/* Valeurs OpenLane (9 octobre 2026) — Outils › Valeurs OpenLane, bloc « Valeurs OpenLane »
   dans le panneau d'inventaire, la fiche d'achat, le Suivi service et l'évaluation, puce
   « OpenLane 23 055 $ » sur les lignes d'inventaire et de service.

   Maxime : « faire la même chose que eBlock avec app.openlane.ca/marketguide — quand je
   fais une recherche de NIV pour les valeurs » : inventaire en stock + évaluations
   récentes + NIV demandés à la main.

   Le signet « Automax ← OpenLane (valeurs) » (chargeur : CODE_SIGNET_OPENLANE, code
   complet publié dans assets/signet-openlane.js par mock/signet-build.py depuis
   mock/signet-openlane.src.js) demande au site la liste des NIV à lire (pont.html),
   interroge Market Guide dans la page OpenLane de l'utilisateur (décodage, ventes
   comparables 90 / 180 j, prévision 30-60-90 j au km connu) et renvoie les valeurs par
   lots. Routes : GET ?openlane=1, ?openlaneVin=NIV ; POST openlaneImporter
   (phases liste / valeurs / demander).

   - AMX.vues.ValeursOpenlane : la page (import, demande d'un NIV, cartes par
     concession, table, détail en modale, export Excel).
   - AMX.openlaneBloc(vin, conteneur, opts) : bloc compact pour un NIV.
   - AMX.openlaneOuvrir(vin, ligne) : la modale, d'où qu'on vienne.
   - AMX.openlanePuce(vin) : puce pour une ligne (index par NIV en cache local). */
