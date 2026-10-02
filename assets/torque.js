/* =========================================================================
   Outils › Archive Torque — tout ce qui a été fait dans Torque, chez nous.

   Maxime cesse l'abonnement Torque (500 $/mois par concession) le mois
   prochain. Le signet « Automax ← Torque » (ci-dessous, CODE_SIGNET_TORQUE,
   source lisible dans mock/signet-torque.src.js) lit toutes les évaluations
   d'une concession depuis le compte Torque ouvert dans Chrome et les envoie
   au serveur par lots, via pont.html (iframe caché sur notre site, qui porte
   la session du site). Le serveur (Torque.gs) les garde dans la feuille
   « Torque » (+ « TorqueJSON » pour la fiche complète, « TorqueAnalyses » pour
   les analyses de marché) et rapatrie les photos dans Drive par un
   déclencheur, tant qu'il en reste.

     GET  ?torque=1[&concession=]  → { evaluations[], parConcession, parStatut, photos, analyses }
     GET  ?torqueFiche=ID           → { ligne, fiche }
     GET  ?torqueVin=NIV            → { evaluations[] }  (fiche d'évaluation : « Historique Torque »)
     GET  ?torqueEtat=1             → compteurs, photos, concessions Torque apprises
     POST torquePhotosLancer / torquePhotosArreter (admin)
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;

  var STATUTS_TORQUE = {
    Completed: ['Complété / Relance', 'vert'], Pending: ['En attente', 'ambre'], Incomplete: ['Fiche incomplète', 'gris'], Lost: ['Perdu', 'rouge'],
    TradedIn: ['Repris', 'bleu'], TradeIn: ['Repris', 'bleu'], Bought: ['Repris', 'bleu'], TradedInWholesale: ['Repris wholesale', 'violet'], TradeInWholesale: ['Repris wholesale', 'violet'], BoughtWholesale: ['Repris wholesale', 'violet'], Wholesale: ['Wholesale', 'violet']
  };
  var COULEUR_CONCESSION = { stemarie: 'vert', hawkesbury: 'bleu', vwbrossard: 'violet', bmwsherbrooke: 'sombre', hyundailongueuil: 'ambre' };
  var PERIODES = [['tout', 'Tout'], ['j30', '30 jours'], ['trimestre', 'Trimestre'], ['annee', 'Année'], ['an1', '12 mois']];
  var URL_TORQUE_EVAL = 'https://dealer.torquemanagement.ca/vehicle-management/evaluations/';

  // Signet « Automax ← Torque » (source : mock/signet-torque.src.js, embarqué
  // par mock/signet-build.py). Ne jamais éditer la constante à la main.
  var CODE_SIGNET_TORQUE = "javascript:(function () { if (window.__amxTorque) { alert('Un export Torque est d\u00e9j\u00e0 en cours dans cette page.'); return; } var s = document.createElement('script'); s.src = " + JSON.stringify(AMX.SITE) + " + 'assets/signet-torque.js?t=' + Date.now(); s.onerror = function () { alert('Impossible de charger le signet depuis le site d\\'inventaire (groupeautomax.github.io). V\u00e9rifiez votre connexion, puis recliquez.'); }; document.body.appendChild(s); })();";

  function fmt(n) { return (n === null || n === undefined || n === '' || isNaN(n)) ? '—' : AMX.fmtArgent(n, 0); }
  function nombre(v) { if (v === null || v === undefined || v === '') return null; var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; }
  function fmtKm(n) { n = nombre(n); return n === null ? '—' : AMX.fmtNombre(Math.round(n)) + ' km'; }
  function statut(code) { var s = STATUTS_TORQUE[code]; return s ? { libelle: s[0], couleur: s[1] } : { libelle: code || '—', couleur: 'gris' }; }
  function nomCourt(cle) { return (AMX.CONCESSIONS[cle] || cle || '').replace(' Automobiles Ltée', '').replace(' Chevrolet Buick Cadillac', ''); }
  function debutPeriode(cle) {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth();
    if (cle === 'j30') { var d = new Date(now); d.setDate(d.getDate() - 30); return d.getTime(); }
    if (cle === 'trimestre') return new Date(y, Math.floor(m / 3) * 3, 1).getTime();
    if (cle === 'annee') return new Date(y, 0, 1).getTime();
    if (cle === 'an1') { var e = new Date(now); e.setFullYear(e.getFullYear() - 1); return e.getTime(); }
    return -Infinity;
  }
  function vehiculeTexte(r) { return [r.annee, r.marque, r.modele].filter(Boolean).join(' ') || '—'; }
  function telephone(t) { var c = String(t || '').replace(/\D/g, ''); return c.length === 10 ? c.slice(0, 3) + ' ' + c.slice(3, 6) + '-' + c.slice(6) : (t || ''); }

  function injecterCss() {
    if (document.getElementById('css-torque')) return;
    var s = document.createElement('style');
    s.id = 'css-torque';
    s.textContent = [
      '.torque-page .carte { margin-bottom: 12px; }',
      '.torque-cartes { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 12px; }',
      '.torque-carte { text-align: left; background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); padding: 10px 12px 9px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; box-shadow: var(--ombre); position: relative; overflow: hidden; }',
      '.torque-carte::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--ligne-forte); }',
      '.torque-carte.vert::before { background: var(--vert); } .torque-carte.bleu::before { background: var(--bleu); } .torque-carte.violet::before { background: var(--violet); } .torque-carte.sombre::before { background: var(--noir-2); } .torque-carte.ambre::before { background: var(--ambre); }',
      '.torque-carte.actif { border-color: var(--encre); box-shadow: 0 0 0 2px rgba(0,0,0,.08); }',
      '.torque-carte .haut { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; } .torque-carte .nom { font-weight: 600; font-size: 13px; } .torque-carte .n { font-size: 20px; font-weight: 700; }',
      '.torque-carte .bas { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11.5px; color: var(--encre-3); } .torque-carte .bas b { color: var(--encre); font-weight: 600; }',
      '.torque-outils { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .torque-outils .recherche { display: flex; align-items: center; gap: 6px; flex: 1 1 220px; } .torque-outils .recherche svg { width: 16px; height: 16px; color: var(--encre-3); } .torque-outils .recherche input { flex: 1; height: 32px; }',
      '.torque-outils .compte { margin-left: auto; font-size: 12px; }',
      '.torque-table { overflow-x: auto; } .torque-table .tableau { min-width: 980px; } .torque-table td, .torque-table th { padding: 7px 10px; }',
      '.torque-table td.vehicule { display: flex; gap: 8px; align-items: center; min-width: 220px; } .torque-table td.vehicule .nom { font-weight: 600; } .torque-table td.vehicule .vin { font-family: var(--mono); font-size: 11px; color: var(--encre-3); }',
      '.torque-table td.photo img { width: 56px; height: 42px; object-fit: cover; border-radius: 6px; background: var(--gris-bg); display: block; }',
      '.torque-table td.photo .sans { width: 56px; height: 42px; border-radius: 6px; background: var(--gris-bg); display: flex; align-items: center; justify-content: center; color: var(--encre-4); font-size: 10px; }',
      '.torque-table tr.archivee td { color: var(--encre-3); }',
      '.torque-etapes { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; } .torque-etapes .section-titre { margin-bottom: 4px; } .torque-etapes p { margin: 0 0 8px; color: var(--encre-2); font-size: 12.5px; }',
      '.torque-import-etat { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; margin-top: 12px; } .torque-import-etat .case { background: var(--carte-2); border: 1px solid var(--ligne); border-radius: 8px; padding: 8px 10px; font-size: 12px; } .torque-import-etat .case b { display: block; font-size: 15px; } .torque-import-etat .case .mini { color: var(--encre-3); font-size: 11px; }',
      '.torque-photos { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 10px; font-size: 12.5px; } .torque-photos .jauge { flex: 1 1 160px; height: 8px; background: var(--gris-bg); border-radius: 4px; overflow: hidden; } .torque-photos .jauge i { display: block; height: 100%; background: var(--vert); }',
      '.torque-fiche { display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; } @media (max-width: 760px) { .torque-fiche { grid-template-columns: 1fr; } }',
      '.torque-fiche h4 { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin: 14px 0 6px; } .torque-fiche h4:first-child { margin-top: 0; }',
      '.torque-fiche dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; font-size: 12.5px; margin: 0; } .torque-fiche dt { color: var(--encre-3); } .torque-fiche dd { margin: 0; }',
      '.torque-galerie { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; } .torque-galerie a { display: block; aspect-ratio: 4/3; border-radius: 8px; overflow: hidden; background: var(--gris-bg); } .torque-galerie img { width: 100%; height: 100%; object-fit: cover; display: block; }',
      '.torque-prix { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; } .torque-prix .tuile { background: var(--carte-2); border: 1px solid var(--ligne); border-radius: 8px; padding: 8px 10px; } .torque-prix .l { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); } .torque-prix .v { font-size: 16px; font-weight: 700; } .torque-prix .tuile.fort .v { color: var(--vert); }',
      '.torque-notes { white-space: pre-wrap; font-size: 12.5px; background: var(--carte-2); border-radius: 8px; padding: 8px 10px; }',
      '.torque-options { display: flex; flex-wrap: wrap; gap: 4px; } .torque-options span { background: var(--gris-bg); border-radius: 999px; padding: 2px 8px; font-size: 11.5px; }',
      '.eval-torque-historique { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12.5px; }',
      '.eval-torque-historique .badge { cursor: pointer; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ La vue ------------------------------- */
  function ArchiveTorque(ctx) {
    injecterCss();
    this.generation = 0;
    this.liste = null; this.erreur = ''; this.refus = '';
    this.concession = AMX.memo.lire('torque_concession', '');
    this.periode = AMX.memo.lire('torque_periode', 'tout');
    this.statut = ''; this.recherche = ''; this.archivees = false;
    this.tri = { cle: 'creeLe', desc: true };
    this.etat = null;
    this.construire();
    this.naviguer(ctx || {});
    this.charger();
  }
  ArchiveTorque.prototype.demonter = function () { this.generation++; };
  ArchiveTorque.prototype.naviguer = function (ctx) {
    var p = (ctx && ctx.params) || {};
    if (p.vin) { this.recherche = String(p.vin).trim().toUpperCase(); this.elRecherche.value = this.recherche; this.concession = ''; this.periode = 'tout'; if (this.liste) this.rendre(); }
    if (p.id) { this.ouvrirId = String(p.id); if (this.liste) this.ouvrir(this.ouvrirId); }
  };

  ArchiveTorque.prototype.construire = function () {
    var self = this;
    this.elEtat = h('p', { text: 'Chargement de l\'archive…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.btnImport = h('button.btn.primaire', { type: 'button', text: 'Importer depuis Torque', onclick: function () { self.elImport.open = !self.elImport.open; if (self.elImport.open) self.elImport.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Archive Torque'), this.elEtat]),
      h('div.actions', [this.btnRafraichir, this.btnExport, this.btnImport])
    ]);
    this.elImport = this.construireImport();
    this.elCartes = h('div.torque-cartes');
    this.elRecherche = h('input.saisie#torque-recherche', { type: 'search', placeholder: 'Client, téléphone, NIV, modèle, conseiller…', autocomplete: 'off', oninput: AMX.debounce(function (e) { self.recherche = e.target.value; self.rendreTable(); }, 120) });
    this.elSegment = h('div.segment', { role: 'group', 'aria-label': 'Période' });
    this.elStatut = h('select.saisie#torque-statut', { 'aria-label': 'Statut', style: { height: '32px', width: 'auto' } });
    this.elStatut.addEventListener('change', function () { self.statut = self.elStatut.value; self.rendreTable(); });
    var caseArch = h('input', { type: 'checkbox' });
    caseArch.addEventListener('change', function () { self.archivees = caseArch.checked; self.rendreTable(); });
    this.elCompte = h('span.compte.doux');
    var barre = h('div.carte', [h('div.carte-corps', [h('div.torque-outils', [
      h('div.recherche', [h('span', { html: I.recherche }), this.elRecherche]), this.elSegment, this.elStatut,
      h('label.case', { title: 'Les évaluations supprimées dans Torque sont conservées ici, masquées par défaut' }, [caseArch, h('span', 'Inclure les archivées')]), this.elCompte
    ])])]);
    this.elTable = h('div.torque-table');
    this.elVide = h('div');
    this.el = h('div.page.torque-page', [entete, this.elImport, this.elCartes, barre, this.elVide, h('div.carte', [h('div.carte-corps', [this.elTable])])]);
  };

  /* --------------------------- Carte d'import --------------------------- */
  ArchiveTorque.prototype.construireImport = function () {
    var self = this;
    var signet = h('a.btn.primaire', { href: CODE_SIGNET_TORQUE, text: 'Automax ← Torque', title: 'Glissez ce bouton dans votre barre de favoris', draggable: 'true' });
    signet.addEventListener('click', function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B pour l\'afficher), puis cliquez-le depuis Torque, connecté, la concession choisie en haut à gauche.', 'attention', 8000); });
    this.elImportEtat = h('div.torque-import-etat');
    this.elPhotos = h('div.torque-photos');
    var d = h('details.carte#torque-import', [
      h('summary.carte-entete', { style: { cursor: 'pointer' } }, [h('h2', 'Importer depuis Torque — avant la fin de l\'abonnement')]),
      h('div.carte-corps', [
        h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)' } }, 'Le signet lit toutes les évaluations de la concession affichée dans Torque (actives et archivées : véhicule, client, conseiller, valeurs, prix de vente, profit, reconditionnement, statut, état, pneus, pare-brise, carrosserie, notes, options, photos) et les analyses de marché, puis les envoie ici. Il utilise la session Torque déjà ouverte dans votre navigateur, comme Torque lui-même ; il ne modifie rien dans Torque. Une concession à la fois ; recliquer le signet met à jour ce qui a changé.'),
        h('div.torque-etapes', [
          h('div', [h('div.section-titre', '1. Installer (une fois)'), h('p', 'Glissez ce bouton dans la barre de favoris de Chrome. Si la barre est cachée : Cmd+Shift+B.'), signet]),
          h('div', [h('div.section-titre', '2. Dans Torque'), h('p', 'Connectez-vous sur dealer.torquemanagement.ca et choisissez la concession en haut à gauche (BMW Sherbrooke, Hawkesbury, Hyundai Longueuil, Ste-Marie, VW Brossard). Gardez cet onglet du site ouvert et connecté.')]),
          h('div', [h('div.section-titre', '3. Cliquer le signet'), h('p', 'Une bande verte suit la progression en bas de la page Torque. À la fin, changez de concession et recliquez. Revenez ici : « Rafraîchir ».')])
        ]),
        this.elImportEtat,
        this.elPhotos
      ])
    ]);
    d.open = false;
    return d;
  };

  ArchiveTorque.prototype.rendreImport = function () {
    var self = this, e = this.etat;
    AMX.vider(this.elImportEtat); AMX.vider(this.elPhotos);
    if (!e) return;
    Object.keys(AMX.CONCESSIONS).forEach(function (c) {
      var x = (e.parConcession || {})[c];
      self.elImportEtat.appendChild(h('div.case', [h('div', { text: nomCourt(c) }), h('b', { text: x ? AMX.fmtNombre(x.n) : '0' }), h('div.mini', { text: x ? ('dernier import ' + AMX.fmtDate(x.derniere, true) + (x.archivees ? ' · ' + x.archivees + ' archivée' + (x.archivees > 1 ? 's' : '') : '')) : 'pas encore importée' })]));
    });
    this.elImportEtat.appendChild(h('div.case', [h('div', 'Analyses de marché Torque'), h('b', { text: AMX.fmtNombre(e.analyses || 0) }), h('div.mini', 'statistiques et réglages conservés')]));
    var p = e.photos || {};
    var total = p.photosTotal || 0, faites = p.photosDrive || 0;
    var pctPhotos = total ? Math.min(100, Math.round(100 * faites / total)) : 0;
    this.elPhotos.appendChild(h('div', { style: { flex: '1 1 100%', fontWeight: 600 } }, 'Photos rapatriées dans Drive (dossier « Torque — photos »)'));
    this.elPhotos.appendChild(h('div.jauge', [h('i', { style: { width: pctPhotos + '%' } })]));
    this.elPhotos.appendChild(h('span', { text: AMX.fmtNombre(faites) + ' / ' + AMX.fmtNombre(total) + ' photos' + (p.actif ? ' — en cours (toutes les 10 minutes)' : (p.termineLe ? ' — terminé ' + AMX.fmtDate(p.termineLe, true) : (total ? ' — en attente' : ''))) + (p.erreursTotal ? ' · ' + p.erreursTotal + ' introuvable(s)' : '') }));
    if (AMX.estAdmin()) {
      if (!p.actif) this.elPhotos.appendChild(h('button.btn', { type: 'button', text: total && faites < total ? 'Rapatrier les photos' : 'Relancer', onclick: function (ev) { self.photosCommande('torquePhotosLancer', ev.currentTarget); } }));
      else this.elPhotos.appendChild(h('button.btn.fantome', { type: 'button', text: 'Arrêter', onclick: function (ev) { self.photosCommande('torquePhotosArreter', ev.currentTarget); } }));
    }
    this.elPhotos.appendChild(h('span.doux.petit', { text: 'Les photos Torque disparaîtront avec le compte : tant qu\'elles ne sont pas rapatriées, la fiche affiche celles de Torque.' }));
  };

  ArchiveTorque.prototype.photosCommande = function (action, btn) {
    var self = this;
    if (btn) btn.classList.add('occupe');
    return AMX.post({ action: action }).then(function (d) {
      AMX.verifier(d, 'Commande impossible');
      AMX.toast(action === 'torquePhotosLancer' ? 'Rapatriement des photos lancé — ' + (d.faites || 0) + ' photo(s) déjà copiée(s), la suite se fait toute seule.' : 'Rapatriement arrêté.', 'ok');
      return self.charger();
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }).then(function () { if (btn) btn.classList.remove('occupe'); });
  };

  /* ------------------------------ Données ------------------------------ */
  ArchiveTorque.prototype.charger = function (manuel) {
    var self = this, gen = ++this.generation;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    return Promise.all([AMX.get({ torque: 1 }), AMX.get({ torqueEtat: 1 }).catch(function () { return null; })]).then(function (res) {
      if (gen !== self.generation) return;
      var d = res[0];
      self.btnRafraichir.classList.remove('occupe');
      if (d && d.refuse) { self.refus = d.erreur || 'Accès refusé.'; self.rendre(); return; }
      if (!d || !d.ok) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
      self.liste = d.evaluations || []; self.parStatut = d.parStatut || {}; self.etat = res[1] && res[1].ok ? res[1] : { parConcession: {}, photos: d.photos || {}, analyses: d.analyses || 0 };
      self.erreur = ''; self.refus = '';
      self.rendre();
      if (!self.liste.length) self.elImport.open = true;
      if (self.ouvrirId) { var id = self.ouvrirId; self.ouvrirId = null; self.ouvrir(id); }
      if (manuel) AMX.toast('Archive mise à jour — ' + self.liste.length + ' évaluation' + (self.liste.length > 1 ? 's' : ''), 'ok');
    }).catch(function (e) {
      if (gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e); self.rendre();
      AMX.toast('Impossible de charger l\'archive Torque — ' + self.erreur, 'erreur');
    });
  };

  ArchiveTorque.prototype.base = function () {
    var self = this, debut = debutPeriode(this.periode);
    return (this.liste || []).filter(function (r) {
      if (!self.archivees && r.archivee) return false;
      var t = new Date(r.creeLe).getTime();
      if (!(isNaN(t) || t >= debut)) return false;
      if (self.statut && r.statut !== self.statut) return false;
      return true;
    });
  };
  ArchiveTorque.prototype.filtrees = function () {
    var self = this, q = this.recherche.trim().toUpperCase(), qTel = q.replace(/\D/g, '');
    return this.base().filter(function (r) {
      if (self.concession && r.concession !== self.concession) return false;
      if (!q) return true;
      if (qTel.length >= 4 && String(r.telephone || '').replace(/\D/g, '').indexOf(qTel) >= 0) return true;
      return [r.vin, r.marque, r.modele, r.serie, r.annee, r.client, r.conseiller, r.statutLibelle, r.couleur].join(' ').toUpperCase().indexOf(q) >= 0;
    });
  };
  function agreger(lignes) {
    var n = lignes.length, nRepris = 0, interne = 0, nInterne = 0, vente = 0, nVente = 0, nPerdu = 0;
    lignes.forEach(function (r) {
      if (/^(Trade|Bought)/.test(r.statut || '')) nRepris++;
      if (r.statut === 'Lost') nPerdu++;
      var vi = nombre(r.valeurInterne), pv = nombre(r.prixVente);
      if (vi) { interne += vi; nInterne++; } if (pv) { vente += pv; nVente++; }
    });
    return { n: n, nRepris: nRepris, nPerdu: nPerdu, interneMoy: nInterne ? interne / nInterne : null, venteMoy: nVente ? vente / nVente : null };
  }

  /* -------------------------------- Rendu ------------------------------- */
  ArchiveTorque.prototype.rendre = function () {
    var self = this;
    AMX.vider(this.elCartes); AMX.vider(this.elSegment); AMX.vider(this.elVide);
    this.rendreImport();
    if (this.refus) { this.elEtat.textContent = this.refus; this.elVide.appendChild(h('div.vide', [h('div', { html: I.cadenas }), h('h3', 'Accès non autorisé'), h('div', { text: this.refus })])); this.elTable.textContent = ''; return; }
    if (!this.liste) { this.elEtat.textContent = this.erreur ? 'Serveur injoignable : ' + this.erreur : 'Chargement de l\'archive…'; return; }
    var total = this.liste.length, nArch = this.liste.filter(function (r) { return r.archivee; }).length;
    this.elEtat.textContent = total ? (total + ' évaluation' + (total > 1 ? 's' : '') + ' importée' + (total > 1 ? 's' : '') + ' de Torque' + (nArch ? ' (dont ' + nArch + ' archivée' + (nArch > 1 ? 's' : '') + ')' : '') + ' — véhicule, client, conseiller, valeurs, état, photos. Cliquez une concession pour filtrer, une ligne pour tout voir.') : 'Rien d\'importé encore : ouvrez « Importer depuis Torque » ci-dessous.';
    PERIODES.forEach(function (p) {
      self.elSegment.appendChild(h('button' + (p[0] === self.periode ? '.actif' : ''), { type: 'button', text: p[1], onclick: function () { self.periode = p[0]; AMX.memo.ecrire('torque_periode', p[0]); self.rendre(); } }));
    });
    // Statuts présents
    AMX.vider(this.elStatut);
    this.elStatut.appendChild(h('option', { value: '', text: 'Tous les statuts' }));
    var statuts = {}; this.liste.forEach(function (r) { statuts[r.statut || ''] = (statuts[r.statut || ''] || 0) + 1; });
    Object.keys(statuts).sort().forEach(function (s) { self.elStatut.appendChild(h('option', { value: s, selected: s === self.statut ? true : undefined, text: statut(s).libelle + ' (' + statuts[s] + ')' })); });
    // Cartes
    var base = this.base();
    var carte = function (cle, libelle, lignes) {
      var ag = agreger(lignes), actif = self.concession === cle;
      return h('button.torque-carte' + (actif ? '.actif' : '') + (cle ? '.' + (COULEUR_CONCESSION[cle] || 'gris') : ''), { type: 'button', 'aria-pressed': actif ? 'true' : 'false', onclick: function () { self.concession = cle; AMX.memo.ecrire('torque_concession', cle); self.rendre(); } }, [
        h('div.haut', [h('div.nom', { text: libelle }), h('div.n.num', { text: AMX.fmtNombre(ag.n) })]),
        h('div.bas', ag.n ? [h('span', [h('b', { text: String(ag.nRepris) }), ' repris']), h('span', [h('b', { text: String(ag.nPerdu) }), ' perdus']), h('span', [h('b', { text: fmt(ag.interneMoy) }), ' interne moy.']), h('span', [h('b', { text: fmt(ag.venteMoy) }), ' vente moy.'])] : [h('span.doux', 'aucune évaluation')])
      ]);
    };
    this.elCartes.appendChild(carte('', 'Toutes les concessions', base));
    Object.keys(AMX.CONCESSIONS).forEach(function (c) { self.elCartes.appendChild(carte(c, nomCourt(c), base.filter(function (r) { return r.concession === c; }))); });
    this.rendreTable();
  };

  var COLONNES = [
    { cle: 'photo', libelle: '' },
    { cle: 'creeLe', libelle: 'Date' },
    { cle: 'vehicule', libelle: 'Véhicule', valeur: function (r) { return vehiculeTexte(r); } },
    { cle: 'km', libelle: 'Km', num: true, valeur: function (r) { return nombre(r.km); } },
    { cle: 'concession', libelle: 'Concession', valeur: function (r) { return nomCourt(r.concession); } },
    { cle: 'client', libelle: 'Client' },
    { cle: 'conseiller', libelle: 'Conseiller' },
    { cle: 'valeurClient', libelle: 'Valeur client', num: true, valeur: function (r) { return nombre(r.valeurClient); } },
    { cle: 'valeurInterne', libelle: 'Valeur interne', num: true, valeur: function (r) { return nombre(r.valeurInterne); } },
    { cle: 'prixVente', libelle: 'Prix de vente', num: true, valeur: function (r) { return nombre(r.prixVente); } },
    { cle: 'statut', libelle: 'Statut', valeur: function (r) { return statut(r.statut).libelle; } },
    { cle: 'nPhotos', libelle: 'Photos', num: true, valeur: function (r) { return nombre(r.nPhotos) || 0; } }
  ];

  ArchiveTorque.prototype.rendreTable = function () {
    var self = this;
    AMX.vider(this.elTable);
    var lignes = this.filtrees();
    this.elCompte.textContent = lignes.length + ' évaluation' + (lignes.length > 1 ? 's' : '') + (this.concession ? ' · ' + nomCourt(this.concession) : '');
    if (!lignes.length) { this.elTable.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucune évaluation'), h('div', { text: this.recherche ? 'Rien ne correspond à la recherche.' : (this.liste && this.liste.length ? 'Aucune évaluation pour ce filtre.' : 'Importez d\'abord depuis Torque (carte ci-dessus).') })])); return; }
    var c = COLONNES.filter(function (x) { return x.cle === self.tri.cle; })[0] || COLONNES[1];
    var val = c.valeur || function (r) { return r[c.cle]; };
    lignes = lignes.slice().sort(function (a, b) {
      var va = val(a), vb = val(b), r;
      if (typeof va === 'number' || typeof vb === 'number') { va = (typeof va === 'number' && !isNaN(va)) ? va : -Infinity; vb = (typeof vb === 'number' && !isNaN(vb)) ? vb : -Infinity; r = va === vb ? 0 : (va < vb ? -1 : 1); }
      else r = String(va || '').localeCompare(String(vb || ''), 'fr', { numeric: true, sensitivity: 'base' });
      return self.tri.desc ? -r : r;
    });
    var thead = h('thead', [h('tr', COLONNES.map(function (col) {
      var actif = self.tri.cle === col.cle;
      var th = h('th' + (col.num ? '.num' : '') + (col.libelle ? '.registre-triable' : '') + (actif ? '.actif' : ''), { 'aria-sort': actif ? (self.tri.desc ? 'descending' : 'ascending') : 'none', title: col.libelle ? 'Trier par ' + col.libelle.toLowerCase() : '' }, [col.libelle, actif ? h('span', { text: self.tri.desc ? ' ▼' : ' ▲', style: { fontSize: '9px' } }) : null]);
      if (col.libelle) th.addEventListener('click', function () { if (self.tri.cle === col.cle) self.tri.desc = !self.tri.desc; else { self.tri.cle = col.cle; self.tri.desc = !!col.num || col.cle === 'creeLe'; } self.rendreTable(); });
      return th;
    }))]);
    var tbody = h('tbody');
    lignes.forEach(function (r) {
      var s = statut(r.statut);
      var tr = h('tr.cliquable' + (r.archivee ? '.archivee' : ''), { tabindex: '0' }, [
        h('td.photo', r.photo ? [h('img', { src: r.photo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })] : [h('div.sans', { text: 'sans photo' })]),
        h('td.num', [h('div', { text: r.creeLe ? AMX.fmtDate(r.creeLe) : '—' }), r.archivee ? h('div.mini', 'archivée') : null]),
        h('td.vehicule', [AMX.logoMarque(r.marque, 'petit'), h('div', [h('div.nom', { text: vehiculeTexte(r) }), h('div.mini', { text: [r.serie, r.style].filter(Boolean).join(' · ') }), h('div.vin', { text: r.vin || '' })])]),
        h('td.num', { text: fmtKm(r.km) }),
        h('td', [h('span.badge.sans-point.' + (COULEUR_CONCESSION[r.concession] || 'gris'), { text: nomCourt(r.concession) })]),
        h('td', [h('div', { text: r.client || '—' }), r.telephone ? h('div.mini', { text: telephone(r.telephone) }) : null, (r.origine || r.typeClient) ? h('div.mini', { text: [r.origine, r.typeClient].filter(Boolean).join(' / ') }) : null]),
        h('td', { text: r.conseiller || '—' }),
        h('td.num', { text: fmt(nombre(r.valeurClient)) }),
        h('td.num', { text: fmt(nombre(r.valeurInterne)) }),
        h('td.num', [h('div', { text: fmt(nombre(r.prixVente)) }), nombre(r.profit) !== null ? h('div.mini', { text: 'profit ' + fmt(nombre(r.profit)) }) : null]),
        h('td', [h('span.badge.sans-point.' + s.couleur, { text: s.libelle })]),
        h('td.num', { text: String(nombre(r.nPhotos) || 0) })
      ]);
      var ouvrir = function () { self.ouvrir(r.id); };
      tr.addEventListener('click', ouvrir);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') ouvrir(); });
      tbody.appendChild(tr);
    });
    var ag = agreger(lignes);
    var tfoot = h('tfoot', [h('tr', [
      h('td', { colspan: '7', text: 'Total — ' + ag.n + ' évaluation' + (ag.n > 1 ? 's' : '') + ' · ' + ag.nRepris + ' reprise' + (ag.nRepris > 1 ? 's' : '') + ' · ' + ag.nPerdu + ' perdue' + (ag.nPerdu > 1 ? 's' : '') }),
      h('td.num', ''), h('td.num', { text: ag.interneMoy !== null ? 'moy. ' + fmt(ag.interneMoy) : '' }), h('td.num', { text: ag.venteMoy !== null ? 'moy. ' + fmt(ag.venteMoy) : '' }), h('td', ''), h('td', '')
    ])]);
    this.elTable.appendChild(h('table.tableau#torque-table', [thead, tbody, tfoot]));
  };

  /* ------------------------------- Fiche -------------------------------- */
  ArchiveTorque.prototype.ouvrir = function (id) {
    var self = this;
    var ligne = (this.liste || []).filter(function (r) { return String(r.id) === String(id); })[0];
    if (!ligne) { AMX.toast('Évaluation introuvable dans l\'archive.', 'attention'); return; }
    var corps = h('div.torque-fiche');
    corps.appendChild(h('div.doux', { text: 'Chargement de la fiche complète…' }));
    var boutons = [{ texte: 'Ouvrir dans la fiche d\'évaluation', classe: 'primaire', action: function () { AMX.aller('outils', 'evaluation', { vin: ligne.vin }); } }];
    var carfax = AMX.carfax.lien(ligne.vin);
    if (carfax) boutons.push({ texte: 'Rapport CARFAX', action: function () { window.open(carfax, '_blank', 'noopener'); return false; } });
    boutons.push({ texte: 'Voir dans Torque', action: function () { window.open(URL_TORQUE_EVAL + ligne.id, '_blank', 'noopener'); return false; } });
    boutons.push({ texte: 'Fermer' });
    AMX.modale({ titre: vehiculeTexte(ligne) + (ligne.client ? ' — ' + ligne.client : ''), corps: corps, large: true, boutons: boutons });
    AMX.get({ torqueFiche: id }).then(function (d) {
      if (!d || !d.ok) throw new Error((d && d.erreur) || 'Fiche indisponible');
      self.rendreFiche(corps, d.ligne || ligne, d.fiche || null);
    }).catch(function (e) { self.rendreFiche(corps, ligne, null); AMX.toast('Fiche complète indisponible — ' + AMX.erreurTexte(e), 'attention'); });
  };

  function dl(paires) {
    var el = h('dl');
    paires.forEach(function (p) { if (p[1] === null || p[1] === undefined || p[1] === '' || p[1] === '—') return; el.appendChild(h('dt', { text: p[0] })); el.appendChild(h('dd', typeof p[1] === 'string' || typeof p[1] === 'number' ? { text: String(p[1]) } : [p[1]])); });
    return el;
  }
  function libelleMotricite(v) { return { AllWheelDrive: 'Intégrale (AWD)', FourWheelDrive: '4x4', FrontWheelDrive: 'Traction', RearWheelDrive: 'Propulsion' }[v] || v || ''; }
  function libelleGeneral(v) { return { Bad: 'Mauvais', Poor: 'Mauvais', Normal: 'Normal', Average: 'Normal', Good: 'Bon', Excellent: 'Excellent' }[v] || v || ''; }
  function libelleCarburant(v) { return { Gasoline: 'Essence', Diesel: 'Diesel', Hybrid: 'Hybride', Electric: 'Électrique', PlugInHybrid: 'Hybride rechargeable' }[v] || v || ''; }
  function libelleTransmission(v) { return { Automatic: 'Automatique', Manual: 'Manuelle', CVT: 'CVT' }[v] || v || ''; }

  ArchiveTorque.prototype.rendreFiche = function (corps, r, fiche) {
    AMX.vider(corps);
    var s = statut(r.statut);
    var f = fiche || {};
    var v = f.vehicule || {}, c = f.condition || {}, p = f.prix || {}, cl = f.client || {};
    var photos = (r.photos && r.photos.length) ? r.photos : (r.photosTorque || []).map(function (u) { return { vue: u, ouvrir: u }; });
    var gauche = h('div'), droite = h('div');

    gauche.appendChild(h('h4', 'Photos' + (photos.length ? ' (' + photos.length + ')' : '')));
    if (photos.length) gauche.appendChild(h('div.torque-galerie', photos.map(function (ph) { return h('a', { href: ph.ouvrir || ph.vue, target: '_blank', rel: 'noopener' }, [h('img', { src: ph.vue, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })]); })));
    else gauche.appendChild(h('div.doux.petit', 'Aucune photo dans Torque pour cette évaluation.'));
    if (r.photosDrive && r.photosDrive.length) gauche.appendChild(h('div.doux.petit', { style: { marginTop: '4px' } }, 'Photos rapatriées dans Drive' + (r.dossierDrive ? ' — ' : ''), r.dossierDrive ? h('a', { href: 'https://drive.google.com/drive/folders/' + r.dossierDrive, target: '_blank', rel: 'noopener', text: 'ouvrir le dossier' }) : null));

    gauche.appendChild(h('h4', 'Véhicule'));
    gauche.appendChild(dl([
      ['NIV', h('span.mono', { text: r.vin || '' })], ['Véhicule', [r.annee, r.marque, r.modele, r.serie].filter(Boolean).join(' ')], ['Style', r.style], ['Version', v.version],
      ['Moteur', r.moteur || v.moteur], ['Transmission', libelleTransmission(r.transmission)], ['Motricité', libelleMotricite(r.motricite)], ['Carburant', libelleCarburant(r.carburant)],
      ['Odomètre', fmtKm(r.km)], ['Clés', r.cles], ['Couleur', r.couleur], ['Intérieur', r.couleurInterieure]
    ]));

    gauche.appendChild(h('h4', 'État'));
    var voyants = c.voyants || {};
    var voyantsTxt = Object.keys(voyants).filter(function (k) { return voyants[k]; }).map(function (k) { return ({ hasCheckEngine: 'Check engine', hasAbsBreakWarning: 'ABS / freins', hasAirBagWarning: 'Coussins gonflables', hasAirConditionnerWarning: 'Climatisation', hasDamageWarning: 'Dommages', hasSmokeWarning: 'Odeur de fumée', isAmerican: 'Véhicule américain', isCarModified: 'Véhicule modifié' })[k] || k; }).join(', ');
    gauche.appendChild(dl([
      ['État général', libelleGeneral(r.etatGeneral)], ['Pneus d\'été', r.pneusEte], ['Pneus d\'hiver', r.pneusHiver], ['Pare-brise', r.pareBrise],
      ['Accidenté', r.accidente === 'oui' ? 'Oui — déclaré par le client' : (r.accidente === 'non' ? 'Non, selon le client' : '')],
      ['Carrosserie', r.carrosserie || (c.carrosserie && c.carrosserie.vu === false ? 'Véhicule non vu' : '')], ['Voyants / particularités', voyantsTxt || r.voyants],
      ['Solde de prêt', r.soldePret]
    ]));
    if (c.carrosserie && c.carrosserie.dessin) gauche.appendChild(h('div', { style: { marginTop: '6px' } }, [h('a', { href: 'https://api-dealer.torquemanagement.ca/assets/' + c.carrosserie.dessin, target: '_blank', rel: 'noopener' }, [h('img', { src: 'https://api-dealer.torquemanagement.ca/assets/' + c.carrosserie.dessin, alt: 'Schéma de la carrosserie', style: { maxWidth: '100%', borderRadius: '8px', background: '#fff' }, referrerpolicy: 'no-referrer' })])]));
    var options = Array.isArray(f.options) ? f.options : String(r.options || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (options.length) { gauche.appendChild(h('h4', 'Options (' + options.length + ')')); gauche.appendChild(h('div.torque-options', options.map(function (o) { return h('span', { text: o }); }))); }

    droite.appendChild(h('h4', 'Évaluation'));
    droite.appendChild(h('div', { style: { marginBottom: '8px' } }, [h('span.badge.sans-point.' + s.couleur, { text: s.libelle }), r.archivee ? h('span.badge.sans-point.gris', { style: { marginLeft: '6px' }, text: 'Archivée dans Torque' }) : null]));
    droite.appendChild(h('div.torque-prix', [
      h('div.tuile', [h('div.l', 'Valeur client'), h('div.v', { text: fmt(nombre(r.valeurClient)) })]),
      h('div.tuile', [h('div.l', 'Valeur interne'), h('div.v', { text: fmt(nombre(r.valeurInterne)) })]),
      h('div.tuile', [h('div.l', 'Reconditionnement'), h('div.v', { text: fmt(nombre(r.recon)) })]),
      h('div.tuile', [h('div.l', 'Profit'), h('div.v', { text: fmt(nombre(r.profit)) })]),
      h('div.tuile.fort', [h('div.l', 'Prix de vente'), h('div.v', { text: fmt(nombre(r.prixVente)) })])
    ]));
    var recon = p.recon || {};
    var reconDetail = Object.keys(recon).filter(function (k) { return k !== 'total' && nombre(recon[k]); }).map(function (k) { return ({ bodywork: 'Carrosserie', certificate: 'Certificat', fees: 'Frais', other: 'Autre', refurbishment: 'Remise en état', tire: 'Pneus', windshield: 'Pare-brise' })[k] + ' ' + fmt(nombre(recon[k])); }).join(' · ');
    droite.appendChild(dl([['Note sur le prix', r.notePrix], ['Détail recon.', reconDetail], ['Type de prix', p.type === 'Manual' ? 'Manuel' : p.type], ['Créée', r.creeLe ? AMX.fmtDate(r.creeLe, true) : ''], ['Modifiée', r.modifieLe ? AMX.fmtDate(r.modifieLe, true) : ''], ['Importée', r.importeeLe ? AMX.fmtDate(r.importeeLe, true) + (r.importeePar ? ' par ' + String(r.importeePar).split('@')[0] : '') : '']]));

    droite.appendChild(h('h4', 'Client'));
    droite.appendChild(dl([['Nom', r.client], ['Téléphone', r.telephone ? h('a', { href: 'tel:' + String(r.telephone).replace(/\D/g, ''), text: telephone(r.telephone) }) : ''], ['Courriel', cl.courriel ? h('a', { href: 'mailto:' + cl.courriel, text: cl.courriel }) : ''], ['Origine', r.origine], ['Type', r.typeClient], ['Cherche', r.cherche], ['Transaction', r.transaction]]));
    droite.appendChild(h('h4', 'Équipe'));
    droite.appendChild(dl([['Conseiller', r.conseiller], ['Directeur', r.directeur], ['Concession', AMX.CONCESSIONS[r.concession] || r.concession]]));
    var notes = Array.isArray(f.notes) ? f.notes : [];
    droite.appendChild(h('h4', 'Notes' + (notes.length ? ' (' + notes.length + ')' : '')));
    if (notes.length) droite.appendChild(h('div.torque-notes', { text: notes.map(function (n) { return (n.le ? AMX.fmtDateCourte(n.le) + ' ' : '') + (n.par ? n.par + ' : ' : '') + n.texte; }).join('\n') }));
    else if (r.notes) droite.appendChild(h('div.torque-notes', { text: r.notes }));
    else droite.appendChild(h('div.doux.petit', 'Aucune note.'));
    var brut = f.brut || null;
    if (brut && Array.isArray(brut.shares) && brut.shares.length) {
      droite.appendChild(h('h4', 'Prix reçus des wholesalers (' + brut.shares.length + ')'));
      droite.appendChild(h('div.torque-notes', { text: brut.shares.map(function (sh) { return JSON.stringify(sh); }).join('\n') }));
    }
    corps.appendChild(gauche); corps.appendChild(droite);
  };

  /* -------------------------------- Excel ------------------------------- */
  ArchiveTorque.prototype.exporter = function () {
    var lignes = this.filtrees();
    if (!lignes.length) { AMX.toast('Aucune évaluation à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var rows = lignes.map(function (r) {
      return { 'Date': r.creeLe ? AMX.fmtDate(r.creeLe) : '', 'Modifiée': r.modifieLe ? AMX.fmtDate(r.modifieLe) : '', 'Concession': AMX.CONCESSIONS[r.concession] || r.concession, 'Statut': statut(r.statut).libelle, 'Archivée': r.archivee ? 'oui' : '',
        'NIV': r.vin, 'Année': r.annee, 'Marque': r.marque, 'Modèle': r.modele, 'Série': r.serie, 'Style': r.style, 'Moteur': r.moteur, 'Transmission': libelleTransmission(r.transmission), 'Motricité': libelleMotricite(r.motricite), 'Carburant': libelleCarburant(r.carburant), 'Couleur': r.couleur, 'Km': nombre(r.km), 'Clés': r.cles,
        'Client': r.client, 'Téléphone': telephone(r.telephone), 'Origine': r.origine, 'Type de client': r.typeClient, 'Cherche': r.cherche, 'Transaction': r.transaction, 'Conseiller': r.conseiller, 'Directeur': r.directeur,
        'Valeur client': nombre(r.valeurClient), 'Valeur interne': nombre(r.valeurInterne), 'Profit': nombre(r.profit), 'Reconditionnement': nombre(r.recon), 'Prix de vente': nombre(r.prixVente), 'Note prix': r.notePrix,
        'État général': libelleGeneral(r.etatGeneral), 'Pneus été': r.pneusEte, 'Pneus hiver': r.pneusHiver, 'Pare-brise': r.pareBrise, 'Carrosserie': r.carrosserie, 'Accidenté': r.accidente, 'Voyants': r.voyants, 'Solde de prêt': r.soldePret, 'Photos': nombre(r.nPhotos) || 0, 'Id Torque': r.id };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Torque');
    XLSX.writeFile(wb, 'archive-torque-' + (this.concession || 'toutes') + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export Excel — ' + lignes.length + ' ligne' + (lignes.length > 1 ? 's' : ''), 'ok');
  };

  /* ---------- Historique Torque d'un NIV (pour la fiche d'évaluation) --- */
  // Rend dans `conteneur` une ligne « Historique Torque » si le NIV a été
  // évalué dans Torque. Renvoie la promesse du chargement.
  AMX.torqueHistorique = function (vin, conteneur) {
    injecterCss();
    AMX.vider(conteneur);
    vin = String(vin || '').trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return Promise.resolve(null);
    return AMX.get({ torqueVin: vin }, { essais: 1 }).then(function (d) {
      var liste = (d && d.ok && d.evaluations) || [];
      if (!liste.length) return liste;
      var r = liste[0], s = statut(r.statut);
      conteneur.appendChild(h('div.eval-torque-historique', [
        h('span.badge.sans-point.sombre', { text: 'Torque', title: 'Évaluation faite dans Torque, importée dans l\'archive', onclick: function () { AMX.aller('outils', 'torque', { vin: vin, id: r.id }); } }),
        h('span', { text: liste.length + ' évaluation' + (liste.length > 1 ? 's' : '') + ' dans Torque — dernière le ' + AMX.fmtDate(r.creeLe) + (r.client ? ' pour ' + r.client : '') + (r.conseiller ? ' (' + r.conseiller + ')' : '') }),
        h('span', { text: 'valeur interne ' + fmt(nombre(r.valeurInterne)) + ' · prix de vente ' + fmt(nombre(r.prixVente)) }),
        h('span.badge.sans-point.' + s.couleur, { text: s.libelle }),
        h('a', { href: AMX.lien('outils', 'torque', { vin: vin, id: r.id }), text: 'Voir dans l\'archive' })
      ]));
      return liste;
    }).catch(function () { return null; });
  };

  AMX.vues = AMX.vues || {};
  AMX.vues.ArchiveTorque = ArchiveTorque;
})();
