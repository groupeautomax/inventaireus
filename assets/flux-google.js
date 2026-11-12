/* =====================================================================================================
   flux-google.js — Marketing › Annonces Google (12 nov. 2026, ESSAI : rien n'est envoyé à Google)

   Maxime : « es-tu capable de créer un Google inventory booster avec l'inventaire qu'on a » → « ok on commence avec BMW » →
   « un menu marketing dans l'app et le site ; choisir les unités qu'on veut mettre de l'avant dans Google, ou l'AI ? ».
   Le flux des annonces de véhicules de Google (Merchant Center, « vehicle ads ») bâti à partir du SITE de la concession :
   chaque fiche de véhicule du site (prix affiché, photos, lien) vérifiée dans ScanAutomax (FluxGoogle.gs).
   - Tous les véhicules prêts vont dans le flux ; « Mettre de l'avant » pose l'étiquette « vedette » (custom_label_2) que la
     campagne Google peut favoriser. Le système PROPOSE (âge du stock, démos, assez de photos), une personne coche.
   - « Retirer du flux » (ex. réservé) ; « Télécharger le flux » = le fichier pour Merchant Center (TSV).
   Routes : GET ?fluxGoogle=1&compagnie= ; POST fluxGoogleLire, fluxGoogleChoix, fluxGoogleReglages.
   12 nov. (soir, v340) — Maxime : « j'en ai choisi 21 mais comment je commence la publication, tu devrais mieux bâtir cette
   feuille ». En tête de page, « Démarrer les annonces » : les 4 étapes dans l'ordre (choisir · feuille · Merchant Center ·
   campagne Google Ads) avec leur état et le bon bouton. Après un choix, la feuille du flux se récrit d'elle-même 6 s plus
   tard (plus de bouton à chercher). Le partage de la feuille (fait une fois) passe au bas de la page.
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez la version qui contient FluxGoogle.gs.';
  var CSS = [
    '.fgv-page .fgv-avis { border: 1px solid var(--ambre); background: var(--ambre-bg, #fff6e5); border-radius: 10px; padding: 10px 14px; margin: 0 0 12px; font-size: 14px; }',
    '.fgv-page .fgv-essai { border: 1px solid var(--bleu); background: var(--bleu-bg); color: var(--encre); border-radius: 10px; padding: 10px 14px; margin: 0 0 12px; font-size: 14px; }',
    '.fgv-page .fgv-tuiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 0 0 14px; }',
    '.fgv-tuile { border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 12px 14px; text-align: left; cursor: pointer; font: inherit; color: var(--encre); }',
    '.fgv-tuile b { display: block; font-size: 26px; line-height: 1.1; } .fgv-tuile span { font-size: 13px; color: var(--encre-3); }',
    '.fgv-tuile.actif { border-color: var(--vert); box-shadow: 0 0 0 2px var(--vert) inset; } .fgv-tuile.vert b { color: var(--vert-fonce); } .fgv-tuile.ambre b { color: var(--ambre); } .fgv-tuile.rouge b { color: var(--rouge); } .fgv-tuile.violet b { color: #6d28d9; }',
    '.fgv-filtres { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 10px; } .fgv-filtres .saisie.recherche { flex: 1 1 260px; max-width: 420px; }',
    '.fgv-liste { display: flex; flex-direction: column; gap: 8px; }',
    '.fgv-ligne { display: grid; grid-template-columns: 96px 1fr auto; gap: 12px; align-items: center; border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 10px 12px; }',
    '.fgv-ligne.vedette { border-color: #6d28d9; box-shadow: 0 0 0 1px #6d28d9 inset; } .fgv-ligne.exclu { opacity: .72; }',
    '.fgv-ligne img { width: 96px; height: 64px; object-fit: cover; border-radius: 8px; background: var(--fond); } .fgv-ligne .sans { width: 96px; height: 64px; border-radius: 8px; background: var(--fond); display: grid; place-items: center; font-size: 12px; color: var(--encre-3); }',
    '.fgv-ligne .t b { font-size: 15px; } .fgv-ligne .t .m { font-size: 13px; color: var(--encre-3); margin-top: 2px; } .fgv-ligne .t .pb { font-size: 13px; margin-top: 4px; }',
    '.fgv-ligne .pb.exclu { color: var(--rouge); } .fgv-ligne .pb.completer { color: var(--ambre); } .fgv-ligne .pb.note { color: var(--encre-3); }',
    '.fgv-ligne .prop { display: inline-block; margin-top: 4px; font-size: 12px; font-weight: 700; color: #6d28d9; background: #f1ebff; border-radius: 999px; padding: 2px 9px; }',
    '.fgv-ligne .d { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; text-align: right; } .fgv-ligne .prix { font-size: 16px; font-weight: 800; }',
    '.fgv-pastille { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 2px 9px; } .fgv-pastille.pret { background: var(--vert-clair); color: var(--vert-fonce); } .fgv-pastille.completer { background: #fff1d6; color: var(--ambre); } .fgv-pastille.exclu { background: #fde2e2; color: var(--rouge); }',
    '.fgv-etoile { border: 1px solid #6d28d9; color: #6d28d9; background: #fff; border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; } .fgv-etoile.on { background: #6d28d9; color: #fff; }',
    '.fgv-groupe { margin: 18px 0 8px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--encre-2); }',
    '.fgv-vide { padding: 30px; text-align: center; color: var(--encre-3); }',
    '.fgv-feuille { border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 12px 14px; margin: 0 0 14px; font-size: 14px; }',
    '.fgv-feuille .tete { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; } .fgv-feuille .tete b { font-size: 15px; } .fgv-feuille .tete .m { color: var(--encre-3); flex: 1 1 260px; }',
    '.fgv-feuille .partages { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 10px; } .fgv-feuille .puce-p { background: var(--fond); border: 1px solid var(--ligne); border-radius: 999px; padding: 3px 4px 3px 10px; font-size: 13px; display: inline-flex; gap: 6px; align-items: center; }',
    '.fgv-feuille .puce-p button { border: 0; background: none; cursor: pointer; font-size: 15px; line-height: 1; color: var(--encre-3); padding: 0 4px; } .fgv-feuille .ajout { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; } .fgv-feuille .ajout .saisie { flex: 1 1 240px; max-width: 340px; }',
    '.fgv-feuille details { margin-top: 10px; } .fgv-feuille details summary { cursor: pointer; font-weight: 700; color: var(--encre-2); } .fgv-feuille ol { margin: 8px 0 0 18px; padding: 0; } .fgv-feuille li { margin: 4px 0; } .fgv-feuille .err { color: var(--ambre); margin-top: 6px; }',
    '.fgv-demarrer { border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 14px 16px 6px; margin: 0 0 14px; }',
    '.fgv-demarrer h2 { font-size: 17px; margin: 0 0 4px; } .fgv-demarrer > p { font-size: 13px; color: var(--encre-3); margin: 0 0 6px; }',
    '.fgv-pas { display: grid; grid-template-columns: 34px 1fr auto; gap: 4px 12px; align-items: center; padding: 12px 0; border-top: 1px solid var(--ligne); }',
    '.fgv-pas .num { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 14px; background: var(--fond); color: var(--encre-2); border: 2px solid var(--ligne); }',
    '.fgv-pas.ok .num { background: var(--vert); border-color: var(--vert); color: #fff; } .fgv-pas.alerte .num { border-color: var(--ambre); color: var(--ambre); } .fgv-pas.cours .num { border-color: var(--bleu); color: var(--bleu); }',
    '.fgv-pas .txt b { font-size: 15px; } .fgv-pas .txt .exp { font-size: 13px; color: var(--encre-3); margin-top: 2px; } .fgv-pas.alerte .txt b { color: var(--ambre); }',
    '.fgv-pas .act { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }',
    '.fgv-reglages { margin: 18px 0 0; } .fgv-reglages > summary { cursor: pointer; font-weight: 700; color: var(--encre-2); margin: 0 0 10px; }',
    '@media (max-width: 640px) { .fgv-pas { grid-template-columns: 34px 1fr; } .fgv-pas .act { grid-column: 2; justify-content: flex-start; } }',
    '@media (max-width: 640px) { .fgv-ligne { grid-template-columns: 72px 1fr; } .fgv-ligne img, .fgv-ligne .sans { width: 72px; height: 50px; } .fgv-ligne .d { grid-column: 1 / -1; flex-direction: row; justify-content: space-between; align-items: center; } }'
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
  var VISER = { min: 20, max: 40 };   /* nombre de véhicules à mettre de l'avant conseillé pour une campagne d'environ 50 $ par jour */
  var GENRES = { neuf: 'Neuf', demo: 'Démo', occasion: 'Occasion' };
  var ETATS = { pret: 'Prêt pour Google', completer: 'À compléter', exclu: 'Exclu' };

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

  function VueFlux(conteneur, ctx) {
    css();
    var self = this;
    this.conteneur = conteneur; this.detruit = false;
    this.cie = (AMX.compagnieChoisie && AMX.compagnieChoisie('inventaire')) || 'BMW';
    this.f = { q: '', genre: '', etat: '', quoi: '' };
    AMX.vider(conteneur);
    this.btnLire = h('button.btn.primaire', { type: 'button', text: 'Lire le site maintenant', onclick: function () { self.lireSite(); } });
    this.btnFichier = h('button.btn', { type: 'button', text: 'Télécharger le flux (fichier Google)', onclick: function () { self.telecharger(); } });
    this.btnCode = h('button.btn', { type: 'button', text: 'Code d\'établissement Google…', onclick: function () { self.codeEtablissement(); } });
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    this.elSous = h('p');
    conteneur.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Annonces Google'), this.elSous]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnFichier, this.btnCode, this.btnLire], [this.btnLire]))
    ]));
    this.elCies = h('div.barre-cies'); conteneur.appendChild(this.elCies);
    this.elCorps = h('div.fgv-page'); conteneur.appendChild(this.elCorps);
    this.surCie = function (e) { self.cie = (e.detail && e.detail.compagnie) || 'BMW'; self.charger(false); };
    document.addEventListener('amx:compagnie', this.surCie);
    this.charger(false);
  }
  VueFlux.prototype.demonter = function () {
    this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie);
    if (this.minuterieFeuille) this.ecrireFeuilleAuto();   /* des choix pas encore écrits : on les écrit avant de partir */
  };
  VueFlux.prototype.charger = function (force) {
    var self = this, cie = this.cie || 'BMW';
    if (!cache[cie]) { AMX.vider(this.elCorps); this.elCorps.appendChild(AMX.chargeur('Annonces Google')); }
    return charger(cie, force).then(function (d) { if (self.detruit || cie !== (self.cie || 'BMW')) return; self.rep = d; self.rendre(); }).catch(function (e) {
      if (self.detruit) return; AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.fgv-vide', { text: AMX.erreurTexte(e) }));
    });
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
    tour().then(function () { return self.charger(true); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 8000); }).then(function () { b.disabled = false; b.textContent = 'Lire le site maintenant'; });
  };
  VueFlux.prototype.choisir = function (vins, choix, raison) {
    var self = this, cie = this.cie || 'BMW';
    return AMX.post({ action: 'fluxGoogleChoix', compagnie: cie, vins: vins, choix: choix, raison: raison || '' }, { secours: false }).then(function (r) {
      if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Refusé');
      if (!r.message && r.vehicules) throw new Error(SCRIPT_PAS_A_JOUR);
      AMX.toast(r.message, 'ok');
      if (choix === 'vedette' && self.f.quoi === 'suggestions') self.f.quoi = 'vedettes';   /* les proposés passent dans « mis de l'avant » : on les y suit */
      if (self.rep && self.rep.feuille) self.planifierFeuille();
      return self.charger(true);
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 8000); });
  };
  /* v340 : après un choix, la feuille que Merchant Center lit se récrit d'elle-même. On attend 6 s sans nouveau choix
     (on coche souvent plusieurs véhicules de suite), puis une seule écriture. Si la page est quittée avant, on écrit tout de suite. */
  VueFlux.prototype.planifierFeuille = function () {
    var self = this;
    clearTimeout(this.minuterieFeuille);
    this.cieFeuille = this.cie || 'BMW';
    this.etatFeuille = 'attente'; this.rendreDemarrer();
    this.minuterieFeuille = setTimeout(function () { self.ecrireFeuilleAuto(); }, 6000);
  };
  VueFlux.prototype.ecrireFeuilleAuto = function () {
    var self = this;
    clearTimeout(this.minuterieFeuille); this.minuterieFeuille = null;
    if (this.etatFeuille === 'ecriture') { this.reecrire = true; return; }
    this.etatFeuille = 'ecriture'; this.rendreDemarrer();
    this.feuille({ op: 'ecrire', compagnie: this.cieFeuille || this.cie || 'BMW' }, 'Feuille Google à jour.').then(function () {
      self.etatFeuille = ''; self.feuilleEcriteLe = Date.now();
      if (self.reecrire) { self.reecrire = false; self.planifierFeuille(); return; }
      self.rendreDemarrer();
    });
  };
  /* Les 4 étapes pour que les véhicules choisis paraissent dans Google, avec leur état. */
  VueFlux.prototype.rendreDemarrer = function () {
    if (!this.elDemarrer) return;
    var self = this, d = this.rep || {}, f = d.feuille, n = d.compte || {}, nV = n.vedettes || 0, nP = n.suggestions || 0;
    var cg = COMPTES_GOOGLE[this.cie || 'BMW'] || null;
    var pas = function (num, etat, titre, exp, actions) {
      return h('div.fgv-pas.' + etat, [h('div.num', { text: etat === 'ok' ? '✓' : String(num) }), h('div.txt', [h('b', { text: titre }), h('div.exp', { text: exp })]), h('div.act', actions || [])]);
    };
    var voir = function (quoi) { self.f.quoi = quoi; self.f.etat = ''; self.rendre(); if (self.elListe) self.elListe.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    var lien = function (texte, url, primaire) { return h('a.btn' + (primaire ? '.primaire' : '') + '.petit', { href: url, target: '_blank', rel: 'noopener', text: texte }); };
    AMX.vider(this.elDemarrer);
    this.elDemarrer.appendChild(h('h2', 'Démarrer les annonces'));
    this.elDemarrer.appendChild(h('p', { text: 'Seuls les véhicules mis de l\'avant sont annoncés. Les 4 étapes, dans l\'ordre :' }));
    /* 1. Choisir */
    var e1 = nV >= VISER.min ? 'ok' : nV > 0 ? 'alerte' : 'afaire';
    var t1 = nV ? nV + ' véhicule' + (nV > 1 ? 's' : '') + ' mis de l\'avant' : 'Choisir les véhicules à annoncer';
    var x1 = nV > VISER.max * 1.5 ? 'C\'est beaucoup : le budget se répartit sur trop de véhicules. Visez ' + VISER.min + ' à ' + VISER.max + '.'
      : 'Visez ' + VISER.min + ' à ' + VISER.max + ' véhicules (environ 30 pour 50 $ par jour). Les proposés sont en stock depuis longtemps ou des démos, avec assez de photos.';
    var a1 = [];
    if (nP) a1.push(h('button.btn.petit' + (nV ? '' : '.primaire'), { type: 'button', text: 'Voir les proposés (' + nP + ')', onclick: function () { voir('suggestions'); } }));
    if (nV) a1.push(h('button.btn.petit', { type: 'button', text: 'Voir les mis de l\'avant', onclick: function () { voir('vedettes'); } }));
    this.elDemarrer.appendChild(pas(1, e1, t1, x1, a1));
    /* 2. Feuille */
    var e2, t2, x2, a2 = [];
    if (!f) { e2 = 'afaire'; t2 = 'Créer la feuille Google du flux'; x2 = 'Une seule fois : « Créer la feuille » juste en dessous, puis la partager avec le compte de Merchant Center.'; }
    else if (this.etatFeuille === 'attente') { e2 = 'cours'; t2 = 'Vos choix partent dans la feuille dans quelques secondes…'; x2 = 'Continuez de cocher : une seule écriture suivra.'; a2.push(h('button.btn.petit', { type: 'button', text: 'Écrire tout de suite', onclick: function () { self.ecrireFeuilleAuto(); } })); }
    else if (this.etatFeuille === 'ecriture') { e2 = 'cours'; t2 = 'Écriture de la feuille Google…'; x2 = 'Environ 15 secondes.'; }
    else {
      e2 = 'ok'; t2 = 'Feuille Google à jour';
      x2 = (f.n || 0) + ' véhicules · récrite ' + (f.le ? 'le ' + AMX.fmtDate(f.le, true) : '') + '. Elle se récrit d\'elle-même après chaque choix et chaque matin.';
      if (f.url) a2.push(lien('Ouvrir la feuille', f.url));
      a2.push(h('button.btn.petit', { type: 'button', text: 'Écrire maintenant', onclick: function () { self.ecrireFeuilleAuto(); } }));
    }
    this.elDemarrer.appendChild(pas(2, e2, t2, x2, a2));
    /* 3. Merchant Center */
    this.elDemarrer.appendChild(pas(3, 'info', 'Google relit la feuille chaque matin à 7 h',
      'Pour que vos choix comptent aujourd\'hui : Merchant Center › Paramètres › Sources de données › « Mettre à jour » sur la feuille.',
      cg ? [lien('Ouvrir Merchant Center', 'https://merchants.google.com/mc/products/sources?a=' + cg.merchant)] : []));
    /* 4. Campagne */
    this.elDemarrer.appendChild(pas(4, 'info', 'Publier la campagne dans Google Ads (une seule fois)',
      (cg ? 'La campagne « ' + cg.campagne + ' » est prête : ' : '') + 'Google Ads › Campagnes › le brouillon › « Publier la campagne ». Elle dépense dès qu\'elle est publiée. Ensuite, rien à refaire : vos choix ici suffisent, Google suit la feuille.',
      cg ? [lien('Ouvrir Google Ads', 'https://ads.google.com/aw/campaigns?ocid=' + cg.ocid, true)] : []));
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
    AMX.toast(lignes.length + ' véhicules dans le fichier. Rien n\'est envoyé à Google.', 'ok', 6000);
  };

  /* 12 nov. : la feuille Google que Merchant Center lit chaque jour (FluxGoogle.gs, FGV_feuille). */
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
      h('li', { text: 'Récupération : tous les jours, vers 7 h (ScanAutomax récrit la feuille après 5 h).' })])]);
    if (!f) {
      var bC = h('button.btn.primaire', { type: 'button', text: 'Créer la feuille', disabled: !!d.jamaisLu, onclick: function () { bC.disabled = true; bC.textContent = 'Création…'; self.feuille({ op: 'creer' }).then(function () { bC.disabled = false; bC.textContent = 'Créer la feuille'; }); } });
      el.appendChild(h('div.tete', [h('b', 'Feuille Google pour Merchant Center'), h('span.m', { text: d.jamaisLu ? 'Lisez d\'abord le site, puis créez la feuille.' : 'Merchant Center lira chaque jour une feuille Google que ScanAutomax récrit tous les matins. Rien n\'est envoyé à Google : c\'est Merchant Center qui vient lire.' }), bC]));
      return el;
    }
    var bE = h('button.btn', { type: 'button', text: 'Écrire la feuille maintenant', onclick: function () { bE.disabled = true; self.feuille({ op: 'ecrire' }).then(function () { bE.disabled = false; }); } });
    el.appendChild(h('div.tete', [h('b', 'Feuille Google pour Merchant Center'),
      h('span.m', { text: (f.n || 0) + ' véhicule' + ((f.n || 0) > 1 ? 's' : '') + ' · récrite ' + (f.le ? 'le ' + AMX.fmtDate(f.le, true) : 'jamais') + ' · mise à jour chaque matin' }),
      h('a.btn', { href: f.url, target: '_blank', rel: 'noopener', text: 'Ouvrir la feuille' }), bE]));
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
  VueFlux.prototype.filtrer = function () {
    var f = this.f, d = this.rep || {};
    return (d.lignes || []).filter(function (l) {
      if (f.genre && l.genre !== f.genre) return false;
      if (f.etat && l.etat !== f.etat) return false;
      if (f.quoi === 'vedettes' && !l.vedette) return false;
      if (f.quoi === 'suggestions' && !l.suggestion) return false;
      if (f.q && !AMX.correspond([l.vehicule, l.stock, l.google && l.google.vin, l.couleur, GENRES[l.genre]], f.q)) return false;
      return true;
    });
  };
  VueFlux.prototype.rendre = function () {
    var self = this, d = this.rep || {}, f = this.f;
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.cie, onchange: function (c) { if (AMX.choisirCompagnie) AMX.choisirCompagnie(c); self.cie = c || 'BMW'; self.charger(false); } });
    AMX.vider(this.elCorps);
    var est = d.prepare === false;
    this.btnLire.style.display = est ? 'none' : ''; this.btnFichier.style.display = est || !d.lignes || !d.lignes.length ? 'none' : '';
    this.elSous.textContent = est ? 'Pas encore préparé pour cette concession.' : (d.nom || '') + (d.sitemapsLe ? ' · site lu le ' + AMX.fmtDate(d.sitemapsLe, true) : '') + ' · les véhicules mis de l\'avant sont annoncés sur Google';
    if (est) {
      this.elCorps.appendChild(h('div.fgv-vide', [h('p', { text: 'L\'essai commence avec BMW Sherbrooke.' }), h('button.btn.primaire', { type: 'button', text: 'Voir BMW Sherbrooke', onclick: function () { self.cie = 'BMW'; if (AMX.choisirCompagnie) AMX.choisirCompagnie('BMW'); self.charger(false); } })]));
      return;
    }
    (d.manque || []).forEach(function (m) { self.elCorps.appendChild(h('div.fgv-avis', [h('b', 'À faire : '), m + ' ', h('button.btn.petit', { type: 'button', text: 'Poser le code', onclick: function () { self.codeEtablissement(); } })])); });
    this.elDemarrer = h('div.fgv-demarrer'); this.elCorps.appendChild(this.elDemarrer); this.rendreDemarrer();
    if (!d.feuille) this.elCorps.appendChild(this.carteFeuille(d));
    if (d.jamaisLu) { this.elCorps.appendChild(h('div.fgv-vide', [h('p', { text: 'Le site n\'a pas encore été lu.' }), h('button.btn.primaire', { type: 'button', text: 'Lire le site de ' + (d.nom || 'la concession'), onclick: function () { self.lireSite(); } })])); return; }
    var n = d.compte || {};
    var tuile = function (cle, val, lib, ton) {
      var actif = (cle === f.etat) || (cle === f.quoi);
      return h('button.fgv-tuile.' + ton + (actif ? '.actif' : ''), { type: 'button', onclick: function () {
        if (cle === 'vedettes' || cle === 'suggestions') { f.quoi = f.quoi === cle ? '' : cle; f.etat = ''; } else { f.etat = f.etat === cle ? '' : cle; f.quoi = ''; }
        self.rendre();
      } }, [h('b', { text: String(val || 0) }), h('span', { text: lib })]);
    };
    this.elCorps.appendChild(h('div.fgv-tuiles', [
      tuile('pret', n.pret, 'prêts pour Google', 'vert'), tuile('completer', n.completer, 'à compléter', 'ambre'), tuile('exclu', n.exclu, 'exclus', 'rouge'),
      tuile('vedettes', n.vedettes, 'mis de l\'avant', 'violet'), tuile('suggestions', n.suggestions, 'proposés à mettre de l\'avant', 'violet')
    ]));
    var q = h('input.saisie.recherche', { type: 'search', placeholder: 'Rechercher : modèle, # stock, NIV, couleur…', value: f.q });
    q.addEventListener('input', AMX.debounce ? AMX.debounce(function () { f.q = q.value.trim(); self.rendreListe(); }, 200) : function () { f.q = q.value.trim(); self.rendreListe(); });
    var selG = h('select.saisie', { onchange: function (e) { f.genre = e.target.value; self.rendreListe(); } }, [h('option', { value: '', text: 'Neufs, démos et occasions' })].concat(Object.keys(GENRES).map(function (k) { return h('option', { value: k, text: GENRES[k] + 's', selected: f.genre === k }); })));
    this.elCorps.appendChild(h('div.fgv-filtres', [q, selG]));
    this.elListe = h('div'); this.elCorps.appendChild(this.elListe);
    this.rendreListe();
    if ((d.absents || []).length && !f.etat && !f.quoi) {
      this.elCorps.appendChild(h('div.fgv-groupe', { text: 'Dans notre stock, mais pas sur le site (' + d.absents.length + ')' }));
      this.elCorps.appendChild(h('p.mini', { text: 'Ces véhicules ne peuvent pas être annoncés tant qu\'ils n\'ont pas leur fiche sur le site de la concession (D2C).' }));
      this.elCorps.appendChild(h('div.fgv-liste', d.absents.slice(0, 60).map(function (a) {
        return h('div.fgv-ligne', [h('div.sans', { text: a.quoi === 'neuf' ? 'Neuf' : 'Occasion' }), h('div.t', [h('b', { text: a.modele || 'Véhicule' }), h('div.m', { text: (a.stock ? '# ' + a.stock + ' · ' : '') + a.vin + (a.statut ? ' · ' + a.statut : '') })]), h('div.d')]);
      })));
    }
    /* La feuille et son partage se règlent une fois : au bas de la page, repliés. */
    if (d.feuille) this.elCorps.appendChild(h('details.fgv-reglages', [h('summary', { text: 'Feuille Google et partage (réglé une fois)' }), this.carteFeuille(d)]));
  };
  VueFlux.prototype.rendreListe = function () {
    var self = this, d = this.rep || {}, liste = this.filtrer();
    AMX.vider(this.elListe);
    var props = liste.filter(function (l) { return l.suggestion; });
    if (this.f.quoi === 'suggestions' && props.length) {
      this.elListe.appendChild(h('div.fgv-avis', [h('span', { text: props.length + ' véhicule' + (props.length > 1 ? 's' : '') + ' proposé' + (props.length > 1 ? 's' : '') + ' : en stock depuis longtemps (' + (d.regles ? d.regles.joursOccasion + ' j et plus pour une occasion, ' + d.regles.joursNeuf + ' j et plus pour un neuf' : '') + ') ou démonstrateurs, avec assez de photos. ' }),
        h('button.btn.petit.primaire', { type: 'button', text: 'Mettre les ' + props.length + ' de l\'avant', onclick: function () { self.choisir(props.map(function (l) { return l.google.vin; }).filter(Boolean), 'vedette'); } })]));
    }
    if (!liste.length) { this.elListe.appendChild(h('div.fgv-vide', { text: 'Aucun véhicule ici.' })); return; }
    this.elListe.appendChild(h('div.fgv-liste', liste.slice(0, 300).map(function (l) { return self.ligne(l); })));
    if (liste.length > 300) this.elListe.appendChild(h('p.mini', { text: 'Les 300 premiers sur ' + liste.length + ' : précisez la recherche.' }));
  };
  VueFlux.prototype.ligne = function (l) {
    var self = this, vin = l.google && l.google.vin;
    var img = l.photo ? h('img', { src: l.photo, alt: '', loading: 'lazy' }) : h('div.sans', { text: 'sans photo' });
    var meta = [GENRES[l.genre] || '', l.stock ? '# ' + l.stock : '', vin || '', l.km !== null && l.km !== undefined ? AMX.fmtNombre(l.km) + ' km' : '', l.couleur || '', l.jours !== null && l.jours !== undefined ? l.jours + ' j en stock' : '', l.nbPhotos ? l.nbPhotos + ' photos' : ''].filter(Boolean).join(' · ');
    var textes = [h('b', { text: l.vehicule || ('Fiche ' + l.id) }), h('div.m', { text: meta })];
    if ((l.problemes || []).length) textes.push(h('div.pb.' + l.etat, { text: l.problemes.join(' · ') }));
    if ((l.notes || []).length) textes.push(h('div.pb.note', { text: l.notes.join(' · ') }));
    if (l.suggestion) textes.push(h('span.prop', { text: 'Proposé : ' + l.suggestion }));
    var actions = [];
    if (vin && l.etat !== 'exclu') actions.push(h('button.fgv-etoile' + (l.vedette ? '.on' : ''), { type: 'button', title: l.vedette ? 'Ne plus mettre de l\'avant' : 'Mettre ce véhicule de l\'avant dans Google', text: l.vedette ? '★ Mis de l\'avant' : '☆ Mettre de l\'avant', onclick: function () { self.choisir([vin], l.vedette ? '' : 'vedette'); } }));
    var menu = [{ texte: 'Voir la fiche sur le site', action: function () { window.open(l.url, '_blank', 'noopener'); } }];
    if (vin && !l.retire) menu.push({ texte: 'Retirer du flux…', action: function () {
      var inp = h('input.saisie', { type: 'text', placeholder: 'Pourquoi ? (ex. réservé, en réparation)' });
      AMX.modale({ titre: 'Retirer du flux Google', corps: h('div', [h('p.mini', { text: l.vehicule + ' ne sera pas annoncé sur Google, même s\'il reste sur le site.' }), inp]), boutons: [{ texte: 'Annuler' }, { texte: 'Retirer', classe: 'primaire', action: function () { return self.choisir([vin], 'retire', inp.value.trim()); } }] });
    } });
    if (vin && l.retire) menu.push({ texte: 'Remettre dans le flux', action: function () { self.choisir([vin], ''); } });
    if (AMX.menuActions) actions.push(AMX.menuActions(menu, { petit: true }));
    return h('div.fgv-ligne.' + l.etat + (l.vedette ? '.vedette' : ''), [img, h('div.t', textes), h('div.d', [
      l.prix ? h('div.prix', { text: AMX.fmtArgent ? AMX.fmtArgent(l.prix) : l.prix + ' $' }) : null,
      h('span.fgv-pastille.' + l.etat, { text: ETATS[l.etat] || l.etat }), h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, actions)])]);
  };

  AMX.fluxGoogle = { charger: charger, peutVoir: peutVoir, compteur: compteur, vider: function () { cache = {}; } };
  AMX.section('fluxgoogle', {
    titre: 'Annonces Google', icone: 'voiture', ordre: 36,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new VueFlux(conteneur, ctx); }
  });
})();
