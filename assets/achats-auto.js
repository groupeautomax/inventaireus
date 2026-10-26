/* =========================================================================
   achats-auto.js — achats entrés automatiquement au registre (26 oct. 2026)

   AchatsAuto.gs entre tout seul, au statut « Acheté », les achats lus sur les portails (favori DealerSource sur
   « Mes transactions », achats Manheim de BMW Financial Services). Maxime : « il faut qu'il soit une autre couleur ou
   inscrit d'une manière distinctive ». Tant que personne ne l'a confirmé, un tel véhicule est en VIOLET dans Usagé :
   ligne bordée de violet, puce « Auto · GMF », chiffre « Entrés automatiquement » (filtre ?alerte=auto) et, dans le
   panneau, un bloc qui dit d'où il vient avec le bouton « Confirmer ». L'Accueil compte ceux qui restent à confirmer.

   AMX.achatsAuto : charger(force) · enCache() · entree(vin) (non confirmée, sinon null) · compte(compagnie) ·
   puce(vin) · bloc(vin) · confirmer(vins) · lireOpenlane(compagnie) · peutLire() · vider(). Événement « amx:achatsAuto ».
   OPENLANE n'a pas de favori : le serveur lit ses achats tout seul aux 2 heures (AchatsAuto.gs, ACHA_tic) ;
   lireOpenlane() le fait tout de suite (menu « … » d'Usagé).
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones || {};
  var DUREE_MS = 60000;
  var cache = { d: null, le: 0, promesse: null, index: {} };

  function vinDe(x) { return String(x || '').trim().toUpperCase(); }
  function indexer(d) {
    var ix = {};
    ((d && d.achats) || []).forEach(function (a) { var v = vinDe(a.vin); if (v && !ix[v]) ix[v] = a; });
    cache.index = ix;
  }
  function annoncer() { try { document.dispatchEvent(new CustomEvent('amx:achatsAuto')); } catch (e) {} }
  function argent(n) { return (n === null || n === undefined || isNaN(Number(n))) ? '' : AMX.fmtArgent(Number(n), 0); }
  function jour(x) { return x ? (AMX.fmtDateCourte ? AMX.fmtDateCourte(x) : AMX.fmtDate(x)) : ''; }
  function nomRegistre(r) { return { DETAIL: 'Detail', CAN: 'Canada', US: 'É.-U.' }[r] || r || ''; }

  var A = AMX.achatsAuto = {
    charger: function (force) {
      if (!force && cache.d && Date.now() - cache.le < DUREE_MS) return Promise.resolve(cache.d);
      if (cache.promesse) return cache.promesse;
      cache.promesse = AMX.get({ achatsAuto: 1 }, { secours: false, delai: 45000 }).then(function (d) {
        cache.promesse = null;
        if (!d || !Array.isArray(d.achats)) throw new Error('Le script n\'est pas à jour (AchatsAuto.gs) : il faut le déployer.');
        cache.d = d; cache.le = Date.now(); indexer(d); annoncer();
        return d;
      }, function (e) { cache.promesse = null; throw e; });
      return cache.promesse;
    },
    enCache: function () { return cache.d; },
    vider: function () { cache.d = null; cache.le = 0; cache.index = {}; },
    /** L'entrée automatique non confirmée de ce NIV, sinon null. */
    entree: function (vin) { var a = cache.index[vinDe(vin)]; return a && !a.confirme ? a : null; },
    /** Nombre d'entrées à confirmer (une concession, ou toutes). */
    compte: function (cie) { return ((cache.d && cache.d.achats) || []).filter(function (a) { return !a.confirme && (!cie || a.compagnie === cie); }).length; },
    /** { registre: n } des entrées à confirmer, pour aller au bon registre. */
    parRegistre: function (cie) { var o = {}; ((cache.d && cache.d.achats) || []).forEach(function (a) { if (!a.confirme && (!cie || a.compagnie === cie)) o[a.registre] = (o[a.registre] || 0) + 1; }); return o; },
    puce: function (vin) {
      var a = A.entree(vin); if (!a) return null;
      return h('span.puce.auto', { text: 'Auto · ' + (a.sourceCourt || a.source), title: 'Entré automatiquement le ' + jour(a.le) + ' depuis ' + (a.sourceNom || a.source) + ' — à confirmer' });
    },
    confirmer: function (vins) {
      vins = (Array.isArray(vins) ? vins : [vins]).map(vinDe).filter(Boolean);
      return AMX.post({ action: 'achatAutoConfirmer', vins: vins }, { rejouer: true }).then(function (r) {
        AMX.verifier(r, 'Confirmation refusée');
        if (r.confirmes === undefined) throw new Error('Le script n\'est pas à jour (AchatsAuto.gs) : il faut le déployer.');
        var maintenant = new Date().toISOString();
        ((cache.d && cache.d.achats) || []).forEach(function (a) { if (vins.indexOf(vinDe(a.vin)) >= 0) { a.confirme = true; a.confirmeLe = maintenant; a.confirmePar = (AMX.session && AMX.session.courriel) || ''; } });
        if (cache.d) cache.d.aConfirmer = A.compte('');
        annoncer();
        return r;
      });
    },
    /** Ceux qui peuvent entrer des achats (mêmes droits que le serveur). */
    peutLire: function () { return !!(AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.perm('ajouterVehicule') || AMX.estAdmin()); },
    /** « Lire les achats OPENLANE » : le serveur lit OPENLANE tout de suite et entre les achats récents. */
    lireOpenlane: function (cie) {
      AMX.toast('Lecture des achats OPENLANE…', 'info');
      return AMX.post({ action: 'achatsOpenlane', compagnie: cie || '' }, { delai: 150000 }).then(function (r) {
        if (r && r.vehicules && !r.concessions) throw new Error('Le script n\'est pas à jour (AchatsAuto.gs) : il faut le déployer.');
        AMX.verifier(r, 'Lecture OPENLANE refusée');
        var n = (r.ajoutes || []).length, lus = r.lus || 0;
        var txt = n ? n + ' achat' + (n > 1 ? 's' : '') + ' OPENLANE entré' + (n > 1 ? 's' : '') + ' au registre (en violet)' : 'OPENLANE : ' + lus + ' achat' + (lus > 1 ? 's' : '') + ' lu' + (lus > 1 ? 's' : '') + ', rien de nouveau à entrer';
        if ((r.erreurs || []).length) txt += ' — ' + r.erreurs.join(' · ');
        AMX.toast(txt, n ? 'ok' : 'info');
        return A.charger(true).then(function () { return r; });
      }).catch(function (e) { AMX.toast(e.message || String(e), 'erreur'); throw e; });
    },
    /** Bloc violet du panneau Usagé : d'où vient l'entrée, le prix, et « Confirmer ». */
    bloc: function (vin) {
      var a = A.entree(vin); if (!a) return null;
      var details = [
        a.acheteLe ? 'acheté le ' + jour(a.acheteLe) : '',
        a.prix ? argent(a.prix) + (a.frais ? ' + ' + argent(a.frais) + ' de frais' : '') : '',
        a.paye ? 'payé' + (/^\d{4}-/.test(a.paye) ? ' le ' + jour(a.paye) : '') : 'pas encore payé',
        a.vendeur || ''
      ].filter(Boolean).join(' · ');
      var etat = h('span.doux.petit');
      var b = h('div.bloc.achat-auto-bloc', [
        h('h3', 'Entré automatiquement'),
        h('p', { text: 'Ce véhicule est entré tout seul au registre ' + nomRegistre(a.registre) + ', au statut « Acheté », le ' + jour(a.le) + ' depuis ' + (a.sourceNom || a.source) + '.' }),
        details ? h('p.doux.petit', { text: details }) : null,
        h('p.doux.petit', { text: 'Vérifiez le registre et la fiche d\'achat, puis confirmez : le violet disparaît.' }),
        h('div.actions-ligne', [
          (cache.d && cache.d.peutConfirmer) ? h('button.btn.primaire', { type: 'button', html: (I.ok || '') + '<span>Confirmer l\'achat</span>', onclick: function () {
            etat.textContent = 'Confirmation…';
            A.confirmer([vin]).then(function () { AMX.toast('Achat confirmé', 'ok'); }).catch(function (e) { etat.textContent = ''; AMX.toast(e.message || String(e), 'erreur'); });
          } }) : null,
          h('a.btn', { href: AMX.lien('achat', '', { vin: vin }), html: (I.achat || '') + '<span>Fiche d\'achat</span>' }),
          etat
        ])
      ]);
      return b;
    }
  };

  /* Violet : la ligne d'Usagé, la puce, le chiffre et le bloc du panneau (couleurs du thème, mode sombre compris). */
  if (!document.getElementById('css-achats-auto')) {
    var st = document.createElement('style'); st.id = 'css-achats-auto';
    st.textContent = [
      '.ligne.achat-auto { box-shadow: inset 4px 0 0 var(--violet); background: var(--violet-bg); }',
      '.puce.auto { color: var(--violet); background: var(--violet-bg); border-color: var(--violet-bord); font-weight: 600; }',
      '.kpi.auto { border-color: var(--violet-bord); } .kpi.auto .valeur { color: var(--violet); } .kpi.auto.actif { background: var(--violet-bg); }',
      '.bloc.achat-auto-bloc { border: 1px solid var(--violet-bord); border-left: 4px solid var(--violet); background: var(--violet-bg); border-radius: 10px; padding: 12px 14px; }',
      '.bloc.achat-auto-bloc h3 { color: var(--violet); }',
      '.bloc.achat-auto-bloc p { margin: 4px 0; }'
    ].join('\n');
    document.head.appendChild(st);
  }
})();
