/* Relance (21 octobre 2026) — la tuile « Relance » regroupe tout ce qui ramène un client :
   Équité (clients BMW Financial Services, assets/equite.js), Leads (assets/leads.js, par Vente),
   Avis Google et sondages (assets/avis.js) et CSI (assets/csi.js). Les onglets sont assemblés par TUILES dans
   app.js ; ce module ne fournit que la page « Équité › Clients », qui vivait avant dans Inventaire › Neufs › BMW
   Sherbrooke › onglet Équité. Maxime : « pour la relance d'équité il ne faut pas que ça soit dans Inventaire
   mais dans Relance ». La vue « Importer le portefeuille » reste la page d'Outils (AMX.vues.ImportPortefeuille),
   montée par la tuile avec l'onglet « equite » de la source outils. */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var CIE_DEFAUT = 'BMW';   /* BMW (InfoBahn) ; depuis le 4 nov. aussi Hawkesbury et Ste-Marie (GM Dealer Direct) */
  var CIES_GM = { HAWKS: 1, STM: 1 };
  var URL_GMDD = 'https://www.gmdealerdirect.ca/lm/Lead/myLeadLists.aspx';
  var URL_VWF = 'https://dealerportal.vwfinance.ca/dashboard/portfolio-management';   /* 4 nov. : VW Finance (Dealer Extranet) */
  var URL_HMF = 'https://www.hmfdealer.ca/hmfdp/s/';   /* 5 nov. : Hyundai Finance (Customer Portfolio) */
  var URL_SMARTPORTAL = 'https://login.smartdealerportal.com/';   /* la page de connexion : sans session, home… mène à « logged out » sans bouton */   /* 6 nov. : SmartPortal de J.D. Power (offres de fidélité Hyundai) */

  function nomCie(code) { return (AMX.COMPAGNIES_TOUTES[code] || code || '').replace(' Chevrolet Buick Cadillac', ''); }

  AMX.relance = {
    /** Page Relance › Équité › Clients : concession, puis la liste des clients avec équité (AMX.equite.monter). */
    equite: function (conteneur, ctx) { return new PageEquite(conteneur, ctx); }
  };

  function PageEquite(conteneur, ctx) {
    var self = this;
    this.conteneur = conteneur;
    var codes = AMX.codesPour ? AMX.codesPour('inventaire') : [];
    var choisie = AMX.compagnieChoisie('inventaire');
    this.cie = choisie || (codes.indexOf(CIE_DEFAUT) >= 0 ? CIE_DEFAUT : (codes[0] || CIE_DEFAUT));
    this.vue = null;
    this.construire();
    this.rendre();
    this.surChangement = function () { if (self.el.isConnected) self.rendreEntete(); };
    document.addEventListener('amx:openlane', this.surChangement);
    /* Le choix de concession du haut du site : la page le suit (« Tout le groupe » garde la concession affichée). */
    this.surCie = function () { var c = AMX.compagnieChoisie('inventaire'); if (c && c !== self.cie && self.el.isConnected) { self.cie = c; self.rendre(); } };
    document.addEventListener('amx:compagnie', this.surCie);
    // Les neufs (inventaire IVS-R) servent à trouver le neuf similaire : on les charge sans bloquer la page.
    if (AMX.neufs && AMX.neufs.charger) AMX.neufs.charger().then(function () { if (self.vue && self.vue.rendre && self.el.isConnected) self.vue.rendre(); }).catch(function () {});
    AMX.equite.charger().then(function () { if (self.el.isConnected) self.rendreEntete(); }).catch(function () {});
  }
  PageEquite.prototype.demonter = function () {
    document.removeEventListener('amx:openlane', this.surChangement);
    document.removeEventListener('amx:compagnie', this.surCie);
    if (this.vue && this.vue.demonter) { try { this.vue.demonter(); } catch (e) {} }
    this.vue = null;
  };
  PageEquite.prototype.naviguer = function () { this.rendreEntete(); };

  PageEquite.prototype.construire = function () {
    var self = this;
    this.elEtat = h('p', { text: 'Chargement du portefeuille…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () {
      self.btnRafraichir.classList.add('occupe');
      AMX.equite.charger(true).then(function () { self.btnRafraichir.classList.remove('occupe'); self.rendre(); AMX.toast('Portefeuille mis à jour.', 'ok'); }, function (e) { self.btnRafraichir.classList.remove('occupe'); AMX.toast('Mise à jour impossible — ' + AMX.erreurTexte(e), 'erreur'); });
    } });
    this.btnImporter = h('a.btn', { href: AMX.lien('relance', 'equite', { vue: 'import' }), html: I.telecharger + '<span>Importer le portefeuille</span>', title: 'Déposer l\'export InfoBahn (BMW Financial Services)' });
    /* 6 nov. (Maxime) : « fais un gros onglet Synchroniser OpenLane pour que les valeurs se calculent ; le lien d'importation est
       à deux places, mets-le dans Actions et efface les deux autres ». Un seul gros bouton dans l'en-tête ; l'importation, le
       calcul de la dette, l'export et Rafraîchir vont dans le menu Actions. */
    this.btnSync = h('button.btn.primaire.eq-sync-gros', { type: 'button', disabled: true, html: I.rafraichir + '<span>Synchroniser OpenLane</span>', onclick: function () { if (self.vue && self.vue.basculerSync) self.vue.basculerSync(); } });
    /* 6 nov. (Maxime : « le lien pour J.D. Power n'est pas là ») : SmartPortal, pour les offres de fidélité — Hyundai seulement. */
    this.btnFidelite = h('a.btn', { href: URL_SMARTPORTAL, target: '_blank', rel: 'noopener', hidden: 'hidden', html: I.externe + '<span>Ouvrir SmartPortal (fidélité)</span>', title: 'SmartPortal de J.D. Power : connectez-vous, puis Pistes de vente, liste « HACC CRM -- HACC CRM - Loyalty Special Offer », puis le favori « Automax ← Fidélité Hyundai »' });
    this.btnDette = h('button.btn', { type: 'button', text: 'Calcul de la dette', title: 'La dette de chaque client est recalculée chaque jour d\'après son contrat : voir le détail', onclick: function () { if (self.vue && self.vue.calculDette) self.vue.calculDette(); } });
    this.btnExport = h('button.btn', { type: 'button', html: I.externe + '<span>Exporter Excel</span>', onclick: function () { if (self.vue && self.vue.exporter) self.vue.exporter(); } });
    this.elCies = h('div.barre-cies');
    this.elCorps = h('div');
    this.el = h('div.page', [
      h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', 'Équité'), this.elEtat]), h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnImporter, this.btnFidelite, this.btnDette, this.btnExport, this.btnSync], [this.btnSync]))]),
      this.elCies,
      this.elCorps
    ]);
    this.conteneur.appendChild(this.el);
  };

  PageEquite.prototype.rendreEntete = function () {
    var self = this, d = AMX.equite.enCache();
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.cie, sansToutes: true, compte: function (c) { return d ? AMX.equite.comptes(c).length : null; }, onchange: function (c) { c = c || CIE_DEFAUT; if (c === self.cie && self.vue) return; self.cie = c; self.rendre(); } });
    var comptes = d ? AMX.equite.comptes(this.cie) : [], etat = d ? AMX.equite.etat(this.cie) : null;
    /* Le bouton suit la concession : BMW = dépôt de l'export InfoBahn ; GM = GM Dealer Direct et le favori Constructeur. */
    var gm = !!CIES_GM[this.cie], vw = this.cie === 'VW', hmf = this.cie === 'HYUNDAI', portail = gm ? URL_GMDD : (vw ? URL_VWF : (hmf ? URL_HMF : ''));
    this.btnImporter.setAttribute('href', portail || AMX.lien('relance', 'equite', { vue: 'import' }));
    var nomPortail = hmf ? 'Hyundai Finance' : (vw ? 'VW Finance' : 'GM Dealer Direct');
    gm = gm || vw || hmf;
    if (gm) { this.btnImporter.setAttribute('target', '_blank'); this.btnImporter.setAttribute('rel', 'noopener'); } else { this.btnImporter.removeAttribute('target'); this.btnImporter.removeAttribute('rel'); }
    this.btnFidelite.hidden = !hmf;
    this.btnImporter.innerHTML = (gm ? I.externe : I.telecharger) + '<span>' + (gm ? 'Ouvrir ' + nomPortail : 'Importer le portefeuille') + '</span>';
    this.btnImporter.title = gm ? 'Puis cliquez le favori « Automax ← ' + (hmf ? 'Hyundai Finance » dans ' : 'Constructeur » dans ') + (hmf ? 'Customer Portfolio de Hyundai Finance' : (vw ? 'Portfolio Manager du Dealer Extranet' : 'GM Dealer Direct')) : 'Déposer l\'export InfoBahn (BMW Financial Services)';
    var lib = hmf ? 'Hyundai Finance' : (vw ? 'VW Finance' : (CIES_GM[this.cie] ? 'Financière GM' : 'BMW Financial Services'));
    this.elEtat.textContent = !d ? 'Chargement du portefeuille…'
      : (nomCie(this.cie) + ' · ' + lib + ' · ' + AMX.fmtNombre(comptes.length) + ' client' + (comptes.length > 1 ? 's' : '') + ' financé' + (comptes.length > 1 ? 's' : '') + (etat && etat.le ? ' · portefeuille lu le ' + AMX.fmtDate(etat.le, true) + (etat.par ? ' par ' + String(etat.par).split('@')[0] : '') : (comptes.length ? '' : ' · aucun portefeuille lu')));
    this.btnDette.disabled = this.btnExport.disabled = !comptes.length;
  };
  PageEquite.prototype.rendre = function () {
    this.rendreEntete();
    if (this.vue && this.vue.demonter) { try { this.vue.demonter(); } catch (e) {} }
    AMX.vider(this.elCorps);
    this.vue = AMX.equite.monter(this.elCorps, this.cie, { boutonSync: this.btnSync });
  };
})();
