/* =========================================================================
   Section « Avis » : suivi des avis Google du groupe (8 octobre 2026).

   Trois onglets :
     Aperçu   — note et nombre d'avis par concession (relevé quotidien d'Avis.gs),
                nouveaux avis 7 / 30 jours, négatifs, à traiter, rang face aux
                concurrents (Concurrence.gs), et les statistiques PAR PERSONNE
                (demande de Maxime) : qui envoie des demandes d'avis, qui reçoit
                quelles notes (sondages et avis Google attribués).
     Avis     — la liste des avis, filtres (concession, note, état, personne),
                état interne (nouveau → réglé), RESPONSABLE (le compte qui
                répond ou rappelle le client) et CRÉDITÉS (les comptes concernés,
                choisis parmi les comptes de la concession, filtre Vente / Service),
                « Mes avis » pour chacun.
     Sondages — les demandes d'avis envoyées aux clients (texto / courriel) et
                le bouton « Demander un avis » (livraison, fin de service).

   Règles (Maxime, 7 oct.) : le sondage part à TOUS les clients, le lien Google
   est montré à TOUS (jamais de filtrage selon la note) ; une note ≤ 3 alerte
   les directeurs (courriel + texto) pour rappeler le client dans l'heure.

   Attribution à des utilisateurs (Maxime, 8 oct. soir) : les comptes viennent
   de la feuille Utilisateurs avec leur rôle et leur département (Role.gs ›
   ROLES_ : vendeur, direction des ventes, service, direction service, BDC…) ;
   chaque personne voit ses avis (responsable ou crédité) et ses statistiques.

   Routes serveur (AvisSuivi.gs) :
     GET  ?avis=1     POST avisEtat, avisAssigner, avisEmployes, sondageCreer

   Avis Google en direct (15 oct. 2026, AvisApi.gs — API Business Profile
   approuvée par Google) : tous les avis des 8 fiches arrivent par l'API
   (relevé horaire), et la RÉPONSE se fait d'ici — brouillon gardé, texte
   proposé selon la note et la langue (« Suggérer »), « Publier sur Google »,
   « Retirer ». Réservé aux gestionnaires, directions, admins et marketing
   (le serveur tranche). Un admin peut lancer « Relever maintenant ».
     POST avisBrouillon { id, brouillon | suggerer }, avisRepondre { id, texte },
          avisRetirerReponse { id }, avisRelever { mode }
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, esc = AMX.esc, I = AMX.icones;

  I.avis = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/></svg>';
  I.etoile = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/></svg>';

  var ETATS = {
    nouveau:    { libelle: 'Nouveau',      couleur: 'bleu' },
    a_repondre: { libelle: 'À répondre',   couleur: 'rouge' },
    assigne:    { libelle: 'Assigné',      couleur: 'ambre' },
    brouillon:  { libelle: 'Brouillon',    couleur: 'violet' },
    repondu:    { libelle: 'Répondu',      couleur: 'vert' },
    regle:      { libelle: 'Réglé',        couleur: 'gris' }
  };
  var A_TRAITER = { nouveau: 1, a_repondre: 1, assigne: 1, brouillon: 1 };
  var SEUIL = 3;   // réglable dans Admin › Réglages des avis (le serveur renvoie seuilNegatif)
  var DEP_NOMS = { direction: 'Direction', ventes: 'Ventes', service: 'Service', pieces: 'Pièces', marketing: 'Marketing', administration: 'Administration' };
  var DEP_COULEUR = { direction: 'sombre', ventes: 'vert', service: 'ambre', pieces: 'ambre', marketing: 'violet', administration: 'gris' };
  function puceDep(dep) { return dep ? h('span.puce.avis-dep.avis-dep-' + (DEP_COULEUR[dep] || 'gris'), { text: DEP_NOMS[dep] || dep }) : null; }
  function deTypeDep(dep, type) {   // un compte est-il du bon département pour un avis / sondage de ce type ?
    if (!type) return true;
    if (type === 'service') return dep === 'service' || dep === 'pieces';
    return dep === 'ventes' || dep === '' || dep === 'direction';
  }
  function libelleUtilisateur(u) { return u.nom + (u.roleLibelle ? ' · ' + u.roleLibelle : (u.role ? ' · ' + u.role : '')); }
  // Vente ou service ? Selon le département de la fiche Google (AvisFiches, réglable dans Admin), sinon d'après son nom.
  function typeDeFiche(d, nomFiche) {
    var f = (d && d.fiches || []).filter(function (x) { return x.nom === nomFiche; })[0];
    var dep = f ? String(f.departement || '') : '';
    if (dep) return dep === 'service' || dep === 'pieces' ? 'service' : 'vente';
    return /service|pi[eè]ces/i.test(String(nomFiche || '')) ? 'service' : 'vente';
  }

  function injecterCss() {
    if (document.getElementById('css-avis')) return;
    var s = document.createElement('style');
    s.id = 'css-avis';
    s.textContent = [
      '.avis-page .carte { margin-bottom: 14px; overflow: hidden; }',
      '.avis-page .carte-entete h2 { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }',
      '.avis-page .carte-entete h2 .sous { font-weight: 400; font-size: 12px; color: var(--encre-3); }',
      '.avis-page .defile { overflow-x: auto; }',
      '.avis-page .tableau { border: none; border-radius: 0; box-shadow: none; }',
      '.avis-etoiles { display: inline-flex; gap: 1px; color: #F5B301; vertical-align: -2px; }',
      '.avis-etoiles svg { width: 14px; height: 14px; }',
      '.avis-etoiles svg.eteinte { color: var(--ligne-forte); }',
      '.avis-etoiles.grand svg { width: 18px; height: 18px; }',
      '.avis-note { font-weight: 700; font-variant-numeric: tabular-nums; }',
      '.avis-pos { color: var(--vert); } .avis-neg { color: var(--rouge); }',
      '.avis-liste { display: flex; flex-direction: column; gap: 10px; }',
      '.avis-carte { background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); padding: 14px 16px; display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 14px; }',
      '.avis-carte.negatif { border-left: 3px solid var(--rouge); }',
      '.avis-carte .haut { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }',
      '.avis-carte .auteur { font-weight: 600; font-size: 13.5px; }',
      '.avis-carte .meta { color: var(--encre-3); font-size: 12px; }',
      '.avis-carte .texte { font-size: 13.5px; line-height: 1.5; color: var(--encre-2); white-space: pre-wrap; }',
      '.avis-carte .texte.vide-texte { color: var(--encre-4); font-style: italic; }',
      '.avis-carte .reponse { margin-top: 10px; padding: 10px 12px; background: var(--carte-2); border-radius: var(--rayon-s); font-size: 12.5px; line-height: 1.5; border-left: 3px solid var(--vert); }',
      '.avis-carte .reponse .l { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin-bottom: 4px; }',
      '.avis-carte .reponse .l .ed { margin-left: 8px; font-weight: 500; letter-spacing: 0; text-transform: none; font-size: 11px; }',
      '.avis-carte .reponse-edit { margin-top: 10px; padding: 10px 12px; border: 1px dashed var(--ligne-forte); border-radius: var(--rayon-s); background: var(--carte-2); }',
      '.avis-carte .reponse-edit .l { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin-bottom: 6px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }',
      '.avis-carte .reponse-edit textarea { width: 100%; min-height: 88px; font: inherit; font-size: 13px; line-height: 1.45; padding: 8px 10px; border: 1px solid var(--ligne); border-radius: var(--rayon-s); background: var(--carte); color: var(--encre); resize: vertical; box-sizing: border-box; }',
      '.avis-carte .reponse-edit .actions-ligne { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }',
      '.avis-carte .reponse-edit .compte { margin-left: auto; font-size: 11px; color: var(--encre-4); }',
      '.avis-plus-ligne { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 14px 0 6px; }',
      '.retrait-modale .avis-cite { padding: 10px 12px; border-left: 3px solid var(--ligne); background: var(--fond-2, #f6f7f9); border-radius: var(--rayon-s); font-size: 13px; }',
      '.retrait-modale .champ { margin: 10px 0; } .retrait-modale textarea.saisie { width: 100%; box-sizing: border-box; font: inherit; }',
      '.retrait-modale .retrait-texte { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.45; }',
      '.retrait-dossier { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--ligne); }',
      '.retrait-dossier .l { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--encre-2); margin-bottom: 6px; }',
      '.retrait-voie { padding: 8px 10px; margin-bottom: 8px; border: 1px solid var(--ligne); border-radius: var(--rayon-s); }',
      '.retrait-voie.recommande { border-color: var(--vert, #0a7f4a); background: var(--vert-bg, #ecf7f1); }',
      '.retrait-voie-tete { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .retrait-voie .btn { white-space: nowrap; }',
      '.retrait-etapes { margin: 6px 0 0 0; padding-left: 20px; font-size: 12.5px; line-height: 1.45; color: var(--encre-2); } .retrait-etapes li { margin: 3px 0; } .retrait-etapes b { color: var(--encre); }',
      '.retrait-mode { margin: 8px 0 10px; padding: 8px 10px; border-radius: var(--rayon-s); background: var(--fond-2, #f6f7f9); font-size: 12.5px; line-height: 1.45; color: var(--encre-2); }',
      '.retrait-suivi { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .retrait-suivi input.saisie { flex: 1; min-width: 200px; }',
      '.avis-retrait.actif { border-color: var(--ambre, #b7791f); color: var(--ambre, #b7791f); }',
      '.avis-api-barre { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; padding: 8px 12px; border: 1px solid var(--ligne); border-radius: var(--rayon-s); background: var(--carte-2); font-size: 12.5px; color: var(--encre-2); }',
      '.avis-api-barre .pt { width: 8px; height: 8px; border-radius: 50%; background: var(--vert); box-shadow: 0 0 0 3px var(--vert-clair); }',
      '.avis-api-barre .btn { margin-left: auto; }',
      '.avis-carte .cote { display: flex; flex-direction: column; gap: 8px; border-left: 1px solid var(--ligne); padding-left: 14px; }',
      '.avis-carte .cote .champ > label { font-size: 10.5px; }',
      '.avis-carte .cote select { height: 30px; font-size: 12.5px; }',
      '.avis-employes { display: flex; gap: 4px; flex-wrap: wrap; min-height: 22px; }',
      '.avis-employes .puce.moi { background: var(--vert-clair); color: var(--vert); border-color: transparent; }',
      '.puce.avis-dep { border-color: transparent; }',
      '.puce.avis-dep-vert { background: var(--vert-clair); color: var(--vert); }',
      '.puce.avis-dep-ambre { background: var(--ambre-bg); color: var(--ambre); }',
      '.puce.avis-dep-violet { background: #efe9fb; color: #6b3fd1; }',
      '.puce.avis-dep-sombre { background: var(--noir-2); color: #fff; }',
      '.avis-choix { display: grid; gap: 6px; max-height: 340px; overflow: auto; }',
      '.avis-choix label.champ.inline { cursor: pointer; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--ligne); border-radius: var(--rayon-s); margin: 0; }',
      '.avis-choix label.champ.inline.coche { border-color: var(--vert); background: var(--vert-clair); }',
      '.avis-choix-outils { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }',
      '.avis-choix-outils input.saisie { flex: 1 1 160px; height: 32px; }',
      '.avis-personnes-outils { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }',
      '.avis-filtres { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }',
      '.avis-filtres input.saisie { width: 220px; height: 32px; }',
      '.avis-filtres select.saisie { width: auto; height: 32px; }',
      '.avis-fiches { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }',
      '.avis-fiche { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 10px 12px; background: var(--carte-2); }',
      '.avis-fiche .n { font-size: 12.5px; font-weight: 600; margin-bottom: 4px; }',
      '.avis-fiche .v { display: flex; gap: 8px; align-items: baseline; font-size: 12px; color: var(--encre-3); flex-wrap: wrap; }',
      '.avis-fiche .v b { color: var(--encre); font-size: 15px; }',
      '.avis-moi { background: var(--vert-clair) !important; }',
      '.avis-ligne-neg td:first-child { box-shadow: inset 3px 0 0 var(--rouge); }',
      '.avis-repere { font-size: 11px; color: var(--encre-4); }',
      '@media (max-width: 860px) { .avis-carte { grid-template-columns: 1fr; } .avis-carte .cote { border-left: none; padding-left: 0; border-top: 1px solid var(--ligne); padding-top: 10px; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ----------------------------- Cache (AMX.avis) ---------------------------- */
  var cache = { reponse: null, quand: 0 };
  var promesse = null;
  AMX.avis = {
    enCache: function () { return cache.reponse; },
    charger: function (force) {
      if (!force && cache.reponse && Date.now() - cache.quand < 60000) return Promise.resolve(cache.reponse);
      // v100 : un rechargement forcé après une écriture ne se contente pas d'un chargement déjà en vol (parti AVANT l'écriture,
      // il ramènerait la liste d'avant — p. ex. un avis sans sa réponse fraîchement publiée) : il en relance un après.
      if (promesse) return force ? promesse.then(function () { return AMX.avis.charger(true); }, function () { return AMX.avis.charger(true); }) : promesse;
      promesse = AMX.get({ avis: 1 }, { copie: 'avis', secours: false }).then(function (d) {
        AMX.verifier(d, 'Suivi des avis indisponible');
        if (d.seuilNegatif >= 1 && d.seuilNegatif <= 4) SEUIL = Number(d.seuilNegatif);
        cache.reponse = d; cache.quand = Date.now(); cache.copieLe = 0; promesse = null;
        document.dispatchEvent(new CustomEvent('amx:avis'));
        return d;
      }, function (e) { promesse = null; throw e; });
      return promesse;
    },
    invalider: function () { cache.quand = 0; },
    // 16 oct. (Google lent) : la dernière réponse gardée dans le navigateur (gzip), affichée en attendant le serveur.
    copie: function () {
      if (cache.reponse) return Promise.resolve({ donnees: cache.reponse, quand: cache.copieLe || 0 });
      return AMX.cacheLocal.lireGz('avis', 7 * 86400000).then(function (o) {
        if (!o || !o.donnees || !o.donnees.stats || cache.reponse) return null;
        cache.reponse = o.donnees; cache.quand = 0; cache.copieLe = o.quand;
        return { donnees: o.donnees, quand: o.quand };
      });
    },
    copieLe: function () { return cache.copieLe || 0; }
  };

  function etoiles(n, grand) {
    var z = h('span.avis-etoiles' + (grand ? '.grand' : ''), { title: n + ' / 5' });
    for (var i = 1; i <= 5; i++) { var s = AMX.svg('etoile'); if (i > n) s.classList.add('eteinte'); z.appendChild(s); }
    return z;
  }
  function nomDe(courriel) {
    var d = cache.reponse; var c = String(courriel || '').toLowerCase();
    if (!c) return '';
    if (d && d.utilisateurs) for (var i = 0; i < d.utilisateurs.length; i++) if (d.utilisateurs[i].courriel === c) return d.utilisateurs[i].nom;
    return c.split('@')[0].replace(/[._-]/g, ' ');
  }
  function nomConcession(code) { return AMX.COMPAGNIES_TOUTES[code] || code || '—'; }
  function fmtTel(t) { var d = String(t || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + '-' + d.slice(6) : String(t || ''); }
  function fmtNote(n) { return n === null || n === undefined || isNaN(n) ? '—' : Number(n).toFixed(n >= 10 ? 0 : 2).replace('.', ','); }
  function fmtNote1(n) { return n === null || n === undefined || isNaN(n) ? '—' : Number(n).toFixed(1).replace('.', ','); }
  function signe(n) { if (n === null || n === undefined || isNaN(n)) return ''; return (n > 0 ? '+' : '') + String(Math.round(n * 100) / 100).replace('.', ','); }
  function badgeEtat(etat) { var e = ETATS[etat] || { libelle: etat, couleur: 'gris' }; return h('span.badge.' + e.couleur, { text: e.libelle }); }
  function estNegatif(a) { return a.etoiles > 0 && a.etoiles <= SEUIL; }

  /* --------------------------------- Section -------------------------------- */
  AMX.section('avis', {
    titre: 'Avis', icone: 'avis', ordre: 45,
    onglets: [
      { id: 'apercu', titre: 'Aperçu' },
      { id: 'avis', titre: 'Avis', compteur: function () { var d = cache.reponse; return d ? d.avis.filter(function (a) { return A_TRAITER[a.etat] && estNegatif(a); }).length || '' : ''; } },
      { id: 'sondages', titre: 'Sondages', compteur: function () { var d = cache.reponse; return d ? d.sondages.filter(function (s) { return s.note !== null && s.note <= SEUIL && AMX.joursDepuis(s.reponduLe) <= 7; }).length || '' : ''; } }
    ],
    monter: function (conteneur, ctx) { return new Avis(conteneur, ctx); }
  });

  function Avis(conteneur, ctx) {
    var self = this;
    injecterCss();
    this.conteneur = conteneur;
    this.onglet = ctx.onglet || 'apercu';
    this.params = ctx.params || {};
    this.filtres = { recherche: '', concession: AMX.compagnieChoisie('inventaire') || AMX.maConcession(), etoiles: '', etat: '', personne: (ctx.params && ctx.params.personne) || '' };   /* 16 oct. : même concession que le reste du site */
    this.filtrePersonnes = '';   // Aperçu › tableau par personne : '', 'ventes', 'service', 'direction', 'autres'
    this.construire();
    this.charger();
    this.surAvis = function () { self.rendre(); AMX.rafraichirSousBarre(); };
    document.addEventListener('amx:avis', this.surAvis);
    this.minuterie = setInterval(function () { if (!document.hidden) self.charger(true); }, 300000);
  }
  Avis.prototype.demonter = function () { clearInterval(this.minuterie); document.removeEventListener('amx:avis', this.surAvis); };
  Avis.prototype.naviguer = function (ctx) { this.onglet = ctx.onglet || 'apercu'; this.params = ctx.params || {}; this.rendre(); };

  Avis.prototype.construire = function () {
    var self = this;
    var page = h('div.page.avis-page');
    this.elEntete = h('div.entete-page', [
      h('div', [h('h1', 'Avis Google'), this.elSous = h('p', 'Chargement…')]),
      h('div.actions', [
        h('button.btn.primaire', { type: 'button', onclick: function () { self.demanderAvis(); } }, [AMX.svg('plus'), ' Demander un avis']),
        h('button.btn', { type: 'button', title: 'Rafraîchir', onclick: function () { self.charger(true); } }, [AMX.svg('rafraichir'), ' Rafraîchir'])
      ])
    ]);
    this.elCorps = h('div');
    page.appendChild(this.elEntete); page.appendChild(this.elCorps);
    this.conteneur.appendChild(page);
  };
  Avis.prototype.charger = function (force) {
    var self = this;
    if (!cache.reponse) {
      AMX.vider(this.elCorps); this.elCorps.appendChild(h('div.chargement', [h('span.spin'), 'Chargement des avis…']));
      AMX.avis.copie().then(function (c) { if (c && c.quand && !self.detruit) { self.rendre(); AMX.rafraichirSousBarre(); } }).catch(function () {});   /* 16 oct. : la copie d'abord */
    }
    AMX.avis.charger(force).then(function () { self.rendre(); AMX.rafraichirSousBarre(); }, function (e) {
      if (cache.reponse) { self.rendre(); AMX.toast('Avis : mise à jour impossible (copie du navigateur affichée) — ' + AMX.erreurTexte(e), 'erreur'); return; }
      AMX.vider(self.elCorps);
      self.elCorps.appendChild(h('div.alerte-bloc.erreur', [AMX.svg('alerte'), h('div', { text: AMX.erreurTexte(e) })]));
    });
  };

  Avis.prototype.rendre = function () {
    var d = cache.reponse; if (!d) return;
    var g = d.stats.groupe;
    this.elSous.textContent = (cache.copieLe ? 'Copie du ' + AMX.copieTexte(cache.copieLe) + ' — mise à jour en cours… · ' : '') + (g.note !== null ? 'Note du groupe ' + fmtNote(g.note) + ' / 5 sur ' + AMX.fmtNombre(g.nombre) + ' avis' : 'Aucune mesure encore') +
      (g.nouveaux30 ? ' · ' + g.nouveaux30 + ' nouveaux en 30 jours' : '') + (g.negatifs30 ? ' · ' + g.negatifs30 + ' négatif' + (g.negatifs30 > 1 ? 's' : '') : '');
    AMX.vider(this.elCorps);
    if (d.api && !d.api.approuve) {
      this.elCorps.appendChild(h('div.alerte-bloc.info', { style: { marginBottom: '14px' } }, [AMX.svg('info'),
        h('div', [h('b', 'En attente de l\'approbation de Google (API Business Profile). '),
          'D\'ici là, les notes et le nombre d\'avis sont exacts (relevé quotidien), mais la liste ne montre que les 5 avis « les plus pertinents » de chaque fiche. Dès l\'approbation : tous les avis, les nouveaux en temps réel et la réponse directement d\'ici.'])]));
    }
    if (d.api && d.api.approuve && (this.onglet === 'avis' || this.onglet === 'apercu' || !this.onglet)) this.elCorps.appendChild(this.barreApi(d));
    if (this.onglet === 'avis') this.rendreAvis(d);
    else if (this.onglet === 'sondages') this.rendreSondages(d);
    else this.rendreApercu(d);
  };

  /* Avis Google en direct : dernier relevé, et « Relever maintenant » pour les admins. */
  Avis.prototype.barreApi = function (d) {
    var self = this;
    var quand = d.api.dernierReleve ? AMX.fmtDate(d.api.dernierReleve, true) : 'pas encore';
    var btn = AMX.estAdmin() ? h('button.btn.petit', { type: 'button', onclick: function (e) {
      var b = e.currentTarget; b.disabled = true; b.textContent = 'Relevé en cours…';
      AMX.post({ action: 'avisRelever', mode: 'recent' }).then(function (r) {
        AMX.verifier(r, 'Relevé refusé');
        AMX.toast((r.nouveaux ? r.nouveaux + ' nouvel' + (r.nouveaux > 1 ? 's' : '') + ' avis' : 'Aucun nouvel avis') + (r.modifies ? ', ' + r.modifies + ' mis à jour' : '') + (r.disparus ? ', ' + r.disparus + ' disparu' + (r.disparus > 1 ? 's' : '') : '') + (r.alertes ? ' · ' + r.alertes + ' alerte' + (r.alertes > 1 ? 's' : '') + ' envoyée' + (r.alertes > 1 ? 's' : '') : ''), 'ok');
        return self.charger(true);
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }).then(function () { b.disabled = false; b.textContent = 'Relever maintenant'; });
    } }, 'Relever maintenant') : null;
    return h('div.avis-api-barre', [h('span.pt'), h('span', [h('b', 'Avis Google en direct'), ' — tous les avis des fiches, relevés chaque heure par l\'API Business Profile. Dernier relevé : ' + quand + '.']), btn]);
  };

  /* --------------------------------- Aperçu --------------------------------- */
  Avis.prototype.rendreApercu = function (d) {
    var self = this, g = d.stats.groupe, ss = d.stats.sondages, rep = d.repere || {};
    var moiC = AMX.session.courriel;
    var mesAvis = d.avis.filter(function (a) { return a.assigneA === moiC || a.employes.indexOf(moiC) >= 0; });
    var mesATraiter = mesAvis.filter(function (a) { return A_TRAITER[a.etat]; }).length;
    var kpi = function (valeur, libelle, sous, classe, action) {
      return h('button.kpi' + (classe ? '.' + classe : '') + (action ? '' : '.neutre'), { type: 'button', onclick: action || null }, [
        h('div.valeur', { text: valeur }), h('div.libelle', { text: libelle }), sous ? h('div.sous', { text: sous }) : null]);
    };
    this.elCorps.appendChild(h('div.kpis', [
      kpi(fmtNote(g.note), 'Note du groupe', rep.note ? 'marché ' + fmtNote(rep.note) : ''),
      kpi(AMX.fmtNombre(g.nombre), 'Avis Google', d.fiches.length + ' fiches'),
      kpi(g.nouveaux30 ? '+' + g.nouveaux30 : '0', 'Nouveaux 30 j', g.nouveaux7 ? '+' + g.nouveaux7 + ' cette semaine' : 'aucun cette semaine'),
      kpi(String(g.negatifs30), 'Négatifs 30 j', '≤ ' + SEUIL + ' étoiles', g.negatifs30 ? 'alerte' : ''),
      kpi(String(g.aTraiter), 'À traiter', 'avis sans suite', g.aTraiter ? 'attention' : '', function () { AMX.aller('avis', 'avis'); }),
      kpi(String(ss.envoyes30), 'Sondages 30 j', ss.enAttente ? ss.enAttente + ' en attente d\'envoi' : (ss.envoyes + ' au total'), '', function () { AMX.aller('avis', 'sondages'); }),
      kpi(ss.note !== null ? fmtNote1(ss.note) : '—', 'Note sondages', ss.tauxReponse !== null ? ss.tauxReponse + ' % de réponses' : 'aucune réponse encore', ss.negatifs ? 'attention' : ''),
      kpi(String(ss.clicsGoogle), 'Clics vers Google', 'depuis le sondage'),
      kpi(String(mesAvis.length), 'Mes avis', mesATraiter ? mesATraiter + ' à traiter' : 'responsable ou crédité', mesATraiter ? 'attention' : '', function () { self.filtres.personne = 'moi'; AMX.aller('avis', 'avis'); })
    ]));

    // Par concession
    var lignes = d.stats.parConcession;
    var tbl = h('table.tableau', [
      h('thead', [h('tr', [h('th', 'Concession'), h('th.num', 'Note'), h('th.num', 'Avis'), h('th.num', '30 j'), h('th.num', 'Var. note'), h('th.num', 'Négatifs 30 j'), h('th.num', 'À traiter'), h('th', 'Face aux concurrents'), h('th.num', 'Réponses')])]),
      h('tbody', lignes.map(function (c) {
        return h('tr.cliquable', { onclick: function () { self.filtres.concession = c.code; AMX.aller('avis', 'avis'); } }, [
          h('td', [h('div', { style: { fontWeight: 600 } }, nomConcession(c.code)), h('div.mini', c.fiches.map(function (f) { return f.nom; }).join(' · '))]),
          h('td.num', [h('span.avis-note', fmtNote(c.note)), ' ', c.note !== null ? etoiles(Math.round(c.note)) : null]),
          h('td.num', AMX.fmtNombre(c.nombre)),
          h('td.num', c.nouveaux30 ? h('span.avis-pos', '+' + c.nouveaux30) : '0'),
          h('td.num', c.varNote30 === null ? h('span.doux', '—') : h('span' + (c.varNote30 > 0 ? '.avis-pos' : c.varNote30 < 0 ? '.avis-neg' : ''), signe(c.varNote30) || '0')),
          h('td.num', c.negatifs30 ? h('span.badge.rouge', String(c.negatifs30)) : h('span.doux', '0')),
          h('td.num', c.aTraiter ? h('span.badge.ambre', String(c.aTraiter)) : h('span.doux', '0')),
          h('td', c.concurrence.length ? c.concurrence.map(function (x) {
            var top = x.rang === 1;
            return h('div.mini', [h('span' + (top ? '.avis-pos' : ''), { style: { fontWeight: 600 } }, (top ? '1er' : x.rang + 'e') + ' / ' + x.total), ' ', x.marque ? x.marque : x.fiche, x.moyenneMarche ? h('span.avis-repere', ' · marché ' + fmtNote(x.moyenneMarche)) : null]);
          }) : h('span.doux', '—')),
          h('td.num', c.tauxReponse === null ? h('span.doux', '—') : [c.tauxReponse + ' %', c.delaiMedian !== null ? h('div.mini', 'médiane ' + c.delaiMedian + ' j') : null])
        ]);
      }))
    ]);
    this.elCorps.appendChild(h('div.carte', [
      h('div.carte-entete', [h('h2', ['Par concession', h('span.sous', 'relevé quotidien des fiches Google')])]),
      h('div.defile', [tbl])
    ]));

    // Par fiche (détail)
    var fiches = [];
    lignes.forEach(function (c) { c.fiches.forEach(function (f) { fiches.push(Object.assign({ code: c.code }, f)); }); });
    this.elCorps.appendChild(h('div.carte', [
      h('div.carte-entete', [h('h2', ['Par fiche Google', h('span.sous', fiches.length + ' fiches')])]),
      h('div.carte-corps', [h('div.avis-fiches', fiches.map(function (f) {
        return h('div.avis-fiche', [
          h('div.n', f.nom),
          h('div.v', [h('b', fmtNote(f.note)), f.note !== null ? etoiles(Math.round(f.note)) : null, h('span', f.nombre !== null ? AMX.fmtNombre(f.nombre) + ' avis' : 'pas encore mesurée'),
            f.nouveaux30 ? h('span.avis-pos', '+' + f.nouveaux30 + ' / 30 j') : null, f.varNote30 ? h('span' + (f.varNote30 > 0 ? '.avis-pos' : '.avis-neg'), signe(f.varNote30)) : null])
        ]);
      }))])
    ]));

    // Par personne
    var personnes = d.stats.personnes || [];
    var moi = AMX.session.courriel;
    var admin = AMX.estAdmin();
    var actif = function (p) { return p.demandesEnvoyees || p.avisAttribues || p.reponduesSondage || p.avisRepondus; };
    var terrain = function (p) { return p.departement === 'ventes' || p.departement === 'service' || p.departement === 'pieces' || p.role === 'vendeur' || p.role === 'utilisateur'; };
    var groupeP = function (p) { if (p.role === 'admin' || p.role === 'proprietaire' || p.departement === 'direction') return 'direction'; if (p.departement === 'ventes') return 'ventes'; if (p.departement === 'service' || p.departement === 'pieces') return 'service'; return 'autres'; };
    var visibles = admin ? personnes.filter(function (p) { return (actif(p) || terrain(p)) && (!self.filtrePersonnes || groupeP(p) === self.filtrePersonnes); }) : personnes.filter(function (p) { return p.courriel === moi; });
    if (!admin && !visibles.length) visibles = [{ courriel: moi, nom: AMX.session.nom || moi, concession: AMX.maConcession(), demandesEnvoyees: 0, demandes30: 0, reponduesSondage: 0, noteSondage: null, negatifsSondage: 0, clicsGoogle: 0, avisAttribues: 0, noteAvis: null, avis5: 0, avisNegatifs: 0, avisRepondus: 0 }];
    var segP = h('div.segment', [['', 'Tous'], ['ventes', 'Ventes'], ['service', 'Service'], ['direction', 'Direction'], ['autres', 'Autres']].map(function (o) {
      return h('button' + (self.filtrePersonnes === o[0] ? '.actif' : ''), { type: 'button', text: o[1], onclick: function () { self.filtrePersonnes = o[0]; self.rendre(); } });
    }));
    var tblP = h('table.tableau', [
      h('thead', [h('tr', [h('th', 'Personne'), h('th', 'Rôle'), h('th', 'Concession'), h('th.num', { title: 'Demandes d\'avis envoyées aux clients (30 j / total)' }, 'Demandes envoyées'), h('th.num', { title: 'Sondages répondus par les clients de cette personne' }, 'Notes reçues'), h('th.num', 'Note moy.'), h('th.num', 'Négatifs'), h('th.num', 'Clics Google'), h('th.num', { title: 'Avis Google crédités à cette personne' }, 'Avis crédités'), h('th.num', 'Note avis'), h('th.num', '5 ★'), h('th.num', { title: 'Avis dont cette personne avait la charge et qui ont reçu une réponse' }, 'Réponses')])]),
      h('tbody', visibles.length ? visibles.map(function (p) {
        return h('tr.cliquable' + (p.courriel === moi ? '.avis-moi' : ''), { title: 'Voir les avis de ' + p.nom, onclick: function () { self.filtres.personne = p.courriel; AMX.aller('avis', 'avis'); } }, [
          h('td', [h('div', { style: { fontWeight: 600 } }, p.nom), h('div.mini', p.courriel)]),
          h('td', [h('div', { text: p.roleLibelle || p.role || '—' }), puceDep(p.departement)]),
          h('td', p.concession === '*' ? 'Groupe' : nomConcession(p.concession)),
          h('td.num', [h('b', String(p.demandes30)), h('span.doux', ' / ' + p.demandesEnvoyees)]),
          h('td.num', String(p.reponduesSondage)),
          h('td.num', p.noteSondage === null ? h('span.doux', '—') : [h('span.avis-note' + (p.noteSondage <= SEUIL ? '.avis-neg' : p.noteSondage >= 4.5 ? '.avis-pos' : ''), fmtNote1(p.noteSondage)), ' ', etoiles(Math.round(p.noteSondage))]),
          h('td.num', p.negatifsSondage ? h('span.badge.rouge', String(p.negatifsSondage)) : h('span.doux', '0')),
          h('td.num', String(p.clicsGoogle)),
          h('td.num', String(p.avisAttribues)),
          h('td.num', p.noteAvis === null ? h('span.doux', '—') : h('span.avis-note', fmtNote1(p.noteAvis))),
          h('td.num', p.avis5 ? h('span.avis-pos', String(p.avis5)) : h('span.doux', '0')),
          h('td.num', String(p.avisRepondus))
        ]);
      }) : [h('tr', [h('td', { colspan: 12 }, h('span.doux', 'Personne n\'a encore envoyé de demande ni reçu de note.'))])])
    ]);
    this.elCorps.appendChild(h('div.carte', [
      h('div.carte-entete', [h('h2', ['Par personne', h('span.sous', admin ? 'qui envoie des demandes d\'avis, qui reçoit quelles notes' : 'vos demandes et vos notes')]),
        admin ? h('div.avis-personnes-outils', [segP, h('span.doux.petit', 'Les avis Google sont attribués dans l\'onglet Avis : un responsable et des crédités par avis.')]) : null]),
      h('div.defile', [tblP])
    ]));
  };

  /* ---------------------------------- Avis ---------------------------------- */
  Avis.prototype.rendreAvis = function (d) {
    var self = this, f = this.filtres;
    var moiC = AMX.session.courriel;
    // 16 oct. : la concession se choisit dans la rangée sous l'en-tête, comme partout (compte des avis par concession, mêmes autres filtres)
    var passe = function (a, sansCie) {
      if (!sansCie && f.concession && a.concession !== f.concession) return false;
      if (f.personne) { var qui = f.personne === 'moi' ? moiC : f.personne; if (a.assigneA !== qui && a.employes.indexOf(qui) < 0) return false; }
      if (f.etoiles === 'neg' && !estNegatif(a)) return false;
      if (f.etoiles && f.etoiles !== 'neg' && a.etoiles !== Number(f.etoiles)) return false;
      if (f.etat === 'traiter' && !A_TRAITER[a.etat]) return false;
      if (f.etat && f.etat !== 'traiter' && a.etat !== f.etat) return false;
      if (f.recherche) { var q = f.recherche.toLowerCase(); if ((a.auteur + ' ' + a.texte + ' ' + a.fiche + ' ' + a.reponse).toLowerCase().indexOf(q) < 0) return false; }
      return true;
    };
    var elCies = h('div.barre-cies');
    AMX.barreConcessions(elCies, { domaine: 'inventaire', valeur: f.concession,
      compte: function (c) { return d.avis.filter(function (a) { return passe(a, true) && (!c || a.concession === c); }).length; },
      onchange: function (c) { f.concession = c; self.rendre(); } });
    this.elCorps.appendChild(elCies);
    var liste = d.avis.filter(function (a) {
      if (f.concession && a.concession !== f.concession) return false;
      if (f.personne) { var qui = f.personne === 'moi' ? moiC : f.personne; if (a.assigneA !== qui && a.employes.indexOf(qui) < 0) return false; }
      if (f.etoiles === 'neg' && !estNegatif(a)) return false;
      if (f.etoiles && f.etoiles !== 'neg' && a.etoiles !== Number(f.etoiles)) return false;
      if (f.etat === 'traiter' && !A_TRAITER[a.etat]) return false;
      if (f.etat && f.etat !== 'traiter' && a.etat !== f.etat) return false;
      if (f.recherche) { var q = f.recherche.toLowerCase(); if ((a.auteur + ' ' + a.texte + ' ' + a.fiche + ' ' + a.reponse).toLowerCase().indexOf(q) < 0) return false; }
      return true;
    });
    var concessions = Object.keys(AMX.COMPAGNIES);
    var filtres = h('div.avis-filtres', [
      h('input.saisie', { type: 'search', placeholder: 'Rechercher un avis…', value: f.recherche, oninput: AMX.debounce(function (e) { f.recherche = e.target.value.trim(); self.rendre(); }, 200) }),
      null,
      h('select.saisie', { onchange: function (e) { f.etoiles = e.target.value; self.rendre(); } }, [
        h('option', { value: '', text: 'Toutes les notes', selected: !f.etoiles }), h('option', { value: 'neg', text: 'Négatifs (≤ ' + SEUIL + ' ★)', selected: f.etoiles === 'neg' }),
        h('option', { value: '5', text: '5 ★', selected: f.etoiles === '5' }), h('option', { value: '4', text: '4 ★', selected: f.etoiles === '4' }), h('option', { value: '3', text: '3 ★', selected: f.etoiles === '3' }), h('option', { value: '2', text: '2 ★', selected: f.etoiles === '2' }), h('option', { value: '1', text: '1 ★', selected: f.etoiles === '1' })]),
      h('select.saisie', { onchange: function (e) { f.etat = e.target.value; self.rendre(); } }, [h('option', { value: '', text: 'Tous les états', selected: !f.etat }), h('option', { value: 'traiter', text: 'À traiter', selected: f.etat === 'traiter' })].concat(Object.keys(ETATS).map(function (k) { return h('option', { value: k, text: ETATS[k].libelle, selected: f.etat === k }); }))),
      h('select.saisie', { title: 'Responsable ou crédité', onchange: function (e) { f.personne = e.target.value; self.rendre(); } }, [h('option', { value: '', text: 'Toutes les personnes', selected: !f.personne }), h('option', { value: 'moi', text: 'Mes avis', selected: f.personne === 'moi' })].concat(
        d.utilisateurs.filter(function (u) { return !f.concession || u.concession === '*' || (u.concessions || [u.concession]).indexOf(f.concession) >= 0; }).map(function (u) { return h('option', { value: u.courriel, text: u.nom + (u.departement ? ' (' + (DEP_NOMS[u.departement] || u.departement) + ')' : ''), selected: f.personne === u.courriel }); }))),
      h('span.doux.petit', liste.length + ' avis' + (liste.length !== d.avis.length ? ' sur ' + d.avis.length : ''))
    ]);
    this.elCorps.appendChild(filtres);
    if (!liste.length) { this.elCorps.appendChild(h('div.vide', [AMX.svg('avis'), h('h3', 'Aucun avis'), h('p', 'Rien ne correspond à ces filtres.')])); return; }
    // 15 oct. (v96) : avec l'API, 2 000 avis et plus — on affiche par tranches de PAGE_AVIS (chaque carte a deux listes de personnes).
    var elListe = h('div.avis-liste');
    var montres = 0;
    var plus = liste.length > PAGE_AVIS ? h('button.btn.petit.avis-plus', { type: 'button', onclick: function () { ajouter(); } }) : null;
    var ajouter = function () {
      var fin = Math.min(liste.length, montres + PAGE_AVIS);
      for (var i = montres; i < fin; i++) elListe.appendChild(self.carteAvis(liste[i], d));
      montres = fin;
      if (plus) { plus.textContent = 'Afficher ' + Math.min(PAGE_AVIS, liste.length - montres) + ' avis de plus (' + (liste.length - montres) + ' restants)'; plus.style.display = montres < liste.length ? '' : 'none'; }
    };
    ajouter();
    this.elCorps.appendChild(elListe);
    if (plus) this.elCorps.appendChild(h('div.avis-plus-ligne', [plus, h('span.doux.petit', 'Affinez avec les filtres (concession, note, état, personne) pour aller droit au but.')]));
  };

  // Les comptes qui voient cette concession (principale, accès supplémentaire ou groupe), triés : son département d'abord.
  Avis.prototype.utilisateursPour = function (d, concession, type) {
    var l = d.utilisateurs.filter(function (u) { return u.concession === '*' || u.concession === concession || (u.concessions || []).indexOf(concession) >= 0; });
    return l.slice().sort(function (x, y) {
      var dx = deTypeDep(x.departement || '', type) ? 0 : 1, dy = deTypeDep(y.departement || '', type) ? 0 : 1;
      if (dx !== dy) return dx - dy;
      return x.nom.localeCompare(y.nom, 'fr');
    });
  };
  function selectPersonnes(liste, valeur, vide, type) {
    var sel = h('select.saisie', [h('option', { value: '', text: vide, selected: !valeur })]);
    var groupes = [['Même département', function (u) { return deTypeDep(u.departement || '', type); }], ['Autres', function (u) { return !deTypeDep(u.departement || '', type); }]];
    groupes.forEach(function (g) {
      var dans = liste.filter(g[1]); if (!dans.length) return;
      var og = h('optgroup', { label: g[0] });
      dans.forEach(function (u) { og.appendChild(h('option', { value: u.courriel, text: libelleUtilisateur(u), selected: valeur === u.courriel })); });
      sel.appendChild(og);
    });
    if (valeur && !liste.some(function (u) { return u.courriel === valeur; })) sel.appendChild(h('option', { value: valeur, text: nomDe(valeur), selected: true }));
    return sel;
  }
  Avis.prototype.carteAvis = function (a, d) {
    var self = this, moiC = AMX.session.courriel;
    var typeAvis = typeDeFiche(d, a.fiche);
    var utilisateurs = this.utilisateursPour(d, a.concession, typeAvis);
    var selEtat = h('select.saisie', { onchange: function (e) { self.ecrire({ action: 'avisEtat', id: a.id, etat: e.target.value }, 'État mis à jour'); } },
      Object.keys(ETATS).map(function (k) { return h('option', { value: k, text: ETATS[k].libelle, selected: a.etat === k }); }));
    var selAssign = selectPersonnes(utilisateurs, a.assigneA, '— personne —', typeAvis);
    selAssign.addEventListener('change', function (e) { self.ecrire({ action: 'avisAssigner', id: a.id, courriel: e.target.value }, e.target.value ? 'Responsable : ' + nomDe(e.target.value) : 'Responsable retiré'); });
    var employes = h('div.avis-employes', a.employes.length ? a.employes.map(function (c) { return h('span.puce' + (c === moiC ? '.moi' : ''), { title: c }, nomDe(c)); }) : [h('span.doux.petit', 'aucun')]);
    var moiCredite = a.employes.indexOf(moiC) >= 0;
    var date = a.creeLe ? AMX.fmtDate(a.creeLe) : '';
    var jours = AMX.joursDepuis(a.creeLe);
    return h('div.avis-carte' + (estNegatif(a) ? '.negatif' : ''), { 'data-avis': a.id }, [
      h('div', [
        h('div.haut', [etoiles(a.etoiles, true), h('span.auteur', a.auteur || 'Anonyme'), badgeEtat(a.etat),
          h('span.meta', [a.fiche, date ? ' · ' + date : '', jours !== null && jours <= 30 ? ' · il y a ' + (jours === 0 ? 'moins d\'un jour' : jours + ' j') : '', a.source !== 'google' ? ' · ' + a.source : '']),
          !a.enLigne ? h('span.badge.gris', 'Disparu de Google') : null,
          a.reponseEtat && a.reponseEtat !== 'APPROVED' ? h('span.badge.ambre', a.reponseEtat === 'PENDING' ? 'Réponse en modération' : 'Réponse refusée') : null,
          badgeRetrait(a)]),
        h('div.texte' + (a.texte ? '' : '.vide-texte'), a.texte || 'Note sans commentaire.'),
        this.blocReponse(a, d)
      ]),
      h('div.cote', [
        h('div.champ', [h('label', 'État'), selEtat]),
        h('div.champ', [h('label', { title: 'Le compte qui répond à l\'avis ou rappelle le client' }, 'Responsable'), selAssign]),
        h('div.champ', [h('label', { title: 'Les comptes concernés par cet avis : il compte dans leurs statistiques « avis crédités »' }, ['Crédités ', h('button.btn.fantome.petit', { type: 'button', style: { marginLeft: '4px' }, onclick: function () { self.choisirEmployes(a, utilisateurs, typeAvis); } }, 'Modifier')]), employes]),
        h('div.actions-ligne', { style: { gap: '6px', flexWrap: 'wrap' } }, [
          moiCredite ? null : h('button.btn.petit', { type: 'button', title: 'M\'ajouter aux crédités', onclick: function () { self.ecrire({ action: 'avisEmployes', id: a.id, employes: a.employes.concat([moiC]) }, 'Avis crédité à vous'); } }, 'Me créditer'),
          a.assigneA === moiC ? null : h('button.btn.petit', { type: 'button', title: 'Devenir le responsable de cet avis', onclick: function () { self.ecrire({ action: 'avisAssigner', id: a.id, courriel: moiC }, 'Vous êtes responsable de cet avis'); } }, 'Je m\'en occupe'),
          a.lien ? h('a.btn.petit', { href: a.lien, target: '_blank', rel: 'noopener' }, [AMX.svg('externe'), ' Google']) : null,
          peutRepondre(d) && a.source === 'google' ? h('button.btn.petit.avis-retrait' + (a.retrait && a.retrait.etat ? '.actif' : ''), { type: 'button', title: 'Demander à Google de retirer cet avis (faux avis, conflit d\'intérêts, harcèlement, diffamation…)', onclick: function () { self.modaleRetrait(a, d); } }, a.retrait && a.retrait.etat ? 'Retrait : ' + (RETRAIT_ETATS[a.retrait.etat] || a.retrait.etat) : 'Demander le retrait') : null
        ])
      ])
    ]);
  };

  /* Rôles qui répondent aux avis (le serveur tranche de toute façon : modifierMontants, gererUtilisateurs, alertesAvis ou marketing). */
  var PAGE_AVIS = 50;   // cartes affichées d'un coup sur l'onglet Avis (v96 : 2 000 avis et plus avec l'API)

  /* 15 oct. soir (v98) — Demander à Google le retrait d'un avis. Google n'a pas d'API pour ça : on prépare le dossier
     (serveur, FR + EN) et on ouvre les voies où un humain regarde : l'outil de gestion des avis (signaler, puis faire
     appel une fois), un agent du soutien Fiche d'établissement, le formulaire juridique. Le suivi est gardé dans
     l'avis (retrait { etat, canal, motif, demandeLe, note }). */
  var RETRAIT_MOTIFS = [
    ['faux', 'Faux avis — cette personne n\'est pas un client'],
    ['conflit', 'Conflit d\'intérêts — employé, ex-employé, concurrent ou proche'],
    ['horsSujet', 'Hors sujet — ne décrit pas une expérience client'],
    ['harcelement', 'Harcèlement, insultes, propos haineux ou menaces'],
    ['perso', 'Renseignements personnels (nom complet, numéro, adresse)'],
    ['spam', 'Spam, publicité, lien, doublon'],
    ['diffamation', 'Propos faux et diffamatoires (voie juridique)'],
    ['autre', 'Autre infraction aux règles de Google']
  ];
  var RETRAIT_ETATS = { demande: 'demandé', appel: 'en appel', refuse: 'refusé par Google', retire: 'retiré par Google' };
  var RETRAIT_CANAUX = { outil: 'Outil de gestion des avis (signalement)', appel: 'Outil de gestion des avis — appel', support: 'Agent du soutien Fiche d\'établissement', juridique: 'Formulaire juridique (Google Maps)' };
  // v100 : les pages de Google, connues du site (le serveur peut les remplacer) — plus de lien « # » si le script déployé est en retard.
  var RETRAIT_LIENS = { outil: 'https://support.google.com/business/workflow/9945796', support: 'https://support.google.com/business/gethelp', juridique: 'https://support.google.com/legal/troubleshooter/1114905', profil: 'https://business.google.com/' };
  var SCRIPT_PAS_A_JOUR = 'Le script du serveur n\'est pas à jour : la version déployée ne connaît pas encore le module de retrait. Dans l\'éditeur Apps Script : Déployer › Gérer les déploiements › crayon › Nouvelle version › Déployer, puis réessayez.';
  function badgeRetrait(a) {
    var e = a.retrait && a.retrait.etat;
    if (!e) return null;
    var c = e === 'retire' ? 'vert' : e === 'refuse' ? 'gris' : 'ambre';
    return h('span.badge.' + c, { title: 'Demande de retrait à Google' + (a.retrait.demandeLe ? ' le ' + AMX.fmtDate(a.retrait.demandeLe) : '') + (a.retrait.canal ? ' — ' + (RETRAIT_CANAUX[a.retrait.canal] || a.retrait.canal) : '') }, 'Retrait ' + (RETRAIT_ETATS[e] || e));
  }

  Avis.prototype.modaleRetrait = function (a, d) {
    var self = this;
    var r = a.retrait || {};
    var motifSel = h('select.saisie', RETRAIT_MOTIFS.map(function (m) { return h('option', { value: m[0], text: m[1], selected: (r.motif || 'faux') === m[0] }); }));
    var preuves = h('textarea.saisie', { rows: 3, placeholder: 'Les faits qui appuient la demande : aucune vente ni rendez-vous à ce nom dans le DMS, ex-employé parti le…, le texte vise une autre entreprise, etc.' });
    var zoneDossier = h('div.retrait-dossier', { style: { display: 'none' } });
    var canalSel = h('select.saisie', Object.keys(RETRAIT_CANAUX).map(function (k) { return h('option', { value: k, text: RETRAIT_CANAUX[k], selected: (r.canal || 'outil') === k }); }));
    var note = h('input.saisie', { type: 'text', placeholder: 'Note (facultatif) : numéro de dossier Google, date du courriel…' });
    var etatBloc = r.etat ? h('div.alerte-bloc.' + (r.etat === 'retire' ? 'ok' : 'info'), { style: { marginBottom: '12px' } }, [AMX.svg(r.etat === 'retire' ? 'ok' : 'info'), h('div', [
      h('b', 'Retrait ' + (RETRAIT_ETATS[r.etat] || r.etat) + (r.demandeLe ? ' — demandé le ' + AMX.fmtDate(r.demandeLe) : '') + (r.canal ? ' via ' + (RETRAIT_CANAUX[r.canal] || r.canal) : '') + '. '),
      r.note ? h('div.doux.petit', { style: { marginTop: '4px', whiteSpace: 'pre-wrap' } }, r.note) : null])]) : null;
    var preparer = h('button.btn.petit', { type: 'button', onclick: function (e) {
      var b = e.currentTarget; b.disabled = true; b.textContent = 'Un instant…';
      AMX.post({ action: 'avisDossierRetrait', id: a.id, motif: motifSel.value, preuves: preuves.value }).then(function (res) {
        AMX.verifier(res, 'Dossier refusé');
        // 15 oct. soir (v100) : tant que la version DÉPLOYÉE du script n'a pas le module de retrait, une action inconnue tombe dans
        // l'ancien traitement POST (mise à jour d'inventaire) qui répond { ok: true, vehicules } — la fenêtre montrait un dossier vide
        // et des liens « # » qui rouvraient le site. On le dit clairement, et les liens vers Google ne dépendent plus du serveur.
        if (!res.dossier) throw new Error(SCRIPT_PAS_A_JOUR);
        AMX.vider(zoneDossier); zoneDossier.style.display = '';
        var ta = h('textarea.saisie.retrait-texte', { rows: 12, readonly: 'readonly' }); ta.value = res.dossier || '';
        var liens = Object.assign({}, RETRAIT_LIENS, res.liens || {});
        // 15 oct. soir (Maxime : « les liens 1-2-3 ne fonctionnent pas, je ne comprends pas coller le dossier ») : les pages de
        // Google (outil de gestion, agent) exigent le compte Google qui gère les fiches — Chrome ouvrait le compte par défaut,
        // souvent un autre, et la page restait vide ou demandait de se connecter. On passe par le sélecteur de compte de Google
        // avec le courriel de la session, qui continue vers la page voulue. Et chaque voie dit, étape par étape, où coller.
        var courriel = String((AMX.session && AMX.session.courriel) || '');
        var avecCompte = function (url) { return courriel ? 'https://accounts.google.com/AccountChooser?Email=' + encodeURIComponent(courriel) + '&continue=' + encodeURIComponent(url) : url; };
        var coller = h('b', 'collez le dossier (Cmd+V sur Mac, Ctrl+V sur PC, ou clic droit › Coller)');
        var voie = function (cle, titre, etapes, recommande, compte) {
          var url = liens[cle] || '#';
          return h('div.retrait-voie' + (recommande ? '.recommande' : ''), [
            h('div.retrait-voie-tete', [
              h('a.btn.petit' + (recommande ? '.primaire' : ''), { href: compte ? avecCompte(url) : url, target: '_blank', rel: 'noopener', 'data-lien': url }, [AMX.svg('externe'), ' ' + titre]),
              recommande ? h('span.badge.vert.sans-point', 'Recommandé pour ce motif') : null
            ]),
            h('ol.retrait-etapes', etapes.map(function (t) { return h('li', t); }))
          ]);
        };
        var anglais = function () { var i = ta.value.indexOf('--- English version'); return i >= 0 ? ta.value.slice(i) : ta.value; };
        zoneDossier.appendChild(h('div.l', 'Le dossier — le texte à donner à Google (français, puis anglais)'));
        zoneDossier.appendChild(ta);
        zoneDossier.appendChild(h('div.actions-ligne', [
          h('button.btn.primaire.petit', { type: 'button', onclick: function () { AMX.copier(ta.value, 'Dossier copié — collez-le dans le formulaire de Google (Cmd+V)'); } }, 'Copier le dossier'),
          h('button.btn.petit', { type: 'button', onclick: function () { AMX.copier(anglais(), 'Version anglaise copiée — collez-la dans le formulaire de Google (Cmd+V)'); } }, 'Copier la version anglaise seulement')
        ]));
        zoneDossier.appendChild(h('div.retrait-mode', [h('b', 'Comment ça marche : '), '1) cliquez « Copier le dossier » (le texte est mis en mémoire) · 2) ouvrez la voie choisie ci-dessous, elle s\'ouvre dans un nouvel onglet' + (courriel ? ' avec le compte ' + courriel + ' (celui qui gère les fiches ; si Google en propose un autre, choisissez celui-là)' : '') + ' · 3) dans le formulaire de Google, cliquez dans la grande zone de texte et collez (Cmd+V). Chaque voie dit où, ci-dessous.']));
        zoneDossier.appendChild(h('div.l', { style: { marginTop: '12px' } }, 'Où le déposer — par ordre d\'efficacité'));
        zoneDossier.appendChild(voie('outil', '1. Outil de gestion des avis', [
          ['Choisissez la fiche (', h('b', a.fiche), ') › Continuer › « Signaler un nouvel avis pour suppression » › Continuer.'],
          ['Trouvez l\'avis de ', h('b', a.auteur || 'l\'auteur'), ' › « Signaler » › choisissez le motif (', h('b', (RETRAIT_MOTIFS.filter(function (m) { return m[0] === motifSel.value; })[0] || ['', 'Spam'])[1].split(' — ')[0]), ') › Envoyer. ', h('b', 'À cette étape, il n\'y a rien à coller'), ' : Google ne demande qu\'un motif.'],
          ['Google répond en quelques jours ; l\'état est dans l\'outil (Décision en attente / Aucune infraction / Transmis).'],
          ['Si « Aucune infraction » : revenez dans l\'outil › « Vérifier l\'état d\'un avis signalé et options d\'appel » › « Faire appel » › cochez l\'avis › « Soumettre un appel » : dans la zone de texte du formulaire, ', coller, '. Un seul appel par avis (jusqu\'à 10 à la fois) ; un humain le lit et répond par courriel. Puis notez « Appel fait » ici.']
        ], res.voieRecommandee === 'outil', true));
        zoneDossier.appendChild(voie('support', '2. Parler à un agent du soutien', [
          ['Sujet « Avis » › « Supprimer un avis » (ou le sujet le plus proche) › Étapes suivantes.'],
          ['Dans la grande zone de texte « Décrivez votre problème », ', h('b', 'collez le dossier (Cmd+V)'), ', puis choisissez clavardage ou courriel.'],
          ['Utile quand l\'outil a refusé, ou pour un faux avis avec des preuves (aucune transaction, ex-employé). Réponse par courriel : notez le numéro de dossier ci-dessous.']
        ], false, true));
        zoneDossier.appendChild(voie('juridique', '3. Demande juridique', [
          ['Choisissez « Google Maps, Waze et produits associés » › motif juridique › « Diffamation » (ou Renseignements personnels, Harcèlement).'],
          ['Remplissez le formulaire ; dans la zone de description, ', h('b', 'collez la version anglaise du dossier (Cmd+V)'), ' — bouton « Copier la version anglaise seulement » ci-dessus.'],
          ['Traité par l\'équipe juridique, à part du tri automatique. Réponse par courriel, souvent en 1 à 2 semaines.']
        ], res.voieRecommandee === 'juridique', false));
        zoneDossier.appendChild(h('div.l', { style: { marginTop: '12px' } }, 'Puis notez ici ce que vous avez fait'));
        zoneDossier.appendChild(h('div.retrait-suivi', [canalSel, note, h('button.btn.primaire.petit', { type: 'button', onclick: function (ev) {
          var bb = ev.currentTarget; bb.disabled = true;
          self.ecrire({ action: 'avisRetrait', id: a.id, etat: canalSel.value === 'appel' ? 'appel' : 'demande', canal: canalSel.value, motif: motifSel.value, note: note.value }, 'Demande de retrait notée').then(function (ok) { if (ok) modale.fermer(); else bb.disabled = false; });
        } }, r.etat ? 'Mettre à jour' : 'Marquer la demande comme envoyée')]));
      }).catch(function (e2) { AMX.toast(AMX.erreurTexte(e2), 'erreur'); }).then(function () { b.disabled = false; b.textContent = 'Préparer le dossier'; });
    } }, 'Préparer le dossier');
    var corps = h('div.retrait-modale', [
      etatBloc,
      h('div.avis-cite', [etoiles(a.etoiles, true), ' ', h('b', a.auteur || 'Anonyme'), h('span.doux', ' · ' + a.fiche + (a.creeLe ? ' · ' + AMX.fmtDate(a.creeLe) : '')), h('div.doux', { style: { marginTop: '4px', whiteSpace: 'pre-wrap' } }, a.texte || 'Note sans commentaire.')]),
      h('p.doux.petit', { style: { margin: '10px 0' } }, 'Le drapeau « Signaler » de Google est un tri automatique qui refuse presque tout. Ce qui fonctionne : un dossier précis, déposé là où quelqu\'un le lit (appel dans l\'outil de gestion, agent du soutien, formulaire juridique). Google ne retire un avis que s\'il enfreint ses règles — jamais parce qu\'on le trouve injuste.'),
      h('div.champ', [h('label', 'Motif'), motifSel]),
      h('div.champ', [h('label', 'Éléments à l\'appui'), preuves]),
      h('div.actions-ligne', [preparer]),
      zoneDossier
    ]);
    var boutons = [{ texte: 'Fermer' }];
    if (r.etat === 'demande') boutons.unshift({ texte: 'Appel fait', classe: 'fantome', action: function () { return self.ecrire({ action: 'avisRetrait', id: a.id, etat: 'appel', canal: 'appel', note: 'Appel déposé dans l\'outil de gestion' }, 'Appel noté'); } });
    if (r.etat === 'demande' || r.etat === 'appel') {
      boutons.unshift({ texte: 'Refusé par Google', classe: 'fantome', action: function () { return self.ecrire({ action: 'avisRetrait', id: a.id, etat: 'refuse' }, 'Refus noté'); } });
      boutons.unshift({ texte: 'Retiré par Google', classe: 'fantome', action: function () { return self.ecrire({ action: 'avisRetrait', id: a.id, etat: 'retire' }, 'Retrait noté'); } });
    }
    if (r.etat) boutons.unshift({ texte: 'Annuler la demande', classe: 'fantome', action: function () { if (!window.confirm('Effacer le suivi de cette demande de retrait ?')) return false; return self.ecrire({ action: 'avisRetrait', id: a.id, etat: '' }, 'Suivi effacé'); } });
    var modale = AMX.modale({ titre: 'Demander le retrait à Google — ' + (a.auteur || 'avis') + ' (' + a.etoiles + ' ★)', corps: corps, large: true, boutons: boutons });
  };

  function peutRepondre(d) {
    var role = String((d && d.moi && d.moi.role) || '');
    return AMX.estAdmin() || ['gestionnaire', 'direction_ventes', 'direction_service', 'marketing', 'proprietaire', 'admin'].indexOf(role) >= 0;
  }

  /* La réponse publiée, et l'éditeur (brouillon · suggestion · publier · retirer) quand l'API est active et que l'avis vient de Google. */
  Avis.prototype.blocReponse = function (a, d) {
    var self = this;
    var enDirect = !!(d.api && d.api.approuve) && a.repondable && a.enLigne;
    var droit = peutRepondre(d);
    var publiee = a.reponse ? h('div.reponse', [h('div.l', ['Réponse de la concession' + (a.reponseLe ? ' · ' + AMX.fmtDate(a.reponseLe) : ''),
      enDirect && droit ? h('button.btn.fantome.petit.ed', { type: 'button', onclick: function () { self.ouvrirEditeur(a, d, a.reponse); } }, 'Modifier') : null,
      enDirect && droit ? h('button.btn.fantome.petit.ed', { type: 'button', onclick: function () {
        if (!window.confirm('Retirer la réponse publiée sur Google ?')) return;
        self.ecrire({ action: 'avisRetirerReponse', id: a.id }, 'Réponse retirée de Google');
      } }, 'Retirer') : null]), a.reponse]) : null;
    if (a.reponse || !droit) return publiee;
    if (!enDirect) {
      if (a.brouillon) return h('div.reponse-edit', [h('div.l', 'Brouillon (réponse à publier sur Google quand l\'API sera active)'), h('div', { style: { whiteSpace: 'pre-wrap', fontSize: '12.5px' } }, a.brouillon)]);
      return null;
    }
    return this.editeurReponse(a, d, a.brouillon || '');
  };

  Avis.prototype.ouvrirEditeur = function (a, d, texte) {
    var carte = this.elCorps.querySelector('[data-avis="' + a.id + '"]');
    if (!carte) return;
    var ancien = carte.querySelector('.reponse-edit'); if (ancien) ancien.remove();
    var bloc = carte.querySelector('.reponse');
    var ed = this.editeurReponse(a, d, texte || '');
    if (bloc) bloc.parentNode.insertBefore(ed, bloc.nextSibling); else carte.firstChild.appendChild(ed);
    ed.querySelector('textarea').focus();
  };

  Avis.prototype.editeurReponse = function (a, d, texte) {
    var self = this;
    var nomRep = a.nomReponse || a.fiche || 'la concession';   // v100 : Ste-Marie répond « Ste-Marie Automobiles Ltée », pas « Ste-Marie Chevrolet »
    var ta = h('textarea', { placeholder: 'Votre réponse publique, au nom de ' + nomRep + '…' });
    ta.value = texte || '';
    var compte = h('span.compte');
    var majCompte = function () { compte.textContent = ta.value.length ? ta.value.length + ' / 4000' : ''; };
    ta.addEventListener('input', majCompte); majCompte();
    var occupe = function (b, oui, texteAttente) { b.disabled = oui; if (oui) { b.dataset.t = b.textContent; b.textContent = texteAttente; } else if (b.dataset.t) b.textContent = b.dataset.t; };
    var bSuggerer = h('button.btn.petit', { type: 'button', title: 'Un texte proposé selon la note, la langue de l\'avis et la fiche — à relire avant de publier', onclick: function (e) {
      var b = e.currentTarget; occupe(b, true, 'Un instant…');
      AMX.post({ action: 'avisBrouillon', id: a.id, suggerer: true }).then(function (r) {
        AMX.verifier(r, 'Suggestion refusée');
        ta.value = r.suggestion || ''; majCompte(); ta.focus();
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }).then(function () { occupe(b, false); });
    } }, 'Suggérer un texte');
    var bBrouillon = h('button.btn.petit', { type: 'button', onclick: function (e) {
      var b = e.currentTarget; occupe(b, true, 'Enregistrement…');
      self.ecrire({ action: 'avisBrouillon', id: a.id, brouillon: ta.value }, ta.value.trim() ? 'Brouillon enregistré' : 'Brouillon effacé').then(function () { occupe(b, false); });
    } }, 'Enregistrer le brouillon');
    var bPublier = h('button.btn.primaire.petit', { type: 'button', onclick: function (e) {
      var t = ta.value.trim();
      if (t.length < 2) { AMX.toast('Écrivez une réponse d\'abord.', 'erreur'); ta.focus(); return; }
      if (!window.confirm((a.reponse ? 'Remplacer la réponse publiée sur Google' : 'Publier cette réponse sur Google') + ', au nom de ' + nomRep + ' ? Elle sera visible par tout le monde.')) return;
      var b = e.currentTarget; occupe(b, true, 'Publication…');
      // v100 : `remplacer` seulement quand l'écran montre déjà une réponse (« Remplacer sur Google ») — sinon le serveur refuse de
      // publier par-dessus une réponse qu'il trouve déjà en ligne (faite d'ici ou dans Google) : jamais en double.
      self.ecrire({ action: 'avisRepondre', id: a.id, texte: t, remplacer: !!a.reponse }, a.reponse ? 'Réponse remplacée sur Google' : 'Réponse publiée sur Google').then(function (ok) { if (!ok) occupe(b, false); });
    } }, a.reponse ? 'Remplacer sur Google' : 'Publier sur Google');
    return h('div.reponse-edit', [
      h('div.l', [a.reponse ? 'Modifier la réponse' : (a.brouillon ? 'Brouillon' : 'Répondre'), h('span.doux', { style: { fontWeight: 400, letterSpacing: 0, textTransform: 'none' } }, '— publiée sur la fiche Google « ' + a.fiche + ' »' + (nomRep !== a.fiche ? ', signée ' + nomRep : ''))]),
      ta,
      h('div.actions-ligne', [bSuggerer, bBrouillon, bPublier, compte])
    ]);
  };

  Avis.prototype.choisirEmployes = function (a, utilisateurs, type) {
    var self = this;
    var choix = {}; a.employes.forEach(function (c) { choix[c] = true; });
    var filtre = { dep: type === 'service' ? 'service' : (type === 'vente' ? 'ventes' : ''), q: '' };
    var liste = h('div.avis-choix');
    var dessiner = function () {
      AMX.vider(liste);
      var l = utilisateurs.filter(function (u) {
        if (filtre.dep === 'ventes' && !deTypeDep(u.departement || '', 'vente')) return false;
        if (filtre.dep === 'service' && !deTypeDep(u.departement || '', 'service')) return false;
        if (filtre.q && (u.nom + ' ' + u.courriel + ' ' + (u.roleLibelle || '')).toLowerCase().indexOf(filtre.q) < 0) return false;
        return true;
      });
      // Les personnes déjà cochées restent visibles quel que soit le filtre.
      utilisateurs.forEach(function (u) { if (choix[u.courriel] && l.indexOf(u) < 0) l.push(u); });
      if (!l.length) { liste.appendChild(h('p.doux.petit', 'Aucun compte ne correspond.')); return; }
      l.forEach(function (u) {
        var lab;
        var cb = h('input', { type: 'checkbox', checked: !!choix[u.courriel], onchange: function (e) { if (e.target.checked) choix[u.courriel] = true; else delete choix[u.courriel]; lab.classList.toggle('coche', e.target.checked); } });
        lab = h('label.champ.inline' + (choix[u.courriel] ? '.coche' : ''), [cb, h('span', [u.nom, h('span.doux.petit', ' · ' + (u.roleLibelle || u.role || '') + (u.concession && u.concession !== '*' ? ' · ' + nomConcession(u.concession) : '')), ' ', puceDep(u.departement)])]);
        liste.appendChild(lab);
      });
    };
    var seg = h('div.segment', [['', 'Tous'], ['ventes', 'Vente'], ['service', 'Service']].map(function (o) {
      return h('button' + (filtre.dep === o[0] ? '.actif' : ''), { type: 'button', text: o[1], onclick: function (e) { filtre.dep = o[0]; seg.querySelectorAll('button').forEach(function (b) { b.classList.remove('actif'); }); e.currentTarget.classList.add('actif'); dessiner(); } });
    }));
    var corps = h('div', [
      h('p', { style: { margin: '0 0 10px', color: 'var(--encre-2)', lineHeight: '1.5' } }, 'Qui est concerné par cet avis ? Ces comptes le verront dans « Mes avis » et dans leurs statistiques (avis crédités, note, 5 ★).'),
      h('div.avis-choix-outils', [seg, h('input.saisie', { type: 'search', placeholder: 'Nom…', oninput: function (e) { filtre.q = e.target.value.trim().toLowerCase(); dessiner(); } })]),
      liste
    ]);
    dessiner();
    AMX.modale({
      titre: 'Crédités — ' + (a.auteur || 'avis') + ' (' + a.etoiles + ' ★)', corps: corps,
      boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
        return self.ecrire({ action: 'avisEmployes', id: a.id, employes: Object.keys(choix) }, 'Attribution enregistrée');
      } }]
    });
  };

  Avis.prototype.ecrire = function (corps, message) {
    var self = this;
    return AMX.post(corps).then(function (r) {
      // v100 : la ligne renvoyée est la bonne même sur un refus (DEJA_REPONDU : la réponse existante, « plus sur Google » : disparu)
      // → on l'affiche TOUT DE SUITE, sans attendre le rechargement (qui pouvait ramener une liste encore vieille).
      if (r && r.avis && cache.reponse) {
        cache.reponse.avis = cache.reponse.avis.map(function (x) { return x.id === r.avis.id ? r.avis : x; });
        self.rendre();
      }
      AMX.verifier(r, 'Écriture refusée');
      if (!r.avis && r.vehicules) throw new Error(SCRIPT_PAS_A_JOUR);   // v100 : action inconnue du script déployé → ancien traitement d'inventaire
      AMX.toast(r.dejaPubliee ? 'Cette réponse était déjà publiée sur Google — rien en double.' : (message || 'Enregistré'), 'ok');
      self.charger(true);
      return true;
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });   // 15 oct. : .catch (un refus du serveur, p. ex. « Google a refusé la réponse », était une erreur non attrapée)
  };

  /* -------------------------------- Sondages -------------------------------- */
  Avis.prototype.rendreSondages = function (d) {
    var self = this, ss = d.stats.sondages;
    var kpi = function (valeur, libelle, sous, classe) { return h('button.kpi.neutre' + (classe ? '.' + classe : ''), { type: 'button' }, [h('div.valeur', { text: valeur }), h('div.libelle', { text: libelle }), sous ? h('div.sous', { text: sous }) : null]); };
    this.elCorps.appendChild(h('div.kpis', [
      kpi(String(ss.envoyes), 'Envoyés', ss.envoyes30 + ' en 30 jours'),
      kpi(ss.tauxReponse !== null ? ss.tauxReponse + ' %' : '—', 'Taux de réponse', ss.repondus + ' réponses'),
      kpi(ss.note !== null ? fmtNote1(ss.note) : '—', 'Note moyenne', 'sur 5'),
      kpi(String(ss.negatifs), 'Négatifs', '≤ ' + SEUIL + ' — directeurs prévenus', ss.negatifs ? 'alerte' : ''),
      kpi(String(ss.clicsGoogle), 'Clics vers Google', 'depuis la page merci'),
      kpi(String(ss.enAttente), 'En attente', 'envoi entre 9 h et 20 h', ss.enAttente ? 'attention' : '')
    ]));
    this.elCorps.appendChild(h('div.alerte-bloc.ok', { style: { marginBottom: '14px' } }, [AMX.svg('ok'), h('div', [
      h('b', 'Comment ça marche. '), 'À la livraison ou à la fin d\'un service, cliquez « Demander un avis » : le client reçoit un texto (ou un courriel) avec un sondage de 10 secondes. ',
      'Tous les clients reçoivent ensuite le lien pour laisser un avis Google — c\'est la règle de Google. Une note de ', String(SEUIL), ' ou moins prévient tout de suite les directeurs (courriel + texto) pour rappeler le client dans l\'heure.'])]));
    var moiS = AMX.session.courriel, fp = self.filtres.personne ? (self.filtres.personne === 'moi' ? moiS : self.filtres.personne) : '';
    var liste = d.sondages.filter(function (s) { return (!self.filtres.concession || s.concession === self.filtres.concession) && (!fp || s.vendeur === fp || s.envoyePar === fp); });
    if (!liste.length) { this.elCorps.appendChild(h('div.vide', [AMX.svg('courriel'), h('h3', 'Aucune demande d\'avis encore'), h('p', 'Le bouton « Demander un avis » en haut à droite envoie le premier sondage.')])); return; }
    var tbl = h('table.tableau', [
      h('thead', [h('tr', [h('th', 'Date'), h('th', 'Client'), h('th', 'Concession'), h('th', 'Type'), h('th', 'Vendeur / conseiller'), h('th', 'Envoyé par'), h('th', 'Envoi'), h('th.num', 'Note'), h('th', 'Commentaire'), h('th', 'Google')])]),
      h('tbody', liste.map(function (s) {
        var etat = s.stop ? h('span.badge.gris', 'STOP') : s.reponduLe ? h('span.badge.vert', 'Répondu ' + AMX.fmtDateCourte(s.reponduLe)) : s.envoyeLe ? h('span.badge.bleu', (s.canal || 'envoyé') + (s.rappelLe ? ' + rappel' : '')) : h('span.badge.ambre', 'En attente');
        return h('tr' + (s.note !== null && s.note <= SEUIL ? '.avis-ligne-neg' : ''), [
          h('td', AMX.fmtDate(s.creeLe, true)),
          h('td', [h('div', { style: { fontWeight: 600 } }, s.clientNom || '—'), h('div.mini', [fmtTel(s.clientTel), s.clientTel && s.clientCourriel ? ' · ' : '', s.clientCourriel])]),
          h('td', nomConcession(s.concession)),
          h('td', s.type === 'service' ? 'Service' : 'Vente'),
          h('td', nomDe(s.vendeur) || '—'),
          h('td', nomDe(s.envoyePar) || '—'),
          h('td', etat),
          h('td.num', s.note === null ? h('span.doux', '—') : [h('span.avis-note' + (s.note <= SEUIL ? '.avis-neg' : s.note >= 4 ? '.avis-pos' : ''), String(s.note)), ' ', etoiles(s.note)]),
          h('td', { style: { maxWidth: '320px', whiteSpace: 'normal' } }, s.commentaire ? h('span', { style: { fontSize: '12.5px' } }, s.commentaire) : h('span.doux', '—')),
          h('td', s.lienGoogleClique ? h('span.badge.vert', 'Cliqué') : h('span.doux', '—'))
        ]);
      }))
    ]);
    this.elCorps.appendChild(h('div.carte', [h('div.carte-entete', [h('h2', ['Demandes d\'avis', h('span.sous', liste.length + ' envoi' + (liste.length > 1 ? 's' : ''))])]), h('div.defile', [tbl])]));
  };

  Avis.prototype.demanderAvis = function () {
    var self = this, d = cache.reponse || { utilisateurs: [] };
    var concessions = Object.keys(AMX.COMPAGNIES);
    var conc = this.filtres.concession || AMX.maConcession() || concessions[0] || '';
    var selConc = h('select', { onchange: function (e) { conc = e.target.value; majVendeurs(); } }, concessions.map(function (c) { return h('option', { value: c, text: AMX.COMPAGNIES[c], selected: c === conc }); }));
    var type = 'vente';
    var segType = h('div.segment.bloc', [
      h('button' + (type === 'vente' ? '.actif' : ''), { type: 'button', onclick: function (e) { type = 'vente'; segType.querySelectorAll('button').forEach(function (b) { b.classList.remove('actif'); }); e.currentTarget.classList.add('actif'); majVendeurs(); } }, 'Vente / livraison'),
      h('button', { type: 'button', onclick: function (e) { type = 'service'; segType.querySelectorAll('button').forEach(function (b) { b.classList.remove('actif'); }); e.currentTarget.classList.add('actif'); majVendeurs(); } }, 'Service')
    ]);
    var nom = h('input', { type: 'text', placeholder: 'Prénom Nom', autocomplete: 'off' });
    var tel = h('input', { type: 'tel', placeholder: '514 555-1234', autocomplete: 'off', inputmode: 'tel' });
    var courriel = h('input', { type: 'email', placeholder: 'facultatif si cellulaire', autocomplete: 'off' });
    var vin = h('input', { type: 'text', placeholder: '17 caractères (facultatif)', autocomplete: 'off', maxlength: '17', spellcheck: 'false' });
    var selVendeur = h('select');
    function majVendeurs() {
      var moi = AMX.session.courriel, actuel = selVendeur.value || moi;
      AMX.vider(selVendeur);
      var liste = (d.utilisateurs || []).filter(function (u) { return u.concession === '*' || u.concession === conc || (u.concessions || []).indexOf(conc) >= 0; });
      if (!liste.some(function (u) { return u.courriel === moi; })) liste.unshift({ courriel: moi, nom: AMX.session.nom || moi, departement: '' });
      var memeDep = liste.filter(function (u) { return deTypeDep(u.departement || '', type); }), autres = liste.filter(function (u) { return !deTypeDep(u.departement || '', type); });
      var ajouter = function (titre, l) { if (!l.length) return; var og = h('optgroup', { label: titre }); l.forEach(function (u) { og.appendChild(h('option', { value: u.courriel, text: libelleUtilisateur(u), selected: u.courriel === actuel })); }); selVendeur.appendChild(og); };
      ajouter(type === 'service' ? 'Service' : 'Ventes', memeDep); ajouter('Autres', autres);
      if (!selVendeur.value) selVendeur.value = moi;
    }
    majVendeurs();
    var corps = h('div.grille', { style: { gap: '12px' } }, [
      concessions.length > 1 ? h('div.champ', [h('label', 'Concession'), selConc]) : null,
      h('div.champ', [h('label', 'Occasion'), segType]),
      h('div.champ', [h('label', 'Client'), nom]),
      h('div.grille.c2', [h('div.champ', [h('label', 'Cellulaire (texto)'), tel]), h('div.champ', [h('label', 'Courriel'), courriel])]),
      h('div.grille.c2', [h('div.champ', [h('label', 'Vendeur / conseiller crédité'), selVendeur]), h('div.champ', [h('label', 'NIV'), vin])]),
      h('p.doux.petit', { style: { margin: 0, lineHeight: '1.5' } }, 'Le texto part tout de suite (entre 9 h et 20 h, sinon à 9 h). Un seul rappel après 3 jours sans réponse. Le client peut répondre STOP.')
    ]);
    AMX.modale({
      titre: 'Demander un avis au client', corps: corps,
      boutons: [{ texte: 'Annuler' }, { texte: 'Envoyer le sondage', classe: 'primaire', action: function () {
        if (!tel.value.trim() && !courriel.value.trim()) { AMX.toast('Il faut un cellulaire ou un courriel.', 'erreur'); tel.focus(); return false; }
        return AMX.post({ action: 'sondageCreer', concession: conc, type: type, clientNom: nom.value.trim(), clientTel: tel.value.trim(), clientCourriel: courriel.value.trim(), vendeur: selVendeur.value, vin: vin.value.trim().toUpperCase() })
          .then(function (r) {
            AMX.verifier(r, 'Envoi impossible');
            var e = r.envoi || {};
            if (e.canaux && e.canaux.length) AMX.toast('Sondage envoyé par ' + e.canaux.join(' et ') + (nom.value.trim() ? ' à ' + nom.value.trim() : ''), 'ok', 5000);
            else if (e.horsHeures) AMX.toast('Hors des heures d\'envoi : le sondage partira à 9 h.', 'ok', 6000);
            else AMX.toast('Sondage créé, mais l\'envoi a échoué (texto ou courriel). Lien : ' + r.lien, 'erreur', 9000);
            self.filtres.concession = self.filtres.concession || '';
            self.charger(true);
            if (self.onglet !== 'sondages') AMX.aller('avis', 'sondages');
            return true;
          }, function (err) { AMX.toast(AMX.erreurTexte(err), 'erreur'); return false; });
      } }]
    });
  };
})();