(function () {
  'use strict';
  var h = AMX.h, esc = AMX.esc, I = AMX.icones;
  var URL_MARCHE = 'https://app.openlane.ca/marketguide';
  var TAUX_KM = 0.10;   // $ par km pour « ajusté à votre km » (même repère que l'évaluation)
  // Chargeur du signet (généré par mock/signet-build.py) — ne jamais éditer la constante à la main.
  var CODE_SIGNET_OPENLANE = "javascript:(function () { var s = document.createElement('script'); s.src = " + JSON.stringify(AMX.SITE) + " + 'assets/signet-openlane.js?t=' + Date.now(); s.onerror = function () { alert(\"Impossible de charger le signet depuis le site d'inventaire (groupeautomax.github.io). V\u00e9rifiez votre connexion, puis recliquez.\"); }; document.body.appendChild(s); })();";

  function nombre(v) { if (v === null || v === undefined || v === '') return null; if (typeof v === 'number') return isNaN(v) ? null : v; var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; }
  function fmt(n) { n = nombre(n); return n === null ? '—' : AMX.fmtArgent(n, 0); }
  function fmtKm(n) { n = nombre(n); return n === null ? '—' : AMX.fmtNombre(Math.round(n)) + ' km'; }
  function vehiculeTexte(r) { return [r.annee, r.marque, r.modele, r.version].filter(Boolean).join(' ') || r.modeleInventaire || r.vehicule || '—'; }
  function nomCie(code) { return (AMX.COMPAGNIES_TOUTES[code] || code || '').replace(' Chevrolet Buick Cadillac', ''); }
  function couleurCie(code) { return (AMX.COULEUR_COMPAGNIE && AMX.COULEUR_COMPAGNIE[code]) || 'gris'; }
  function libelleSource(s) { return { inventaire: 'Inventaire', evaluation: 'Évaluation', manuel: 'Demandé' }[s] || s || ''; }
  function fourchette(a, b) { a = nombre(a); b = nombre(b); if (a === null && b === null) return '—'; if (a === null || b === null || a === b) return fmt(a === null ? b : a); return fmt(a) + ' – ' + fmt(b); }
  function milieu(a, b) { a = nombre(a); b = nombre(b); if (a === null) return b; if (b === null) return a; return Math.round((a + b) / 2); }
  /** Prix moyen des ventes ramené au km du véhicule (TAUX_KM $ / km) ; null sans ventes ou sans km. */
  function ajuste(r, km) {
    km = nombre(km === undefined ? r.km : km); var moy = nombre(r.prixMoy), kmMoy = nombre(r.kmMoy);
    if (km === null || moy === null || kmMoy === null) return null;
    return Math.round(moy + (kmMoy - km) * TAUX_KM);
  }
  function badgeInventaire(r) {
    if (!r.registre) return h('span.badge.sans-point.gris', { text: r.source === 'evaluation' ? 'Évaluation' : (r.source === 'manuel' ? 'Demandé' : 'Plus à l\'inventaire') });
    var s = AMX.statut(r.statutInventaire, r.registre);
    return h('span.badge.sans-point.' + s.couleur, { text: s.libelle + ' · ' + (r.registre === 'DETAIL' ? 'Detail' : (r.registre === 'CAN' ? 'Canada' : 'É.-U.')) });
  }
  function peutDemander() { return AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.perm('gererUtilisateurs') || AMX.estAdmin(); }

  function injecterCss() {
    if (document.getElementById('css-openlane')) return;
    var s = document.createElement('style');
    s.id = 'css-openlane';
    s.textContent = [
      '.ol-page .carte { margin-bottom: 12px; }',
      '.ol-cartes { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 12px; }',
      '.ol-carte { text-align: left; background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); padding: 10px 12px 9px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; box-shadow: var(--ombre); position: relative; overflow: hidden; }',
      '.ol-carte::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--ligne-forte); }',
      '.ol-carte.vert::before { background: var(--vert); } .ol-carte.bleu::before { background: var(--bleu); } .ol-carte.violet::before { background: var(--violet); } .ol-carte.sombre::before { background: var(--noir-2); } .ol-carte.ambre::before { background: var(--ambre); } .ol-carte.toutes::before { background: linear-gradient(var(--bleu), var(--noir-2)); }',
      '.ol-carte.actif { border-color: var(--encre); box-shadow: 0 0 0 2px rgba(0,0,0,.08); }',
      '.ol-carte .haut { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; } .ol-carte .nom { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .ol-carte .n { font-size: 20px; font-weight: 700; }',
      '.ol-carte .bas { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11.5px; color: var(--encre-3); } .ol-carte .bas b { color: var(--encre); font-weight: 600; }',
      '.ol-outils { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .ol-outils .recherche { display: flex; align-items: center; gap: 6px; flex: 1 1 220px; } .ol-outils .recherche svg { width: 16px; height: 16px; color: var(--encre-3); } .ol-outils .recherche input { flex: 1; }',
      '.ol-outils .compte { margin-left: auto; font-size: 12px; }',
      '.ol-table { overflow-x: auto; } .ol-table .tableau { min-width: 980px; } .ol-table td, .ol-table th { padding: 7px 10px; vertical-align: middle; }',
      '.ol-table td.vehicule { display: flex; gap: 8px; align-items: center; min-width: 230px; } .ol-table td.vehicule .nom { font-weight: 600; } .ol-table td.vehicule .vin { font-family: var(--mono); font-size: 11px; color: var(--encre-3); }',
      '.ol-table td.vehicule .logo-marque { width: 34px; height: 34px; flex: none; border: 1px solid var(--ligne); border-radius: 8px; display: grid; place-items: center; background: #fff; font-size: 11px; font-weight: 700; color: var(--encre-4); overflow: hidden; } .ol-table td.vehicule .logo-marque img { width: 24px; height: 24px; object-fit: contain; }',
      '.ol-table td.num, .ol-table td.date, .ol-table td.badges { white-space: nowrap; } .ol-table td.num .mini { color: var(--encre-3); }',
      '.ol-table tr.sans-valeur td { color: var(--encre-3); } .ol-table td.fort { font-weight: 700; }',
      '.ol-etapes { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; } .ol-etapes .section-titre { margin-bottom: 4px; } .ol-etapes p { margin: 0 0 8px; color: var(--encre-2); font-size: 12.5px; }',
      '.ol-import-etat { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 12px; } .ol-import-etat .case { background: var(--carte-2); border: 1px solid var(--ligne); border-radius: 8px; padding: 8px 10px; } .ol-import-etat .case b { display: block; font-size: 18px; } .ol-import-etat .mini { font-size: 11px; color: var(--encre-3); }',
      '.ol-demande { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--ligne); } .ol-demande input { font-family: var(--mono); } .ol-demande .niv { width: 200px; text-transform: uppercase; } .ol-demande .km { width: 120px; }',
      '.ol-tuiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; } .ol-tuiles .tuile { background: var(--carte-2); border: 1px solid var(--ligne); border-radius: 8px; padding: 8px 10px; min-width: 0; } .ol-tuiles .l { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--encre-3); line-height: 1.25; } .ol-tuiles .v { font-size: 17px; font-weight: 700; } .ol-tuiles .m { font-size: 11px; color: var(--encre-3); } .ol-tuiles .tuile.fort { background: var(--vert-clair); border-color: #B6E0C6; } .ol-tuiles .tuile.prev { background: #EEF4FF; border-color: #C7D7FB; }',
      '.ol-fiche h4 { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin: 14px 0 6px; } .ol-fiche h4:first-child { margin-top: 0; }',
      '.ol-fiche dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; font-size: 12.5px; margin: 0; } .ol-fiche dt { color: var(--encre-3); } .ol-fiche dd { margin: 0; }',
      '.ol-comparables { overflow-x: auto; } .ol-comparables table { width: 100%; border-collapse: collapse; font-size: 12.5px; } .ol-comparables th, .ol-comparables td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--ligne); white-space: nowrap; } .ol-comparables th { color: var(--encre-3); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; } .ol-comparables td.num, .ol-comparables th.num { text-align: right; } .ol-comparables img { width: 48px; height: 36px; object-fit: cover; border-radius: 5px; background: var(--gris-bg); display: block; }',
      '.ol-prev-ligne { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; } .ol-prev-ligne b { font-weight: 700; }',
      '.ol-bloc { display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; } .ol-bloc .ligne-badges { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; } .ol-bloc .ol-tuiles .v { font-size: 15px; }',
      '.ol-erreurs { font-size: 11.5px; color: var(--encre-3); }',
      '.puce.openlane { cursor: pointer; } .puce.openlane b { font-weight: 700; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ La vue ------------------------------- */
  function ValeursOpenlane(ctx) {
    injecterCss();
    this.generation = 0;
    this.liste = null; this.erreur = ''; this.refus = '';
    this.compagnie = AMX.compagnieChoisie('inventaire');
    this.portee = AMX.memo.lire('openlane_portee', 'stock');   // 'stock' | 'evaluation' | 'tous'
    this.recherche = '';
    this.tri = { cle: 'luLe', desc: true };
    this.construire();
    var local = AMX.cacheLocal.lire('openlane', 7 * 86400000);
    if (local && Array.isArray(local.donnees)) { this.liste = local.donnees; this.duCache = true; }
    this.rendre();
    this.naviguer(ctx || {});
    this.charger();
    var moi = this;
    this.surProfil = function () { if (moi.liste) { moi.compagnie = AMX.compagnieChoisie('inventaire'); moi.rendre(); } };
    document.addEventListener('amx:profil', this.surProfil);
  }
  ValeursOpenlane.prototype.demonter = function () { this.generation++; document.removeEventListener('amx:profil', this.surProfil); };
  ValeursOpenlane.prototype.naviguer = function (ctx) {
    var p = (ctx && ctx.params) || {};
    if (p.vin) { this.recherche = String(p.vin).trim().toUpperCase(); this.elRecherche.value = this.recherche; this.portee = 'tous'; if (this.liste) this.rendre(); }
    if (p.ouvrir) { this.ouvrirVin = String(p.ouvrir).toUpperCase(); if (this.liste) AMX.openlaneOuvrir(this.ouvrirVin); }
    if (p.demander) { this.elNiv.value = String(p.demander).toUpperCase(); if (p.km) this.elKm.value = p.km; this.elImport.open = true; }
  };

  ValeursOpenlane.prototype.construire = function () {
    var self = this;
    this.elEtat = h('p', { text: 'Chargement des valeurs…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.btnImport = h('button.btn.primaire', { type: 'button', text: 'Lire depuis OpenLane', onclick: function () { self.elImport.open = !self.elImport.open; if (self.elImport.open) self.elImport.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Valeurs OpenLane'), this.elEtat]),
      h('div.actions', [this.btnRafraichir, this.btnExport, this.btnImport])
    ]);
    this.elImport = this.construireImport();
    this.elCartes = h('div.ol-cartes');
    this.elRecherche = h('input.saisie#openlane-recherche', { type: 'search', placeholder: 'NIV, # stock, modèle, version…', autocomplete: 'off', oninput: AMX.debounce(function (e) { self.recherche = e.target.value; self.rendreTable(); }, 120) });
    this.elSegment = h('div.segment', { role: 'group', 'aria-label': 'Portée' });
    this.elCompte = h('span.compte.doux');
    var barre = h('div.carte', [h('div.carte-corps', [h('div.ol-outils', [h('div.recherche', [h('span', { html: I.recherche }), this.elRecherche]), this.elSegment, this.elCompte])])]);
    this.elTable = h('div.ol-table');
    this.elVide = h('div');
    this.el = h('div.page.ol-page', [entete, this.elImport, this.elCartes, barre, this.elVide, h('div.carte', [h('div.carte-corps', [this.elTable])])]);
  };

  /* --------------------------- Carte d'import --------------------------- */
  ValeursOpenlane.prototype.construireImport = function () {
    var self = this;
    var signet = h('a.btn.primaire', { href: CODE_SIGNET_OPENLANE, text: 'Automax ← OpenLane (valeurs)', title: 'Glissez ce bouton dans votre barre de favoris', draggable: 'true' });
    signet.addEventListener('click', function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B pour l\'afficher), puis cliquez-le depuis OpenLane, connecté, sur Market guide.', 'attention', 8000); });
    this.elImportEtat = h('div.ol-import-etat');
    this.elNiv = h('input.saisie.niv', { type: 'text', placeholder: 'NIV (17 car.)', maxlength: '17', autocomplete: 'off', spellcheck: 'false' });
    this.elKm = h('input.saisie.km', { type: 'text', inputmode: 'numeric', placeholder: 'km', autocomplete: 'off' });
    this.btnDemander = h('button.btn', { type: 'button', text: 'Demander ce NIV', onclick: function () { self.demander(); } });
    this.elNiv.addEventListener('keydown', function (e) { if (e.key === 'Enter') self.demander(); });
    this.elKm.addEventListener('keydown', function (e) { if (e.key === 'Enter') self.demander(); });
    var d = h('details.carte#openlane-import', [
      h('summary.carte-entete', { style: { cursor: 'pointer' } }, [h('h2', 'Lire les valeurs depuis OpenLane')]),
      h('div.carte-corps', [
        h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)' } }, 'Le signet demande au site les NIV à valoriser — inventaire en stock, évaluations des 60 derniers jours, NIV demandés ci-dessous — puis interroge Market guide pour chacun : ventes passées comparables (min / moyenne / max, 90 jours), prévision de prix OpenLane à 30, 60 et 90 jours au kilométrage connu. Une valeur de moins de 7 jours n\'est pas relue. Rien n\'est modifié dans OpenLane.'),
        h('div.ol-etapes', [
          h('div', [h('div.section-titre', '1. Installer (une fois)'), h('p', 'Glissez ce bouton dans la barre de favoris de Chrome. Si la barre est cachée : Cmd+Shift+B.'), signet]),
          h('div', [h('div.section-titre', '2. Dans OpenLane'), h('p', 'Connectez-vous sur app.openlane.ca et ouvrez Market guide. Gardez cet onglet du site ouvert et connecté : la petite fenêtre « Pont Automax » s\'en sert.')]),
          h('div', [h('div.section-titre', '3. Cliquer le signet'), h('p', 'Une bande verte suit la progression en bas de la page OpenLane (environ 2 secondes par NIV). À la fin, revenez ici : « Rafraîchir ».')])
        ]),
        this.elImportEtat,
        h('div.ol-demande', [h('span', { style: { fontWeight: 600 } }, 'Un NIV en particulier :'), this.elNiv, this.elKm, this.btnDemander, h('span.doux.petit', 'Ajouté à la liste — lu au prochain clic du signet.')])
      ])
    ]);
    d.open = false;
    return d;
  };
  ValeursOpenlane.prototype.rendreImport = function () {
    AMX.vider(this.elImportEtat);
    var l = this.liste || [];
    var lues = l.filter(function (r) { return r.luLe; }), enStock = l.filter(function (r) { return r.enStock; }), aLire = l.filter(function (r) { return r.aLire; });
    var dernier = l.map(function (r) { return r.luLe || ''; }).sort().pop() || '';
    var prev = lues.filter(function (r) { return nombre(r.prevision) !== null; }).length;
    this.elImportEtat.appendChild(h('div.case', [h('div', 'NIV avec valeurs'), h('b', { text: AMX.fmtNombre(lues.length) }), h('div.mini', { text: dernier ? 'dernière lecture ' + AMX.fmtDate(dernier, true) : 'pas encore lu' })]));
    this.elImportEtat.appendChild(h('div.case', [h('div', 'Encore à l\'inventaire'), h('b', { text: AMX.fmtNombre(enStock.length) }), h('div.mini', 'achetés, pas vendus ni comptabilisés')]));
    this.elImportEtat.appendChild(h('div.case', [h('div', 'Avec prévision'), h('b', { text: AMX.fmtNombre(prev) }), h('div.mini', { text: (lues.length - prev) ? (lues.length - prev) + ' sans prévision (km inconnu ou NIV hors plage)' : 'prévision 30-60-90 j pour chacun' })]));
    this.elImportEtat.appendChild(h('div.case', [h('div', 'Demandés, à lire'), h('b', { text: AMX.fmtNombre(aLire.length) }), h('div.mini', { text: aLire.length ? 'recliquez le signet dans OpenLane' : 'rien en attente' })]));
    this.btnDemander.disabled = !peutDemander();
  };
  ValeursOpenlane.prototype.demander = function () {
    var self = this, vin = String(this.elNiv.value || '').trim().toUpperCase(), km = String(this.elKm.value || '').trim();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) { AMX.toast('Entrez un NIV de 17 caractères.', 'attention'); this.elNiv.focus(); return; }
    this.btnDemander.classList.add('occupe');
    return AMX.openlane.demander(vin, km).then(function (r) {
      self.btnDemander.classList.remove('occupe');
      if (!r || !r.ok) { AMX.toast((r && r.erreur) || 'Demande refusée', 'erreur'); return; }
      AMX.toast(vin + (r.existait ? ' redemandé' : ' ajouté') + ' — cliquez le signet dans OpenLane pour lire ses valeurs.', 'ok', 6000);
      self.elNiv.value = ''; self.elKm.value = '';
      self.charger();
    }, function (e) { self.btnDemander.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };

  /* ------------------------------ Données ------------------------------ */
  ValeursOpenlane.prototype.charger = function (manuel, tentative) {
    var self = this, gen = ++this.generation;
    tentative = tentative || 1;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    return AMX.get({ openlane: 1 }).then(function (d) {
      if (gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      if (d && d.refuse) { self.refus = d.erreur || 'Accès refusé.'; self.rendre(); return; }
      if (!d || !d.ok) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
      self.liste = d.valeurs || []; self.duCache = false; self.erreur = ''; self.refus = '';
      AMX.openlane.poser(self.liste);
      self.rendre();
      if (!self.liste.length) self.elImport.open = true;
      if (self.ouvrirVin) { var v = self.ouvrirVin; self.ouvrirVin = null; AMX.openlaneOuvrir(v); }
      if (manuel) AMX.toast('Valeurs OpenLane mises à jour — ' + self.liste.length + ' NIV', 'ok');
    }).catch(function (e) {
      if (gen !== self.generation) return;
      if (tentative < 3 && /Pas de réponse|réseau|HTTP 5|illisible/i.test(String(e && e.message || e))) { self.generation--; setTimeout(function () { if (gen === self.generation) self.charger(manuel, tentative + 1); }, 2500); return; }
      self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e); self.rendre();
      AMX.toast('Impossible de charger les valeurs OpenLane — ' + self.erreur, 'erreur');
    });
  };
  ValeursOpenlane.prototype.base = function () {
    var self = this;
    return (this.liste || []).filter(function (r) { return self.portee === 'tous' || (self.portee === 'evaluation' ? r.source === 'evaluation' : r.enStock); });
  };
  ValeursOpenlane.prototype.filtrees = function () {
    var self = this, l = this.base();
    if (this.compagnie) l = l.filter(function (r) { return String(r.compagnie || '').toUpperCase() === self.compagnie; });
    var q = String(this.recherche || '').trim().toLowerCase();
    if (q) l = l.filter(function (r) { return [r.vin, r.stock, r.annee, r.marque, r.modele, r.version, r.style, r.modeleInventaire, libelleSource(r.source)].join(' ').toLowerCase().indexOf(q) >= 0; });
    return l;
  };

  ValeursOpenlane.prototype.rendre = function () {
    var self = this;
    this.limite = 300;
    AMX.vider(this.elCartes); AMX.vider(this.elSegment); AMX.vider(this.elVide);
    this.rendreImport();
    if (this.refus) { this.elEtat.textContent = this.refus; this.elVide.appendChild(h('div.vide', [h('div', { html: I.cadenas }), h('h3', 'Accès non autorisé'), h('div', { text: this.refus })])); this.elTable.textContent = ''; return; }
    if (!this.liste) { this.elEtat.textContent = this.erreur ? 'Serveur injoignable : ' + this.erreur : 'Chargement des valeurs…'; if (!this.erreur) this.elVide.appendChild(AMX.chargeur('Valeurs OpenLane')); return; }
    var total = this.liste.length, lues = this.liste.filter(function (r) { return r.luLe; }).length, enStock = this.liste.filter(function (r) { return r.enStock; }).length;
    this.elEtat.textContent = (total ? (lues + ' NIV avec des valeurs OpenLane, ' + enStock + ' encore à l\'inventaire — ventes comparables, prévision 30-60-90 j, prix ajusté au km. Cliquez une ligne pour le détail.') : 'Aucune valeur pour l\'instant : installez le signet ci-dessous et cliquez-le depuis OpenLane › Market guide.') + (this.erreur ? ' (liste gardée localement — serveur injoignable : ' + this.erreur + ')' : (this.duCache ? ' (mise à jour en cours…)' : ''));
    [['stock', 'Encore à l\'inventaire'], ['evaluation', 'Évaluations'], ['tous', 'Tous les NIV']].forEach(function (p) {
      self.elSegment.appendChild(h('button' + (p[0] === self.portee ? '.actif' : ''), { type: 'button', text: p[1], onclick: function () { self.portee = p[0]; AMX.memo.ecrire('openlane_portee', p[0]); self.rendre(); } }));
    });
    var base = this.base();
    var carte = function (code, libelle, lignes) {
      var actif = self.compagnie === code, n = lignes.length;
      var prevs = lignes.map(function (r) { return nombre(r.prevision); }).filter(function (x) { return x !== null; });
      var ventes = lignes.filter(function (r) { return nombre(r.nVentes) > 0; }).length;
      var total = prevs.reduce(function (a, b) { return a + b; }, 0);
      return h('button.ol-carte' + (actif ? '.actif' : '') + (code ? '.' + couleurCie(code) : '.toutes'), { type: 'button', 'aria-pressed': actif ? 'true' : 'false', 'data-compagnie': code, onclick: function () { self.compagnie = code; AMX.choisirCompagnie(code); self.rendre(); } }, [
        h('div.haut', [h('div.nom', { text: libelle }), h('div.n.num', { text: AMX.fmtNombre(n) })]),
        h('div.bas', n ? [h('span', [h('b', { text: String(prevs.length) }), ' prévision' + (prevs.length > 1 ? 's' : '')]), h('span', [h('b', { text: String(ventes) }), ' avec ventes']), prevs.length ? h('span', [h('b', { text: fmt(total) }), ' prévu']) : null] : [h('span.doux', 'aucun NIV')])
      ]);
    };
    this.elCartes.appendChild(carte('', 'Toutes les concessions', base));
    AMX.codesPour('inventaire').forEach(function (c) { self.elCartes.appendChild(carte(c, nomCie(c), base.filter(function (r) { return String(r.compagnie || '').toUpperCase() === c; }))); });
    if (this.compagnie && AMX.codesPour('inventaire').indexOf(this.compagnie) < 0) this.compagnie = '';
    this.rendreTable();
  };

  var COLONNES = [
    { cle: 'luLe', libelle: 'Lu le' },
    { cle: 'vehicule', libelle: 'Véhicule', valeur: function (r) { return vehiculeTexte(r); } },
    { cle: 'km', libelle: 'Km', num: true, valeur: function (r) { return nombre(r.km); } },
    { cle: 'compagnie', libelle: 'Concession' },
    { cle: 'statutInventaire', libelle: 'Inventaire' },
    { cle: 'nVentes', libelle: 'Ventes', num: true, valeur: function (r) { return nombre(r.nVentes); } },
    { cle: 'prixMin', libelle: 'Min', num: true, valeur: function (r) { return nombre(r.prixMin); } },
    { cle: 'prixMoy', libelle: 'Moyenne', num: true, valeur: function (r) { return nombre(r.prixMoy); } },
    { cle: 'prixMax', libelle: 'Max', num: true, valeur: function (r) { return nombre(r.prixMax); } },
    { cle: 'ajuste', libelle: 'Ajusté km', num: true, valeur: function (r) { return ajuste(r); } },
    { cle: 'prevision', libelle: 'Prévision', num: true, valeur: function (r) { return nombre(r.prevision); } },
    { cle: 'j90', libelle: '90 j', num: true, valeur: function (r) { return milieu(r.j90Min, r.j90Max); } }
  ];
  ValeursOpenlane.prototype.rendreTable = function () {
    var self = this;
    AMX.vider(this.elTable);
    var lignes = this.filtrees();
    this.elCompte.textContent = lignes.length + ' NIV' + (this.compagnie ? ' · ' + nomCie(this.compagnie) : '');
    if (!lignes.length) { this.elTable.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucun NIV'), h('div', { text: this.recherche ? 'Rien ne correspond à la recherche.' : (this.liste && this.liste.length ? (this.portee === 'stock' ? 'Aucune valeur pour un véhicule encore à l\'inventaire avec ce filtre — « Tous les NIV » montre aussi les évaluations et les véhicules vendus.' : 'Aucun NIV pour ce filtre.') : 'Lisez d\'abord les valeurs depuis OpenLane (bouton « Lire depuis OpenLane »).') })])); return; }
    var c = COLONNES.filter(function (x) { return x.cle === self.tri.cle; })[0] || COLONNES[0];
    var val = c.valeur || function (r) { return r[c.cle]; };
    lignes = lignes.slice().sort(function (a, b) {
      var va = val(a), vb = val(b), r;
      if (typeof va === 'number' || typeof vb === 'number') { va = (typeof va === 'number' && !isNaN(va)) ? va : -Infinity; vb = (typeof vb === 'number' && !isNaN(vb)) ? vb : -Infinity; r = va === vb ? 0 : (va < vb ? -1 : 1); }
      else r = String(va || '').localeCompare(String(vb || ''), 'fr', { numeric: true, sensitivity: 'base' });
      return self.tri.desc ? -r : r;
    });
    var thead = h('thead', [h('tr', COLONNES.map(function (col) {
      var actif = self.tri.cle === col.cle;
      var th = h('th' + (col.num ? '.num' : '') + '.registre-triable' + (actif ? '.actif' : ''), { 'aria-sort': actif ? (self.tri.desc ? 'descending' : 'ascending') : 'none', title: 'Trier par ' + col.libelle.toLowerCase() }, [col.libelle, actif ? h('span', { text: self.tri.desc ? ' ▾' : ' ▴' }) : null]);
      th.addEventListener('click', function () { if (self.tri.cle === col.cle) self.tri.desc = !self.tri.desc; else { self.tri.cle = col.cle; self.tri.desc = !!col.num || col.cle === 'luLe'; } self.rendreTable(); });
      return th;
    }))]);
    var tbody = h('tbody');
    var LIMITE = this.limite || 300, visibles = lignes.slice(0, LIMITE);
    visibles.forEach(function (r) {
      var lue = !!r.luLe, nv = nombre(r.nVentes) || 0, aj = ajuste(r);
      var tr = h('tr.cliquable' + (lue ? '' : '.sans-valeur'), { tabindex: '0', 'data-vin': r.vin }, [
        h('td.date', [h('div', { text: lue ? AMX.fmtDate(r.luLe) : '—' }), h('div.mini', { text: lue ? libelleSource(r.source) : (r.aLire ? 'À lire (signet)' : libelleSource(r.source)) })]),
        h('td.vehicule', [AMX.logoMarque(r.marque, 'petit'), h('div', [h('div.nom', { text: vehiculeTexte(r) }), h('div.mini', { text: [r.style && r.style !== r.version ? r.style : '', r.stock ? '# ' + r.stock : ''].filter(Boolean).join(' · ') }), h('div.vin', { text: r.vin || '' })])]),
        h('td.num', { text: fmtKm(r.km) }),
        h('td.badges', r.compagnie ? [h('span.badge.sans-point.' + couleurCie(r.compagnie), { text: nomCie(r.compagnie) })] : [h('span.doux', '—')]),
        h('td.badges', [badgeInventaire(r)]),
        h('td.num', lue ? [h('div', { text: nv ? String(nv) : '0' }), nv ? h('div.mini', { text: (r.jours || 90) + ' j' + (r.avecVersion ? ' · version' : '') }) : null] : [h('span.doux', '—')]),
        h('td.num', { text: nv ? fmt(r.prixMin) : '—' }),
        h('td.num.fort', { text: nv ? fmt(r.prixMoy) : '—' }),
        h('td.num', { text: nv ? fmt(r.prixMax) : '—' }),
        h('td.num', aj !== null ? [h('div', { text: fmt(aj) }), h('div.mini', { text: 'km moy. ' + fmtKm(r.kmMoy) })] : [h('span.doux', '—')]),
        h('td.num.fort', nombre(r.prevision) !== null ? [h('div', { text: fmt(r.prevision) }), nombre(r.previsionBas) !== null && nombre(r.previsionBas) !== nombre(r.previsionHaut) ? h('div.mini', { text: fourchette(r.previsionBas, r.previsionHaut) }) : null] : [h('span.doux', { text: lue && r.erreur && /prévision/.test(r.erreur) ? 'km ?' : '—', title: r.erreur || '' })]),
        h('td.num', { text: nombre(r.j90Min) !== null ? fmt(milieu(r.j90Min, r.j90Max)) : '—', title: nombre(r.j90Min) !== null ? fourchette(r.j90Min, r.j90Max) : '' })
      ]);
      var ouvrir = function () { AMX.openlaneOuvrir(r.vin, r); };
      tr.addEventListener('click', ouvrir);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') ouvrir(); });
      tbody.appendChild(tr);
    });
    if (lignes.length > visibles.length) {
      tbody.appendChild(h('tr', [h('td', { colspan: String(COLONNES.length), style: { textAlign: 'center', padding: '12px' } }, [
        h('span.doux', { text: visibles.length + ' lignes affichées sur ' + lignes.length + ' — ' }),
        h('button.btn.petit', { type: 'button', text: 'Afficher 300 de plus', onclick: function () { self.limite = LIMITE + 300; self.rendreTable(); } })
      ])]));
    }
    var prevs = lignes.map(function (r) { return nombre(r.prevision); }).filter(function (x) { return x !== null; });
    var totalPrev = prevs.reduce(function (a, b) { return a + b; }, 0);
    var tfoot = h('tfoot', [h('tr', [h('td', { colspan: '10', text: 'Total — ' + lignes.length + ' NIV · ' + prevs.length + ' avec prévision' }), h('td.num', { text: prevs.length ? fmt(totalPrev) : '—' }), h('td', '')])]);
    this.elTable.appendChild(h('table.tableau#openlane-table', [thead, tbody, tfoot]));
  };

  /* ------------------------------- Détail ------------------------------- */
  function dl(paires) {
    var el = h('dl');
    paires.forEach(function (p) { if (p[1] === null || p[1] === undefined || p[1] === '' || p[1] === '—') return; el.appendChild(h('dt', { text: p[0] })); el.appendChild(h('dd', typeof p[1] === 'string' || typeof p[1] === 'number' ? { text: String(p[1]) } : [p[1]])); });
    return el;
  }
  function tuile(libelle, valeur, mini, cls) { return h('div.tuile' + (cls ? '.' + cls : ''), [h('div.l', { text: libelle }), h('div.v.num', { text: valeur }), mini ? h('div.m', { text: mini }) : null]); }
  /** Tuiles des valeurs (modale et bloc compact). */
  function tuiles(r, km, compact) {
    var nv = nombre(r.nVentes) || 0, aj = ajuste(r, km), out = [];
    if (nv) {
      out.push(tuile('Ventes ' + (r.jours || 90) + ' j', String(nv), r.avecVersion ? 'même version' : 'toutes versions'));
      out.push(tuile('Moyenne', fmt(r.prixMoy), fmt(r.prixMin) + ' – ' + fmt(r.prixMax), 'fort'));
      if (!compact) out.push(tuile('Km moyen', fmtKm(r.kmMoy), fmtKm(r.kmMin) + ' – ' + fmtKm(r.kmMax)));
      if (aj !== null) out.push(tuile('Ajusté à ' + fmtKm(km === undefined ? r.km : km), fmt(aj), TAUX_KM.toFixed(2).replace('.', ',') + ' $ / km'));
    }
    if (nombre(r.prevision) !== null) {
      out.push(tuile('Prévision', fmt(r.prevision), (nombre(r.previsionBas) !== null && nombre(r.previsionBas) !== nombre(r.previsionHaut) ? fourchette(r.previsionBas, r.previsionHaut) + ' · ' : '') + fmtKm(r.previsionKm), 'prev'));
      if (!compact) { out.push(tuile('Dans 30 j', fourchette(r.j30Min, r.j30Max))); out.push(tuile('Dans 60 j', fourchette(r.j60Min, r.j60Max))); }
      out.push(tuile('Dans 90 j', fourchette(r.j90Min, r.j90Max), nombre(r.prevision) && nombre(r.j90Min) !== null ? (Math.round((milieu(r.j90Min, r.j90Max) - nombre(r.prevision)) / nombre(r.prevision) * 100)) + ' %' : ''));
    }
    return h('div.ol-tuiles', out);
  }
  function rendreDetail(corps, r, f) {
    AMX.vider(corps);
    var d = (f && f.decodage) || {}, v = (f && f.ventes) || null;
    var gauche = h('div');
    gauche.appendChild(h('div.ligne-badges', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } }, [
      h('span.badge.sans-point.bleu', { text: 'OpenLane' }), badgeInventaire(r), r.compagnie ? h('span.badge.sans-point.' + couleurCie(r.compagnie), { text: nomCie(r.compagnie) }) : null,
      r.luLe ? h('span.badge.sans-point.gris', { text: 'Lu ' + AMX.fmtDate(r.luLe, true) + (r.luPar ? ' · ' + r.luPar.split('@')[0] : '') }) : h('span.badge.sans-point.ambre', { text: 'Pas encore lu — cliquez le signet dans OpenLane' })
    ]));
    if (r.luLe) gauche.appendChild(tuiles(r, undefined, false));
    if (r.erreur) gauche.appendChild(h('div.ol-erreurs', { style: { marginTop: '8px' }, text: 'Notes : ' + r.erreur }));
    gauche.appendChild(h('h4', 'Véhicule'));
    gauche.appendChild(dl([['NIV', r.vin], ['Décodé', [d.annee || r.annee, d.marque || r.marque, d.modele || r.modele, d.version || r.version].filter(Boolean).join(' ')], ['Style', d.style || r.style], ['Carrosserie', d.carrosserie], ['Motricité', d.motricite], ['Moteur', d.moteur], ['PDSF', nombre(d.pdsf || r.pdsf) !== null ? fmt(d.pdsf || r.pdsf) : ''], ['Km connu', nombre(r.km) !== null ? fmtKm(r.km) : ''], ['Source', libelleSource(r.source)], ['# stock', r.stock]]));
    corps.appendChild(gauche);
    if (v && v.liste && v.liste.length) {
      var comp = h('div.ol-comparables');
      comp.appendChild(h('h4', 'Ventes comparables OpenLane (' + v.n + ' sur ' + v.jours + ' jours' + (v.avecVersion ? ', version ' + (d.version || '') : '') + ')'));
      var km = nombre(r.km);
      comp.appendChild(h('table', [
        h('thead', [h('tr', [h('th', ''), h('th', 'Vendu'), h('th', 'Véhicule'), h('th.num', 'Km'), h('th.num', 'Prix'), km !== null ? h('th.num', 'Ajusté') : null, h('th', 'Prov.'), h('th', 'Note')])]),
        h('tbody', v.liste.map(function (x) {
          var kmX = nombre(x.km), prixX = nombre(x.prix);
          var ajX = (km !== null && kmX !== null && prixX !== null) ? Math.round(prixX + (kmX - km) * TAUX_KM) : null;
          return h('tr', [
            h('td', x.photo ? [h('img', { src: x.photo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })] : []),
            h('td', { text: x.date ? AMX.fmtDateCourte(x.date) : '—' }),
            h('td', [h('div', { text: [x.version, x.couleur].filter(Boolean).join(' · ') || x.style || '—' }), h('div.mini.doux', { text: [x.motricite, x.moteur].filter(Boolean).join(' · ') })]),
            h('td.num', { text: fmtKm(x.km) }),
            h('td.num', { style: { fontWeight: 600 }, text: fmt(x.prix) }),
            km !== null ? h('td.num', { text: ajX !== null ? fmt(ajX) : '—' }) : null,
            h('td', { text: x.province || '' }),
            h('td', { text: [x.telQuel ? 'tel quel' : '', x.divulgations ? 'divulgations' : '', nombre(x.encheres) ? x.encheres + ' ench.' : ''].filter(Boolean).join(', ') })
          ]);
        }))
      ]));
      corps.appendChild(comp);
    } else if (r.luLe) corps.appendChild(h('div.doux', { style: { marginTop: '8px' }, text: 'Aucune vente comparable chez OpenLane sur 180 jours.' }));
  }
  /** La modale d'un NIV, d'où qu'on vienne (table, panneau d'inventaire, fiche d'achat, évaluation). */
  AMX.openlaneOuvrir = function (vin, ligne) {
    injecterCss();
    vin = String(vin || '').trim().toUpperCase();
    var corps = h('div.ol-fiche');
    corps.appendChild(h('div.doux', { text: 'Chargement des valeurs OpenLane…' }));
    var r0 = ligne || AMX.openlane.valeur(vin) || null;
    var titre = r0 && (r0.marque || r0.modeleInventaire) ? vehiculeTexte(r0) + (r0.stock ? ' — # ' + r0.stock : '') : 'Valeurs OpenLane';
    var modale = AMX.modale({ titre: titre, corps: corps, large: true, boutons: [{ texte: 'Fermer' }] });
    AMX.get({ openlaneVin: vin }).then(function (d) {
      if (!d || !d.ok) throw new Error((d && d.erreur) || 'Valeurs indisponibles');
      var r = d.valeur || r0 || { vin: vin }, f = d.detail || null;
      rendreDetail(corps, r, f);
      var actions = h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' } }, [
        r.vehiculeId && r.registre ? h('a.btn', { href: AMX.lien('inventaire', r.registre.toLowerCase(), { vin: vin }), text: 'Voir à l\'inventaire' }) : null,
        h('a.btn', { href: AMX.lien('outils', 'evaluation', { vin: vin }), text: 'Évaluation' }),
        h('a.btn', { href: AMX.lien('achat', '', { vin: vin }), html: I.achat + '<span>Fiche d\'achat</span>' }),
        peutDemander() ? h('button.btn.fantome', { type: 'button', text: r.luLe ? 'Relire au prochain signet' : 'Demander', onclick: function (e) { var b = e.currentTarget; b.classList.add('occupe'); AMX.openlane.demander(vin, r.km).then(function (x) { b.classList.remove('occupe'); AMX.toast(x && x.ok ? 'Ce NIV sera relu au prochain clic du signet dans OpenLane.' : ((x && x.erreur) || 'Refusé'), x && x.ok ? 'ok' : 'erreur'); }, function (err) { b.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(err), 'erreur'); }); } }) : null,
        h('a.btn.fantome', { href: URL_MARCHE, target: '_blank', rel: 'noopener', html: I.externe + '<span>Market guide</span>' })
      ]);
      corps.appendChild(actions);
    }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('div.vide', [h('div', { html: I.alerte }), h('h3', 'Valeurs indisponibles'), h('div', { text: AMX.erreurTexte(e) })])); });
    return modale;
  };

  /* -------------------------------- Excel ------------------------------- */
  ValeursOpenlane.prototype.exporter = function () {
    var lignes = this.filtrees();
    if (!lignes.length) { AMX.toast('Aucun NIV à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var rows = lignes.map(function (r) {
      return { 'Lu le': r.luLe ? AMX.fmtDate(r.luLe, true) : '', 'Source': libelleSource(r.source), 'Concession': nomCie(r.compagnie), 'Registre': r.registre, '# stock': r.stock, 'Statut inventaire': r.registre ? AMX.statut(r.statutInventaire, r.registre).libelle : '',
        'NIV': r.vin, 'Année': r.annee, 'Marque': r.marque, 'Modèle': r.modele, 'Version': r.version, 'Style': r.style, 'Km': nombre(r.km),
        'Ventes': nombre(r.nVentes), 'Jours': nombre(r.jours), 'Même version': r.avecVersion ? 'oui' : 'non', 'Prix min': nombre(r.prixMin), 'Prix moyen': nombre(r.prixMoy), 'Prix max': nombre(r.prixMax), 'Km min': nombre(r.kmMin), 'Km moyen': nombre(r.kmMoy), 'Km max': nombre(r.kmMax), 'Ajusté au km': ajuste(r), 'Dernière vente': r.derniereVente ? AMX.fmtDate(r.derniereVente) : '',
        'Prévision': nombre(r.prevision), 'Prévision bas': nombre(r.previsionBas), 'Prévision haut': nombre(r.previsionHaut), '30 j min': nombre(r.j30Min), '30 j max': nombre(r.j30Max), '60 j min': nombre(r.j60Min), '60 j max': nombre(r.j60Max), '90 j min': nombre(r.j90Min), '90 j max': nombre(r.j90Max), 'Prévision km': nombre(r.previsionKm), 'PDSF': nombre(r.pdsf), 'Notes': r.erreur };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'OpenLane');
    XLSX.writeFile(wb, 'valeurs-openlane-' + (this.compagnie || 'toutes') + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export Excel — ' + lignes.length + ' ligne' + (lignes.length > 1 ? 's' : ''), 'ok');
  };

  /* ------------- Bloc compact d'un NIV (inventaire, achat, service, évaluation) ------------- */
  // Rend dans `conteneur` les valeurs OpenLane du véhicule si elles ont été lues ; sinon, un
  // bouton « Demander les valeurs OpenLane » (opts.km = km du moment, pour la prévision).
  // Renvoie la promesse de la ligne (null si rien n'est connu et rien demandé).
  AMX.openlaneBloc = function (vin, conteneur, opts) {
    injecterCss();
    opts = opts || {};
    AMX.vider(conteneur);
    vin = String(vin || '').trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return Promise.resolve(null);
    var rendreDemande = function (r) {
      var zone = h('div.ol-bloc');
      var km = nombre(opts.km !== undefined ? opts.km : (r && r.km));
      var info = r && r.aLire ? 'Demandé — sera lu au prochain clic du signet dans OpenLane.' : '';
      if (peutDemander() && !(r && r.aLire)) {
        var btn = h('button.btn.petit', { type: 'button', text: r && r.luLe ? 'Mettre à jour (signet)' : 'Demander les valeurs OpenLane', onclick: function () {
          btn.classList.add('occupe');
          AMX.openlane.demander(vin, km).then(function (x) { btn.classList.remove('occupe'); if (x && x.ok) { btn.replaceWith(h('span.doux.petit', 'Demandé — cliquez le signet « Automax ← OpenLane » dans OpenLane, puis rouvrez.')); } else AMX.toast((x && x.erreur) || 'Refusé', 'erreur'); }, function (e) { btn.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(e), 'erreur'); });
        } });
        zone.appendChild(h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } }, [btn, km === null ? h('span.doux.petit', 'Sans km, pas de prévision.') : null]));
      } else if (info) zone.appendChild(h('span.doux.petit', { text: info }));
      else if (!peutDemander()) zone.appendChild(h('span.doux.petit', 'Valeurs non lues (signet OpenLane).'));
      return zone;
    };
    return AMX.get({ openlaneVin: vin }, { essais: 1 }).then(function (d) {
      var r = (d && d.ok && d.valeur) || null;
      if (!r || !r.luLe) { conteneur.appendChild(rendreDemande(r)); return r; }
      var bloc = h('div.ol-bloc');
      var km = opts.km !== undefined && nombre(opts.km) !== null ? nombre(opts.km) : nombre(r.km);
      var nv = nombre(r.nVentes) || 0, prev = nombre(r.prevision);
      bloc.appendChild(h('div.ligne-badges', [
        h('span.badge.sans-point.bleu', { text: 'OpenLane', title: 'Lu le ' + AMX.fmtDate(r.luLe, true) }),
        nv ? h('span.badge.sans-point.gris', { text: nv + ' vente' + (nv > 1 ? 's' : '') + ' · ' + (r.jours || 90) + ' j' }) : h('span.badge.sans-point.gris', { text: 'Aucune vente comparable' }),
        prev === null && r.erreur && /prévision/.test(r.erreur) ? h('span.badge.sans-point.ambre', { text: 'Pas de prévision (km)', title: r.erreur }) : null,
        h('span.doux.petit', { text: AMX.fmtDate(r.luLe) })
      ]));
      if (nv || prev !== null) bloc.appendChild(tuiles(r, km, true));
      bloc.appendChild(h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
        h('button.btn.petit', { type: 'button', text: 'Détails OpenLane', onclick: function () { AMX.openlaneOuvrir(vin, r); } }),
        h('a.btn.petit.fantome', { href: AMX.lien('outils', 'openlane', { vin: vin }), text: 'Valeurs OpenLane' })
      ]));
      // Km du moment différent de celui de la prévision : proposer la mise à jour.
      if (km !== null && nombre(r.previsionKm) !== null && Math.abs(km - nombre(r.previsionKm)) > 2000 && peutDemander()) bloc.appendChild(rendreDemande(r));
      conteneur.appendChild(bloc);
      return r;
    }).catch(function () { return null; });
  };

  /* ---------------- Index par NIV (lignes d'inventaire et de service) ---------------- */
  var olIndex = null, olPromesse = null, olQuand = 0;
  function indexer(liste) { var idx = {}; (liste || []).forEach(function (r) { if (r && r.vin) idx[String(r.vin).toUpperCase()] = r; }); return idx; }
  AMX.openlane = {
    charger: function (force) {
      if (!force && olIndex && Date.now() - olQuand < 3600000) return Promise.resolve(olIndex);
      if (olPromesse) return olPromesse;
      if (!olIndex) { var local = AMX.cacheLocal.lire('openlane', 7 * 86400000); if (local && Array.isArray(local.donnees)) { olIndex = indexer(local.donnees); olQuand = local.quand || 0; if (!force && Date.now() - olQuand < 3600000) return Promise.resolve(olIndex); } }
      olPromesse = AMX.get({ openlane: 1 }, { essais: 2 }).then(function (d) {
        olPromesse = null;
        if (!d || !d.ok) { if (!olIndex) olIndex = {}; return olIndex; }
        AMX.openlane.poser(d.valeurs || []);
        return olIndex;
      }, function (e) { olPromesse = null; if (!olIndex) olIndex = {}; throw e; });
      return olPromesse;
    },
    poser: function (liste) { olIndex = indexer(liste); olQuand = Date.now(); AMX.cacheLocal.ecrire('openlane', liste); document.dispatchEvent(new CustomEvent('amx:openlane')); },
    valeur: function (vin) { return (olIndex && olIndex[String(vin || '').toUpperCase()]) || null; },
    enCache: function () { return olIndex; },
    ajuste: ajuste,
    /** Demande (ou redemande) la lecture d'un NIV au prochain signet ; km facultatif. */
    demander: function (vin, km) {
      return AMX.post({ action: 'openlaneImporter', phase: 'demander', vin: String(vin || '').trim().toUpperCase(), km: km === undefined || km === null ? '' : String(km) }).then(function (r) {
        if (r && r.ok && olIndex) { var cur = olIndex[r.vin] || { vin: r.vin, source: 'manuel' }; cur.aLire = true; cur.demandeLe = new Date().toISOString(); if (r.km) cur.km = r.km; olIndex[r.vin] = cur; }
        return r;
      });
    }
  };
  /** Puce « OpenLane 23 055 $ » (prévision, sinon moyenne des ventes) pour une ligne ; null si rien de lu. Clic = le détail. */
  AMX.openlanePuce = function (vin) {
    var r = AMX.openlane.valeur(vin);
    if (!r || !r.luLe) return null;
    var prev = nombre(r.prevision), moy = nombre(r.prixMoy);
    if (prev === null && moy === null) return null;
    var texte = 'OpenLane ' + fmt(prev !== null ? prev : moy);
    var titre = prev !== null ? 'Prévision OpenLane ' + fmt(prev) + ' à ' + fmtKm(r.previsionKm) + (moy !== null ? ' — ventes comparables : moyenne ' + fmt(moy) + ' (' + r.nVentes + ' sur ' + (r.jours || 90) + ' j)' : '') : 'Moyenne des ' + r.nVentes + ' ventes comparables OpenLane (' + (r.jours || 90) + ' j) — pas de prévision (km inconnu)';
    var el = h('span.puce.openlane.info', { text: texte, title: titre + '. Cliquez pour le détail.', role: 'button', tabindex: '0' });
    var ouvrir = function (e) { e.preventDefault(); e.stopPropagation(); AMX.openlaneOuvrir(r.vin, r); };
    el.addEventListener('click', ouvrir);
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') ouvrir(e); });
    return el;
  };

  AMX.vues = AMX.vues || {};
  AMX.vues.ValeursOpenlane = ValeursOpenlane;
})();
