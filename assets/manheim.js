/* =========================================================================
   manheim.js — Fiches Manheim (BMW Financial Services) sur nos véhicules (24 oct. 2026)

   Maxime : « va chercher les ventes et ajoute photos et détails au stock que nous avons chez BMW ». Le favori
   « Automax ← Manheim » (Outils › Opportunités d'achat › Sources › Manheim) lit les onglets « Disponible » et « Achats »
   de marketplace.manheim.ca ; le serveur (Manheim.gs) garde une fiche par NIV : photos (autovinlive.com, publiques), cote
   CR, dommages avec photo, pneus, inspection, divulgations, CARFAX, prix.
   AMX.manheim = { charger(force), parVin(vin), fiche(vin), ouvrir(vin), bloc(vin, conteneur) → Promise<bool> }.
   Le bloc « Fiche Manheim » du panneau Occasion n'apparaît que si le véhicule a une fiche.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h;
  var cache = { rep: null, quand: 0, promesse: null }, fiches = {};
  var ANGLES = { '3/4 VIEW - LEFT FRONT': '3/4 avant gauche', '3/4 VIEW - RIGHT FRONT': '3/4 avant droit', '3/4 VIEW - LEFT REAR': '3/4 arrière gauche', '3/4 VIEW - RIGHT REAR': '3/4 arrière droit',
    'ENGINE': 'Moteur', 'ROOF': 'Toit', 'TRUNK/BED': 'Coffre', 'ODOMETER': 'Odomètre', 'INTERIOR - DRIVERS SIDE': 'Intérieur conducteur', 'TIRE INFO STICKER': 'Étiquette des pneus',
    'WINDSHIELD BRAND LOGO': 'Pare-brise', 'SERIES/TRIM': 'Version', 'FRONT': 'Avant', 'REAR': 'Arrière', 'LEFT SIDE': 'Côté gauche', 'RIGHT SIDE': 'Côté droit', 'DASHBOARD': 'Tableau de bord' };

  function nb(v) { return typeof v === 'number' && isFinite(v); }
  function argent(v) { return nb(v) ? AMX.fmtArgent(Math.round(v)) : '—'; }
  function angle(a) { return ANGLES[String(a || '').toUpperCase()] || (a ? String(a).charAt(0) + String(a).slice(1).toLowerCase() : ''); }
  function piece(p) { return (typeof AMX.eblockTraduirePieces === 'function' && p) ? AMX.eblockTraduirePieces(p) : (p || ''); }
  function cote(c) { return nb(c) ? 'CR ' + String(c.toFixed(1)).replace('.', ',') : ''; }
  function couleurCote(c) { return !nb(c) ? 'gris' : (c >= 4 ? 'vert' : (c >= 3 ? 'ambre' : 'rouge')); }

  function charger(force) {
    if (!force && cache.rep && Date.now() - cache.quand < 5 * 60000) return Promise.resolve(cache.rep);
    if (cache.promesse) return cache.promesse;
    if (!cache.rep) { try { var c = AMX.cacheLocal && AMX.cacheLocal.lire('manheim', 7 * 86400000); if (c && c.donnees) cache.rep = c.donnees; } catch (e) {} }
    cache.promesse = AMX.get({ manheim: 1 }, { delai: 60000, secours: false }).then(function (d) {
      cache.promesse = null;
      if (!d || d.refuse || !Array.isArray(d.fiches)) { if (d && d.vehicules) throw new Error('Le script n\'est pas à jour (Manheim.gs) : redéployez-le.'); return cache.rep; }
      cache.rep = d; cache.quand = Date.now();
      try { if (AMX.cacheLocal) AMX.cacheLocal.ecrire('manheim', d); } catch (e2) {}
      return d;
    }, function (e) { cache.promesse = null; if (cache.rep) return cache.rep; throw e; });
    return cache.promesse;
  }
  function parVin(vin) {
    var d = cache.rep, v = String(vin || '').toUpperCase();
    if (!d || !d.fiches) return null;
    for (var i = 0; i < d.fiches.length; i++) if (d.fiches[i].vin === v) return d.fiches[i];
    return null;
  }
  function fiche(vin) {
    var v = String(vin || '').toUpperCase();
    if (fiches[v]) return fiches[v];
    fiches[v] = AMX.get({ manheimVin: v }, { delai: 45000 }).then(function (d) {
      if (!d || d.refuse) throw new Error((d && d.erreur) || 'Fiche Manheim illisible.');
      return d;
    }, function (e) { delete fiches[v]; throw e; });
    return fiches[v];
  }

  /* ---- Galerie ---- */
  function galerie(photos, grande) {
    var i = 0, liste = photos || [];
    if (!liste.length) return h('div.mini.doux', { text: 'Pas de photo.' });
    var img = h('img.mh-grande', { src: liste[0].u, alt: angle(liste[0].a) || 'Photo', loading: 'lazy', referrerpolicy: 'no-referrer' });
    var leg = h('div.mini.doux.mh-leg');
    var montrer = function (j) {
      i = (j + liste.length) % liste.length; img.src = liste[i].u; img.alt = angle(liste[i].a) || 'Photo';
      leg.textContent = (i + 1) + ' / ' + liste.length + (liste[i].a ? ' · ' + angle(liste[i].a) : '');
      vignettes.querySelectorAll('img').forEach(function (x, k) { x.classList.toggle('actif', k === i); });
    };
    var vignettes = h('div.mh-vignettes', liste.map(function (p, k) {
      return h('img', { src: p.u, alt: angle(p.a) || 'Photo ' + (k + 1), loading: 'lazy', referrerpolicy: 'no-referrer', title: angle(p.a), onclick: function () { montrer(k); } });
    }));
    var cadre = h('div.mh-cadre' + (grande ? '.grand' : ''), [
      h('button.mh-fleche.g', { type: 'button', 'aria-label': 'Photo précédente', text: '‹', onclick: function () { montrer(i - 1); } }),
      h('a', { href: liste[0].u, target: '_blank', rel: 'noopener noreferrer', title: 'Ouvrir la photo en grand', onclick: function (ev) { ev.currentTarget.href = liste[i].u; } }, [img]),
      h('button.mh-fleche.d', { type: 'button', 'aria-label': 'Photo suivante', text: '›', onclick: function () { montrer(i + 1); } })]);
    var el = h('div.mh-galerie', [cadre, leg, vignettes]);
    setTimeout(function () { montrer(0); }, 0);
    return el;
  }

  /* ---- Fenêtre « fiche complète » ---- */
  function ouvrir(vin) {
    var corps = h('div.mh-fiche', [AMX.chargeur ? AMX.chargeur('Fiche Manheim', { compact: true }) : h('div', { text: 'Chargement…' })]);
    var m = AMX.modale({ titre: 'Fiche Manheim', corps: corps, large: true, proteger: false });
    fiche(vin).then(function (d) {
      AMX.vider(corps);
      var f = d.fiche, r = d.resume || {};
      if (!f) { corps.appendChild(h('div.vide', { text: 'Pas de fiche Manheim pour ce NIV.' })); return; }
      var ins = f.inspection || {};
      var titre = [f.annee, f.marque, f.modele, f.version].filter(Boolean).join(' ');
      corps.appendChild(h('div.mh-tete', [
        h('div', [h('h3', { text: titre }), h('div.mini', [AMX.texteVin ? AMX.texteVin(f.vin) : f.vin])]),
        h('div.mh-puces', [nb(f.cote) ? h('span.puce.' + couleurCote(f.cote), { text: cote(f.cote), title: 'Cote d\'état Manheim (sur 5)' }) : null,
          f.type === 'achat' ? h('span.puce.vert', { text: 'Acheté ' + (f.acheteLe ? AMX.fmtDate(f.acheteLe) : '') + ' · ' + argent(f.prix) }) : h('span.puce.bleu', { text: 'Disponible · ' + (nb(f.prixAchat) ? 'achat immédiat ' + argent(f.prixAchat) : 'mise ' + argent(f.mise)) }),
          r.inventaire ? h('span.puce', { text: 'Chez nous : ' + (r.inventaire.registre === 'DETAIL' ? 'Detail' : r.inventaire.registre) + ' · ' + (r.inventaire.compagnie || '') }) : null])
      ]));
      corps.appendChild(galerie(f.photos, true));
      var lignes = [['Kilométrage', nb(f.km) ? AMX.fmtNombre(f.km) + ' km' : '—'], ['Couleur', f.couleur || '—'], ['Moteur', f.moteur || '—'], ['Traction', f.motricite || '—'],
        ['Transmission', f.transmission || '—'], ['Inventaire', f.typeInv || '—'], ['Lieu', [f.ville, f.province].filter(Boolean).join(', ') || '—'],
        ['Inspection', [ins.le ? AMX.fmtDate(ins.le) : '', ins.par].filter(Boolean).join(' · ') || '—'],
        ['Cadre endommagé', ins.cadre === true ? 'Oui' : (ins.cadre === false ? 'Non' : '—')], ['Conduisible', ins.conduisible === true ? 'Oui' : (ins.conduisible === false ? 'Non' : '—')],
        ['Odeur', ins.odeur || '—'], ['Peinture', ins.peinture || '—']];
      if (f.type !== 'achat') lignes.push(['Fin de la vente', f.finVente ? AMX.fmtDate(f.finVente, true) : '—'], ['Mise de départ', argent(f.mise)], ['Achat immédiat', argent(f.prixAchat)]);
      corps.appendChild(h('div.mh-grille', lignes.map(function (l) { return h('div', [h('span.doux', { text: l[0] }), h('b', { text: l[1] })]); })));
      if ((f.dommages || []).length) {
        corps.appendChild(h('h4', { text: f.dommages.length + ' dommage' + (f.dommages.length > 1 ? 's' : '') + ' répertorié' + (f.dommages.length > 1 ? 's' : '') }));
        corps.appendChild(h('div.mh-dommages', f.dommages.map(function (x) {
          return h('div.mh-dommage', [x.i ? h('a', { href: x.i, target: '_blank', rel: 'noopener noreferrer' }, [h('img', { src: x.i, alt: piece(x.p), loading: 'lazy', referrerpolicy: 'no-referrer' })]) : h('div.mh-sans')
            , h('div', [h('b', { text: piece(x.p) || 'Dommage' }), h('div.mini', { text: x.d || '' }), nb(x.c) && x.c > 0 ? h('div.mini', { text: 'coût estimé ' + argent(x.c) }) : null])]);
        })));
      }
      if ((f.pneus || []).length) {
        corps.appendChild(h('h4', { text: 'Pneus' }));
        corps.appendChild(h('div.mh-pneus', f.pneus.map(function (t) {
          return h('div', [h('b', { text: nb(t.t) ? t.t + '/32' : '—' }), h('div.mini', { text: [t.p, t.m, t.s ? t.s + ' po' : ''].filter(Boolean).join(' · ') })]);
        })));
      }
      if ((f.divulgations || []).length) corps.appendChild(h('div', [h('h4', { text: 'Divulgations' }), h('ul.mh-liste', f.divulgations.map(function (x) { return h('li', [x.c ? h('b', { text: x.c + ' : ' }) : null, x.t]); }))]));
      if ((f.annonces || []).length) corps.appendChild(h('div', [h('h4', { text: 'Annonces' }), h('ul.mh-liste', f.annonces.map(function (x) { return h('li', { text: x }); }))]));
      if ((f.options || []).length) corps.appendChild(h('details.mh-options', [h('summary', { text: 'Équipement (' + f.options.length + ')' }), h('div.mini', { text: f.options.join(' · ') })]));
      corps.appendChild(h('div.mh-actions', [f.carfax ? h('a.btn.petit.primaire', { href: f.carfax, target: '_blank', rel: 'noopener', text: 'Rapport CARFAX ↗' }) : null,
        f.lien ? h('a.btn.petit', { href: f.lien, target: '_blank', rel: 'noopener', text: 'Manheim ↗' }) : null,
        h('span.mini.doux', { text: 'Lu le ' + (r.luLe ? AMX.fmtDate(r.luLe, true) : '?') + ' par le favori « Automax ← Manheim ».' })]));
    }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('div.vide', { text: String(e && e.message || e) })); });
    return m;
  }

  /* ---- Bloc du panneau Occasion : seulement si une fiche existe. Renvoie Promise<bool>. ---- */
  function bloc(vin, conteneur) {
    return charger(false).then(function () {
      var r = parVin(vin);
      if (!r || !conteneur) return false;
      AMX.vider(conteneur);
      var vignettes = h('div.mh-mini');
      conteneur.appendChild(h('div.mh-bloc', [
        h('div.mh-bloc-ligne', [nb(r.cote) ? h('span.puce.' + couleurCote(r.cote), { text: cote(r.cote) }) : null,
          h('span', { text: r.type === 'achat' ? 'Acheté sur Manheim' + (r.acheteLe ? ' le ' + AMX.fmtDate(r.acheteLe) : '') + (nb(r.prix) ? ' · ' + argent(r.prix) : '') : 'En vente sur Manheim · ' + argent(r.prix) }),
          r.nbDommages ? h('span.puce.rouge', { text: r.nbDommages + ' dommage' + (r.nbDommages > 1 ? 's' : '') }) : h('span.puce.vert', { text: 'aucun dommage' }),
          h('span.doux', { text: r.nbPhotos + ' photos' })]),
        vignettes,
        h('div.mh-bloc-ligne', [h('button.btn.petit', { type: 'button', text: 'Voir la fiche Manheim', onclick: function () { ouvrir(vin); } }),
          r.carfax ? h('a.btn.petit.fantome', { href: r.carfax, target: '_blank', rel: 'noopener', text: 'CARFAX ↗' }) : null])
      ]));
      fiche(vin).then(function (d) {
        var ph = (d && d.fiche && d.fiche.photos) || [];
        ph.slice(0, 8).forEach(function (p) { vignettes.appendChild(h('img', { src: p.u, alt: angle(p.a) || 'Photo', loading: 'lazy', referrerpolicy: 'no-referrer', title: angle(p.a), onclick: function () { ouvrir(vin); } })); });
        if (ph.length > 8) vignettes.appendChild(h('button.mh-plus', { type: 'button', text: '+' + (ph.length - 8), onclick: function () { ouvrir(vin); } }));
      }).catch(function () {});
      return true;
    }, function () { return false; });
  }

  var css = h('style', { text: [
    '.mh-galerie { display: grid; gap: 6px; } .mh-cadre { position: relative; background: #0B0F12; border-radius: 10px; overflow: hidden; display: flex; align-items: center; justify-content: center; aspect-ratio: 4 / 3; max-height: 420px; }',
    '.mh-cadre.grand { max-height: 480px; } .mh-cadre img.mh-grande { max-width: 100%; max-height: 480px; display: block; }',
    '.mh-fleche { position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; border-radius: 50%; border: 0; background: rgba(255,255,255,.85); color: #141A1F; font-size: 26px; line-height: 1; cursor: pointer; z-index: 2; } .mh-fleche.g { left: 8px; } .mh-fleche.d { right: 8px; }',
    '.mh-vignettes, .mh-mini { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; } .mh-vignettes img, .mh-mini img { width: 84px; height: 63px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 2px solid transparent; flex: none; }',
    '.mh-vignettes img.actif { border-color: var(--vert); } .mh-plus { width: 63px; height: 63px; border-radius: 6px; border: 1px solid var(--bordure); background: var(--fond); font-weight: 600; cursor: pointer; flex: none; }',
    '.mh-tete { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; margin-bottom: 10px; } .mh-tete h3 { margin: 0 0 4px; } .mh-puces { display: flex; gap: 6px; flex-wrap: wrap; }',
    '.mh-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px 16px; margin: 12px 0; } .mh-grille > div { display: grid; gap: 2px; font-size: 14px; }',
    '.mh-fiche h4 { margin: 14px 0 6px; } .mh-dommages { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; } .mh-dommage { display: grid; grid-template-columns: 96px 1fr; gap: 10px; align-items: start; border: 1px solid var(--bordure); border-radius: 8px; padding: 6px; }',
    '.mh-dommage img, .mh-sans { width: 96px; height: 72px; object-fit: cover; border-radius: 6px; background: var(--fond); display: block; }',
    '.mh-pneus { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; } .mh-pneus > div { border: 1px solid var(--bordure); border-radius: 8px; padding: 6px 10px; }',
    '.mh-liste { margin: 0; padding-left: 18px; font-size: 14px; } .mh-options { margin-top: 10px; } .mh-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 14px; }',
    '.mh-bloc { display: grid; gap: 8px; } .mh-bloc-ligne { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 14px; } .mh-fiche .doux, .mh-bloc .doux { color: var(--encre-3); }',
    '@media (max-width: 640px) { .mh-vignettes img, .mh-mini img { width: 68px; height: 51px; } .mh-dommage { grid-template-columns: 72px 1fr; } .mh-dommage img, .mh-sans { width: 72px; height: 54px; } }'
  ].join('\n') });
  document.head.appendChild(css);

  AMX.manheim = { charger: charger, parVin: parVin, fiche: fiche, ouvrir: ouvrir, bloc: bloc, vider: function () { cache = { rep: null, quand: 0, promesse: null }; fiches = {}; try { AMX.cacheLocal && AMX.cacheLocal.oublier('manheim'); } catch (e) {} } };
})();
