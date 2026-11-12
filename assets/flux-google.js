/* =====================================================================================================
   flux-google.js — Marketing › Annonces Google

   Maxime : « es-tu capable de créer un Google inventory booster avec l'inventaire qu'on a » → « ok on commence avec BMW » →
   « un menu marketing dans l'app et le site ; choisir les unités qu'on veut mettre de l'avant dans Google, ou l'AI ? ».
   Le flux des annonces de véhicules de Google (Merchant Center, « vehicle ads ») bâti à partir du SITE de la concession :
   chaque fiche de véhicule du site (prix affiché, photos, lien) vérifiée dans ScanAutomax (FluxGoogle.gs).
   Routes : GET ?fluxGoogle=1&compagnie= ; POST fluxGoogleLire, fluxGoogleChoix, fluxGoogleReglages, fluxGoogleFeuille.

   12 nov. (soir, v341) — Maxime : « je veux que ce soit super simple : choisir ou enlever des unités et cliquer Publier »
   et « je peux voir un aperçu des annonces ? ». La page :
   - une case par véhicule (cocher = annoncé, décocher = retiré) ; les changements restent sur l'appareil (AMX.memo
     fgv_brouillon_<CIE>) tant qu'on n'a pas cliqué « Publier sur Google » ;
   - « Publier sur Google » : enregistre les choix (fluxGoogleChoix vedette / ''), puis récrit la feuille que Merchant
     Center lit (fluxGoogleFeuille ecrire). La campagne Google Ads n'annonce que les véhicules cochés (étiquette vedette) ;
   - « Aperçu des annonces » : à quoi ressemblent les annonces des véhicules cochés (photo, prix, titre, km, concession),
     avec ce que la feuille envoie vraiment à Google. Google choisit lui-même la mise en page.
   Le partage de la feuille et le code d'établissement (réglés une fois) sont au bas de la page, repliés.
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez la version qui contient FluxGoogle.gs.';
  var CSS = [
    '.fgv-page .fgv-avis { border: 1px solid var(--ambre); background: var(--ambre-bg, #fff6e5); border-radius: 10px; padding: 10px 14px; margin: 0 0 12px; font-size: 14px; }',
    /* barre de publication, collée sous la barre du site */
    '.fgv-publier { position: sticky; top: calc(var(--barre-h) + var(--sous-h)); z-index: 20; display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 12px 16px; margin: 0 0 12px; box-shadow: 0 6px 18px rgba(20,26,31,.07); }',
    '.fgv-publier .compte { flex: 1 1 260px; } .fgv-publier .compte b { font-size: 20px; } .fgv-publier .compte .exp { font-size: 13px; color: var(--encre-3); margin-top: 2px; }',
    '.fgv-publier .compte .attente { color: var(--ambre); font-weight: 700; } .fgv-publier .compte .ajour { color: var(--vert-fonce); font-weight: 700; }',
    '.fgv-publier .boutons { display: flex; flex-wrap: wrap; gap: 8px; } .fgv-publier .btn.gros { font-size: 15px; padding: 10px 18px; }',
    '.fgv-campagne { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 13px; color: var(--encre-2); background: var(--bleu-bg); border: 1px solid var(--bleu); border-radius: 10px; padding: 8px 12px; margin: 0 0 12px; }',
    '.fgv-campagne span { flex: 1 1 280px; }',
    /* vues : choisis, proposés, tous les prêts, exclus */
    '.fgv-filtres { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 10px; } .fgv-filtres .saisie.recherche { flex: 1 1 240px; max-width: 380px; }',
    '.fgv-vues { display: flex; flex-wrap: wrap; gap: 6px; } .fgv-vues button { border: 1px solid var(--ligne); background: var(--carte); color: var(--encre-2); border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }',
    '.fgv-vues button.actif { background: var(--encre); border-color: var(--encre); color: #fff; } .fgv-vues button .n { opacity: .75; margin-left: 4px; }',
    '.fgv-bloc-prop { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; font-size: 14px; border: 1px solid #c9b6f5; background: #f6f1ff; border-radius: 10px; padding: 8px 12px; margin: 0 0 10px; }',
    /* lignes */
    '.fgv-liste { display: flex; flex-direction: column; gap: 8px; }',
    '.fgv-ligne { display: grid; grid-template-columns: 40px 96px 1fr auto; gap: 12px; align-items: center; border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 10px 12px; cursor: pointer; }',
    '.fgv-ligne.choisi { border-color: #6d28d9; box-shadow: 0 0 0 1px #6d28d9 inset; } .fgv-ligne.change { border-style: dashed; } .fgv-ligne.exclu { opacity: .72; cursor: default; }',
    '.fgv-coche { width: 34px; height: 34px; border-radius: 9px; border: 2px solid var(--encre-4, #5F6978); background: var(--carte); color: #fff; font-size: 20px; font-weight: 800; line-height: 1; display: grid; place-items: center; cursor: pointer; padding: 0; }',
    '.fgv-coche.on { background: #6d28d9; border-color: #6d28d9; } .fgv-coche:disabled { border-color: var(--ligne); background: var(--fond); cursor: not-allowed; }',
    '.fgv-ligne img { width: 96px; height: 64px; object-fit: cover; border-radius: 8px; background: var(--fond); } .fgv-ligne .sans { width: 96px; height: 64px; border-radius: 8px; background: var(--fond); display: grid; place-items: center; font-size: 12px; color: var(--encre-3); }',
    '.fgv-ligne .t b { font-size: 15px; } .fgv-ligne .t .m { font-size: 13px; color: var(--encre-3); margin-top: 2px; } .fgv-ligne .t .pb { font-size: 13px; margin-top: 4px; }',
    '.fgv-ligne .pb.exclu { color: var(--rouge); } .fgv-ligne .pb.completer { color: var(--ambre); } .fgv-ligne .pb.note { color: var(--encre-3); }',
    '.fgv-ligne .prop { display: inline-block; margin-top: 4px; font-size: 12px; font-weight: 700; color: #6d28d9; background: #f1ebff; border-radius: 999px; padding: 2px 9px; }',
    '.fgv-ligne .chg { display: inline-block; margin-top: 4px; margin-left: 4px; font-size: 12px; font-weight: 700; color: var(--ambre); background: #fff1d6; border-radius: 999px; padding: 2px 9px; }',
    '.fgv-ligne .d { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; text-align: right; } .fgv-ligne .prix { font-size: 16px; font-weight: 800; }',
    '.fgv-pastille { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 2px 9px; } .fgv-pastille.completer { background: #fff1d6; color: var(--ambre); } .fgv-pastille.exclu { background: #fde2e2; color: var(--rouge); }',
    '.fgv-groupe { margin: 18px 0 8px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--encre-2); }',
    '.fgv-vide { padding: 30px; text-align: center; color: var(--encre-3); }',
    /* aperçu des annonces */
    '.fgv-apercu-note { font-size: 13px; color: var(--encre-3); margin: 0 0 12px; }',
    '.fgv-apercus { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }',
    '.fgv-annonce { border: 1px solid #dadce0; border-radius: 12px; overflow: hidden; background: #fff; color: #202124; font-family: Arial, Helvetica, sans-serif; display: flex; flex-direction: column; }',
    '.fgv-annonce .img { position: relative; aspect-ratio: 4 / 3; background: #f1f3f4; } .fgv-annonce .img img { width: 100%; height: 100%; object-fit: cover; display: block; }',
    '.fgv-annonce .img .pub { position: absolute; left: 8px; top: 8px; background: rgba(255,255,255,.92); color: #202124; font-size: 11px; font-weight: 700; border-radius: 4px; padding: 1px 6px; }',
    '.fgv-annonce .corps { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 3px; }',
    '.fgv-annonce .prix { font-size: 18px; font-weight: 700; } .fgv-annonce .titre { font-size: 14px; line-height: 1.3; color: #1a0dab; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }',
    '.fgv-annonce .km { font-size: 13px; color: #4d5156; } .fgv-annonce .vend { font-size: 13px; color: #202124; margin-top: 4px; } .fgv-annonce .vend span { color: #4d5156; }',
    '.fgv-annonce-envoi { margin-top: 14px; font-size: 13px; } .fgv-annonce-envoi table { width: 100%; border-collapse: collapse; } .fgv-annonce-envoi td { border-top: 1px solid var(--ligne); padding: 5px 6px; vertical-align: top; } .fgv-annonce-envoi td:first-child { color: var(--encre-3); white-space: nowrap; width: 150px; }',
    /* réglages, repliés au bas de la page */
    '.fgv-reglages { margin: 22px 0 0; } .fgv-reglages > summary { cursor: pointer; font-weight: 700; color: var(--encre-2); margin: 0 0 10px; }',
    '.fgv-feuille { border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 12px 14px; margin: 0 0 14px; font-size: 14px; }',
    '.fgv-feuille .tete { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; } .fgv-feuille .tete b { font-size: 15px; } .fgv-feuille .tete .m { color: var(--encre-3); flex: 1 1 260px; }',
    '.fgv-feuille .partages { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 10px; } .fgv-feuille .puce-p { background: var(--fond); border: 1px solid var(--ligne); border-radius: 999px; padding: 3px 4px 3px 10px; font-size: 13px; display: inline-flex; gap: 6px; align-items: center; }',
    '.fgv-feuille .puce-p button { border: 0; background: none; cursor: pointer; font-size: 15px; line-height: 1; color: var(--encre-3); padding: 0 4px; } .fgv-feuille .ajout { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; } .fgv-feuille .ajout .saisie { flex: 1 1 240px; max-width: 340px; }',
    '.fgv-feuille .mini { font-size: 13px; color: var(--encre-3); margin-top: 6px; } .fgv-merchant .tete .m { flex-basis: 100%; }',
    '.fgv-feuille details { margin-top: 10px; } .fgv-feuille details summary { cursor: pointer; font-weight: 700; color: var(--encre-2); } .fgv-feuille ol { margin: 8px 0 0 18px; padding: 0; } .fgv-feuille li { margin: 4px 0; } .fgv-feuille .err { color: var(--ambre); margin-top: 6px; }',
    '@media (max-width: 640px) { .fgv-ligne { grid-template-columns: 38px 72px 1fr; } .fgv-ligne img, .fgv-ligne .sans { width: 72px; height: 50px; } .fgv-ligne .d { grid-column: 2 / -1; flex-direction: row; justify-content: space-between; align-items: center; }',
    '  .fgv-publier { top: calc(var(--barre-h) + var(--sous-h)); padding: 10px 12px; } .fgv-publier .boutons { width: 100%; } .fgv-publier .boutons .btn { flex: 1 1 auto; } }'
  ].join('\n');
  function css() { if (!document.getElementById('css-flux-google')) { var s = document.createElement('style'); s.id = 'css-flux-google'; s.textContent = CSS; document.head.appendChild(s); } }
  function perms() { return (AMX.session && AMX.session.perms) || {}; }
  function peutVoir() {
    var p = perms(), r = String(p.role || AMX.session.role || '');
    return r === 'proprietaire' || r === 'admin' || r === 'gestionnaire' || r === 'direction_ventes' || r === 'marketing' || !!(p.gererUtilisateurs || p.gererAdmins);
  }
  /* Les comptes Google de chaque concession (identifiants seulement : il faut être connecté pour y entrer). */
  var COMPTES_GOOGLE = {
    BMW: { merchant: '5903667475', ocid: '8664050367', campagne: 'BMW Sherbrooke - Annonces de véhicules (choisis)' }
  };
  var VISER = { min: 20, max: 40 };   /* nombre de véhicules conseillé pour une campagne d'environ 50 $ par jour */
  var GENRES = { neuf: 'Neuf', demo: 'Démo', occasion: 'Occasion' };
  var ETATS = { pret: 'Prêt pour Google', completer: 'À compléter', exclu: 'Exclu' };
  var VUES = [['choisis', 'Annoncés'], ['proposes', 'Proposés'], ['prets', 'Tous les véhicules'], ['exclus', 'Exclus']];

  var cache = {};   // par concession : { rep, le }
  function charger(cie, force) {
    var c = cache[cie];
    if (!force && c && Date.now() - c.le < AMX.dureeCopie(120000)) return Promise.resolve(c.rep);
    return AMX.get({ fluxGoogle: '1', compagnie: cie }, { delai: 90000, secours: false }).then(function (d) {
      if (d && d.refuse) throw new Error(d.erreur || 'Accès refusé.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!Array.isArray(d.lignes)) throw new Error(SCRIPT_PAS_A_JOUR);
      cache[cie] = { rep: d, le: Date.now() };
      return d;
    });
  }
  function compteur() { var cie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : ''; var c = cache[cie || 'BMW']; return c && c.rep && c.rep.compte ? (c.rep.compte.suggestions || '') : ''; }
  function vinDe(l) { return (l.google && l.google.vin) || ''; }
  function argent(n) { return n ? (AMX.fmtArgent ? AMX.fmtArgent(n) : n + ' $') : ''; }

  function VueFlux(conteneur, ctx) {
    css();
    var self = this;
    this.conteneur = conteneur; this.detruit = false;
    this.cie = (AMX.compagnieChoisie && AMX.compagnieChoisie('inventaire')) || 'BMW';
    this.f = { q: '', genre: '', vue: '' };
    AMX.vider(conteneur);
    this.btnLire = h('button.btn', { type: 'button', text: 'Relire le site de la concession', onclick: function () { self.lireSite(); } });
    this.btnFichier = h('button.btn', { type: 'button', text: 'Télécharger le flux (fichier Google)', onclick: function () { self.telecharger(); } });
    this.btnCode = h('button.btn', { type: 'button', text: 'Code d\'établissement Google…', onclick: function () { self.codeEtablissement(); } });
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    this.elSous = h('p');
    conteneur.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Annonces Google'), this.elSous]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnLire, this.btnFichier, this.btnCode], []))
    ]));
    this.elCies = h('div.barre-cies'); conteneur.appendChild(this.elCies);
    this.elCorps = h('div.fgv-page'); conteneur.appendChild(this.elCorps);
    this.surCie = function (e) { self.cie = (e.detail && e.detail.compagnie) || 'BMW'; self.f.vue = ''; self.charger(false); };
    document.addEventListener('amx:compagnie', this.surCie);
    this.charger(false);
  }
  VueFlux.prototype.demonter = function () { this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); };
  VueFlux.prototype.charger = function (force) {
    var self = this, cie = this.cie || 'BMW';
    if (!cache[cie]) { AMX.vider(this.elCorps); this.elCorps.appendChild(AMX.chargeur('Annonces Google')); }
    return charger(cie, force).then(function (d) { if (self.detruit || cie !== (self.cie || 'BMW')) return; self.rep = d; self.rendre(); }).catch(function (e) {
      if (self.detruit) return; AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.fgv-vide', { text: AMX.erreurTexte(e) }));
    });
  };

  /* ---- Les choix pas encore publiés : { NIV: true (à annoncer) | false (à retirer) }, gardés sur l'appareil ---- */
  VueFlux.prototype.brouillon = function () {
    var cle = 'fgv_brouillon_' + (this.cie || 'BMW');
    if (!this._br || this._brCle !== cle) { this._brCle = cle; this._br = (AMX.memo && AMX.memo.lire(cle, {})) || {}; }
    return this._br;
  };
  VueFlux.prototype.garderBrouillon = function () { if (AMX.memo) AMX.memo.ecrire(this._brCle, this._br || {}); };
  VueFlux.prototype.nettoyerBrouillon = function () {
    /* un choix déjà publié (ou un véhicule disparu du flux) n'est plus un changement */
    var br = this.brouillon(), parVin = {};
    (this.rep && this.rep.lignes || []).forEach(function (l) { var v = vinDe(l); if (v) parVin[v] = l; });
    Object.keys(br).forEach(function (v) { var l = parVin[v]; if (!l || l.etat === 'exclu' || !!l.vedette === br[v]) delete br[v]; });
    this.garderBrouillon();
  };
  VueFlux.prototype.choisi = function (l) { var br = this.brouillon(), v = vinDe(l); return v && Object.prototype.hasOwnProperty.call(br, v) ? br[v] : !!l.vedette; };
  VueFlux.prototype.change = function (l) { var br = this.brouillon(), v = vinDe(l); return !!v && Object.prototype.hasOwnProperty.call(br, v); };
  VueFlux.prototype.basculer = function (lignes, valeur) {
    var self = this, br = this.brouillon();
    lignes.forEach(function (l) {
      var v = vinDe(l); if (!v || l.etat === 'exclu') return;
      var voulu = valeur === undefined ? !self.choisi(l) : valeur;
      if (voulu === !!l.vedette) delete br[v]; else br[v] = voulu;
    });
    this.garderBrouillon();
    this.rendrePublier(); this.rendreVues(); this.rendreListe();
  };
  VueFlux.prototype.nbChanges = function () { return Object.keys(this.brouillon()).length; };
  VueFlux.prototype.nbChoisis = function () { var self = this; return (this.rep && this.rep.lignes || []).filter(function (l) { return l.etat !== 'exclu' && self.choisi(l); }).length; };

  /* ---- Publier : enregistrer les choix, puis récrire la feuille que Merchant Center lit ---- */
  VueFlux.prototype.publier = function () {
    var self = this, cie = this.cie || 'BMW', br = this.brouillon();
    var aj = Object.keys(br).filter(function (v) { return br[v] === true; }), re = Object.keys(br).filter(function (v) { return br[v] === false; });
    var b = this.btnPublier; if (b) { b.disabled = true; b.textContent = 'Publication…'; }
    var envoyer = function (vins, choix) {
      if (!vins.length) return Promise.resolve();
      return AMX.post({ action: 'fluxGoogleChoix', compagnie: cie, vins: vins, choix: choix }, { secours: false, delai: 60000 }).then(function (r) {
        if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Refusé');
        if (!r.message && r.vehicules) throw new Error(SCRIPT_PAS_A_JOUR);
      });
    };
    return envoyer(aj, 'vedette').then(function () { return envoyer(re, ''); }).then(function () {
      return AMX.post({ action: 'fluxGoogleFeuille', compagnie: cie, op: 'ecrire', relire: true }, { secours: false, delai: 120000 });
    }).then(function (r) {
      if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'La feuille n\'a pas pu être écrite.');
      var nPublies = self.nbChoisis();   // compté avec les choix, avant de vider le brouillon (la liste n'est pas encore relue)
      self._br = {}; self.garderBrouillon();
      self.publieLe = Date.now(); self.aRepublier = false;
      var m = r.merchant || {}, suite = m.ok && m.maintenant ? 'Google relit la feuille maintenant : les annonces changent d\'ici une heure environ.'
        : (m.message || 'Google affiche les changements demain matin.');
      AMX.toast('Publié : ' + nPublies + ' véhicule' + (nPublies > 1 ? 's' : '') + ' annoncé' + (nPublies > 1 ? 's' : '') + '. ' + suite, m.ok === false && m.branche ? 'attention' : 'ok', 10000);
      return self.charger(true);
    }).catch(function (e) {
      AMX.toast('Publication pas terminée : ' + AMX.erreurTexte(e) + ' Vos choix sont gardés : réessayez.', 'erreur', 10000);
      self.rendrePublier();
    });
  };

  /* ---- Aperçu : à quoi ressemblent les annonces des véhicules cochés ---- */
  VueFlux.prototype.annonce = function (l) {
    var d = this.rep || {}, g = l.google || {};
    var titre = g.title || l.vehicule || '';
    var km = l.km !== null && l.km !== undefined ? AMX.fmtNombre(l.km) + ' km' : '';
    var genre = l.genre === 'neuf' ? 'Neuf' : l.genre === 'demo' ? 'Démonstrateur' : 'Occasion';
    return h('div.fgv-annonce', [
      h('div.img', [l.photo ? h('img', { src: l.photo, alt: '', loading: 'lazy' }) : null, h('span.pub', { text: 'Annonce' })]),
      h('div.corps', [h('div.prix', { text: argent(l.prix) }), h('div.titre', { text: titre }), h('div.km', { text: [km, genre].filter(Boolean).join(' · ') }),
        h('div.vend', [document.createTextNode(d.nom || ''), h('span', { text: ' · en magasin' })])])
    ]);
  };
  VueFlux.prototype.apercu = function (liste) {
    var self = this;
    var corps = h('div', [
      h('p.fgv-apercu-note', { text: 'Aperçu approximatif : Google choisit lui-même la mise en page selon l\'endroit (Recherche, Google Maps, YouTube…). La photo, le prix, le titre et le kilométrage sont ceux que la feuille envoie à Google. Le vrai aperçu : Google Ads › la campagne › Groupe de composants › « Aperçu ».' }),
      liste.length ? h('div.fgv-apercus', liste.slice(0, 60).map(function (l) {
        var a = self.annonce(l); a.style.cursor = 'pointer'; a.title = 'Voir ce que Google reçoit pour ce véhicule';
        a.onclick = function () { self.apercuUn(l); }; return a;
      })) : h('div.fgv-vide', { text: 'Aucun véhicule coché.' }),
      liste.length > 60 ? h('p.mini', { text: 'Les 60 premiers sur ' + liste.length + '.' }) : null
    ]);
    AMX.modale({ titre: 'Aperçu des annonces (' + liste.length + ')', corps: corps, large: true, boutons: [{ texte: 'Fermer' }] });
  };
  VueFlux.prototype.apercuUn = function (l) {
    var g = l.google || {};
    var rangs = [['Titre', g.title], ['Prix', g.price], ['Kilométrage', g.mileage], ['État', g.condition], ['Année', g.year], ['Marque', g.brand], ['Modèle', g.model], ['Version', g.trim], ['Couleur', g.color], ['Carrosserie', g.body_style], ['Moteur', g.engine], ['Disponibilité', g.availability], ['Lien', g.link], ['Photos', 1 + String(g.additional_image_link || '').split(',').filter(Boolean).length]];
    AMX.modale({ titre: l.vehicule || 'Aperçu', corps: h('div', [
      h('div', { style: { maxWidth: '300px' } }, [this.annonce(l)]),
      h('div.fgv-annonce-envoi', [h('b', 'Ce que la feuille envoie à Google'), h('table', [h('tbody', rangs.filter(function (r) { return r[1] !== undefined && r[1] !== ''; }).map(function (r) {
        return h('tr', [h('td', { text: r[0] }), h('td', r[0] === 'Lien' ? [h('a', { href: r[1], target: '_blank', rel: 'noopener', text: 'Voir la fiche sur le site' })] : { text: String(r[1]) })]);
      }))])])
    ]), boutons: [{ texte: 'Fermer' }] });
  };

  VueFlux.prototype.lireSite = function () {
    var self = this, cie = this.cie || 'BMW', b = this.btnLire, total = 0, tours = 0;
    b.disabled = true;
    var tour = function () {
      tours++; b.textContent = 'Lecture du site… (' + total + ' fiches)';
      return AMX.post({ action: 'fluxGoogleLire', compagnie: cie }, { secours: false, delai: 330000 }).then(function (r) {
        if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Refusé');
        if (r.fiches === undefined && r.vehicules) throw new Error(SCRIPT_PAS_A_JOUR);
        total += r.lus || 0;
        if (r.restants > 0 && tours < 6) return tour();
        AMX.toast(total + ' fiche' + (total > 1 ? 's' : '') + ' lue' + (total > 1 ? 's' : '') + ' sur le site (' + r.fiches + ' au total).', 'ok');
      });
    };
    tour().then(function () { return self.charger(true); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 8000); }).then(function () { b.disabled = false; b.textContent = 'Relire le site de la concession'; });
  };
  VueFlux.prototype.retirerOuRemettre = function (vin, choix, raison) {
    var self = this, cie = this.cie || 'BMW';
    return AMX.post({ action: 'fluxGoogleChoix', compagnie: cie, vins: [vin], choix: choix, raison: raison || '' }, { secours: false }).then(function (r) {
      if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Refusé');
      AMX.toast(r.message + ' Cliquez « Publier sur Google » pour l\'envoyer.', 'ok', 7000);
      self.aRepublier = true;
      return self.charger(true);
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 8000); });
  };
  VueFlux.prototype.codeEtablissement = function () {
    var self = this, d = this.rep || {}, cie = this.cie || 'BMW';
    var inp = h('input.saisie', { type: 'text', value: (d.reglage && d.reglage.storeCode) || '', placeholder: 'ex. BMWSHERB' });
    AMX.modale({ titre: 'Code d\'établissement Google — ' + (d.nom || cie), corps: h('div', [
      h('p.mini', { text: 'Google relie chaque annonce à la fiche Google de la concession par ce code (« store code »), inscrit dans le profil d\'établissement Google (Infos › Code de magasin). Copiez-le ici, exactement pareil (majuscules comprises).' }),
      h('label.champ', [h('span', 'Code d\'établissement'), inp])]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
        return AMX.post({ action: 'fluxGoogleReglages', compagnie: cie, storeCode: inp.value.trim() }, { secours: false }).then(function (r) {
          if (!r || r.ok === false || r.refuse) throw new Error((r && r.erreur) || 'Refusé'); AMX.toast('Code enregistré.', 'ok'); return self.charger(true);
        }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
      } }] });
  };
  /* Le fichier pour Merchant Center : les véhicules prêts et à compléter (pas les exclus), colonnes de Google, séparées par des tabulations. */
  VueFlux.prototype.telecharger = function () {
    var d = this.rep; if (!d || !d.lignes) return;
    var col = d.colonnes || [], lignes = d.lignes.filter(function (l) { return l.google && l.etat !== 'exclu'; });
    var net = function (x) { return String(x === null || x === undefined ? '' : x).replace(/[\t\r\n]+/g, ' '); };
    var tsv = [col.join('\t')].concat(lignes.map(function (l) { return col.map(function (k) { return net(l.google[k]); }).join('\t'); })).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8' }));
    a.download = 'flux-google-' + (d.compagnie || 'BMW').toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.tsv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    AMX.toast(lignes.length + ' véhicules dans le fichier.', 'ok', 6000);
  };

  /* La feuille Google que Merchant Center lit chaque jour (FluxGoogle.gs, FGV_feuille) : création et partage, une fois. */
  VueFlux.prototype.feuille = function (corps, ok) {
    var self = this;
    corps.action = 'fluxGoogleFeuille'; corps.compagnie = corps.compagnie || this.cie || 'BMW';
    return AMX.post(corps, { secours: false, delai: 120000 }).then(function (r) {
      if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Refusé');
      if (!r.message && r.vehicules) throw new Error(SCRIPT_PAS_A_JOUR);
      AMX.toast(r.message || ok || 'Fait.', 'ok', 6000); return self.charger(true);
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 9000); return false; });
  };
  VueFlux.prototype.carteFeuille = function (d) {
    var self = this, f = d.feuille, el = h('div.fgv-feuille');
    var etapes = h('details', [h('summary', { text: 'Dans Merchant Center (une seule fois)' }), h('ol', [
      h('li', { text: 'Partagez la feuille avec le compte Google qui ouvre Merchant Center (ci-dessous).' }),
      h('li', { text: 'Merchant Center › Produits › Sources de données › Ajouter une source › Google Sheets › « Feuille existante » : collez le lien de la feuille.' }),
      h('li', { text: 'Pays : Canada, langue : français ; programme « Annonces de véhicules ».' }),
      h('li', { text: 'Récupération : tous les jours, vers 7 h (ScanAutomax récrit la feuille après 5 h et à chaque « Publier »).' })])]);
    if (!f) {
      var bC = h('button.btn.primaire', { type: 'button', text: 'Créer la feuille', disabled: !!d.jamaisLu, onclick: function () { bC.disabled = true; bC.textContent = 'Création…'; self.feuille({ op: 'creer' }).then(function () { bC.disabled = false; bC.textContent = 'Créer la feuille'; }); } });
      el.appendChild(h('div.tete', [h('b', 'Feuille Google pour Merchant Center'), h('span.m', { text: d.jamaisLu ? 'Lisez d\'abord le site, puis créez la feuille.' : 'Merchant Center lira chaque jour une feuille Google que ScanAutomax récrit tous les matins et à chaque « Publier ».' }), bC]));
      return el;
    }
    el.appendChild(h('div.tete', [h('b', 'Feuille Google pour Merchant Center'),
      h('span.m', { text: (f.n || 0) + ' véhicule' + ((f.n || 0) > 1 ? 's' : '') + ' · récrite ' + (f.le ? 'le ' + AMX.fmtDate(f.le, true) : 'jamais') + ' · mise à jour chaque matin et à chaque « Publier »' }),
      h('a.btn', { href: f.url, target: '_blank', rel: 'noopener', text: 'Ouvrir la feuille' })]));
    if (f.erreur) el.appendChild(h('div.err', { text: f.erreur }));
    var parts = h('div.partages', [h('span', { text: (f.partages || []).length ? 'Partagée avec :' : 'Pas encore partagée.' })].concat((f.partages || []).map(function (q) {
      return h('span.puce-p', [h('span', { text: q.courriel + (q.role === 'writer' ? ' (éditeur)' : ' (lecture)') }),
        d.peutPartager ? h('button', { type: 'button', title: 'Retirer l\'accès', 'aria-label': 'Retirer l\'accès de ' + q.courriel, text: '×', onclick: function () { AMX.confirmer ? AMX.confirmer('Retirer l\'accès de ' + q.courriel + ' à la feuille ?').then(function (oui) { if (oui) self.feuille({ op: 'retirer', courriel: q.courriel }); }) : self.feuille({ op: 'retirer', courriel: q.courriel }); } }) : null]);
    })));
    el.appendChild(parts);
    if (d.peutPartager) {
      var inp = h('input.saisie', { type: 'email', placeholder: 'Courriel du compte Google de Merchant Center' });
      var ed = h('input', { type: 'checkbox' });
      var bP = h('button.btn', { type: 'button', text: 'Partager', onclick: function () {
        var c = inp.value.trim(); if (!c) { inp.focus(); return; }
        bP.disabled = true; self.feuille({ op: 'partager', courriel: c, editeur: ed.checked }).then(function () { bP.disabled = false; });
      } });
      el.appendChild(h('div.ajout', [inp, h('label', { title: 'Seulement si Merchant Center refuse de lire la feuille en lecture seule' }, [ed, ' éditeur']), bP]));
    } else el.appendChild(h('p.mini', { text: 'La propriétaire ou le directeur général partage la feuille avec le compte de Merchant Center.' }));
    el.appendChild(etapes);
    return el;
  };

  /* 12 nov. : Merchant Center relit la feuille dès « Publier » (MerchantCenter.gs). Branché une fois par la propriétaire ou le DG :
     activer « Merchant API » dans la console Google Cloud, puis « Brancher Merchant Center » (lien ouvert connecté comme mallard@). */
  VueFlux.prototype.merchant = function (op) {
    var self = this, cie = this.cie || 'BMW', fen = null;
    if (op === 'lien') { try { fen = window.open('', '_blank'); } catch (e) { fen = null; } }   // ouverte dans le clic, sinon le navigateur la bloque
    return AMX.post({ action: 'fluxGoogleReglages', compagnie: cie, merchant: op }, { secours: false, delai: 120000 }).then(function (r) {
      if (!r || r.refuse || r.ok === false) {
        if (fen) try { fen.close(); } catch (e2) {}
        if (r && r.merchant && self.rep) self.rep.merchant = r.merchant;
        throw new Error((r && (r.erreur || r.message)) || 'Refusé');
      }
      if (!r.message && !r.url && r.vehicules) throw new Error(SCRIPT_PAS_A_JOUR);
      if (op === 'lien') {
        if (fen) fen.location = r.url; else window.open(r.url, '_blank');
        AMX.toast(r.message || 'Autorisez l\'accès dans la page qui vient de s\'ouvrir.', 'ok', 12000);
        return null;
      }
      AMX.toast(r.message || 'Fait.', r.plusTard ? 'attention' : 'ok', 9000);
      return self.charger(true);
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 10000); if (self.rep) self.rendre(); return false; });
  };
  VueFlux.prototype.carteMerchant = function (d) {
    var self = this, m = d.merchant, el = h('div.fgv-feuille.fgv-merchant');
    if (!m) return h('span');
    var etat, detail = [];
    if (m.branche) {
      etat = 'Branché : Google relit la feuille dès « Publier sur Google ».';
      detail.push('Compte Merchant Center ' + m.compte + (m.sourceNom ? ' · source « ' + m.sourceNom + ' »' : '') + (m.autorisePar ? ' · accès de ' + m.autorisePar : ''));
      detail.push(m.derniere ? 'Dernière relecture : ' + AMX.fmtDate(m.derniere, true) + ' (' + m.nJour + ' aujourd\'hui sur ' + m.maxJour + ')' : 'Pas encore de relecture demandée.');
      if (m.aRelire) detail.push('Prochaine relecture : ' + AMX.fmtDate(m.aRelire, true) + ' (au plus une par ' + m.delaiMin + ' minutes).');
    } else if (m.autorise) {
      etat = 'Accès autorisé, mais la source de Merchant Center n\'est pas encore trouvée : « Vérifier le branchement ».';
    } else etat = 'Pas branché : Merchant Center lit la feuille une fois par jour (7 h), donc les changements paraissent le lendemain.';
    var tete = [h('b', 'Relecture tout de suite par Google (Merchant Center)'), h('span.m', { text: etat })];
    el.appendChild(h('div.tete', tete));
    detail.forEach(function (t) { el.appendChild(h('div.mini', { text: t })); });
    if (m.erreur) el.appendChild(h('div.err', { text: m.erreur + (m.erreurLe ? ' (' + AMX.fmtDate(m.erreurLe, true) + ')' : '') }));
    var bt = [];
    if (m.branche) {
      var bR = h('button.btn', { type: 'button', text: 'Faire relire maintenant', onclick: function () { bR.disabled = true; self.merchant('relire').then(function () { bR.disabled = false; }); } });
      bt.push(bR);
    }
    if (m.peutBrancher) {
      bt.push(h('button.btn' + (m.autorise ? '' : '.primaire'), { type: 'button', text: m.autorise ? 'Rebrancher (nouvel accès)' : 'Brancher Merchant Center', onclick: function () { self.merchant('lien'); } }));
      if (m.autorise) {
        var bV = h('button.btn', { type: 'button', text: 'Vérifier le branchement', onclick: function () { bV.disabled = true; bV.textContent = 'Vérification…'; self.merchant('verifier').then(function () { bV.disabled = false; bV.textContent = 'Vérifier le branchement'; }); } });
        bt.push(bV);
        bt.push(h('button.btn.fantome', { type: 'button', text: 'Oublier l\'accès', onclick: function () {
          var go = function () { self.merchant('oublier'); };
          if (AMX.confirmer) AMX.confirmer('Oublier l\'accès à Merchant Center ? Google relira alors la feuille seulement chaque matin.').then(function (oui) { if (oui) go(); }); else go();
        } }));
      }
    } else if (!m.autorise) el.appendChild(h('p.mini', { text: 'La propriétaire ou le directeur général branche Merchant Center (une fois).' }));
    if (bt.length) el.appendChild(h('div.ajout', bt));
    if (m.peutBrancher && !m.branche) el.appendChild(h('details', [h('summary', { text: 'Comment brancher (une seule fois)' }), h('ol', [
      h('li', { text: 'Console Google Cloud, projet « My Project Reviews » › API et services › Bibliothèque › « Merchant API » › Activer.' }),
      h('li', { text: '« Brancher Merchant Center » : dans la page qui s\'ouvre, choisissez le compte mallard@groupeautomax.com (administrateur de Merchant Center), cochez tout, Autoriser.' }),
      h('li', { text: 'ScanAutomax inscrit son projet auprès de Merchant Center et trouve la source qui lit la feuille. Si la page dit d\'attendre 5 minutes : « Vérifier le branchement » ensuite.' })])]));
    return el;
  };

  /* ---- La page ---- */
  VueFlux.prototype.vueParDefaut = function () {
    var d = this.rep || {}, n = d.compte || {};
    return (n.vedettes || this.nbChanges()) ? 'choisis' : (n.suggestions ? 'proposes' : 'prets');
  };
  VueFlux.prototype.dansVue = function (l, vue) {
    if (vue === 'exclus') return l.etat === 'exclu';
    if (l.etat === 'exclu') return false;
    if (vue === 'choisis') return this.choisi(l) || this.change(l);   /* un véhicule décoché reste visible jusqu'à « Publier » */
    if (vue === 'proposes') return !!l.suggestion;
    return true;
  };
  VueFlux.prototype.filtrer = function () {
    var self = this, f = this.f, d = this.rep || {};
    return (d.lignes || []).filter(function (l) {
      if (!self.dansVue(l, f.vue)) return false;
      if (f.genre && l.genre !== f.genre) return false;
      if (f.q && !AMX.correspond([l.vehicule, l.stock, vinDe(l), l.couleur, GENRES[l.genre]], f.q)) return false;
      return true;
    });
  };
  VueFlux.prototype.rendre = function () {
    var self = this, d = this.rep || {}, f = this.f;
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.cie, onchange: function (c) { if (AMX.choisirCompagnie) AMX.choisirCompagnie(c); self.cie = c || 'BMW'; self.f.vue = ''; self.charger(false); } });
    AMX.vider(this.elCorps);
    var est = d.prepare === false;
    this.btnLire.style.display = est ? 'none' : ''; this.btnFichier.style.display = est || !d.lignes || !d.lignes.length ? 'none' : '';
    this.elSous.textContent = est ? 'Pas encore préparé pour cette concession.' : 'Cochez les véhicules à annoncer, puis « Publier sur Google ».' + (d.sitemapsLe ? ' Site de ' + (d.nom || 'la concession') + ' lu le ' + AMX.fmtDate(d.sitemapsLe, true) + '.' : '');
    if (est) {
      this.elCorps.appendChild(h('div.fgv-vide', [h('p', { text: 'Les annonces Google commencent avec BMW Sherbrooke.' }), h('button.btn.primaire', { type: 'button', text: 'Voir BMW Sherbrooke', onclick: function () { self.cie = 'BMW'; if (AMX.choisirCompagnie) AMX.choisirCompagnie('BMW'); self.charger(false); } })]));
      return;
    }
    (d.manque || []).forEach(function (m) { self.elCorps.appendChild(h('div.fgv-avis', [h('b', 'À faire : '), m + ' ', h('button.btn.petit', { type: 'button', text: 'Poser le code', onclick: function () { self.codeEtablissement(); } })])); });
    if (!d.feuille) this.elCorps.appendChild(this.carteFeuille(d));
    if (d.jamaisLu) { this.elCorps.appendChild(h('div.fgv-vide', [h('p', { text: 'Le site n\'a pas encore été lu.' }), h('button.btn.primaire', { type: 'button', text: 'Lire le site de ' + (d.nom || 'la concession'), onclick: function () { self.lireSite(); } })])); return; }
    this.nettoyerBrouillon();
    if (!f.vue) f.vue = this.vueParDefaut();
    this.elPublier = h('div.fgv-publier'); this.elCorps.appendChild(this.elPublier); this.rendrePublier();
    this.elCampagne = h('div'); this.elCorps.appendChild(this.elCampagne); this.rendreCampagne();
    var q = h('input.saisie.recherche', { type: 'search', placeholder: 'Rechercher : modèle, # stock, NIV, couleur…', value: f.q });
    q.addEventListener('input', AMX.debounce ? AMX.debounce(function () { f.q = q.value.trim(); self.rendreListe(); }, 200) : function () { f.q = q.value.trim(); self.rendreListe(); });
    var selG = h('select.saisie', { onchange: function (e) { f.genre = e.target.value; self.rendreVues(); self.rendreListe(); } }, [h('option', { value: '', text: 'Neufs, démos et occasions' })].concat(Object.keys(GENRES).map(function (k) { return h('option', { value: k, text: GENRES[k] + 's', selected: f.genre === k }); })));
    this.elVues = h('div.fgv-vues');
    this.elCorps.appendChild(h('div.fgv-filtres', [this.elVues, q, selG]));
    this.rendreVues();
    this.elListe = h('div'); this.elCorps.appendChild(this.elListe);
    this.rendreListe();
    if (d.feuille) this.elCorps.appendChild(h('details.fgv-reglages', [h('summary', { text: 'Réglages : feuille Google, Merchant Center, partage et code d\'établissement (faits une fois)' }), this.carteMerchant(d), this.carteFeuille(d),
      h('button.btn', { type: 'button', text: 'Code d\'établissement Google…', onclick: function () { self.codeEtablissement(); } })]));
  };
  VueFlux.prototype.rendrePublier = function () {
    if (!this.elPublier) return;
    var self = this, d = this.rep || {}, f = d.feuille || {}, nC = this.nbChoisis(), nX = this.nbChanges();
    AMX.vider(this.elPublier);
    var etat;
    if (nX) etat = h('span.attente', { text: nX + ' changement' + (nX > 1 ? 's' : '') + ' pas encore publié' + (nX > 1 ? 's' : '') });
    else if (this.aRepublier) etat = h('span.attente', { text: 'À republier' });
    else etat = h('span.ajour', { text: 'Tout est publié' + (f.le ? ' (' + AMX.fmtDate(f.le, true) + ')' : '') });
    var conseil = nC < VISER.min ? 'Visez ' + VISER.min + ' à ' + VISER.max + ' véhicules.' : nC > VISER.max * 1.5 ? 'C\'est beaucoup pour le budget : visez ' + VISER.min + ' à ' + VISER.max + '.' : ((d.merchant && d.merchant.branche) ? 'Google relit la feuille dès que vous publiez (une heure environ).' : 'Google affiche les changements le lendemain matin.');
    this.elPublier.appendChild(h('div.compte', [h('div', [h('b', { text: nC + ' véhicule' + (nC > 1 ? 's' : '') + ' annoncé' + (nC > 1 ? 's' : '') }), document.createTextNode(' · '), etat]), h('div.exp', { text: conseil })]));
    var choisis = (d.lignes || []).filter(function (l) { return l.etat !== 'exclu' && self.choisi(l); });
    this.btnPublier = h('button.btn.primaire.gros', { type: 'button', text: nX ? 'Publier sur Google (' + nX + ')' : 'Publier sur Google', disabled: !d.feuille, title: d.feuille ? '' : 'Créez d\'abord la feuille Google', onclick: function () { self.publier(); } });
    this.elPublier.appendChild(h('div.boutons', [h('button.btn.gros', { type: 'button', text: 'Aperçu des annonces', onclick: function () { self.apercu(choisis); } }), this.btnPublier]));
  };
  /* La campagne Google Ads se publie une fois ; ensuite, ce bouton suffit. Le rappel se cache sur l'appareil (« C'est fait »). */
  VueFlux.prototype.rendreCampagne = function () {
    if (!this.elCampagne) return;
    var self = this, cg = COMPTES_GOOGLE[this.cie || 'BMW'], cle = 'fgv_campagne_ok_' + (this.cie || 'BMW');
    AMX.vider(this.elCampagne);
    if (!cg || (AMX.memo && AMX.memo.lire(cle, false))) return;
    this.elCampagne.appendChild(h('div.fgv-campagne', [h('span', { text: 'Première fois seulement : la campagne « ' + cg.campagne + ' » doit être publiée dans Google Ads (elle dépense dès qu\'elle l\'est). Ensuite, « Publier sur Google » suffit.' }),
      h('a.btn.petit', { href: 'https://ads.google.com/aw/campaigns?ocid=' + cg.ocid, target: '_blank', rel: 'noopener', text: 'Ouvrir Google Ads' }),
      h('button.btn.petit.fantome', { type: 'button', text: 'C\'est fait', onclick: function () { if (AMX.memo) AMX.memo.ecrire(cle, true); self.rendreCampagne(); } })]));
  };
  VueFlux.prototype.rendreVues = function () {
    if (!this.elVues) return;
    var self = this, f = this.f, d = this.rep || {};
    AMX.vider(this.elVues);
    VUES.forEach(function (v) {
      var n = (d.lignes || []).filter(function (l) { return self.dansVue(l, v[0]) && (!f.genre || l.genre === f.genre); }).length;
      if (v[0] === 'exclus' && !n) return;
      self.elVues.appendChild(h('button' + (f.vue === v[0] ? '.actif' : ''), { type: 'button', onclick: function () { f.vue = v[0]; self.rendreVues(); self.rendreListe(); } }, [document.createTextNode(v[1]), h('span.n', { text: String(n) })]));
    });
  };
  VueFlux.prototype.rendreListe = function () {
    var self = this, d = this.rep || {}, liste = this.filtrer();
    AMX.vider(this.elListe);
    if (this.f.vue === 'proposes') {
      var aCocher = liste.filter(function (l) { return !self.choisi(l); });
      this.elListe.appendChild(h('div.fgv-bloc-prop', [h('span', { text: 'Proposés : ' + (d.regles ? 'occasions en stock depuis ' + d.regles.joursOccasion + ' jours et plus, neufs depuis ' + d.regles.joursNeuf + ' jours et plus, et démos' : 'en stock depuis longtemps, et démos') + ', avec assez de photos.' }),
        aCocher.length ? h('button.btn.petit', { type: 'button', text: 'Cocher les ' + aCocher.length, onclick: function () { self.basculer(aCocher, true); } }) : null]));
    }
    if (!liste.length) { this.elListe.appendChild(h('div.fgv-vide', { text: this.f.vue === 'choisis' ? 'Aucun véhicule annoncé : cochez-en dans « Proposés » ou « Tous les véhicules ».' : 'Aucun véhicule ici.' })); return; }
    this.elListe.appendChild(h('div.fgv-liste', liste.slice(0, 300).map(function (l) { return self.ligne(l); })));
    if (liste.length > 300) this.elListe.appendChild(h('p.mini', { text: 'Les 300 premiers sur ' + liste.length + ' : précisez la recherche.' }));
    if ((d.absents || []).length && this.f.vue === 'prets' && !this.f.q) {
      this.elListe.appendChild(h('div.fgv-groupe', { text: 'Dans notre stock, mais pas sur le site (' + d.absents.length + ')' }));
      this.elListe.appendChild(h('p.mini', { text: 'Ces véhicules ne peuvent pas être annoncés tant qu\'ils n\'ont pas leur fiche sur le site de la concession (D2C).' }));
      this.elListe.appendChild(h('div.fgv-liste', d.absents.slice(0, 60).map(function (a) {
        return h('div.fgv-ligne.exclu', [h('div'), h('div.sans', { text: a.quoi === 'neuf' ? 'Neuf' : 'Occasion' }), h('div.t', [h('b', { text: a.modele || 'Véhicule' }), h('div.m', { text: (a.stock ? '# ' + a.stock + ' · ' : '') + a.vin + (a.statut ? ' · ' + a.statut : '') })]), h('div.d')]);
      })));
    }
  };
  VueFlux.prototype.ligne = function (l) {
    var self = this, vin = vinDe(l), exclu = l.etat === 'exclu' || !vin, on = !exclu && this.choisi(l), chg = !exclu && this.change(l);
    var img = l.photo ? h('img', { src: l.photo, alt: '', loading: 'lazy' }) : h('div.sans', { text: 'sans photo' });
    var meta = [GENRES[l.genre] || '', l.stock ? '# ' + l.stock : '', l.km !== null && l.km !== undefined ? AMX.fmtNombre(l.km) + ' km' : '', l.couleur || '', l.jours !== null && l.jours !== undefined ? l.jours + ' j en stock' : '', l.nbPhotos ? l.nbPhotos + ' photos' : ''].filter(Boolean).join(' · ');
    var textes = [h('b', { text: l.vehicule || ('Fiche ' + l.id) }), h('div.m', { text: meta })];
    if ((l.problemes || []).length) textes.push(h('div.pb.' + l.etat, { text: l.problemes.join(' · ') }));
    if (l.suggestion && !on) textes.push(h('span.prop', { text: 'Proposé : ' + l.suggestion }));
    if (chg) textes.push(h('span.chg', { text: on ? 'sera annoncé à la publication' : 'sera retiré à la publication' }));
    var coche = h('button.fgv-coche' + (on ? '.on' : ''), { type: 'button', disabled: exclu, 'aria-pressed': on ? 'true' : 'false', 'aria-label': (on ? 'Ne plus annoncer ' : 'Annoncer ') + (l.vehicule || ''), title: exclu ? 'Ne peut pas être annoncé' : (on ? 'Décocher : ne plus annoncer' : 'Cocher : annoncer sur Google'), text: on ? '✓' : '',
      onclick: function (e) { e.stopPropagation(); self.basculer([l]); } });
    var menu = [{ texte: 'Aperçu de l\'annonce', action: function () { self.apercuUn(l); } }, { texte: 'Voir la fiche sur le site', action: function () { window.open(l.url, '_blank', 'noopener'); } }];
    if (vin && !l.retire) menu.push({ texte: 'Retirer complètement du flux…', action: function () {
      var inp = h('input.saisie', { type: 'text', placeholder: 'Pourquoi ? (ex. réservé, en réparation)' });
      AMX.modale({ titre: 'Retirer du flux Google', corps: h('div', [h('p.mini', { text: l.vehicule + ' ne sera envoyé à Google d\'aucune façon, même s\'il reste sur le site.' }), inp]), boutons: [{ texte: 'Annuler' }, { texte: 'Retirer', classe: 'primaire', action: function () { return self.retirerOuRemettre(vin, 'retire', inp.value.trim()); } }] });
    } });
    if (vin && l.retire) menu.push({ texte: 'Remettre dans le flux', action: function () { self.retirerOuRemettre(vin, ''); } });
    var droite = [l.prix ? h('div.prix', { text: argent(l.prix) }) : null];
    if (l.etat !== 'pret') droite.push(h('span.fgv-pastille.' + l.etat, { text: ETATS[l.etat] || l.etat }));
    if (AMX.menuActions) droite.push(AMX.menuActions(menu, { petit: true }));
    var el = h('div.fgv-ligne' + (on ? '.choisi' : '') + (chg ? '.change' : '') + (exclu ? '.exclu' : ''), [coche, img, h('div.t', textes), h('div.d', droite)]);
    if (!exclu) el.addEventListener('click', function (e) { if (e.target.closest('button, a, .menu-actions, [role="menu"]')) return; self.basculer([l]); });
    return el;
  };

  AMX.fluxGoogle = { charger: charger, peutVoir: peutVoir, compteur: compteur, vider: function () { cache = {}; } };
  AMX.section('fluxgoogle', {
    titre: 'Annonces Google', icone: 'voiture', ordre: 36,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new VueFlux(conteneur, ctx); }
  });
})();
