/* =====================================================================
   Historique d'un # stock ou d'un NIV — 13 nov. 2026 (suggestion SB1EA533CD3, François, Ste-Marie)
   « Chercher un numéro de stock et voir son historique : quand il a quitté l'inventaire, pourquoi (vendu, transféré,
   retiré par le feed DMS ou le portail du manufacturier) et d'où vient le changement. »
   AMX.historique.ouvrir(q)   — fenêtre : où il est aujourd'hui, pourquoi il a quitté un registre, puis tout ce qui
                                est arrivé, du plus récent au plus vieux (registres, journal, Livre des ventes, neufs,
                                occasions effacées, achats, fiche d'achat). GET ?historiqueStock=1&q= (HistoriqueStock.gs).
   AMX.historique.demander()  — demande le # stock ou le NIV, puis ouvre.
   Branché : recherche du haut (dernière ligne des résultats), Occasion (Actions de la page et du panneau).
   ===================================================================== */
(function () {
  'use strict';
  var h = AMX.h;
  var GENRES = {
    entree: { t: 'Entrée', c: 'vert' }, sortie: { t: 'Sortie', c: 'rouge' }, suppression: { t: 'Effacé', c: 'rouge' },
    transfert: { t: 'Transfert', c: 'violet' }, vente: { t: 'Vente', c: 'bleu' }, statut: { t: 'Statut', c: 'ambre' },
    achat: { t: 'Achat', c: 'sarcelle' }, neuf: { t: 'Neuf', c: 'bleu' }, info: { t: 'Info', c: 'gris' }
  };
  var CSS = [
    '.hst { display: flex; flex-direction: column; gap: 14px; }',
    '.hst-cherche { display: flex; gap: 8px; } .hst-cherche input { flex: 1; min-width: 0; }',
    '.hst-veh { border: 1px solid var(--ligne); border-radius: 12px; padding: 14px 16px; background: var(--carte, #fff); }',
    '.hst-veh h3 { margin: 0 0 4px; font-size: 18px; } .hst-veh .hst-niv { font-family: ui-monospace, Menlo, monospace; color: var(--encre-3); font-size: 13px; }',
    '.hst-stocks { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 10px; }',
    '.hst-resume { margin: 0 0 12px; padding: 10px 12px 10px 30px; background: var(--fond, #f6f7f9); border-radius: 10px; font-size: 15px; line-height: 1.45; }',
    '.hst-resume li + li { margin-top: 4px; } .hst-resume li:first-child { font-weight: 600; }',
    '.hst-actuel-env { overflow-x: auto; margin-bottom: 12px; } .hst-actuel { width: 100%; border-collapse: collapse; font-size: 14px; }',
    '.hst-actuel th, .hst-actuel td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--ligne); }',
    '.hst-actuel th { font-size: 12px; color: var(--encre-3); font-weight: 600; } .hst-actuel tr.autre td { color: var(--encre-3); }',
    '.hst-ligne-temps { list-style: none; margin: 0; padding: 0; }',
    '.hst-ligne-temps li { display: grid; grid-template-columns: 150px 14px 1fr; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--ligne); font-size: 14px; }',
    '.hst-ligne-temps .d { color: var(--encre-3); font-size: 13px; white-space: nowrap; } .hst-ligne-temps .q { font-weight: 600; }',
    '.hst-ligne-temps .p { width: 10px; height: 10px; border-radius: 50%; margin-top: 5px; background: var(--encre-4); }',
    '.hst-ligne-temps .p.vert { background: var(--vert); } .hst-ligne-temps .p.rouge { background: var(--rouge, #c62828); } .hst-ligne-temps .p.ambre { background: var(--ambre); }',
    '.hst-ligne-temps .p.bleu { background: var(--bleu); } .hst-ligne-temps .p.violet { background: #6d3fb5; } .hst-ligne-temps .p.sarcelle { background: var(--sarcelle); }',
    '.hst-ligne-temps .x { color: var(--encre-2, #333); } .hst-ligne-temps .par { color: var(--encre-3); font-size: 13px; }',
    '.hst-ligne-temps li.autre .q::after { content: " · autre concession"; font-weight: 400; color: var(--encre-3); font-size: 12px; }',
    '.hst-plus { margin-top: 8px; } .hst-boutons { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }',
    '.hst-vide { padding: 18px; text-align: center; color: var(--encre-3); border: 1px dashed var(--ligne); border-radius: 12px; }',
    '@media (max-width: 640px) { .hst-ligne-temps li { grid-template-columns: 1fr; gap: 2px; } .hst-ligne-temps .p { display: none; } .hst-actuel .col-entre { display: none; } .hst-actuel { font-size: 13px; } .hst-actuel th, .hst-actuel td { padding: 5px 4px; } .hst-veh { padding: 12px; } }'
  ].join('\n');
  function css() { if (!document.getElementById('css-historique')) { var st = document.createElement('style'); st.id = 'css-historique'; st.textContent = CSS; document.head.appendChild(st); } }
  function cle(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function jour(d, heure) { return d ? AMX.fmtDate(d, heure) : '—'; }

  function lire(q) {
    return AMX.get({ historiqueStock: 1, q: q }, { delai: 60000, secours: false }).then(function (d) {
      if (d && d.refuse) throw new Error(d.erreur || 'Non autorisé.');
      if (!d || !Array.isArray(d.vehicules)) throw new Error('Le script n\'est pas à jour : redéployez-le (HistoriqueStock.gs).');
      return d;
    });
  }

  function tableActuel(v) {
    var lignes = (v.actuel || []).slice().sort(function (a, b) { return (a.parti ? 1 : 0) - (b.parti ? 1 : 0); });
    if (!lignes.length && !v.neuf) return null;
    var corps = lignes.map(function (a) {
      return h('tr' + (a.autre ? '.autre' : ''), [
        h('td', { text: a.nomCie }), h('td', { text: a.nomRegistre || '' }), h('td', { text: a.stock || '—' }),
        h('td', [AMX.badgeStatut(a.statut, a.registre)]),
        h('td.col-entre', { text: jour(a.entreLe) }), h('td', { text: jour(a.depuis) })
      ]);
    });
    if (v.neuf) corps.push(h('tr' + (v.neuf.autre ? '.autre' : ''), [h('td', { text: v.neuf.nomCie }), h('td', { text: 'Neufs' + (v.neuf.origine ? ' (' + v.neuf.origine + ')' : '') }),
      h('td', { text: v.neuf.stock || '—' }), h('td', { text: v.neuf.sortiLe ? 'Sorti' : (v.neuf.statut || 'En stock') }), h('td.col-entre', { text: jour(v.neuf.recuLe) }), h('td', { text: v.neuf.sortiLe ? jour(v.neuf.sortiLe) : '—' })]));
    return h('div.hst-actuel-env', h('table.hst-actuel', [
      h('thead', h('tr', [h('th', 'Concession'), h('th', 'Registre'), h('th', '# stock'), h('th', 'Statut'), h('th.col-entre', 'Entré le'), h('th', 'Depuis le')])),
      h('tbody', corps)
    ]));
  }

  function ligneTemps(ev) {
    var MAX = 40, ouvert = false, ul = h('ul.hst-ligne-temps'), plus = null;
    var dessiner = function () {
      AMX.vider(ul);
      (ouvert ? ev : ev.slice(0, MAX)).forEach(function (e) {
        var g = GENRES[e.genre] || GENRES.info;
        var texte = [];
        if (e.avant || e.apres) texte.push((e.avant ? e.avant + ' → ' : '') + (e.apres || ''));
        if (e.detail) texte.push(e.detail);
        ul.appendChild(h('li' + (e.autre ? '.autre' : ''), [
          h('span.d', { text: jour(e.date, true) }), h('span.p.' + g.c, { title: g.t }),
          h('div', [h('div.q', { text: e.quoi || g.t }), texte.length ? h('div.x', { text: texte.join(' · ') }) : null, e.par ? h('div.par', { text: 'par ' + e.par }) : null])
        ]));
      });
      if (plus) plus.hidden = ouvert || ev.length <= MAX;
    };
    if (ev.length > MAX) plus = h('button.btn.petit.fantome.hst-plus', { type: 'button', text: 'Voir les ' + ev.length + ' événements', onclick: function () { ouvert = true; dessiner(); } });
    dessiner();
    return h('div', [ul, plus]);
  }

  function carteVehicule(v, fermer) {
    var actif = (v.actuel || []).filter(function (a) { return !a.parti && !a.autre; })[0];
    var boutons = [];
    if (actif && AMX.inventaire && AMX.inventaire.lien && (!AMX.voitOnglet || AMX.voitOnglet('inventaire', 'usage'))) {
      boutons.push(h('a.btn', { href: AMX.inventaire.lien(actif.registre, { vin: v.vin }), text: 'Ouvrir dans Occasion', onclick: function () { setTimeout(fermer, 0); } }));
    }
    if (v.vin) boutons.push(h('button.btn.fantome', { type: 'button', text: 'Copier le NIV', onclick: function () { AMX.copier ? AMX.copier(v.vin) : navigator.clipboard.writeText(v.vin); } }));
    return h('section.hst-veh', [
      h('h3', { text: v.titre || 'Véhicule' }),
      h('div.hst-niv', { text: v.vin }),
      (v.stocks || []).length ? h('div.hst-stocks', v.stocks.map(function (s) { return h('span.puce', { text: '# ' + s }); })) : null,
      (v.resume || []).length ? h('ul.hst-resume', v.resume.map(function (r) { return h('li', { text: r }); })) : null,
      tableActuel(v),
      (v.evenements || []).length ? ligneTemps(v.evenements) : (v.autre ? null : h('div.hst-vide', { text: 'Aucun événement trouvé.' })),
      boutons.length ? h('div.hst-boutons', boutons) : null
    ]);
  }

  function remplir(corps, d, fermer) {
    AMX.vider(corps);
    if (d.trop) corps.appendChild(h('div.avis.ambre', { text: d.trop + ' véhicules répondent à « ' + d.q + ' » : les 6 premiers sont montrés. Précisez (# stock complet ou NIV).' }));
    (d.vehicules || []).forEach(function (v) { corps.appendChild(carteVehicule(v, fermer)); });
    if ((d.seulStock || []).length) {
      corps.appendChild(h('section.hst-veh', [h('h3', { text: 'Au Livre des ventes, sans NIV' }),
        h('ul.hst-ligne-temps', d.seulStock.map(function (o) {
          return h('li' + (o.autre ? '.autre' : ''), [h('span.d', { text: jour(o.date) }), h('span.p.bleu'),
            h('div', [h('div.q', { text: 'Vente ' + (o.type || '') + (o.id ? ' ' + o.id : '') + ' — ' + o.nomCie + (o.etat ? ' (' + o.etat + ')' : '') }), h('div.x', { text: ['# stock ' + o.stock, o.modele].filter(Boolean).join(' · ') })])]);
        }))]));
    }
    if (!(d.vehicules || []).length && !(d.seulStock || []).length) {
      corps.appendChild(h('div.hst-vide', { text: 'Rien trouvé pour « ' + d.q + ' » dans les registres, le journal, le Livre des ventes, les neufs ni les occasions effacées.' }));
    }
    if ((d.erreurs || []).length) corps.appendChild(h('p.doux.petit', { text: 'Pas lu : ' + d.erreurs.join(' ; ') }));
  }

  function ouvrir(q, opts) {
    css(); opts = opts || {};
    var repli = cle(opts.repli) && cle(opts.repli) !== cle(q) ? String(opts.repli) : '';
    q = String(q || '').trim();
    var corps = h('div.hst-res');
    var champ = h('input.saisie', { type: 'search', value: q, placeholder: '# stock, NIV ou fin du NIV (6 caractères)', 'aria-label': '# stock ou NIV' });
    var m = null;
    var chercher = function () {
      var v = champ.value.trim();
      if (cle(v).length < 3) { AMX.toast('Tapez un # stock ou un NIV (3 caractères et plus).', 'attention'); return; }
      var t = m && m.el && m.el.querySelector('.modale-entete h2'); if (t) t.textContent = 'Historique — ' + v;
      AMX.vider(corps); corps.appendChild(AMX.chargeur ? AMX.chargeur('Recherche dans l\'historique', { compact: true }) : h('p', { text: 'Recherche…' }));
      lire(v).then(function (d) { remplir(corps, d, fermer); }).catch(function (e) {
        AMX.vider(corps);
        var msg = String((e && e.message) || e || 'Erreur');
        /* Un NIV qui est aussi au registre d'une autre concession peut être refusé par la portée : on reprend par le # stock. */
        if (repli && /concession|portée|autoris/i.test(msg)) { champ.value = repli; repli = ''; chercher(); return; }
        if (/concession|portée|autoris/i.test(msg)) msg += ' — essayez le # stock.';
        corps.appendChild(h('div.hst-vide', { text: msg }));
      });
    };
    champ.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); chercher(); } });
    var fermer = function () {};
    m = AMX.modale({ titre: q ? 'Historique — ' + q : 'Historique d\'un # stock', large: true, proteger: false, classe: 'hst-voile',
      corps: h('div.hst', [h('div.hst-cherche', [champ, h('button.btn.primaire', { type: 'button', text: 'Chercher', onclick: chercher })]), corps]),
      boutons: [{ texte: 'Fermer' }] });
    fermer = m.fermer;
    if (cle(q).length >= 3) chercher(); else setTimeout(function () { champ.focus(); }, 30);
  }

  AMX.historique = { ouvrir: ouvrir, demander: function () { ouvrir(''); }, lire: lire };
})();
