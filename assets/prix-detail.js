/* ============================================================================
   ScanAutomax — prix de détail des usagés (26 octobre 2026)

   Deux suggestions de Louis Prassinos (Hyundai Longueuil) :
   - « lorsqu'on modifie un prix de détail, Torque envoie le changement de prix à D2C et le prix est mis à jour ; de plus un
     courriel est envoyé à chaque vendeur et directeur l'avisant du changement de prix afin de relancer le client » ;
   - « une notification à chaque 15 jours que le prix n'a pas été modifié […] ; si on a plusieurs versions identiques en
     stock, on baisse le prix du plus vieux » (courriel aux directeurs généraux : PrixDetail.gs, horloge).

   AMX.prixDetail :
   - charger(force) : GET ?prixDetail=1 → { changements, attente, reglages, peutModifier, peutRegler } (1 minute) ;
   - attente(vin) : le prix en attente pour le site de la concession, s'il y en a un ;
   - modifier(v, opts) : la fenêtre « Modifier le prix » (v = { vin, stock, nom, compagnie, prix }, opts.prixVise) ;
   - carte(conteneur) : « Prix à inscrire sur le site » + le favori « Automax → D2C (prix) » + réglages des courriels ;
   - peut() : droit de changer un prix (direction des ventes).
   Événement `amx:prixDetail` après un changement ou un retour du favori.
   ========================================================================== */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones || {};
  // Chargeur du favori (généré par mock/signet-d2c-prix-build.py) — ne jamais éditer la constante à la main.
  var CODE_SIGNET_D2C_PRIX = "javascript:(function () { var s = document.createElement('script'); s.src = " + JSON.stringify(AMX.SITE) + " + 'assets/signet-d2c-prix.js?t=' + Date.now(); s.onerror = function () { alert(\"Impossible de charger le signet depuis le site d'inventaire (groupeautomax.github.io). V\u00e9rifiez votre connexion, puis recliquez.\"); }; document.body.appendChild(s); })();";
  var COURTS = { STM: 'Ste Marie', HAWKS: 'Hawkesbury', BMW: 'BMW Sherbrooke', VW: 'VW Brossard', HYUNDAI: 'Hyundai Longueuil' };
  var ROLES = ['admin', 'proprietaire', 'gestionnaire', 'direction_ventes', 'directeur_commercial'];
  var cache = { d: null, quand: 0, promesse: null };

  function nb(x) { return typeof x === 'number' && isFinite(x); }
  function argent(n) { return nb(n) ? AMX.fmtArgent(n) : '—'; }
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || COURTS[c] || c; }
  function peut() { return AMX.perm('modifierMontants') || AMX.estAdmin() || ROLES.indexOf(AMX.session.role) >= 0; }

  function charger(force) {
    if (!force && cache.d && Date.now() - cache.quand < 60000) return Promise.resolve(cache.d);
    if (cache.promesse) return cache.promesse;
    cache.promesse = AMX.get({ prixDetail: 1 }, { secours: false }).then(function (d) {
      cache.promesse = null;
      if (d && Array.isArray(d.attente)) { cache.d = d; cache.quand = Date.now(); }
      else if (d && d.vehicules) cache.d = { ancien: true, attente: [], changements: [], reglages: {} };   // script pas encore déployé
      else if (d && (d.refuse || d.ok === false)) cache.d = { refuse: true, attente: [], changements: [], reglages: {}, erreur: d.erreur };
      return cache.d;
    }, function (e) { cache.promesse = null; throw e; });
    return cache.promesse;
  }
  function attente(vin) {
    vin = String(vin || '').toUpperCase();
    return ((cache.d && cache.d.attente) || []).filter(function (x) { return x.vin === vin; })[0] || null;
  }
  function dernier(vin) {
    vin = String(vin || '').toUpperCase();
    return ((cache.d && cache.d.changements) || []).filter(function (x) { return x.vin === vin && x.d2c !== 'remplace'; })[0] || null;
  }
  /* Un prix inscrit au site puis remis par le feed du DMS : le site affiche un autre prix depuis. */
  function ecrase(c) {
    return !!(c && c.d2c === 'applique' && nb(c.prixD2c) && c.prixD2c !== c.prix && c.prixD2cLe && c.d2cLe && c.prixD2cLe > c.d2cLe);
  }
  function annoncer() { try { window.dispatchEvent(new CustomEvent('amx:prixDetail')); } catch (e) {} }

  /* ------------------------------ Modifier le prix ------------------------------ */
  function modifier(v, opts) {
    opts = opts || {};
    if (!peut()) { AMX.toast('Changer un prix de détail est réservé à la direction des ventes.', 'attention'); return Promise.resolve(false); }
    var vin = String(v.vin || '').toUpperCase(), cie = String(v.compagnie || '').toUpperCase();
    var enAttente = attente(vin), actuel = enAttente ? enAttente.prix : (nb(v.prix) ? v.prix : null);
    var champ = h('input.saisie#pxd-prix', { type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Nouveau prix de détail', value: opts.prixVise ? String(opts.prixVise) : (nb(actuel) ? String(actuel) : '') });
    var raison = h('textarea.saisie#pxd-raison', { rows: 2, maxlength: 300, placeholder: 'Facultatif : aligné au marché, 75 jours en stock, client qui attend une baisse…' });
    var apercu = h('div.pxd-apercu');
    var lire = function () { var n = Math.round(Number(String(champ.value).replace(/[^\d]/g, ''))); return n > 0 ? n : null; };
    var maj = function () {
      var n = lire();
      AMX.vider(apercu);
      if (!nb(n)) { apercu.appendChild(h('span.doux', { text: 'Entrez le nouveau prix.' })); return; }
      if (!nb(actuel)) { apercu.appendChild(h('span', { text: 'Nouveau prix : ' + argent(n) })); return; }
      var e = n - actuel, p = actuel ? Math.round(e / actuel * 1000) / 10 : 0;
      apercu.appendChild(h('b.' + (e < 0 ? 'neg' : e > 0 ? 'pos' : 'doux'), { text: e === 0 ? 'Même prix qu\'affiché' : (e < 0 ? 'Baisse de ' : 'Hausse de ') + argent(Math.abs(e)) + ' (' + (p > 0 ? '+' : p < 0 ? '−' : '') + String(Math.abs(p)).replace('.', ',') + ' %)' }));
    };
    champ.addEventListener('input', maj);
    var raccourci = function (lib, val) { return h('button.btn.petit.fantome', { type: 'button', text: lib, onclick: function () { champ.value = String(val); maj(); champ.focus(); } }); };
    var raccourcis = [];
    if (nb(opts.prixVise)) raccourcis.push(raccourci('Prix visé ' + argent(opts.prixVise), opts.prixVise));
    if (nb(actuel)) [500, 1000, 2000].forEach(function (x) { raccourcis.push(raccourci('− ' + argent(x), actuel - x)); });
    var reg = cache.d && cache.d.reglages && cache.d.reglages[cie];
    var avis = reg && reg.avisPrix ? 'Un courriel part aux vendeurs et aux directeurs de ' + nomCie(cie) + ' pour qu\'ils relancent leurs clients.' : 'Pas de courriel aux vendeurs pour ' + nomCie(cie) + ' (pas activé).';
    var corps = h('div.pxd-modale', [
      h('div.pxd-veh', [h('b', { text: v.nom || vin }), h('div.mini.doux', { text: [v.stock ? '# ' + v.stock : '', nomCie(cie), vin].filter(Boolean).join(' · ') })]),
      h('div.pxd-ligne', [h('span', { text: enAttente ? 'Prix en attente pour le site' : 'Prix affiché sur le site' }), h('b', { text: argent(actuel) })]),
      h('label.champ', [h('span', 'Nouveau prix de détail'), champ]),
      raccourcis.length ? h('div.pxd-raccourcis', raccourcis) : null,
      apercu,
      h('label.champ', [h('span', 'Raison'), raison]),
      h('ul.pxd-info', [h('li', { text: avis }), h('li', { text: 'Le prix s\'inscrit sur le site de la concession avec le favori « Automax → D2C (prix) », cliqué dans D2C Media (la liste des prix à inscrire est dans Analyse usagé et Outils › Import D2C).' })])
    ]);
    maj();
    return new Promise(function (resolve) {
      AMX.modale({ titre: 'Modifier le prix de détail', corps: corps, onFermer: function () { resolve(false); }, boutons: [
        { texte: 'Annuler' },
        { texte: 'Enregistrer le prix', classe: 'primaire', action: function () {
          var n = lire();
          if (!nb(n) || n < 1000) { AMX.toast('Entrez un prix de détail valide.', 'attention'); champ.focus(); return false; }
          if (nb(actuel) && n === actuel) { AMX.toast('C\'est déjà ce prix.', 'attention'); return false; }
          return AMX.post({ action: 'prixDetailModifier', vin: vin, prix: n, raison: raison.value.trim() }).then(function (r) {
            if (r && r.vehicules && !r.changement) throw new Error('Le script du site n\'est pas à jour (PrixDetail.gs) : il faut le déployer.');
            AMX.verifier(r);
            cache.quand = 0;
            var a = r.avis || {};
            AMX.toast('Prix enregistré : ' + argent(n) + (a.envoye ? ' — courriel à ' + a.n + ' personne' + (a.n > 1 ? 's' : '') : '') + '. Reste à l\'inscrire sur le site (favori D2C).', 'ok', 6000);
            charger(true).then(annoncer, annoncer);
            resolve(r.changement);
          }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 6000); throw e; });
        } }] });
      setTimeout(function () { try { champ.focus(); champ.select(); } catch (e) {} }, 50);
    });
  }

  /* ------------------------------ Carte « Prix à inscrire sur le site » ------------------------------ */
  function carte(conteneur, opts) {
    opts = opts || {};
    var cie = opts.compagnie || '';
    AMX.vider(conteneur);
    var d = cache.d;
    if (!d) { charger().then(function () { carte(conteneur, opts); }, function () {}); return; }
    if (d.ancien || d.refuse) return;
    var att = d.attente.filter(function (x) { return !cie || x.compagnie === cie; });
    var ecrases = d.changements.filter(function (x) { return (!cie || x.compagnie === cie) && ecrase(x) && dernier(x.vin) === x; });
    if (opts.siBesoin && !att.length && !ecrases.length) return;
    var signet = h('a.btn' + (att.length ? '.primaire' : ''), { href: CODE_SIGNET_D2C_PRIX, text: 'Automax → D2C (prix)', title: 'Glissez ce bouton dans votre barre de favoris', draggable: 'true' });
    signet.addEventListener('click', function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B pour l\'afficher), puis cliquez-le dans D2C Media (Inventory › Summary).', 'attention', 7000); });
    var lignes = att.map(function (x) {
      return h('tr', [h('td', [h('b', { text: x.vehicule || x.vin }), h('div.mini.doux', { text: [x.stock ? '# ' + x.stock : '', nomCie(x.compagnie)].join(' · ') })]),
        h('td.num', { text: argent(nb(x.prixD2c) ? x.prixD2c : x.prixAvant) }), h('td.num', [h('b', { text: argent(x.prix) })]),
        h('td', [h('div', { text: (x.par || '').split('@')[0] }), h('div.mini.doux', { text: AMX.fmtDate(x.le) })]),
        h('td', { text: x.d2cNote || 'en attente' })]);
    });
    var tableau = att.length ? h('div', { style: { overflowX: 'auto' } }, [h('table.tableau.pxd-table', [h('thead', [h('tr', ['Véhicule', 'Sur le site', 'Nouveau prix', 'Demandé par', 'État'].map(function (t, i) { return h('th' + (i === 1 || i === 2 ? '.num' : ''), { text: t }); }))]), h('tbody', lignes)])]) : h('p.doux', { text: 'Aucun prix en attente : le site de la concession est à jour.' });
    var avert = ecrases.length ? h('div.alerte-bloc.attention', [h('b', { text: ecrases.length + ' prix revenu' + (ecrases.length > 1 ? 's' : '') + ' à l\'ancien sur le site' }), h('div', { text: ecrases.map(function (x) { return (x.vehicule || x.vin) + (x.stock ? ' # ' + x.stock : '') + ' : ' + argent(x.prix) + ' inscrit, le site affiche ' + argent(x.prixD2c); }).join(' ; ') + '. Le feed du DMS (Serti) a sans doute remis l\'ancien prix : changez-le aussi dans le DMS.' })]) : null;
    var reglages = d.peutRegler ? reglagesCourriels(d) : null;
    conteneur.appendChild(h('div.carte.pxd-carte', [
      h('div.carte-entete', [h('h2', { text: att.length ? att.length + ' prix à inscrire sur le site de la concession' : 'Prix à inscrire sur le site de la concession' }), h('div.actions-ligne', [signet])]),
      h('div.carte-corps', [avert, tableau,
        h('p.mini.doux', { text: 'Dans D2C Media (Inventory › Summary, niveau Groupe Auto Max), cliquez le favori : il retrouve chaque véhicule par son NIV, montre l\'ancien et le nouveau prix, puis les inscrit quand vous cliquez « Appliquer » et vérifie le tableau.' }),
        reglages])]));
  }
  function reglagesCourriels(d) {
    var cies = Object.keys(d.reglages || {});
    if (!cies.length) return null;
    var lignes = cies.map(function (c) {
      var r = d.reglages[c], cA = h('input', { type: 'checkbox', checked: !!r.avisPrix }), c15 = h('input', { type: 'checkbox', checked: !!r.avis15 });
      var envoyer = function () {
        AMX.post({ action: 'prixDetailReglages', compagnie: c, avisPrix: cA.checked, avis15: c15.checked }).then(function (x) { AMX.verifier(x); r.avisPrix = cA.checked; r.avis15 = c15.checked; AMX.toast('Courriels de ' + nomCie(c) + ' mis à jour.', 'ok'); }).catch(function (e) { cA.checked = !!r.avisPrix; c15.checked = !!r.avis15; AMX.toast(AMX.erreurTexte(e), 'erreur'); });
      };
      cA.addEventListener('change', envoyer); c15.addEventListener('change', envoyer);
      return h('tr', [h('td', { text: nomCie(c) }), h('td', [h('label.case', [cA, h('span', 'aux vendeurs et directeurs')])]), h('td', [h('label.case', [c15, h('span', 'au directeur général')])])]);
    });
    return h('details.pxd-reglages', [h('summary', 'Courriels (propriétaire)'), h('table.tableau', [h('thead', [h('tr', [h('th', 'Concession'), h('th', 'Prix modifié'), h('th', 'Prix inchangé 15 jours')])]), h('tbody', lignes)])]);
  }

  /* ------------------------------ Styles ------------------------------ */
  (function () {
    if (document.getElementById('css-prix-detail')) return;
    var s = document.createElement('style'); s.id = 'css-prix-detail';
    s.textContent = [
      '.pxd-modale { display: grid; gap: 12px; }',
      '.pxd-veh b { font-size: 15px; }',
      '.pxd-ligne { display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; background: var(--fond); border-radius: 8px; }',
      '.pxd-raccourcis { display: flex; flex-wrap: wrap; gap: 6px; }',
      '.pxd-apercu b.neg { color: var(--rouge); } .pxd-apercu b.pos { color: var(--vert-fonce); }',
      '.pxd-info { margin: 0; padding-left: 18px; color: var(--encre-2); font-size: 13px; display: grid; gap: 4px; }',
      '.pxd-carte { margin-bottom: 14px; } .pxd-carte .alerte-bloc { margin-bottom: 10px; display: block; } .pxd-table { width: 100%; }',
      '.pxd-reglages { margin-top: 10px; } .pxd-reglages summary { cursor: pointer; color: var(--encre-2); }'
    ].join('\n');
    document.head.appendChild(s);
  })();

  AMX.prixDetail = { charger: charger, enCache: function () { return cache.d; }, attente: attente, dernier: dernier, ecrase: ecrase, modifier: modifier, carte: carte, peut: peut, signet: function () { return CODE_SIGNET_D2C_PRIX; } };
})();
