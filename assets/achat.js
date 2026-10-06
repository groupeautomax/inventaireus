/* =========================================================================
   Section « Fiche d'achat » : remplace achat.html.
   La fiche est liée au NIV du véhicule ; le serveur synchronise le Stock #
   et le coûtant vers la ligne du registre à chaque enregistrement.

   Routes serveur utilisées (inchangées) :
     GET  ?ficheVin=VIN         → { trouve, donnees, dateMaj }
     GET  ?evalVin=VIN          → { trouve, donnees, dateMaj }   (évaluation du NIV — Outils › Évaluation)
     GET  ?checkStatutVin=VIN   → { statut, vin, modele, compagnie, stock, feuille|source }
     POST { action: 'add', sheet, vin, modele, compagnie }   (VIN absent des registres)
     POST { action: 'saveFiche', vin, data }                 → { dateMaj }
   Externes (depuis le navigateur, comme avant) :
     NHTSA vPIC (marque / modèle / année), Banque du Canada (taux USD→CAD × 0,98).

   Les ids de champs (f-*, c-*) sont imposés par le backend : les clés des
   données enregistrées sont exactement ces ids, plus `_coutantTotal`.

   Lien avec l'évaluation (Maxime, 6 oct.) : « on doit pouvoir transférer une
   évaluation en fiche d'achat pour après l'envoyer dans l'inventaire ; et si
   on remplit une fiche d'achat et que le NIV existe dans l'évaluation, le
   système doit le dire et demander d'importer. »
   → Dès qu'un NIV complet est connu (chargé, tapé ou reçu de l'évaluation),
     la fiche interroge ?evalVin= ; si une évaluation existe, une bannière le
     dit (véhicule, km, prix payé / vente, évaluée quand et par qui) avec
     « Importer dans la fiche » (remplit seulement les cases vides) et « Voir
     l'évaluation ». Arrivée depuis l'évaluation (#/achat?vin=…&source=evaluation),
     l'import se fait tout seul pour une nouvelle fiche.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, esc = AMX.esc, I = AMX.icones;

  var URL_NHTSA = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/';
  var URL_TAUX = 'https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1';
  var ACHETEURS = ['Marc-André', 'Tristan', 'Fred', 'Mathieu', 'Julien', 'Max F', 'HOUSE'];
  // Champs additionnés dans le coûtant (la classe .cout de l'ancienne page).
  var CHAMPS_COUT = ['f-fraisencan', 'f-fraisautres', 'f-fraistransport', 'f-carfax', 'f-prixachat',
    'f-accessoires', 'f-carrosserie', 'f-service', 'f-lavage', 'f-lavagelivraison', 'f-enregistrementcout',
    'f-adj1montant', 'f-adj2montant', 'f-presafetymontant'];
  // Champs calculés : toujours en lecture seule, jamais touchés par le verrouillage.
  var CALCULES = ['f-ecartmmr', 'f-ecartmmrpct', 'f-prixfinalpayer', 'f-prixventelivraison', 'f-ecartventeinitial'];
  var TITRES_VENTE = { CAN: 'Wholesale', DETAIL: 'Vente Detail', US: 'Vente USA' };
  var TITRE_VENTE_DEFAUT = 'Wholesale / Vente Detail / Vente USA';

  /* ------------------------------ Helpers ------------------------------ */
  function el(id) { return document.getElementById(id); }
  function num(id) { var e = el(id); var v = e ? parseFloat(e.value) : NaN; return isNaN(v) ? 0 : v; }
  function coche(id) { var e = el(id); return !!(e && e.checked); }
  function decocher(id) { var e = el(id); if (e) e.checked = false; }
  function valeur(id) { var e = el(id); return e ? String(e.value || '') : ''; }
  function val(id, v) { var e = el(id); if (e) e.value = (v === null || v === undefined) ? '' : v; }
  function fmt2(n) { return AMX.fmtArgent(n, 2); }
  function signe(n) { return (n >= 0 ? '+' : '') + fmt2(n); }
  function fin6(vin) { var v = String(vin || '').trim(); return v.length >= 6 ? v.slice(-6) : v; }

  function injecterCss() {
    if (document.getElementById('css-achat')) return;
    var s = document.createElement('style');
    s.id = 'css-achat';
    s.textContent = [
      '.achat-page .carte, .achat-page .resume-sombre, .achat-page .achat-verrou, .achat-page .achat-eval { margin-bottom: 14px; }',
      '.achat-page .achat-pile { display: flex; flex-direction: column; gap: 12px; }',
      '.achat-page textarea.achat-dommages { color: var(--rouge); font-weight: 600; border-color: var(--rouge-bg); background: var(--rouge-bg); }',
      '.achat-page textarea.achat-dommages::placeholder { color: var(--encre-4); font-weight: 400; }',
      '.achat-page .achat-dommages-liste { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }',
      '.achat-page .achat-dommages-liste:empty { display: none; }',
      '.achat-page .achat-dommages-liste li { background: var(--rouge-bg); color: var(--rouge); border: 1px solid var(--rouge-bord); border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 600; }',
      '.achat-page .achat-dommages-liste li.achat-dommages-titre { background: var(--rouge); color: #fff; border-color: var(--rouge); }',
      '.achat-page a.btn.desactive { opacity: .45; pointer-events: none; }',
      '.achat-page .carte-entete-ligne { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; width: 100%; }',
      '.achat-page .achat-lookup { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }',
      '.achat-page .achat-lookup .champ { flex: 1 1 240px; }',
      '.achat-page .achat-lookup .btn { height: 34px; }',
      '.achat-page .achat-contexte { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--ligne); font-size: 12.5px; color: var(--encre-2); }',
      '.achat-page .achat-contexte .modele { font-weight: 600; color: var(--encre); }',
      '.achat-page .achat-cases { display: flex; flex-wrap: wrap; gap: 4px 18px; }',
      '.achat-page .grille > .case { align-self: end; min-height: 34px; }',
      '.achat-page .achat-sous { border-top: 1px dashed var(--ligne); margin-top: 14px; padding-top: 12px; }',
      '.achat-page .achat-avec-btn { display: flex; gap: 6px; }',
      '.achat-page .achat-avec-btn input { flex: 1; }',
      '.achat-page .achat-avec-btn .btn { height: 34px; flex: none; }',
      '.achat-page .achat-calc input[readonly] { background: var(--carte-2); color: var(--encre); font-weight: 600; font-variant-numeric: tabular-nums; }',
      '.achat-page .achat-total { display: flex; justify-content: flex-end; align-items: baseline; gap: 10px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--ligne); }',
      '.achat-page .achat-total .l { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); }',
      '.achat-page .achat-total b { font-size: 18px; font-variant-numeric: tabular-nums; }',
      '.achat-page .achat-verrou { align-items: center; flex-wrap: wrap; }',
      '.achat-page .achat-eval { align-items: center; flex-wrap: wrap; gap: 10px; }',
      '.achat-page .achat-eval .texte b { display: block; margin-bottom: 2px; }',
      '.achat-page .achat-eval .actions-ligne { display: flex; gap: 6px; flex-wrap: wrap; }',
      '.achat-page .achat-verrou .texte { flex: 1 1 260px; }',
      '.achat-page .achat-verrou .texte b { display: block; margin-bottom: 2px; }',
      '.achat-page .achat-verrou.ferme { background: var(--prune-bg); border-color: var(--prune-bord); color: var(--prune); }',
      '.achat-page .achat-verrou.ferme .btn { color: var(--prune); border-color: var(--prune-bord); background: #fff; }',
      // Dossier comptabilisé : la fiche reste parfaitement lisible et copiable.
      '.achat-page.achat-verrouille .champ input[readonly], .achat-page.achat-verrouille .champ select:disabled { color: var(--encre); -webkit-text-fill-color: var(--encre); opacity: 1; background: var(--carte-2); cursor: text; }',
      '.achat-page.achat-verrouille .case input:disabled { opacity: .85; }',
      '.achat-page .achat-print-only { display: none; }',
      '.achat-page .achat-note { margin: 0 0 20px; }',
      // Impression : la fiche tient sur une page lettre.
      '@media print {',
      '  @page { size: letter; margin: 0.3in; }',
      '  .achat-page { font-size: 9px; }',
      '  .achat-page .noprint, .achat-page .achat-total, .achat-page .achat-note { display: none !important; }',
      '  .achat-page .achat-print-only { display: block; }',
      '  .achat-page img.achat-print-only { height: 20px; width: auto; margin-bottom: 3px; }',
      '  .achat-page .entete-page { margin-bottom: 5px; align-items: flex-end; }',
      '  .achat-page .entete-page h1 { font-size: 13px; }',
      '  .achat-page .entete-page p { font-size: 8px; margin: 1px 0 0; }',
      '  .achat-page .resume-sombre { background: #fff !important; color: #000; border: 1px solid #bbb; border-radius: 5px; padding: 4px 10px; gap: 8px; grid-template-columns: repeat(3, 1fr); margin-bottom: 5px; }',
      '  .achat-page .resume-sombre .l { color: #555; font-size: 7px; }',
      '  .achat-page .resume-sombre .v { font-size: 12px; margin-top: 0; }',
      '  .achat-page .resume-sombre .v.pos { color: #0B5E2E; }',
      '  .achat-page .resume-sombre .v.neg { color: #912018; }',
      '  .achat-page .carte { margin-bottom: 5px; border-radius: 5px; border-color: #bbb; box-shadow: none; break-inside: avoid; }',
      '  .achat-page .carte .carte-entete { padding: 3px 8px; }',
      '  .achat-page .carte .carte-entete h2 { font-size: 8.5px; text-transform: uppercase; letter-spacing: .06em; }',
      '  .achat-page .carte .carte-corps { padding: 5px 8px; }',
      '  .achat-page .achat-pile { gap: 3px; }',
      '  .achat-page .grille { gap: 2px 8px; }',
      '  .achat-page .grille.c2, .achat-page .grille.c3, .achat-page .grille.c4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }',
      '  .achat-page .champ { gap: 0; }',
      '  .achat-page .champ > label { font-size: 7px; letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '  .achat-page .champ input, .achat-page .champ select { height: 17px; font-size: 9px; padding: 0 4px; border-radius: 3px; border-color: #ccc; background: #fff !important; color: #000 !important; -webkit-text-fill-color: #000; box-shadow: none; }',
      '  .achat-page .champ select { appearance: none; -webkit-appearance: none; }',
      '  .achat-page .achat-avec-btn { display: block; }',
      '  .achat-page .case { font-size: 8.5px; padding: 0; gap: 4px; min-height: 0; }',
      '  .achat-page .grille > .case { min-height: 17px; }',
      '  .achat-page .case input { width: 10px; height: 10px; }',
      '  .achat-page .achat-cases { gap: 2px 10px; }',
      '  .achat-page .section-titre { font-size: 7.5px; margin: 0 0 3px; }',
      '  .achat-page .achat-sous { margin-top: 4px; padding-top: 4px; }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // Signet « Automax ← eBlock » (source : mock/signet-eblock.src.js, embarqué
  // par mock/signet-build.py) : depuis la page d'un véhicule sur eBlock, lit le
  // NIV et les dommages du rapport d'état et ouvre la fiche pré-remplie.
  var CODE_SIGNET_EBLOCK = "javascript:(function () { function texte(e) { return (e && (e.innerText || e.textContent) || '').trim(); } function itemReact() { var depart = [].slice.call(document.querySelectorAll('button[data-testid=\"carfax-ca-button\"], h3, h2, h1, button')).slice(0, 80); for (var d = 0; d < depart.length; d++) { var el = depart[d]; var cle = Object.keys(el).filter(function (k) { return k.indexOf('__reactFiber') === 0; })[0]; var f = cle ? el[cle] : null; for (var i = 0; i < 40 && f; i++, f = f.return) { var p = f.memoizedProps; if (!p || typeof p !== 'object') continue; var it = (p.auctionItem && p.auctionItem.inventoryItem) || (p.auctionItemDetails && p.auctionItemDetails.inventoryItem) || p.inventoryItemDetails || p.inventoryItem; if (it && typeof it === 'object' && typeof it.vin === 'string' && it.vin.length === 17) return it; } } return null; } function compter(liste) { var comptes = {}, ordre = []; (liste || []).forEach(function (s) { s = String(s || '').trim(); if (!s) return; if (!comptes[s]) { comptes[s] = 0; ordre.push(s); } comptes[s]++; }); return ordre.map(function (s) { return comptes[s] > 1 ? s + ' \u00d7' + comptes[s] : s; }); } function depuisReact(it) { var cr = it.conditionReport || {}; var carfax = (cr.carfaxCanadaReportStatus === 'VALID' || !cr.carfaxCanadaReportStatus) && /^https:\\/\\/vhr\\.carfax\\.ca\\//.test(cr.carfaxCanadaReportUrl || '') ? cr.carfaxCanadaReportUrl : ''; var km = String((it.mileage && it.mileage.formattedAmount) || it.mileage || '').replace(/[^0-9]/g, ''); return { vin: it.vin.toUpperCase(), dommages: compter((it.damagePhotos || []).map(function (x) { return x && x.location; })), carfax: carfax, marque: it.make || '', modele: [it.model, it.trim].filter(Boolean).join(' '), annee: it.year ? String(it.year) : '', couleur: it.exteriorColor || '', km: km }; } function vinDom() { var libs = [].slice.call(document.querySelectorAll('*')).filter(function (e) { return e.children.length === 0 && /^(VIN|NIV)$/i.test(texte(e)); }); for (var k = 0; k < libs.length; k++) { var s = libs[k].nextElementSibling; if (s && /^[A-HJ-NPR-Z0-9]{17}$/.test(texte(s).toUpperCase())) return texte(s).toUpperCase(); var p = libs[k].parentElement; for (var i = 0; i < 3 && p; i++, p = p.parentElement) { var m = (p.innerText || '').match(/\\b[A-HJ-NPR-Z0-9]{17}\\b/); if (m) return m[0]; } } var tous = (document.body.innerText || '').match(/\\b[A-HJ-NPR-Z0-9]{17}\\b/g) || []; return tous.length ? tous[0] : ''; } function panneau() { var h3 = [].slice.call(document.querySelectorAll('h3')).filter(function (e) { return /^(Damage Photos|Photos? des dommages)$/i.test(texte(e)); })[0]; if (!h3) return null; var c = h3; for (var i = 0; i < 8 && c.parentElement; i++) { c = c.parentElement; if (c.querySelectorAll('img').length >= 1) break; } return c; } function dommagesDom() { var c = panneau(); if (!c) return null; return compter((c.innerText || '').split('\\n').filter(function (s) { return s.trim() && !/^(Damage Photos|Photos? des dommages)$/i.test(s.trim()); })); } function partir(o) { var q = '#/achat?vin=' + encodeURIComponent(o.vin) + '&source=eblock'; ['dommages', 'carfax', 'marque', 'modele', 'annee', 'couleur', 'km'].forEach(function (k) { var v = Array.isArray(o[k]) ? o[k].join('\\n') : (o[k] || ''); if (v) q += '&' + k + '=' + encodeURIComponent(v); }); location.href = " + JSON.stringify(AMX.SITE) + " + q; } var it = itemReact(); if (it) { partir(depuisReact(it)); return; } var v = vinDom(); if (!v) { alert('Aucun NIV trouv\u00e9 sur cette page. Ouvrez la page du v\u00e9hicule sur eBlock, puis cliquez de nouveau.'); return; } var d = dommagesDom(); if (d) { partir({ vin: v, dommages: d }); return; } var b = [].slice.call(document.querySelectorAll('button')).filter(function (x) { return /Damage Photos|dommages/i.test(texte(x)); })[0]; if (!b) { partir({ vin: v }); return; } b.click(); var essais = 0; (function attendre() { essais++; var dd = dommagesDom(); if (dd && dd.length) { partir({ vin: v, dommages: dd }); return; } if (essais > 40) { partir({ vin: v }); return; } setTimeout(attendre, 200); })(); })();";

  /* --------------------------- Constructeurs ---------------------------- */
  // Un champ `.champ` : label + input. opts = { type, step, placeholder, mono, readonly, inputmode, apres (bouton à droite) }
  function champ(id, libelle, opts) {
    opts = opts || {};
    var attrs = { type: opts.type || 'text', id: id, step: opts.step, placeholder: opts.placeholder, autocomplete: 'off' };
    if (opts.type === 'number') attrs.inputmode = opts.inputmode || 'decimal';
    if (opts.readonly) { attrs.readonly = true; attrs.tabindex = '-1'; }
    if (opts.vin) { attrs.spellcheck = 'false'; attrs.autocapitalize = 'characters'; }
    var inp = h('input' + (opts.mono ? '.mono' : ''), attrs);
    return h('div.champ' + (opts.readonly ? '.achat-calc' : ''), [
      h('label', { 'for': id, text: libelle }),
      opts.apres ? h('div.achat-avec-btn', [inp, opts.apres]) : inp
    ]);
  }
  function cout(id, libelle, opts) { return champ(id, libelle, Object.assign({ type: 'number', step: '0.01' }, opts || {})); }
  function date(id, libelle) { return champ(id, libelle, { type: 'date' }); }
  function selection(id, libelle, options) {
    var sel = h('select', { id: id }, [h('option', { value: '', text: 'Choisir…' })].concat(options.map(function (o) { return h('option', { value: o[0], text: o[1] }); })));
    return h('div.champ', [h('label', { 'for': id, text: libelle }), sel]);
  }
  function caseA(id, libelle) { return h('label.case', [h('input', { type: 'checkbox', id: id }), h('span', { text: libelle })]); }
  function carte(titre, enfants) {
    var h2 = typeof titre === 'string' ? h('h2', { text: titre }) : titre;
    return h('div.carte', [h('div.carte-entete', [h2]), h('div.carte-corps', enfants)]);
  }

  /* ------------------------------ Section ------------------------------ */
  AMX.section('achat', {
    titre: 'Fiche d\'achat', icone: 'achat', ordre: 30,
    visible: function () { return AMX.perm('ficheAchat'); },
    monter: function (conteneur, ctx) { return new Fiche(conteneur, ctx); }
  });

  function Fiche(conteneur, ctx) {
    var self = this;
    injecterCss();
    this.conteneur = conteneur;
    this.vinCharge = '';        // dernier NIV passé à charger() (route ou bouton)
    this.vinCourant = '';       // NIV que la fiche représente (chargé ou tapé)
    this.vinVerifie = '';       // dernier NIV vérifié auprès du registre
    this.nouvelle = true;       // aucune fiche serveur pour le NIV courant
    this.verrouillee = false;
    this.coutant = 0;
    this.contexte = null;       // véhicule tel que renvoyé par checkStatutVin
    this.contexteVerifie = false;
    this.decode = null;         // { vin, make, model, year } (NHTSA)
    this.evaluation = null;     // { vin, donnees, dateMaj } — évaluation existante pour le NIV courant
    this.evalVerifiee = '';     // dernier NIV interrogé auprès des évaluations
    this.source = '';           // d'où on arrive (eblock, evaluation)
    this.generation = 0;

    this.construire();
    this.recalculer();
    this.basculerExport();
    this.rendreEblock();

    this.surInventaire = function () { self.rendreContexte(); };
    document.addEventListener('amx:inventaire', this.surInventaire);
    document.addEventListener('amx:carfax', this.surInventaire);
    if (AMX.carfax) AMX.carfax.charger().catch(function () {});
    this.surImpression = function () {
      self.elDateImpression.textContent = 'Groupe Automax · fiche imprimée le ' + AMX.fmtDate(new Date().toISOString(), true) + (self.vinCourant ? ' · NIV ' + self.vinCourant : '');
    };
    window.addEventListener('beforeprint', this.surImpression);

    this.prerempli = null;
    var vin = this.lireParams(ctx);
    if (vin) { this.elLookup.value = vin; this.charger(vin); }
  }

  // Paramètres de l'adresse : vin, et ce que le signet eBlock apporte
  // (dommages, eblock) — gardé pour après le chargement de la fiche.
  Fiche.prototype.lireParams = function (ctx) {
    var p = (ctx && ctx.params) || {};
    var cles = ['dommages', 'eblock', 'carfax', 'marque', 'modele', 'annee', 'couleur', 'km'];
    if (cles.some(function (k) { return p[k]; })) {
      var pre = {}; cles.forEach(function (k) { pre[k] = String(p[k] || ''); });
      this.prerempli = pre;
    }
    this.source = String(p.source || '');
    return p.vin ? String(p.vin).trim() : '';
  };

  Fiche.prototype.demonter = function () {
    document.removeEventListener('amx:inventaire', this.surInventaire);
    document.removeEventListener('amx:carfax', this.surInventaire);
    window.removeEventListener('beforeprint', this.surImpression);
    this.generation++;
  };

  // Même section, params modifiés (#/achat?vin=…) : on charge le nouveau NIV.
  Fiche.prototype.naviguer = function (ctx) {
    var vin = this.lireParams(ctx);
    if (vin && vin !== this.vinCharge) { this.elLookup.value = vin; this.charger(vin); }
    else if (this.prerempli && vin && vin === this.vinCourant) this.appliquerPrerempli();
  };

  Fiche.prototype.etat = function (texte) { this.elEtat.textContent = texte; };

  /* --------------------------- Construction ---------------------------- */
  Fiche.prototype.construire = function () {
    var self = this;
    AMX.vider(this.conteneur);

    // En-tête
    this.elEtat = h('p', { text: 'Entrez un NIV pour charger une fiche existante ou en créer une nouvelle.' });
    this.elDateImpression = h('div.achat-print-only.doux.petit');
    this.btnEnregistrer = h('button.btn.primaire', { type: 'button', html: I.ok + '<span>Enregistrer</span>', onclick: function () { self.enregistrer(); } });
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [
        h('img.achat-print-only', { src: 'assets/logo.png', alt: 'Groupe Automax' }),
        h('h1', 'Fiche d\'achat'),
        this.elEtat,
        this.elDateImpression
      ]),
      h('div.actions.noprint', [
        h('button.btn', { type: 'button', html: I.imprimer + '<span>Imprimer</span>', onclick: function () { window.print(); } }),
        h('button.btn', { type: 'button', html: I.rafraichir + '<span>Réinitialiser</span>', onclick: function () { self.reinitialiser(); } }),
        this.btnEnregistrer
      ])
    ]);

    // Lien avec le registre (par NIV)
    this.elLookup = h('input.mono', { type: 'text', id: 'vin-lookup', placeholder: 'Collez ou tapez le NIV complet', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters' });
    this.elLookup.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); self.chargerDepuisChamp(); } });
    this.btnCharger = h('button.btn', { type: 'button', id: 'charger-btn', html: I.recherche + '<span>Charger</span>', onclick: function () { self.chargerDepuisChamp(); } });
    this.elContexte = h('div.achat-contexte.cache');
    var lookup = h('div.carte.noprint', [h('div.carte-corps', [
      h('div.achat-lookup', [h('div.champ', [h('label', { 'for': 'vin-lookup', text: 'Lien avec le registre — NIV à charger' }), this.elLookup]), this.btnCharger]),
      this.elContexte
    ])]);

    // Bannière « une évaluation existe pour ce NIV » (importer / voir)
    this.elEval = h('div.alerte-bloc.info.achat-eval.noprint.cache');

    // Bannière de verrouillage (dossier comptabilisé)
    this.elVerrou = h('div.alerte-bloc.achat-verrou.noprint.cache');

    // Résumé
    this.elSCoutant = h('div.v#s-coutant.num', '0,00 $');
    this.elSPrixVente = h('div.v#s-prixvente.num', '0,00 $');
    this.elSProfit = h('div.v.pos#s-profit.num', '0,00 $');
    var resume = h('div.resume-sombre', [
      h('div', [h('div.l', 'Coûtant total'), this.elSCoutant]),
      h('div', [h('div.l', 'Prix de vente retenu'), this.elSPrixVente]),
      h('div', [h('div.l', 'Profit estimé'), this.elSProfit])
    ]);

    // Identification
    var identification = carte('Identification du véhicule', [
      h('div.grille.c4', [
        date('f-date', 'Date'),
        champ('f-stock', 'Stock #', { mono: true }),
        selection('f-compagnie', 'Compagnie', [['HAWKS', 'HAWKS'], ['STM', 'STM'], ['BMW', 'BMW']]),
        selection('f-destination', 'Destination inventaire', [['DETAIL', 'Detail'], ['US', 'É.-U.'], ['CAN', 'Canada']]),
        champ('f-niv', 'NIV', { mono: true, vin: true, placeholder: 'Numéro d\'identification' }),
        champ('f-marque', 'Marque'),
        champ('f-modele', 'Modèle'),
        champ('f-annee', 'Année', { type: 'number', inputmode: 'numeric' }),
        champ('f-couleur', 'Couleur'),
        champ('f-km', 'KM', { type: 'number', inputmode: 'numeric' }),
        champ('f-fournisseur', 'Fournisseur'),
        champ('f-vendeur', 'Vendeur'),
        champ('f-villeprovenance', 'Ville de provenance'),
        selection('f-acheteur', 'Acheteur (interne)', ACHETEURS.map(function (a) { return [a, a]; }))
      ])
    ]);

    // Provenance eBlock : le lien de partage du véhicule (toujours valable
    // pour l'équipe connectée à eBlock) et les dommages que son rapport d'état
    // répertorie, en rouge comme sur eBlock.
    this.btnEblock = h('a.btn.noprint#eblock-btn', { href: '#', target: '_blank', rel: 'noopener', title: 'Ouvrir le véhicule sur eBlock', html: I.externe + '<span>Ouvrir</span>' });
    this.elDommagesListe = h('ul.achat-dommages-liste');
    var signetEblock = h('a.btn.petit.noprint', { href: CODE_SIGNET_EBLOCK, text: 'Automax ← eBlock', title: 'Glissez ce bouton dans votre barre de favoris, puis cliquez-le depuis la page du véhicule sur eBlock : le NIV et les dommages arrivent ici tout seuls.', draggable: 'true' });
    signetEblock.addEventListener('click', function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B pour l\'afficher), puis cliquez-le depuis la page du véhicule sur eBlock.', 'attention', 7000); });
    var provenance = carte(h('div.carte-entete-ligne', [h('h2', { html: 'Rapport d\'état eBlock <span class="doux petit" style="font-weight:400">— lien de partage et dommages répertoriés</span>' }), signetEblock]), [
      h('div.grille.c2', [
        champ('f-eblock', 'Lien eBlock (graph.eblock.com/share/…)', { placeholder: 'Collez le lien « Partager » du véhicule', apres: this.btnEblock }),
        h('div.champ', [h('label', { 'for': 'f-dommages', text: 'Dommages répertoriés — un par ligne' }),
          h('textarea#f-dommages.achat-dommages', { rows: '4', placeholder: 'Hood\nFront Bumper\nTires / Rims…' })])
      ]),
      this.elDommagesListe
    ]);

    // Coûts (inclut Frais et ajustements)
    this.elCoutantInline = h('b#s-coutant-inline.num', '0,00 $');
    var couts = carte('Coûts', [
      h('div.achat-pile', [
        h('div.grille.c4', [cout('f-prixachat', 'Prix d\'achat ($)'), cout('f-accessoires', 'Accessoires ($)'), cout('f-carrosserie', 'Carrosserie ($)')]),
        h('div.grille.c4', [cout('f-service', 'Service / Pré-safety ($)'), cout('f-lavage', 'Safety ($)'), cout('f-lavagelivraison', 'Lavage livraison ($)'), cout('f-enregistrementcout', 'Enregistrement ($)')]),
        h('div.grille.c4', [cout('f-prixencan', 'Prix encan ($)'), cout('f-adj1montant', 'Ajustement 1 ($)'), cout('f-adj2montant', 'Ajustement 2 ($)')])
      ]),
      h('div.achat-sous', [
        h('div.section-titre', 'Frais et ajustements'),
        h('div.achat-pile', [
          h('div.grille.c4', [
            cout('f-fraisencan', 'Frais encan ($)'), cout('f-fraisautres', 'Frais autres ou crédit ($)'), cout('f-fraistransport', 'Frais transport ($)'),
            cout('f-carfax', 'Carfax ($)', { apres: h('a.btn.noprint#carfax-btn', { href: 'https://vhr.carfax.ca/fr/', target: '_blank', rel: 'noopener', title: 'Ouvrir Carfax', html: I.externe + '<span>Carfax</span>' }) })
          ]),
          h('div.grille.c4', [date('f-miseligne', 'Mise en ligne — date'), date('f-adj1date', 'Ajustement 1 — date'), date('f-adj2date', 'Ajustement 2 — date'), champ('f-transporteur', 'Nom du transporteur')])
        ])
      ]),
      h('div.achat-total', [h('span.l', 'Total cumulé des coûts'), this.elCoutantInline])
    ]);

    // Statut du dossier
    var statut = carte('Statut du dossier', [
      h('div.achat-cases', [
        caseA('c-arrive', 'Arrivé'), caseA('c-transfere', 'Transféré'), caseA('c-googleachat', 'Google achat'), caseA('c-googleusa', 'Google USA'),
        caseA('c-financer', 'Financer'), caseA('c-scanstm', 'SCAN STM'), caseA('c-attentereg', 'En attente de REG'),
        caseA('c-demandepaiement', 'Demande de paiement'), caseA('c-vehiculepaye', 'Véhicule payé')
      ]),
      h('div.grille.c4', { style: { marginTop: '14px' } }, [selection('f-lienvehicule', 'Lien sur véhicule', [['oui', 'Oui'], ['non', 'Non']])])
    ]);

    // Wholesale / Vente Detail / Vente USA (selon la destination)
    this.elTitreVente = h('h2#wholesale-section-title', { text: TITRE_VENTE_DEFAUT });
    this.btnTaux = h('button.btn.noprint#taux-auto-btn', { type: 'button', title: 'Taux Banque du Canada du jour, moins 2 %', text: 'Taux auto (−2 %)', onclick: function () { self.obtenirTaux(); } });
    this.rangWholesale = h('div.grille.c3#wholesale-row', [champ('f-wsacheteur', 'Wholesale — acheteur'), cout('f-wsprix', 'Wholesale — prix ($)'), date('f-wsdate', 'Wholesale — date de livraison')]);
    this.rangPadCanada = h('div.achat-cases#pad-canada-row', [caseA('c-pad212', 'PAD Canada (212 $)'), caseA('c-pad499-canada', 'PAD Détail (499 $)')]);
    this.rangDetail = h('div.grille.c4#detail-vente-row', [cout('f-prixdetail', 'Prix détail ($)'), caseA('c-pad499', 'PAD Détail (499 $)'), caseA('c-presafety', 'Pré-safety'), cout('f-presafetymontant', 'Montant pré-safety ($)')]);
    this.rangSafety = h('div.achat-cases#safety-row', [caseA('c-safetycpo', 'Safety + CPO')]);
    this.rangPadUsa = h('div.achat-cases#pad-usa-row', [caseA('c-pad350', 'PAD USA (350 $)')]);
    var rangCommun = h('div.grille.c4', [caseA('c-pad50', 'PAD Échange (50 $)'), cout('f-commissionacheteur', 'Commission acheteur ($) — hors coûtant'), cout('f-commissionvendeur', 'Commission vendeur ($) — hors coûtant')]);
    this.sousExport = h('div.achat-sous#export-subsection', [
      h('div.section-titre', 'Export'),
      h('div.achat-pile', [
        h('div.grille.c4', [cout('f-mmrinitial', 'MMR initial ($)'), date('f-mmrinitialdate', 'MMR initial — date'), cout('f-mmrlivraison', 'MMR livraison ($)'), date('f-mmrlivraisondate', 'MMR livraison — date')]),
        h('div.grille.c4', [
          champ('f-ecartmmr', 'Écart MMR (livraison − initial)', { readonly: true }),
          champ('f-ecartmmrpct', 'Écart MMR (%)', { readonly: true }),
          champ('f-taux', 'Taux USD→CAD (taux − 2 %)', { type: 'number', step: '0.0001', placeholder: 'ex. 1,3200', apres: this.btnTaux }),
          cout('f-defense', 'Dépense ($) — nette dans le prix de vente')
        ]),
        h('div.grille.c3', [
          champ('f-prixfinalpayer', 'Prix de vente estimé — MMR initial', { readonly: true }),
          champ('f-prixventelivraison', 'Prix de vente estimé — MMR livraison', { readonly: true }),
          champ('f-ecartventeinitial', 'Écart des deux prix (livraison − initial)', { readonly: true })
        ])
      ])
    ]);
    var vente = carte(this.elTitreVente, [
      h('div.achat-pile', [
        h('div.grille.c4', [cout('f-coutestime', 'Prix de détail ($)'), champ('f-autorisepar', 'Autorisé par')]),
        this.rangWholesale, this.rangPadCanada, this.rangDetail, this.rangSafety, this.rangPadUsa, rangCommun
      ]),
      this.sousExport
    ]);

    // Livraison
    var livraison = carte('Livraison', [
      h('div.grille.c4', [date('f-appele', 'Appelé — date'), champ('f-livraisona', 'Livraison à'), date('f-datearrivee', 'Date d\'arrivée'), date('f-demandepaiementdate', 'Demande de paiement — date')])
    ]);

    this.elFiche = h('div.achat-fiche', [identification, provenance, couts, statut, vente, livraison]);
    var note = h('p.doux.petit.noprint.achat-note', 'Le coûtant total additionne tous les champs de coûts et les PAD cochés. Le prix de vente retenu dépend de la destination : prix de vente estimé (É.-U.), wholesale (Canada) ou prix détail (Detail).');

    this.elPage = h('div.page.etroite.achat-page', [entete, lookup, this.elEval, this.elVerrou, resume, this.elFiche, note]);
    this.conteneur.appendChild(this.elPage);

    // Liaisons : tout changement recalcule ; la destination bascule les blocs.
    this.elFiche.addEventListener('input', function (e) { self.recalculer(); if (e.target && (e.target.id === 'f-eblock' || e.target.id === 'f-dommages')) self.rendreEblock(); });
    this.elFiche.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'f-destination') self.basculerExport(); else self.recalculer();
    });
    var niv = el('f-niv');
    niv.addEventListener('blur', function () {
      var vin = niv.value.trim();
      if (vin.length >= 6) {
        self.elLookup.value = vin;
        if (vin !== self.vinCourant) { self.vinCourant = vin; self.contexte = null; self.contexteVerifie = false; self.decode = null; self.rendreContexte(); }
        if (vin !== self.vinVerifie) self.verifierVerrouillage(vin, false);
      }
      if (vin.length >= 11 && !(self.decode && self.decode.vin === vin)) self.decoderVin(vin);
      // NIV complet tapé à la main : y a-t-il une évaluation ? On le dit.
      if (vin.length === 17 && vin.toUpperCase() !== self.evalVerifiee) self.verifierEvaluation(vin, false);
    });
  };

  /* --------------------- Lien avec l'évaluation ------------------------- */
  // Correspondance évaluation → fiche (seulement les cases vides sont remplies).
  var EVAL_VERS_FICHE = [
    ['marque', 'f-marque'], ['modele', 'f-modele'], ['annee', 'f-annee'], ['km', 'f-km'],
    ['prixAchat', 'f-prixachat'],      // prix d'achat (enchère / vendeur)
    ['frais', 'f-fraisautres'],        // frais estimés à l'évaluation → « Frais autres » (à ventiler au besoin)
    ['recon', 'f-service'],            // reconditionnement estimé → « Service / Pré-safety »
    ['prixVente', 'f-prixdetail'],     // prix de vente visé → prix détail
    ['prixVente', 'f-coutestime']      // … et « Prix de détail » du bloc vente
  ];
  function resumeEvaluation(d) {
    d = d || {};
    var veh = [d.annee, d.marque, d.modele, d.version].filter(Boolean).join(' ');
    var bouts = [];
    if (veh) bouts.push(veh);
    if (d.km) bouts.push(AMX.fmtNombre(parseInt(String(d.km).replace(/[^0-9]/g, ''), 10) || 0) + ' km');
    if (d.prixPaye || d.prixAchat) bouts.push('payé ' + AMX.fmtArgent(parseFloat(d.prixPaye || d.prixAchat) || 0, 0));
    if (d.prixVente) bouts.push('vente visée ' + AMX.fmtArgent(parseFloat(d.prixVente) || 0, 0));
    if (d.marche && d.marche.standard) bouts.push('marché ' + AMX.fmtArgent(d.marche.standard, 0));
    return bouts.join(' · ');
  }

  // Interroge les évaluations pour ce NIV ; `importer` = remplir tout de suite (arrivée depuis l'évaluation).
  Fiche.prototype.verifierEvaluation = function (vin, importer) {
    var self = this;
    vin = String(vin || '').trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) { this.evaluation = null; this.rendreEvaluation(); return Promise.resolve(); }
    this.evalVerifiee = vin;
    return AMX.get('evalVin=' + encodeURIComponent(vin)).then(function (d) {
      if (String(self.vinCourant || '').toUpperCase() !== vin) return;
      self.evaluation = (d && d.trouve) ? { vin: vin, donnees: d.donnees || {}, dateMaj: d.dateMaj || '' } : null;
      if (self.evaluation && importer) self.importerEvaluation(true);
      self.rendreEvaluation();
    }).catch(function () { self.evalVerifiee = ''; });
  };

  Fiche.prototype.rendreEvaluation = function () {
    var self = this, ev = this.evaluation;
    AMX.vider(this.elEval);
    if (!ev || this.verrouillee) { this.elEval.classList.add('cache'); return; }
    var d = ev.donnees || {};
    var qui = d._enregistrePar || d._par || '';
    var quand = ev.dateMaj || d._le || '';
    var manquants = EVAL_VERS_FICHE.filter(function (m) { var v = d[m[0]]; var e = el(m[1]); return v !== undefined && v !== null && String(v).trim() !== '' && e && !String(e.value || '').trim(); }).length;
    this.elEval.classList.remove('cache');
    this.elEval.appendChild(h('span', { html: I.info }));
    this.elEval.appendChild(h('div.texte', { style: { flex: '1 1 260px' } }, [
      h('b', { text: 'Une évaluation existe pour ce NIV' + (ev.importee ? ' — importée dans la fiche' : '') }),
      h('span', { text: resumeEvaluation(d) + (quand ? ' · évaluée le ' + AMX.fmtDate(quand, true) : '') + (qui ? ' par ' + String(qui).split('@')[0] : '') + (ev.importee ? '.' : (manquants ? '. ' + manquants + ' case(s) de la fiche peuvent être remplies à partir d\'elle.' : '. Toutes les cases correspondantes sont déjà remplies.')) })
    ]));
    var actions = h('div.actions-ligne');
    if (!ev.importee && manquants) actions.appendChild(h('button.btn.primaire.petit', { type: 'button', html: I.ok + '<span>Importer dans la fiche</span>', onclick: function () { self.importerEvaluation(false); } }));
    actions.appendChild(h('a.btn.petit', { href: AMX.lien('outils', 'evaluation', { vin: ev.vin }), text: 'Voir l\'évaluation' }));
    this.elEval.appendChild(actions);
  };

  // Remplit les cases vides de la fiche avec l'évaluation ; propose compagnie et destination Detail.
  Fiche.prototype.importerEvaluation = function (silencieux) {
    var ev = this.evaluation; if (!ev) return;
    var d = ev.donnees || {}, n = 0, libelles = [];
    EVAL_VERS_FICHE.forEach(function (m) {
      var v = d[m[0]], e = el(m[1]);
      if (v === undefined || v === null || String(v).trim() === '' || !e || String(e.value || '').trim()) return;
      if (m[1] === 'f-annee' || m[1] === 'f-km') v = String(v).replace(/[^0-9]/g, '');
      else if (/^f-(prixachat|fraisautres|service|prixdetail|coutestime)$/.test(m[1])) { v = String(v).replace(/[^0-9.,-]/g, '').replace(',', '.'); if (!v || isNaN(parseFloat(v))) return; v = String(Math.round(parseFloat(v) * 100) / 100); }
      e.value = v; n++;
      if (m[1] === 'f-fraisautres') libelles.push('frais → « Frais autres »');
      else if (m[1] === 'f-service') libelles.push('recon → « Service / Pré-safety »');
    });
    // Concession de l'évaluation → compagnie ; une évaluation vise le détail.
    var compagnie = '';
    Object.keys(AMX.COMPAGNIE_CONCESSION || {}).forEach(function (c) { if (AMX.COMPAGNIE_CONCESSION[c] === d.concession) compagnie = c; });
    if (compagnie && !valeur('f-compagnie')) { val('f-compagnie', compagnie); n++; }
    if (!valeur('f-destination')) { val('f-destination', 'DETAIL'); n++; }
    if (!valeur('f-date')) val('f-date', new Date().toISOString().slice(0, 10));
    ev.importee = true;
    this.basculerExport();
    this.recalculer();
    this.rendreEvaluation();
    if (!silencieux || n) AMX.toast(n ? 'Évaluation importée : ' + n + ' case(s) remplie(s)' + (libelles.length ? ' (' + libelles.join(', ') + ')' : '') + '. Vérifiez, complétez, puis enregistrez : le véhicule ira à l\'inventaire.' : 'Rien à importer : les cases correspondantes sont déjà remplies.', n ? 'ok' : 'attention', 8000);
  };

  /* ------------------------------ Calculs ------------------------------ */
  Fiche.prototype.recalculer = function () {
    var coutant = 0;
    CHAMPS_COUT.forEach(function (id) { coutant += num(id); });
    // PAD cochés : montants fixes (le PAD Détail compte une seule fois, Detail ou Canada).
    if (coche('c-pad499') || coche('c-pad499-canada')) coutant += 499;
    if (coche('c-pad350')) coutant += 350;
    if (coche('c-pad50')) coutant += 50;
    if (coche('c-pad212')) coutant += 212;
    this.coutant = coutant;

    // MMR et prix de vente estimé (É.-U.) — avant le profit, qui en dépend.
    var mmr = num('f-mmrinitial'), mmrLivraison = num('f-mmrlivraison');
    var ecartMmr = mmrLivraison - mmr;
    val('f-ecartmmr', signe(ecartMmr));
    val('f-ecartmmrpct', mmr !== 0 ? (ecartMmr >= 0 ? '+' : '') + (100 * ecartMmr / mmr).toFixed(1) + ' %' : '—');
    var taux = num('f-taux'), depense = num('f-defense');
    var prixFinalPayer = (mmr * taux) - depense;              // référence principale : MMR initial
    var prixVenteLivraison = (mmrLivraison * taux) - depense; // même taux, même dépense
    val('f-prixfinalpayer', fmt2(prixFinalPayer));
    val('f-prixventelivraison', fmt2(prixVenteLivraison));
    val('f-ecartventeinitial', signe(prixVenteLivraison - prixFinalPayer));

    // Prix de vente retenu et profit — selon la destination choisie.
    var dest = valeur('f-destination');
    var prixDetail = num('f-prixdetail'), prixWholesale = num('f-wsprix');
    var prixVente;
    if (dest === 'US') prixVente = prixFinalPayer;
    else if (dest === 'CAN') prixVente = prixWholesale;
    else if (dest === 'DETAIL') prixVente = prixDetail;
    else prixVente = prixDetail > 0 ? prixDetail : prixWholesale;
    var profit = prixVente - coutant;

    this.elSCoutant.textContent = fmt2(coutant);
    this.elCoutantInline.textContent = fmt2(coutant);
    this.elSPrixVente.textContent = fmt2(prixVente);
    this.elSProfit.textContent = fmt2(profit);
    this.elSProfit.className = 'v num ' + (profit >= 0 ? 'pos' : 'neg');
  };

  // Blocs visibles selon la destination ; les champs des blocs cachés sont vidés (comme avant).
  Fiche.prototype.basculerExport = function () {
    var dest = valeur('f-destination');
    var us = dest === 'US', detail = dest === 'DETAIL', canada = dest === 'CAN';
    this.elTitreVente.textContent = TITRES_VENTE[dest] || TITRE_VENTE_DEFAUT;
    this.sousExport.classList.toggle('cache', canada || detail);
    this.rangPadUsa.classList.toggle('cache', !us);
    this.rangDetail.classList.toggle('cache', !detail);
    this.rangSafety.classList.toggle('cache', !detail);
    this.rangPadCanada.classList.toggle('cache', !canada);
    this.rangWholesale.classList.toggle('cache', !canada);
    if (!us) decocher('c-pad350');
    if (!detail) { decocher('c-pad499'); decocher('c-presafety'); decocher('c-safetycpo'); val('f-presafetymontant', ''); val('f-prixdetail', ''); }
    if (!canada) { decocher('c-pad212'); decocher('c-pad499-canada'); val('f-wsacheteur', ''); val('f-wsprix', ''); val('f-wsdate', ''); }
    this.recalculer();
  };

  /* ------------------------------ Données ------------------------------ */
  // Clés = ids des champs de la fiche (+ _coutantTotal), comme l'ancienne page.
  Fiche.prototype.collecter = function () {
    var data = {};
    this.elFiche.querySelectorAll('input[id], select[id], textarea[id]').forEach(function (e) {
      if (e.type === 'radio') return;
      data[e.id] = (e.type === 'checkbox') ? e.checked : e.value;
    });
    data._coutantTotal = this.coutant || 0;
    return data;
  };

  Fiche.prototype.remplir = function (data) {
    var self = this;
    Object.keys(data || {}).forEach(function (k) {
      if (k === 'vin-lookup' || k.charAt(0) === '_') return;
      var e = el(k);
      if (!e || !self.elFiche.contains(e)) return;
      if (e.type === 'checkbox') e.checked = !!data[k];
      else e.value = (data[k] === null || data[k] === undefined) ? '' : data[k];
    });
    this.recalculer();
    this.basculerExport();
    this.rendreEblock();
  };

  // Bouton « Ouvrir » actif seulement avec un lien eBlock valide ; la liste
  // rouge des dommages se met à jour à la frappe (et s'imprime).
  Fiche.prototype.rendreEblock = function () {
    var lien = AMX.eblockValide(el('f-eblock') ? el('f-eblock').value : '');
    this.btnEblock.href = lien || '#';
    this.btnEblock.classList.toggle('desactive', !lien);
    this.btnEblock.setAttribute('aria-disabled', lien ? 'false' : 'true');
    var dommages = AMX.listeDommages(el('f-dommages') ? el('f-dommages').value : '');
    AMX.vider(this.elDommagesListe);
    if (dommages.length) {
      this.elDommagesListe.appendChild(h('li.achat-dommages-titre', { text: dommages.length + ' dommage' + (dommages.length > 1 ? 's' : '') + ' répertorié' + (dommages.length > 1 ? 's' : '') + ' sur eBlock' }));
      dommages.forEach(function (d) { this.elDommagesListe.appendChild(h('li', { text: d })); }, this);
    }
  };

  Fiche.prototype.viderFormulaire = function () {
    this.elFiche.querySelectorAll('input, select, textarea').forEach(function (e) {
      var type = (e.getAttribute('type') || '').toLowerCase();
      if (type === 'checkbox' || type === 'radio') e.checked = false; else e.value = '';
    });
    this.rendreEblock();
  };

  /* ---------------------------- Chargement ----------------------------- */
  // Valeurs reçues par l'adresse (signet eBlock) : posées une fois la fiche
  // chargée, sans écraser ce qui est déjà rempli.
  Fiche.prototype.appliquerPrerempli = function () {
    var self = this;
    var p = this.prerempli; if (!p) return;
    this.prerempli = null;
    var n = 0, morceaux = [];
    function poser(id, valeur) { var e = el(id); if (valeur && e && !String(e.value || '').trim()) { e.value = valeur; n++; return true; } return false; }
    if (poser('f-dommages', p.dommages)) morceaux.push(AMX.listeDommages(p.dommages).length + ' dommage(s) répertorié(s)');
    if (p.eblock && AMX.eblockValide(p.eblock)) poser('f-eblock', p.eblock);
    poser('f-marque', p.marque); poser('f-modele', p.modele); poser('f-annee', p.annee); poser('f-couleur', p.couleur); poser('f-km', p.km);
    this.rendreEblock();
    this.recalculer();
    // Le lien CARFAX qu'eBlock fournit (rapport public) s'attache au véhicule
    // tout de suite, comme s'il venait de l'import CARFAX.
    var carfax = AMX.carfax ? AMX.carfax.valide(p.carfax) : '';
    var vin = this.vinCourant || (el('f-niv') ? el('f-niv').value.trim().toUpperCase() : '');
    if (carfax && /^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) {
      if (AMX.carfax.lien(vin) === carfax) morceaux.push('rapport CARFAX déjà en place');
      else AMX.carfax.enregistrer([{ vin: vin, lien: carfax }]).then(function () {
        AMX.toast('Rapport CARFAX d\'eBlock attaché au véhicule.', 'ok', 5000);
        self.rendreContexte();
      }).catch(function (e) { AMX.toast('Lien CARFAX non enregistré — ' + AMX.erreurTexte(e), 'erreur'); });
    }
    if (n) AMX.toast('Reçu d\'eBlock : ' + (morceaux.length ? morceaux.join(', ') + (n > morceaux.length ? ' et ' + (n - morceaux.length) + ' champ(s) rempli(s)' : '') : n + ' champ(s) rempli(s)') + '. Collez le lien « Partager » d\'eBlock, puis enregistrez.', 'ok', 8000);
    if (el('f-eblock') && !el('f-eblock').value.trim()) el('f-eblock').focus();
  };

  Fiche.prototype.chargerDepuisChamp = function () {
    var vin = this.elLookup.value.trim();
    if (!vin) { AMX.toast('Entrez un NIV d\'abord.', 'attention'); this.elLookup.focus(); return; }
    this.charger(vin);
  };

  Fiche.prototype.charger = function (vin) {
    var self = this;
    vin = String(vin || '').trim();
    if (!vin) return Promise.resolve();
    var gen = ++this.generation;
    this.vinCharge = vin;
    this.btnCharger.classList.add('occupe');
    this.etat('Recherche de la fiche…');
    this.verrouiller(false);
    return AMX.get('ficheVin=' + encodeURIComponent(vin)).then(function (d) {
      if (gen !== self.generation) return;
      if (d && d.refuse) throw new Error(d.erreur || d.message || 'Accès refusé');
      var changement = self.vinCourant && self.vinCourant !== vin;
      if (d && d.trouve) {
        self.viderFormulaire();
        self.remplir(d.donnees || {});
        self.nouvelle = false;
        self.etat('Fiche existante chargée — NIV se terminant par ' + fin6(vin) + (d.dateMaj ? ', mise à jour le ' + AMX.fmtDate(d.dateMaj, true) : '') + '.');
      } else {
        // Nouvelle fiche : on repart d'un formulaire vide seulement si on change de véhicule.
        if (changement) self.viderFormulaire();
        self.nouvelle = true;
        self.etat('Aucune fiche existante pour ce NIV — nouvelle fiche prête à remplir.');
      }
      val('f-niv', vin);
      self.vinCourant = vin; self.contexte = null; self.contexteVerifie = false; self.decode = null;
      self.evaluation = null; self.evalVerifiee = ''; self.rendreEvaluation();
      self.rendreContexte();
      self.appliquerPrerempli();
      history.replaceState(null, '', AMX.lien('achat', '', { vin: vin }));
      var taches = [self.verifierVerrouillage(vin, true)];
      if (vin.length >= 11) taches.push(self.decoderVin(vin));
      // Évaluation existante ? Arrivée depuis l'évaluation sur une nouvelle fiche : import direct.
      var depuisEval = self.source === 'evaluation'; self.source = '';
      taches.push(self.verifierEvaluation(vin, depuisEval && self.nouvelle));
      return Promise.all(taches);
    }).catch(function (e) {
      if (gen !== self.generation) return;
      self.etat('Impossible de joindre le registre : ' + AMX.erreurTexte(e));
      AMX.toast('Impossible de charger la fiche — ' + AMX.erreurTexte(e), 'erreur');
    }).then(function () { if (gen === self.generation) self.btnCharger.classList.remove('occupe'); });
  };

  // NHTSA : marque / modèle / année, remplis seulement s'ils sont vides.
  Fiche.prototype.decoderVin = function (vin) {
    var self = this;
    var corps = new URLSearchParams(); corps.append('format', 'json'); corps.append('data', vin);
    return fetch(URL_NHTSA, { method: 'POST', body: corps })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var r = (d && d.Results || [])[0];
        if (!r || self.vinCourant !== vin) return;
        self.decode = { vin: vin, make: r.Make || '', model: r.Model || '', year: r.ModelYear || '' };
        if (r.Make && !valeur('f-marque')) val('f-marque', r.Make);
        if (r.Model && !valeur('f-modele')) val('f-modele', r.Model);
        if (r.ModelYear && !valeur('f-annee')) val('f-annee', r.ModelYear);
        self.rendreContexte();
      })
      .catch(function () { /* décodage silencieux : les champs restent modifiables à la main */ });
  };

  // Statut au registre : verrouille si « comptabilisé », et fournit le contexte véhicule.
  Fiche.prototype.verifierVerrouillage = function (vin, prefill) {
    var self = this;
    if (vin.length < 6) return Promise.resolve();
    this.vinVerifie = vin;
    return AMX.get('checkStatutVin=' + encodeURIComponent(vin)).then(function (r) {
      if (self.vinCourant !== vin) return;
      self.contexteVerifie = true;
      if (r && r.statut) {
        self.contexte = { vin: vin, statut: r.statut, modele: r.modele || '', compagnie: r.compagnie || '', stock: r.stock || '', _feuille: r.feuille || r.source || '' };
        if (prefill && self.nouvelle) self.preremplirDepuisRegistre(self.contexte);
      } else {
        self.contexte = null;
      }
      self.verrouiller(!!(r && r.statut === 'comptabilise'));
      self.rendreContexte();
    }).catch(function () { self.vinVerifie = ''; /* silencieux, comme avant */ });
  };

  // Nouvelle fiche d'un véhicule déjà au registre : compagnie, destination et stock proposés.
  Fiche.prototype.preremplirDepuisRegistre = function (v) {
    var change = false;
    if (v.compagnie && !valeur('f-compagnie') && AMX.COMPAGNIES[v.compagnie]) { val('f-compagnie', v.compagnie); change = true; }
    if (v._feuille && !valeur('f-destination') && AMX.FEUILLES.indexOf(v._feuille) >= 0) { val('f-destination', v._feuille); change = true; }
    if (v.stock && !valeur('f-stock')) { val('f-stock', v.stock); change = true; }
    if (change) this.basculerExport();
  };

  Fiche.prototype.rendreContexte = function () {
    var vin = this.vinCourant;
    AMX.vider(this.elContexte);
    if (!vin) { this.elContexte.classList.add('cache'); return; }
    var v = AMX.inventaire.parVin(vin) || this.contexte;
    var d = (this.decode && this.decode.vin === vin) ? this.decode : null;
    var morceaux = [];
    if (d && (d.make || d.model || d.year)) morceaux.push(h('span.puce', { title: 'Décodage NHTSA', text: [d.year, d.make, d.model].filter(Boolean).join(' ') }));
    if (v) {
      morceaux.push(AMX.badgeStatut(v.statut, v._feuille));
      if (v.modele) morceaux.push(h('span.modele', { text: v.modele }));
      if (v._feuille) morceaux.push(h('span.puce', { text: 'Registre ' + AMX.inventaire.nomFeuille(v._feuille) }));
      if (v.stock) morceaux.push(h('span.puce.mono', { text: v.stock }));
      if (v.compagnie) morceaux.push(h('span.puce', { text: v.compagnie }));
      if (v._feuille) morceaux.push(h('a.petit', { href: AMX.lien('inventaire', String(v._feuille).toLowerCase(), { vin: vin }), text: 'Voir dans l\'inventaire' }));
    } else if (this.contexteVerifie) {
      morceaux.push(h('span.puce.attention', { text: 'Absent des registres' }));
      morceaux.push(h('span.doux.petit', { text: 'Il sera ajouté à la destination choisie lors de l\'enregistrement.' }));
    }
    // Rapport CARFAX attaché au véhicule : puce + le bouton « Carfax » des coûts
    // ouvre ce rapport plutôt que la page d'accueil de CARFAX.
    var lienCfx = AMX.carfax ? AMX.carfax.lien(vin) : '';
    var btnCfx = el('carfax-btn');
    if (btnCfx) { btnCfx.href = lienCfx || 'https://vhr.carfax.ca/fr/'; btnCfx.title = lienCfx ? 'Ouvrir le rapport CARFAX de ce véhicule' : 'Ouvrir Carfax'; }
    if (lienCfx) morceaux.push(h('a.puce.info.lien-puce', { href: lienCfx, target: '_blank', rel: 'noopener', text: 'CARFAX', title: 'Voir le rapport CARFAX' }));
    if (!morceaux.length) { this.elContexte.classList.add('cache'); return; }
    this.elContexte.classList.remove('cache');
    this.elContexte.appendChild(h('span.mono.doux', { text: vin }));
    morceaux.forEach(function (m) { this.elContexte.appendChild(m); }, this);
  };

  /* --------------------------- Verrouillage ---------------------------- */
  // Dossier comptabilisé : la fiche reste consultable, imprimable et copiable —
  // seule l'écriture est bloquée. `temporaire` = déverrouillée côté client.
  Fiche.prototype.verrouiller = function (verrou, temporaire) {
    var self = this;
    this.verrouillee = !!verrou;
    this.elFiche.querySelectorAll('input, select, textarea').forEach(function (e) {
      if (e.id === 'f-niv' || CALCULES.indexOf(e.id) >= 0) return; // le NIV reste modifiable ; les calculs restent en lecture seule
      var type = (e.getAttribute('type') || '').toLowerCase();
      if (e.tagName === 'SELECT' || type === 'checkbox' || type === 'radio') e.disabled = self.verrouillee;
      else { e.readOnly = self.verrouillee; e.disabled = false; }
    });
    this.btnTaux.disabled = this.verrouillee;
    this.btnEnregistrer.disabled = this.verrouillee;
    this.elPage.classList.toggle('achat-verrouille', this.verrouillee);
    if (this.elEval) this.rendreEvaluation();

    AMX.vider(this.elVerrou);
    this.elVerrou.className = 'alerte-bloc achat-verrou noprint';
    if (this.verrouillee) {
      this.elVerrou.classList.add('ferme');
      this.elVerrou.appendChild(h('span', { html: I.cadenas }));
      this.elVerrou.appendChild(h('div.texte', [h('b', 'Dossier comptabilisé — fiche consultable, modification verrouillée'), h('span', 'Vous pouvez lire, copier et imprimer la fiche. Déverrouillez-la pour la corriger (chargeback) ; l\'opération est inscrite au journal sous votre nom.')]));
      this.elVerrou.appendChild(h('button.btn', { type: 'button', html: I.cadenas + '<span>Déverrouiller (comptabilité)</span>', onclick: function () { self.deverrouiller(); } }));
    } else if (temporaire) {
      this.elVerrou.classList.add('attention');
      this.elVerrou.appendChild(h('span', { html: I.alerte }));
      this.elVerrou.appendChild(h('div.texte', [h('b', 'Fiche déverrouillée temporairement (comptabilité)'), h('span', 'Le statut réel dans le registre reste « Comptabilisé » tant qu\'il n\'est pas changé là-bas.')]));
    } else {
      this.elVerrou.classList.add('cache');
    }
  };

  Fiche.prototype.deverrouiller = function () {
    var self = this;
    AMX.confirmer('Déverrouiller ce dossier comptabilisé ?',
      'La fiche redevient modifiable pour correction (chargeback). Cette opération est inscrite au journal sous votre nom ; le serveur vérifie vos droits à l\'enregistrement.',
      { ok: 'Déverrouiller' }).then(function (ok) {
      if (!ok) return;
      self.verrouiller(false, true);
      AMX.toast('Fiche déverrouillée pour correction', 'attention');
    });
  };

  /* --------------------------- Enregistrement -------------------------- */
  // Le véhicule est-il déjà dans un des trois registres ? Évite de le créer deux fois.
  Fiche.prototype.registreExistant = function (vin) {
    return AMX.get('checkStatutVin=' + encodeURIComponent(vin)).then(function (r) {
      if (r && r.statut) return { existe: true, feuille: r.feuille || r.source || '' };
      return { existe: false, feuille: '' };
    }, function () {
      // Échec réseau : on ne crée rien, plus sûr que de doubler.
      return { existe: true, feuille: '', incertain: true };
    });
  };

  // Bouton unique : crée le véhicule au registre s'il n'y est pas, puis enregistre la fiche.
  Fiche.prototype.enregistrer = function () {
    var self = this;
    if (this.verrouillee) { AMX.toast('Dossier comptabilisé : déverrouillez la fiche avant d\'enregistrer.', 'attention'); return; }
    var vin = valeur('f-niv').trim();
    if (!vin) { AMX.toast('Le NIV doit être rempli avant d\'enregistrer.', 'attention'); el('f-niv').focus(); return; }
    var btn = this.btnEnregistrer;
    btn.classList.add('occupe');
    this.etat('Vérification du registre…');

    this.registreExistant(vin).then(function (etat) {
      if (etat.incertain) {
        self.etat('Registre injoignable — la fiche sera enregistrée, mais le véhicule n\'a pas été ajouté au registre (pour éviter un doublon). Réessayez plus tard.');
        return;
      }
      if (etat.existe) {
        self.etat('Véhicule déjà au registre' + (etat.feuille ? ' (' + AMX.inventaire.nomFeuille(etat.feuille) + ')' : '') + ' — enregistrement de la fiche…');
        return;
      }
      // Pas encore dans un registre : on le crée une seule fois, dans la destination choisie.
      var dest = valeur('f-destination'), compagnie = valeur('f-compagnie');
      if (!dest || !compagnie) {
        var err = new Error('Ce NIV n\'est dans aucun registre : choisissez la compagnie et la destination inventaire pour qu\'il y soit ajouté, puis réenregistrez.');
        err.doux = true; throw err;
      }
      var modele = [valeur('f-marque').trim(), valeur('f-modele').trim(), valeur('f-annee').trim()].filter(Boolean).join(' ') || '(modèle non précisé)';
      self.etat('Ajout au registre ' + AMX.inventaire.nomFeuille(dest) + '…');
      return AMX.post({ action: 'add', sheet: dest, vin: vin, modele: modele, compagnie: compagnie }).then(function (d) {
        if (d && (d.refuse || d.ok === false)) {
          AMX.toast('Véhicule non ajouté au registre — ' + (d.erreur || d.message || 'action refusée'), 'attention', 7000);
          self.etat('Véhicule non ajouté au registre — enregistrement de la fiche…');
          return;
        }
        AMX.toast('Véhicule ajouté au registre ' + AMX.inventaire.nomFeuille(dest), 'ok');
        AMX.inventaire.lire(dest, true).catch(function () {});
        self.etat('Véhicule ajouté à ' + AMX.inventaire.nomFeuille(dest) + ' — enregistrement de la fiche…');
      });
    }).then(function () {
      var data = self.collecter();
      AMX.ficheOublier(vin);
      return AMX.post({ action: 'saveFiche', vin: vin, data: data }).then(function (d) {
        AMX.verifier(d, 'Enregistrement refusé par le serveur');
        var quand = AMX.fmtDate(d.dateMaj || new Date().toISOString(), true);
        self.vinCourant = vin; self.vinCharge = vin; self.nouvelle = false;
        self.etat('Fiche enregistrée le ' + quand + ' — Stock # et coûtant synchronisés avec le registre.');
        AMX.toast('Fiche enregistrée (NIV …' + fin6(vin) + ')', 'ok');
        history.replaceState(null, '', AMX.lien('achat', '', { vin: vin }));
        // Le registre a changé (stock, coûtant, fiche existante) : on rafraîchit la feuille concernée.
        var v = AMX.inventaire.parVin(vin);
        if (v && v._feuille) AMX.inventaire.lire(v._feuille, true).catch(function () {});
        else if (self.contexte && self.contexte._feuille) AMX.inventaire.lire(self.contexte._feuille, true).catch(function () {});
        if (!self.contexteVerifie) self.verifierVerrouillage(vin, false);
      });
    }).catch(function (e) {
      if (e && e.doux) { self.etat(e.message); AMX.toast(e.message, 'attention', 7000); }
      else { self.etat('Échec de l\'enregistrement : ' + AMX.erreurTexte(e)); AMX.toast('Échec de l\'enregistrement — ' + AMX.erreurTexte(e), 'erreur'); }
    }).then(function () { btn.classList.remove('occupe'); });
  };

  /* ------------------------------ Divers ------------------------------- */
  Fiche.prototype.obtenirTaux = function () {
    var self = this, btn = this.btnTaux;
    if (this.verrouillee) return;
    btn.classList.add('occupe');
    fetch(URL_TAUX).then(function (r) { return r.json(); }).then(function (d) {
      var obs = d && d.observations && d.observations[0];
      var brut = obs && obs.FXUSDCAD && parseFloat(obs.FXUSDCAD.v);
      if (!brut) throw new Error('taux introuvable');
      var ajuste = brut * 0.98; // taux Banque du Canada moins 2 %
      val('f-taux', ajuste.toFixed(4));
      self.recalculer();
      AMX.toast('Taux Banque du Canada ' + brut.toFixed(4) + ' → ' + ajuste.toFixed(4) + ' (−2 %)', 'ok', 5000);
    }).catch(function () {
      AMX.toast('Taux introuvable — entrez-le manuellement.', 'erreur');
    }).then(function () { btn.classList.remove('occupe'); });
  };

  Fiche.prototype.reinitialiser = function () {
    var self = this;
    AMX.confirmer('Réinitialiser la fiche', 'Vider tous les champs de la fiche à l\'écran ? Les fiches déjà enregistrées sur le serveur ne sont pas touchées.', { ok: 'Vider la fiche' }).then(function (ok) {
      if (!ok) return;
      self.generation++;
      self.btnCharger.classList.remove('occupe');
      self.verrouiller(false);
      self.viderFormulaire();
      self.elLookup.value = '';
      self.vinCharge = ''; self.vinCourant = ''; self.vinVerifie = '';
      self.nouvelle = true; self.contexte = null; self.contexteVerifie = false; self.decode = null;
      self.evaluation = null; self.evalVerifiee = ''; self.rendreEvaluation();
      self.rendreContexte();
      self.basculerExport();
      self.etat('Fiche vide. Entrez un NIV pour charger une fiche existante ou en créer une nouvelle.');
      history.replaceState(null, '', AMX.lien('achat', ''));
      self.elLookup.focus();
    });
  };
})();
