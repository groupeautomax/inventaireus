/* Import D2C Media (16 octobre 2026) — Outils › Import D2C.

   Maxime : « je vais te donner accès au CRM pour que tu puisses aller chercher
   des données additionnelles sur les km entre autres » puis « ok on fait ça ».
   D2C Media (admin.d2cmedia.ca) reçoit chaque nuit le feed du DMS Serti de
   Hyundai Longueuil et de Ste-Marie (HomeNet / OneEighty / SM360 pour les
   autres) : la page reçoit la liste complète de l'inventaire D2C par
   postMessage — du signet « Automax ← D2C » cliqué dans D2C, ou de l'onglet
   D2C ouvert ici par « Ouvrir D2C Media » (la tâche planifiée Chrome du
   matin) — la simule concession par concession (POST d2cImporter, mode
   simuler), montre ce qui changerait (neufs vers le suivi des neufs, usagés
   vers les registres : ajouts, coûts, # stock, vendus, km posés, inconnus du
   DMS, liens CARFAX) puis importe sur un clic (« Importer ») — ou tout de
   suite quand la liste arrive avec `auto` (tâche planifiée) ou par
   #/outils/d2c?auto=1. « Dernier import » : GET ?d2c=1 (D2C_ETAT).

   - AMX.vues.ImportD2c : la page.
   - CODE_SIGNET_D2C : chargeur du signet (généré par mock/signet-build.py ;
     code complet dans assets/signet-d2c.js, source mock/signet-d2c.src.js). */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var URL_D2C = 'https://admin.d2cmedia.ca/inventory';
  var ORIGINE_D2C = 'https://admin.d2cmedia.ca';
  var NOM_FENETRE_D2C = 'amx_d2c';
  var DELAI_POST_MS = 180000;   // un passage lit les registres, les fiches, les neufs et Vitrine : jusqu'à 2-3 minutes
  // Script déployé en retard (leçon v100) : une action inconnue tombe dans l'ancien traitement d'inventaire et répond { ok, vehicules }.
  var SCRIPT_PAS_A_JOUR = 'Le script du serveur n\'est pas à jour (D2c.gs, RoutesAjout.gs) : dans l\'éditeur Apps Script, Déployer › Gérer les déploiements › crayon › Nouvelle version › Déployer.';
  // Chargeur du signet (généré par mock/signet-build.py) — ne jamais éditer la constante à la main.
  var CODE_SIGNET_D2C = "javascript:(function () { var s = document.createElement('script'); s.src = " + JSON.stringify(AMX.SITE) + " + 'assets/signet-d2c.js?t=' + Date.now(); s.onerror = function () { alert(\"Impossible de charger le signet depuis le site d'inventaire (groupeautomax.github.io). V\u00e9rifiez votre connexion, puis recliquez.\"); }; document.body.appendChild(s); })();";

  function nomCie(code) { return (AMX.COMPAGNIES_TOUTES[code] || code || '').replace(' Chevrolet Buick Cadillac', ''); }
  function fmtN(n) { return (n === null || n === undefined || n === '') ? '—' : AMX.fmtNombre(n); }
  function fmtKm(n) { return (n === null || n === undefined) ? '—' : AMX.fmtNombre(n) + ' km'; }
  function fmt$(n) { return (n === null || n === undefined || n === '' || n === 0) ? '—' : AMX.fmtArgent(n, 0); }
  function quand(iso) { if (!iso) return '—'; var d = new Date(iso); if (isNaN(d.getTime())) return String(iso); return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }); }
  function pl(n, un, plusieurs) { return n + ' ' + (n > 1 ? (plusieurs || un + 's') : un); }
  /** Concession d'une ligne reçue (le serveur refait le même calcul). */
  var CONCESSIONS = { '178': 'HYUNDAI', '2244': 'STM', '5311': 'HAWKS', '1759': 'BMW', '632': 'VW' };
  function compagnieDe(v) {
    if (CONCESSIONS[String(v.dealerId || '')]) return CONCESSIONS[String(v.dealerId || '')];
    var n = String(v.concession || '').toLowerCase();
    if (/hyundai/.test(n)) return 'HYUNDAI'; if (/marie/.test(n)) return 'STM'; if (/hawkesbury/.test(n)) return 'HAWKS'; if (/bmw/.test(n)) return 'BMW'; if (/volkswagen|\bvw\b/.test(n)) return 'VW';
    return '';
  }

  function injecterCss() {
    if (document.getElementById('css-d2c')) return;
    var s = document.createElement('style'); s.id = 'css-d2c';
    s.textContent = [
      '.d2c-cies { display: grid; gap: 12px; }',
      '.d2c-cie { border: 1px solid var(--ligne); border-radius: 12px; padding: 12px 14px; background: var(--fond-carte, #fff); }',
      '.d2c-cie-tete { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }',
      '.d2c-cie-tete h3 { margin: 0; font-size: 15px; }',
      '.d2c-cie-tete .actions-ligne { margin-left: auto; }',
      '.d2c-comptes { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; color: var(--encre-2); font-size: 13px; }',
      '.d2c-comptes b { color: var(--encre); font-weight: 650; }',
      '.d2c-resultat { margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: var(--fond-2, #F4F6F8); font-size: 13px; }',
      '.d2c-resultat.ok { background: var(--vert-bg, #E6F4EC); }',
      '.d2c-resultat.erreur { background: var(--rouge-bg); }',
      '.d2c-listes { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; margin-top: 10px; }',
      '.d2c-liste summary { cursor: pointer; font-weight: 600; font-size: 13px; }',
      '.d2c-liste table { width: 100%; font-size: 12.5px; margin-top: 6px; border-collapse: collapse; }',
      '.d2c-liste td { padding: 3px 6px 3px 0; border-bottom: 1px solid var(--ligne); vertical-align: top; }',
      '.d2c-options { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }',
      '.d2c-etat-table td, .d2c-etat-table th { white-space: nowrap; }',
      '.d2c-etat-table td.resume { white-space: normal; font-size: 12.5px; color: var(--encre-2); max-width: 520px; }',
      '@media (max-width: 860px) { .d2c-cie-tete .actions-ligne { margin-left: 0; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function ImportD2c(ctx) {
    var self = this;
    injecterCss();
    this.recu = null;          // { lu, niveau, total, attendu, sansVin, auto, vehicules, par: { CIE: [v] } }
    this.simulations = {};     // CIE → réponse du serveur (mode simuler)
    this.imports = {};         // CIE → réponse du serveur (mode importer)
    this.enCours = {};         // CIE → 'simulation' | 'import'
    this.etat = null;          // GET ?d2c=1
    this.auto = !!(ctx && ctx.params && (ctx.params.auto === '1' || ctx.params.auto === 'true'));
    this.options = AMX.memo.lire('d2c_options', { couts: true, km: true, carfax: true, neufs: true, usages: true });
    this.el = h('div.page.etroite.d2c-page', { dataset: { etat: 'attente' } });
    this.surMessage = function (ev) { self.recevoirMessage(ev); };
    window.addEventListener('message', this.surMessage);
    this.construire();
    this.chargerEtat();
  }
  ImportD2c.prototype.demonter = function () { window.removeEventListener('message', this.surMessage); if (this.surPrix) window.removeEventListener('amx:prixDetail', this.surPrix); };
  ImportD2c.prototype.naviguer = function (ctx) { if (ctx && ctx.params && (ctx.params.auto === '1' || ctx.params.auto === 'true')) this.auto = true; };
  ImportD2c.prototype.marquer = function (etat) { this.el.dataset.etat = etat; };

  /* ------------------------------ Construction ------------------------------ */
  ImportD2c.prototype.construire = function () {
    var self = this;
    var signet = h('a.btn.primaire', { href: CODE_SIGNET_D2C, text: 'Automax ← D2C', title: 'Glissez ce bouton dans votre barre de favoris', draggable: 'true' });
    signet.addEventListener('click', function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B pour l\'afficher), puis cliquez-le depuis D2C Media (Inventory › Summary).', 'attention', 7000); });
    var btnOuvrir = h('button.btn#d2c-ouvrir', { html: I.externe + '<span>Ouvrir D2C Media</span>', onclick: function () { self.ouvrirD2c(); } });
    this.el.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Import D2C'), h('p', 'Reprend chaque matin l\'inventaire que D2C Media reçoit du DMS (Serti pour Hyundai Longueuil et Ste-Marie) : les neufs vers le suivi des neufs, les usagés vers les registres (ajouts, coûts, # stock, vendus), le kilométrage dans les fiches d\'achat et les liens CARFAX. Rien n\'est écrit avant que vous ayez vu la simulation — sauf par la tâche automatique du matin.')]),
      h('div.actions', [btnOuvrir])
    ]));
    this.el.appendChild(h('div.carte', { style: { marginBottom: '14px' } }, [
      h('div.carte-entete', [h('h2', 'En un clic : le signet « Automax ← D2C »')]),
      h('div.carte-corps', [
        h('div.grille.c3', [
          h('div', [h('div.section-titre', '1. Installer (une fois)'), h('p', { style: { margin: '0 0 10px', color: 'var(--encre-2)' } }, 'Glissez ce bouton dans la barre de favoris de Chrome. Si la barre est cachée : Cmd+Shift+B.'), signet]),
          h('div', [h('div.section-titre', '2. Dans D2C Media'), h('p', { style: { margin: 0, color: 'var(--encre-2)' } }, 'Ouvrez Inventory › Summary, de préférence au niveau « Groupe Auto Max » (menu en haut à gauche) pour avoir toutes les concessions d\'un coup. Si D2C s\'ouvre sur sa page de connexion, connectez-vous d\'abord.')]),
          h('div', [h('div.section-titre', '3. Cliquer le signet'), h('p', { style: { margin: 0, color: 'var(--encre-2)' } }, 'Il lit toute la table (une vingtaine de secondes) et la transmet ici : la simulation s\'affiche, puis « Importer » écrit pour vrai, une concession à la fois.')])
        ])
      ])
    ]));
    // 26 oct. : les prix de détail changés dans ScanAutomax, à inscrire sur le site par le favori « Automax → D2C (prix) ».
    this.elPrix = h('div');
    this.el.appendChild(this.elPrix);
    if (AMX.prixDetail && AMX.prixDetail.peut()) {
      AMX.prixDetail.charger().then(function () { AMX.prixDetail.carte(self.elPrix); }, function () {});
      this.surPrix = function () { AMX.prixDetail.carte(self.elPrix); };
      window.addEventListener('amx:prixDetail', this.surPrix);
    }
    this.elEtat = h('div');
    this.el.appendChild(h('div.carte', { style: { marginBottom: '14px' } }, [h('div.carte-entete', [h('h2', 'Dernier import par concession'), h('div.actions-ligne', [h('button.btn.fantome.petit', { text: 'Rafraîchir', onclick: function () { self.chargerEtat(true); } })])]), h('div.carte-corps', [this.elEtat])]));
    var cases = ['couts', 'km', 'carfax', 'neufs', 'usages'].map(function (k) {
      var libelles = { couts: 'Mettre à jour les coûts', km: 'Poser les km manquants', carfax: 'Liens CARFAX', neufs: 'Neufs → suivi des neufs', usages: 'Usagés → registres' };
      var c = h('input', { type: 'checkbox', checked: self.options[k] !== false });
      c.addEventListener('change', function () { self.options[k] = c.checked; AMX.memo.ecrire('d2c_options', self.options); self.simulations = {}; self.rendreRecu(); if (self.recu) self.simulerTout(); });
      return h('label.case', [c, h('span', libelles[k])]);
    });
    this.elRecu = h('div');
    this.elCarteRecu = h('div.carte#d2c-recu', [
      h('div.carte-entete', [h('h2', 'Liste reçue de D2C'), h('div.actions-ligne', [h('button.btn.primaire#d2c-tout', { text: 'Tout importer', disabled: true, onclick: function () { self.importerTout(); } })])]),
      h('div.carte-corps', [h('div.d2c-options', { style: { marginBottom: '10px' } }, cases), this.elRecu])
    ]);
    this.el.appendChild(this.elCarteRecu);
    this.rendreRecu();
  };

  /* ------------------------------ D2C : ouvrir ------------------------------ */
  // L'onglet D2C ouvert d'ici garde window.opener : le signet (ou la tâche) nous renvoie la liste sans rien ouvrir d'autre.
  ImportD2c.prototype.ouvrirD2c = function () {
    var w = null;
    try { w = window.open(URL_D2C, NOM_FENETRE_D2C); } catch (e) { w = null; }
    if (!w) { AMX.toast('Chrome a bloqué l\'ouverture de D2C : autorisez les fenêtres surgissantes pour ce site, ou ouvrez admin.d2cmedia.ca vous-même.', 'erreur', 7000); return; }
    this.fenetreD2c = w;
    AMX.toast('D2C Media s\'ouvre dans un nouvel onglet. Connectez-vous s\'il le demande, allez dans Inventory › Summary (niveau Groupe Auto Max), puis cliquez le signet « Automax ← D2C ».', 'ok', 9000);
  };

  /* --------------------------- Réception (postMessage) --------------------------- */
  ImportD2c.prototype.recevoirMessage = function (ev) {
    if (ev.origin !== ORIGINE_D2C || !ev.data || typeof ev.data !== 'object') return;
    var m = ev.data;
    if (m.type === 'amx:d2c-ping') { try { ev.source.postMessage({ type: 'amx:d2c-pret' }, ev.origin); } catch (e) {} return; }
    if (m.type !== 'amx:d2c' || !Array.isArray(m.vehicules)) return;
    var total = m.vehicules.length;
    try { ev.source.postMessage({ type: 'amx:d2c-recu', total: total }, ev.origin); } catch (e2) {}
    // Un même envoi répété (le signet insiste jusqu'à l'accusé) : on ne recommence pas la simulation.
    if (this.recu && this.recu.lu === m.lu && this.recu.total === total) return;
    this.recevoir({ lu: String(m.lu || new Date().toISOString()), niveau: String(m.niveau || ''), total: total, attendu: m.attendu || total, sansVin: m.sansVin || 0, auto: !!m.auto, vehicules: m.vehicules }, 'signet');
  };
  ImportD2c.prototype.recevoir = function (recu, source) {
    var par = {}, ordre = [];
    recu.vehicules.forEach(function (v) {
      if (!v || typeof v !== 'object') return;
      var c = compagnieDe(v) || '?';
      if (!par[c]) { par[c] = []; ordre.push(c); }
      par[c].push(v);
    });
    recu.par = par; recu.ordre = ordre; recu.source = source || 'signet';
    this.recu = recu; this.simulations = {}; this.imports = {}; this.enCours = {};
    this.marquer('recu');
    AMX.toast(pl(recu.total, 'véhicule') + ' reçu' + (recu.total > 1 ? 's' : '') + ' de D2C Media' + (recu.niveau ? ' (' + recu.niveau + ')' : '') + ' — simulation en cours…', 'ok', 6000);
    this.rendreRecu();
    if (this.elCarteRecu.scrollIntoView) this.elCarteRecu.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Import automatique seulement à l'arrivée d'une liste (tâche planifiée : `auto` dans le message, ou ?auto=1) — jamais
    // sur une nouvelle simulation déclenchée par un changement d'option.
    this.simulerTout(!!recu.auto || this.auto);
  };

  /* ------------------------------ Serveur ------------------------------ */
  ImportD2c.prototype.actives = function () { return (this.etat && this.etat.actives) || ['HYUNDAI', 'STM']; };
  ImportD2c.prototype.chargerEtat = function (force) {
    var self = this;
    if (!force && this.etatPromesse) return this.etatPromesse;
    this.etatPromesse = AMX.get({ d2c: 1 }).then(function (d) {
      AMX.verifier(d, 'Lecture de l\'état impossible');
      if (!d.noms || !d.actives) throw new Error(SCRIPT_PAS_A_JOUR);
      self.etat = d; self.rendreEtat(); self.rendreRecu();
      return d;
    }).catch(function (e) { self.etatErreur = AMX.erreurTexte(e); self.rendreEtat(); });
    return this.etatPromesse;
  };
  ImportD2c.prototype.envoyer = function (cie, mode) {
    var self = this, recu = this.recu;
    var corps = { action: 'd2cImporter', compagnie: cie, mode: mode, vehicules: recu.par[cie] || [], lu: recu.lu, niveau: recu.niveau, options: Object.assign({}, this.options) };
    this.enCours[cie] = mode === 'importer' ? 'import' : 'simulation';
    this.rendreRecu();
    return AMX.post(corps, { delai: DELAI_POST_MS }).then(function (d) {
      AMX.verifier(d, mode === 'importer' ? 'Import impossible' : 'Simulation impossible');
      if (!d.compagnie && d.vehicules) throw new Error(SCRIPT_PAS_A_JOUR);
      return d;
    }).then(function (d) {
      delete self.enCours[cie];
      if (mode === 'importer') { self.imports[cie] = d; delete self.simulations[cie]; }
      else { self.simulations[cie] = d; delete self.imports[cie]; }   // une nouvelle simulation remplace l'affichage de l'import précédent (et permet de réimporter)
      self.rendreRecu();
      return d;
    }, function (e) {
      delete self.enCours[cie];
      var err = { ok: false, erreur: AMX.erreurTexte(e), compagnie: cie };
      if (mode === 'importer') self.imports[cie] = err; else self.simulations[cie] = err;
      self.rendreRecu();
      throw e;
    });
  };
  ImportD2c.prototype.ciesActives = function () { var self = this; return (this.recu ? this.recu.ordre : []).filter(function (c) { return self.actives().indexOf(c) >= 0; }); };
  ImportD2c.prototype.simulerTout = function (puisImporter) {
    var self = this;
    this.marquer('simulation');
    var suite = this.chargerEtat().then(function () {
      var cies = self.ciesActives();
      return cies.reduce(function (p, c) { return p.then(function () { return self.envoyer(c, 'simuler').catch(function () {}); }); }, Promise.resolve());
    });
    return suite.then(function () {
      self.marquer('simule');
      if (puisImporter && self.recu) return self.importerTout();
    });
  };
  ImportD2c.prototype.importer = function (cie) {
    var self = this;
    this.marquer('import');
    return this.envoyer(cie, 'importer').then(function (d) {
      AMX.toast(nomCie(cie) + ' : ' + (d.resume || 'import terminé'), 'ok', 9000);
      // Ce qui est partagé avec les autres pages se recharge.
      try { if (AMX.inventaire && AMX.inventaire.tout) AMX.inventaire.tout(true).catch(function () {}); } catch (e) {}
      try { if (AMX.carfax && AMX.carfax.charger) AMX.carfax.charger(true).catch(function () {}); } catch (e2) {}
      self.chargerEtat(true);
      if (!Object.keys(self.enCours).length) self.marquer('termine');
      return d;
    }).catch(function (e) { AMX.toast(nomCie(cie) + ' : ' + AMX.erreurTexte(e), 'erreur', 9000); if (!Object.keys(self.enCours).length) self.marquer('erreur'); throw e; });
  };
  ImportD2c.prototype.importerTout = function () {
    var self = this, cies = this.ciesActives().filter(function (c) { return !self.imports[c] || !self.imports[c].ok; });
    if (!cies.length) return Promise.resolve();
    return cies.reduce(function (p, c) { return p.then(function () { return self.importer(c).catch(function () {}); }); }, Promise.resolve()).then(function () {
      var fait = cies.filter(function (c) { return self.imports[c] && self.imports[c].ok; }).length;
      self.marquer(fait === cies.length ? 'termine' : 'erreur');
      self.rendreRecu();
    });
  };

  /* ------------------------------ Rendu ------------------------------ */
  ImportD2c.prototype.rendreEtat = function () {
    var self = this;
    AMX.vider(this.elEtat);
    if (this.etatErreur && !this.etat) { this.elEtat.appendChild(h('div.alerte-bloc.erreur', { text: this.etatErreur })); this.elEtat.appendChild(h('p.doux.petit', { style: { margin: '10px 0 0' } }, 'Concessions actives (par défaut) : ' + this.actives().map(nomCie).join(', ') + '.')); return; }
    if (!this.etat) { this.elEtat.appendChild(h('div.doux.petit', 'Chargement…')); return; }
    var etat = this.etat.etat || {}, actives = this.actives(), noms = this.etat.noms || {};
    var cies = Object.keys(AMX.COMPAGNIES_TOUTES);
    var table = h('table.tableau.d2c-etat-table'), corps = h('tbody');
    table.appendChild(h('thead', [h('tr', [h('th', 'Concession'), h('th', 'Import D2C'), h('th', 'Dernier passage'), h('th', 'Neufs'), h('th', 'Usagés'), h('th', 'CARFAX'), h('th', 'Résumé')])]));
    cies.forEach(function (c) {
      var e = etat[c], active = actives.indexOf(c) >= 0;
      var n = e && e.neufs, u = e && e.usages;
      corps.appendChild(h('tr', { dataset: { cie: c } }, [
        h('td', [h('b', { text: nomCie(c) })]),
        h('td', [h('span.puce' + (active ? '.ok' : ''), { text: active ? 'Actif' : 'Pas encore' })]),
        h('td', e ? [h('div', { text: quand(e.le) }), h('div.mini', { text: (e.par ? e.par + ' · ' : '') + (e.source || '') })] : [h('span.mini', { text: active ? 'Jamais importé' : '—' })]),
        h('td', n ? [h('div', { text: n.total + (n.initial ? ' (premier import)' : ' · +' + (n.arrivees || 0) + ' / −' + (n.sorties || 0)) }), h('div.mini', { text: n.enStock + ' en stock · ' + n.transit + ' transit · ' + n.demos + ' démo' })] : '—'),
        h('td', u ? [h('div', { text: u.total + ' · ' + pl(u.ajoutes || 0, 'ajouté') + ' · ' + pl(u.vendus || 0, 'vendu') }), h('div.mini', { text: (u.kms || 0) + ' km posés · ' + (u.couts || 0) + ' coûts' + (u.inconnus ? ' · ' + u.inconnus + ' inconnus du DMS' : '') })] : '—'),
        h('td', e && e.carfax ? [h('div', { text: '+' + (e.carfax.nouveaux || 0) }), h('div.mini', { text: (e.carfax.dejaLa || 0) + ' déjà là' })] : '—'),
        h('td.resume', { text: e ? (e.resume || '') : '' })
      ]));
    });
    table.appendChild(corps);
    this.elEtat.appendChild(table);
    this.elEtat.appendChild(h('p.doux.petit', { style: { margin: '10px 0 0' } }, 'Concessions actives : ' + actives.map(nomCie).join(', ') + '. Les autres arrivent dans la liste mais ne sont pas importées (leur feed D2C vient d\'un autre fournisseur, ou leur DMS est déjà suivi autrement).'));
  };

  ImportD2c.prototype.rendreRecu = function () {
    var self = this;
    AMX.vider(this.elRecu);
    var btnTout = this.el.querySelector('#d2c-tout');
    if (!this.recu) {
      this.elRecu.appendChild(h('div.vide', [h('div', { html: I.lien }), h('h3', 'Aucune liste reçue'), h('div', 'Cliquez « Ouvrir D2C Media » puis le signet « Automax ← D2C » dans D2C : la liste arrive ici toute seule.')]));
      if (btnTout) { btnTout.disabled = true; btnTout.textContent = 'Tout importer'; }
      return;
    }
    var recu = this.recu, actives = this.actives();
    this.elRecu.appendChild(h('p.doux.petit', { style: { margin: '0 0 10px' } }, pl(recu.total, 'véhicule') + ' lu' + (recu.total > 1 ? 's' : '') + ' dans D2C le ' + quand(recu.lu) + (recu.niveau ? ' (' + recu.niveau + ')' : '') + (recu.attendu && recu.attendu !== recu.total ? ' — ' + recu.attendu + ' attendus' : '') + (recu.sansVin ? ' · ' + recu.sansVin + ' sans NIV' : '') + ((recu.auto || this.auto) ? ' · mode automatique' : '')));
    var grille = h('div.d2c-cies');
    recu.ordre.forEach(function (c) {
      var liste = recu.par[c], active = actives.indexOf(c) >= 0;
      var corps = { neuf: 0, usage: 0, demo: 0, transit: 0, vendus: 0, cout: 0, km: 0, carfax: 0 }, fournisseurs = {};
      liste.forEach(function (v) {
        var b = String(v.corps || '').toLowerCase();
        if (/demo/.test(b)) corps.demo++; else if (/used|usag|sold/.test(b)) corps.usage++; else corps.neuf++;   // body D2C : new | used | demo | sold
        if (/transit/i.test(String(v.livraison || ''))) corps.transit++;
        if (v.vendu || /sold/.test(b)) corps.vendus++;
        if (v.cout) corps.cout++;
        if (v.km && v.km > 50) corps.km++;
        if (v.carfax) corps.carfax++;
        var f = v.fournisseur || '?'; fournisseurs[f] = (fournisseurs[f] || 0) + 1;
      });
      var sim = self.simulations[c], imp = self.imports[c], enCours = self.enCours[c];
      var carte = h('div.d2c-cie', { dataset: { cie: c } });
      var btnImporter = h('button.btn.primaire.petit', { text: 'Importer ' + nomCie(c), disabled: !active || !!enCours || !(sim && sim.ok) || !!(imp && imp.ok), onclick: function () { self.importer(c); } });
      var btnSimuler = h('button.btn.fantome.petit', { text: 'Simuler', disabled: !active || !!enCours, onclick: function () { self.envoyer(c, 'simuler').catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }); } });
      carte.appendChild(h('div.d2c-cie-tete', [
        h('h3', { text: c === '?' ? 'Concession non reconnue' : nomCie(c) }),
        h('span.puce' + (active ? '.ok' : ''), { text: active ? 'Actif' : 'Pas encore importée' }),
        enCours ? h('span.puce.info', { text: enCours === 'import' ? 'Import en cours…' : 'Simulation…' }) : null,
        imp && imp.ok ? h('span.puce.ok', { text: 'Importé ' + quand(imp.le) }) : null,
        h('div.actions-ligne', [btnSimuler, btnImporter])
      ]));
      carte.appendChild(h('div.d2c-comptes', [
        h('span', [h('b', { text: String(liste.length) }), ' véhicules']),
        h('span', [h('b', { text: String(corps.neuf) }), ' neufs' + (corps.transit ? ' (' + corps.transit + ' en transit)' : '')]),
        h('span', [h('b', { text: String(corps.demo) }), ' démos']),
        h('span', [h('b', { text: String(corps.usage) }), ' usagés']),
        corps.vendus ? h('span', [h('b', { text: String(corps.vendus) }), ' vendus']) : null,
        h('span', [h('b', { text: String(corps.cout) }), ' avec coût']),
        h('span', [h('b', { text: String(corps.km) }), ' avec km']),
        h('span', [h('b', { text: String(corps.carfax) }), ' liens CARFAX']),
        h('span', { text: 'Feed : ' + Object.keys(fournisseurs).map(function (f) { return f + ' ' + fournisseurs[f]; }).join(', ') })
      ]));
      var res = imp || sim;
      if (res) carte.appendChild(self.rendreResultat(res, !!imp));
      grille.appendChild(carte);
    });
    this.elRecu.appendChild(grille);
    var pretes = this.ciesActives().filter(function (c) { return self.simulations[c] && self.simulations[c].ok && !(self.imports[c] && self.imports[c].ok); });
    var occupe = Object.keys(this.enCours).length > 0;
    if (btnTout) { btnTout.disabled = occupe || !pretes.length; btnTout.textContent = occupe ? 'En cours…' : (pretes.length ? 'Importer ' + pretes.map(nomCie).join(' + ') : 'Tout importer'); }
  };

  /** Le détail d'une réponse du serveur (simulation ou import) pour une concession. */
  ImportD2c.prototype.rendreResultat = function (r, importe) {
    if (!r.ok) return h('div.d2c-resultat.erreur', [h('b', { text: importe ? 'Import refusé : ' : 'Simulation impossible : ' }), r.erreur || 'erreur inconnue']);
    var bloc = h('div.d2c-resultat' + (importe ? '.ok' : ''), { dataset: { mode: importe ? 'import' : 'simulation' } });
    bloc.appendChild(h('div', [h('b', { text: importe ? 'Importé — ' : 'Simulation — ' }), r.resume || '']));
    if (r.regle) bloc.appendChild(h('p.doux.petit', { style: { margin: '6px 0 0' } }, 'Règle : ' + r.regle));
    var n = r.neufs, u = r.usages, cf = r.carfax, listes = h('div.d2c-listes');
    function liste(titre, lignes, colonnes) {
      if (!lignes || !lignes.length) return;
      var d = h('details.d2c-liste', [h('summary', { text: titre + ' (' + lignes.length + ')' })]);
      var t = h('table'), tb = h('tbody');
      lignes.forEach(function (l) { tb.appendChild(h('tr', colonnes.map(function (col) { return h('td', { text: col(l) }); }))); });
      t.appendChild(tb); d.appendChild(t);
      listes.appendChild(d);
    }
    if (u && !u.erreur) {
      liste('Usagés à ajouter au registre Detail', u.ajoutes, [function (l) { return l.vin; }, function (l) { return l.modele + (l.stock ? ' · # ' + l.stock : ''); }, function (l) { return fmtKm(l.km) + ' · ' + fmt$(l.cout) + (l.jours !== null && l.jours !== undefined ? ' · ' + l.jours + ' j' : ''); }]);
      liste('Passés Vendu', u.vendus, [function (l) { return l.vin; }, function (l) { return l.modele + ' (' + l.registre + ')'; }, function (l) { return l.raison; }]);
      liste('En stock chez nous, inconnus du DMS (pas touchés)', u.inconnusDms, [function (l) { return l.vin; }, function (l) { return l.modele + (l.stock ? ' · # ' + l.stock : ''); }, function (l) { return l.registre; }]);
      liste('Coûts mis à jour', u.couts, [function (l) { return l.vin; }, function (l) { return l.modele; }, function (l) { return fmt$(l.avant) + ' → ' + fmt$(l.apres); }]);
      liste('# stock posés', u.stocks, [function (l) { return l.vin; }, function (l) { return l.modele; }, function (l) { return '# ' + l.stock; }]);
      liste('Km posés dans la fiche d\'achat', u.kms, [function (l) { return l.vin; }, function (l) { return l.modele; }, function (l) { return fmtKm(l.km); }]);
      liste('Écarts de km (fiche ≠ D2C, rien d\'écrasé)', u.kmEcarts, [function (l) { return l.vin; }, function (l) { return l.modele; }, function (l) { return 'fiche ' + fmtKm(l.fiche) + ' · D2C ' + fmtKm(l.d2c); }]);
      if (!u.fiable) bloc.appendChild(h('p.doux.petit', { style: { margin: '6px 0 0' } }, 'Moins de ' + ((this.etat && this.etat.minUsages) || 10) + ' usagés dans la liste : aucun passage à Vendu n\'est déduit.'));
    } else if (u && u.erreur) bloc.appendChild(h('p', { style: { color: 'var(--rouge)', margin: '6px 0 0' } }, 'Usagés : ' + u.erreur));
    if (n && !n.erreur) bloc.appendChild(h('p.doux.petit', { style: { margin: '6px 0 0' } }, 'Neufs : ' + n.total + ' (' + n.enStock + ' en stock, ' + n.transit + ' en transit' + (n.production ? ', ' + n.production + ' en production' : '') + ', ' + n.demos + ' démo' + (n.vendus ? ', ' + n.vendus + ' vendus' : '') + ', ' + n.avecCout + ' avec coût)' + (n.resultat ? (n.resultat.initial ? ' — premier import' : ' — ' + pl(n.resultat.arrivees || 0, 'arrivée') + ', ' + pl(n.resultat.sorties || 0, 'sortie') + ', ' + pl(n.resultat.modifies || 0, 'modifié')) + (n.resultat.fiable === false ? ' (feed trop petit : aucune sortie déduite)' : '') : '') + (n.arrivesAujourdhui ? ' · ' + n.arrivesAujourdhui + ' arrivé(s) de transit aujourd\'hui' : '') + '.'));
    else if (n && n.erreur) bloc.appendChild(h('p', { style: { color: 'var(--rouge)', margin: '6px 0 0' } }, 'Neufs : ' + n.erreur));
    if (cf && !cf.erreur) bloc.appendChild(h('p.doux.petit', { style: { margin: '6px 0 0' } }, 'CARFAX : ' + pl(cf.nouveaux || 0, 'nouveau lien', 'nouveaux liens') + ', ' + (cf.dejaLa || 0) + ' déjà en place (jamais remplacés).'));
    if (r.autres && Object.keys(r.autres).length) bloc.appendChild(h('p.doux.petit', { style: { margin: '6px 0 0' } }, 'Ignorés (autre concession) : ' + Object.keys(r.autres).map(function (k) { return nomCie(k) + ' ' + r.autres[k]; }).join(', ')));
    if (listes.children.length) bloc.appendChild(listes);
    return bloc;
  };

  AMX.vues.ImportD2c = ImportD2c;
})();
