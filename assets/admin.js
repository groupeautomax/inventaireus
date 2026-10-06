/* =========================================================================
   Section « Admin » : remplace admin.html (accès et utilisateurs).
   Réservée aux comptes qui ont le droit « gererUtilisateurs » (le rôle admin
   l'a d'office). Le serveur reste juge : s'il répond { refuse: true }, la
   page affiche un état verrouillé.

   Routes serveur utilisées (inchangées) :
     GET  ?utilisateurs=1  → { ok, utilisateurs: [{ nom (= courriel), nomComplet, role, actif,
                              acheteur, note, concession, nomConcession, modifiable, droits: { cle: bool } }],
                              droits: { liste: [{ cle, libelle, aide }], defauts: { role: { cle: bool } } },
                              moi: { courriel, role, concession, gererAdmins, concessions, noms,
                                     toutes, domaines, domaineNoms, accorderAcces } }
          (6 oct. : la liste ne contient que les comptes que je peux voir — ma
          concession, ou toutes pour le groupe ; `modifiable: false` = admin ou
          propriétaire, que seul le propriétaire peut toucher ; `acces` =
          accès supplémentaires { concessions: [codes], domaines: { d: '*' | [codes] } }
          que seul un compte du groupe (`accorderAcces`) peut changer)
     POST { action: 'majUtilisateur', nom, role, actif, acheteur, note, concession, nomComplet, droits?, acces? } → { ok }
          (sert à la création ET à la mise à jour ; `droits` ne contient que
          les écarts par rapport aux droits du rôle)
     POST { action: 'supprimerUtilisateur', nom } → { supprime }

   Le bloc `droits` peut manquer tant que le script Apps Script n'est pas
   redéployé : la grille des droits est alors remplacée par un avis, le reste
   fonctionne comme avant.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, esc = AMX.esc, I = AMX.icones;

  // Rôles (6 oct.) : proprietaire = Maxime seul (nomme et retire les admins) ;
  // admin = administrateur de concession (gère les comptes de sa concession —
  // ou de toutes, comme Marc-André, si sa concession est « * »).
  var ROLES = { proprietaire: 'Propriétaire', admin: 'Administrateur', gestionnaire: 'Gestionnaire', utilisateur: 'Utilisateur' };
  var ORDRE_ROLE = { proprietaire: 0, admin: 0, gestionnaire: 1, utilisateur: 2 };
  var COULEUR_ROLE = { proprietaire: 'sombre', admin: 'sombre', gestionnaire: 'bleu', utilisateur: 'gris' };
  var FILTRES_ROLE = [['', 'Tous'], ['admin', 'Admin'], ['gestionnaire', 'Gestionnaire'], ['utilisateur', 'Utilisateur'], ['inactif', 'Inactifs']];
  // Rôles qu'on peut donner d'ici : « Administrateur » seulement pour le propriétaire.
  function choixRoles(moiInfo) {
    var l = [['utilisateur', 'Utilisateur'], ['gestionnaire', 'Gestionnaire']];
    if (moiInfo && moiInfo.gererAdmins) l.push(['admin', 'Administrateur de concession']);
    return l;
  }
  var TOUTES = '*';
  function nomConcession(code, moiInfo) {
    if (!code) return '(à assigner)';
    if (code === TOUTES) return 'Groupe Automax (toutes)';
    return (moiInfo && moiInfo.noms && moiInfo.noms[code]) || AMX.COMPAGNIES_TOUTES[code] || code;
  }
  // Un compte verrouillé pour moi : le serveur le dit (`modifiable: false`) — admin ou propriétaire quand je ne suis pas propriétaire.
  function verrouille(u) { return u.modifiable === false; }

  // Accès supplémentaires (6 oct., soir) : un compte limité à sa concession peut
  // voir d'autres concessions — en entier (`concessions`) ou pour un domaine
  // seulement (`domaines`, '*' = toutes les concessions ou une liste de codes).
  // Ex. Maxime Fabian : HAWKS + { domaines: { evaluations: '*' } }.
  var DOMAINES = ['inventaire', 'evaluations', 'resultats', 'service'];
  var DOMAINE_NOMS = { inventaire: 'Inventaire', evaluations: 'Évaluations', resultats: 'Résultats', service: 'Service' };
  var DOMAINE_AIDE = { inventaire: 'registres, fiches, photos, journal, offres', evaluations: 'registre des évaluations et archive Torque', resultats: 'résultats et temps par étape', service: 'suivi service' };
  function accesNorm(a) {
    var out = { concessions: [], domaines: {} };
    if (!a || typeof a !== 'object') return out;
    (a.concessions || []).forEach(function (c) { c = String(c || '').toUpperCase(); if (c && c !== TOUTES && out.concessions.indexOf(c) < 0) out.concessions.push(c); });
    DOMAINES.forEach(function (d) {
      var v = a.domaines && a.domaines[d];
      if (v === TOUTES || v === true) out.domaines[d] = TOUTES;
      else if (Array.isArray(v) && v.length) out.domaines[d] = v.map(function (x) { return String(x || '').toUpperCase(); }).filter(function (x) { return x && x !== TOUTES; });
      if (Array.isArray(out.domaines[d]) && !out.domaines[d].length) delete out.domaines[d];
    });
    return out;
  }
  function accesVide(a) { var n = accesNorm(a); return !n.concessions.length && !Object.keys(n.domaines).length; }
  function accesCle(a) { var n = accesNorm(a); return JSON.stringify([n.concessions.slice().sort(), DOMAINES.map(function (d) { var v = n.domaines[d]; return v === TOUTES ? '*' : (v || []).slice().sort().join('+'); })]); }
  // Avant l'envoi : une concession vue en entier n'a pas à être répétée par domaine, ni la concession du compte.
  function accesNettoyer(a, concession) {
    var n = accesNorm(a);
    n.concessions = n.concessions.filter(function (c) { return c !== concession; });
    DOMAINES.forEach(function (d) {
      var v = n.domaines[d]; if (!v || v === TOUTES) return;
      v = v.filter(function (c) { return c !== concession && n.concessions.indexOf(c) < 0; });
      if (v.length) n.domaines[d] = v; else delete n.domaines[d];
    });
    return n;
  }
  // Les concessions d'un compte (la principale, colonne J, puis celles vues en entier).
  function concessionsDe(concession, acces) {
    if (concession === TOUTES) return [TOUTES];
    var l = concession ? [concession] : [];
    accesNorm(acces).concessions.forEach(function (c) { if (l.indexOf(c) < 0) l.push(c); });
    return l;
  }
  function nomsConcessions(concession, acces, moiInfo) {
    var l = concessionsDe(concession, acces);
    if (!l.length) return '(à assigner)';
    if (l[0] === TOUTES) return 'Groupe';
    return l.map(function (c) { return nomConcession(c, moiInfo); }).join(' + ');
  }
  // Cocher / décocher une concession sur un brouillon { concession, acces } : la
  // première cochée devient la principale (celle qui « possède » le compte pour
  // la gestion), les autres sont vues en entier. On garde toujours au moins une.
  function basculerConcession(b, code, oui) {
    b.acces = accesNorm(b.acces);
    if (code === TOUTES) {
      if (oui) { b.concession = TOUTES; b.acces.concessions = []; }
      else b.concession = '';
      return '';
    }
    if (oui) {
      if (!b.concession || b.concession === TOUTES) b.concession = code;
      else if (b.concession !== code && b.acces.concessions.indexOf(code) < 0) b.acces.concessions.push(code);
      return '';
    }
    if (b.concession === code) {
      var reste = b.acces.concessions.slice();
      if (!reste.length) return 'Un compte doit avoir au moins une concession — cochez-en une autre avant de retirer celle-ci.';
      b.concession = reste.shift(); b.acces.concessions = reste;
    } else b.acces.concessions = b.acces.concessions.filter(function (x) { return x !== code; });
    return '';
  }
  // Groupe de cases « Concessions » (Maxime, 6 oct. : « juste laisser le système
  // cocher deux concessions, c'est plus simple »). opts : { codes, moiInfo, bloque, apres(message) }
  function casesConcessions(b, opts) {
    var codes = opts.codes, moiInfo = opts.moiInfo, bloque = !!opts.bloque;
    var groupeCoche = b.concession === TOUTES;
    var el = h('div.admin-concessions');
    var caseA = function (code, libelle, coche, desactive, principale) {
      var cb = h('input', { type: 'checkbox', value: code, checked: coche, disabled: desactive, onchange: function (e) {
        var msg = basculerConcession(b, code, e.target.checked);
        if (msg) { e.target.checked = !e.target.checked; AMX.toast(msg, 'attention'); return; }
        opts.apres();
      } });
      return h('label.case' + (coche ? '.cochee' : ''), [cb, h('span', { text: libelle }), principale ? h('span.puce.info', { text: 'principale', title: 'La concession qui gère ce compte (son administrateur peut le modifier).' }) : null]);
    };
    codes.forEach(function (c) {
      var coche = groupeCoche || b.concession === c || accesNorm(b.acces).concessions.indexOf(c) >= 0;
      el.appendChild(caseA(c, nomConcession(c, moiInfo), coche, bloque || groupeCoche, !groupeCoche && b.concession === c && accesNorm(b.acces).concessions.length > 0));
    });
    el.appendChild(caseA(TOUTES, 'Tout le groupe (toutes les concessions, comme Marc-André)', groupeCoche, bloque, false));
    return el;
  }

  // Résumé lisible : « BMW, VW en entier · Évaluations : toutes · Service : STM ».
  function accesTexte(a, moiInfo) {
    var n = accesNorm(a), parts = [];
    if (n.concessions.length) parts.push(n.concessions.map(function (c) { return nomConcession(c, moiInfo); }).join(', ') + ' en entier');
    DOMAINES.forEach(function (d) { var v = n.domaines[d]; if (!v) return; parts.push(DOMAINE_NOMS[d] + ' : ' + (v === TOUTES ? 'toutes les concessions' : v.map(function (c) { return nomConcession(c, moiInfo); }).join(', '))); });
    return parts.join(' · ');
  }

  /* ------------------------------ Helpers ------------------------------ */
  function estCourriel(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || '').trim()); }
  function pluriel(n, mot, pl) { return n + ' ' + (n > 1 ? (pl || mot + 's') : mot); }
  function nomCle(nom) { return String(nom || '').trim().toLowerCase(); }
  function memeCourriel(a, b) { return nomCle(a) === nomCle(b); }
  function roleConnu(u) { return ROLES[u.role] ? u.role : 'utilisateur'; }
  function estActif(u) { return u.actif !== false; }
  function possede(o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); }
  function copier(o) { return Object.assign({}, o || {}); }

  // Référentiel des droits renvoyé par le serveur (null si absent).
  function lireReference(d) {
    var r = d && d.droits;
    if (!r || !Array.isArray(r.liste) || !r.defauts || typeof r.defauts !== 'object') return null;
    var liste = r.liste.filter(function (x) { return x && x.cle; });
    return liste.length ? { liste: liste, defauts: r.defauts } : null;
  }
  function defautDe(ref, role, cle) { return !!(ref && (ref.defauts[role] || {})[cle]); }

  // Écarts d'une personne par rapport à son rôle : on ne garde que les vraies
  // différences (une valeur égale au défaut du rôle n'est pas un écart).
  function ecartsDe(u, ref) {
    var src = (u.droits && typeof u.droits === 'object') ? u.droits : {};
    var role = roleConnu(u), out = {};
    Object.keys(src).forEach(function (k) {
      var v = src[k] === true;
      if (!ref || v !== defautDe(ref, role, k)) out[k] = v;
    });
    return out;
  }
  // Après un changement de rôle : les cases non touchées suivent le nouveau rôle.
  function nettoyerEcarts(b, ref) {
    if (!ref) return;
    Object.keys(b.ecarts).forEach(function (k) { if (b.ecarts[k] === defautDe(ref, b.role, k)) delete b.ecarts[k]; });
  }
  function memesEcarts(a, b) {
    var ka = Object.keys(a || {}).sort(), kb = Object.keys(b || {}).sort();
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) { if (ka[i] !== kb[i] || a[ka[i]] !== b[kb[i]]) return false; }
    return true;
  }
  function badgeRole(role, actif, roleBrut) {
    if (!actif) return h('span.badge.rouge', { text: 'Inactif' });
    return h('span.badge.' + (COULEUR_ROLE[role] || 'gris'), { text: ROLES[role] || (roleBrut ? String(roleBrut) : 'Utilisateur') });
  }
  function avatar(nom, role, actif, grand) {
    return h('div.admin-avatar' + (grand ? '.grand' : '') + '.admin-av-' + (actif ? (COULEUR_ROLE[role] ? role : 'utilisateur') : 'inactif'), { text: AMX.initiales(nom) });
  }

  function injecterCss() {
    if (document.getElementById('css-admin')) return;
    var s = document.createElement('style');
    s.id = 'css-admin';
    s.textContent = [
      '.admin-page .admin-principal { min-width: 0; }',
      '.admin-page .admin-filtre { margin-bottom: 10px; }',
      '.admin-page .admin-outils { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }',
      '.admin-page .admin-outils .recherche { flex: 1 1 220px; }',
      '.admin-page .admin-outils .segment { max-width: 100%; overflow-x: auto; scrollbar-width: none; }',
      '.admin-page .admin-outils .segment::-webkit-scrollbar { display: none; }',
      '.admin-page .admin-outils .segment button { white-space: nowrap; }',
      '.admin-page .admin-outils .compte { color: var(--encre-3); font-size: 12.5px; white-space: nowrap; margin-left: auto; }',
      '.admin-page .admin-outils .compte b { color: var(--encre); }',
      '.admin-page .admin-note { margin: 12px 2px 0; line-height: 1.5; }',
      '.admin-page .admin-parametres { margin-top: 18px; }',
      '.admin-page .admin-parametres .carte-corps { display: flex; flex-direction: column; gap: 10px; }',
      '.admin-page .admin-parametres .ligne-cle { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }',
      '.admin-page .admin-parametres .ligne-cle .champ { flex: 1 1 260px; }',
      '.admin-page .admin-parametres .etat-cle { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; }',
      '.admin-page .admin-parametres ol { margin: 0; padding-left: 18px; font-size: 12px; color: var(--encre-3); line-height: 1.6; }',
      // Avatar (liste et panneau), coloré comme le badge de rôle.
      '.admin-avatar { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 12px; flex: none; letter-spacing: .02em; }',
      '.admin-avatar.grand { width: 42px; height: 42px; font-size: 14px; }',
      '.admin-avatar.admin-av-admin { background: var(--noir-2); color: #fff; }',
      '.admin-avatar.admin-av-gestionnaire { background: var(--bleu-bg); color: var(--bleu); }',
      '.admin-avatar.admin-av-utilisateur { background: var(--gris-bg); color: var(--gris); }',
      '.admin-avatar.admin-av-inactif { background: var(--gris-bg); color: var(--encre-4); }',
      // Ligne de compte : avatar · courriel + note + badges · bouton.
      '.ligne.admin-ligne { grid-template-columns: 40px minmax(0, 1fr) auto; min-height: 58px; padding: 9px 12px; }',
      '.ligne.admin-ligne .titre { overflow-wrap: anywhere; white-space: normal; }',
      '.ligne.admin-ligne .admin-note-ligne { color: var(--encre-3); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }',
      '.ligne.admin-ligne.admin-modifiee::before { content: ""; position: absolute; left: -1px; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; background: var(--ambre); }',
      '.ligne.admin-ligne .btn { justify-self: end; }',
      // Panneau d'édition.
      '.admin-page .admin-entete-id { display: flex; gap: 12px; align-items: center; min-width: 0; }',
      '.admin-page .admin-entete-id h2 { overflow-wrap: anywhere; }',
      '.admin-page .panneau .segment button:disabled { opacity: .5; cursor: not-allowed; }',
      '.admin-page .panneau .case.plein { min-height: 34px; }',
      '.admin-page .admin-avis { margin-bottom: 10px; }',
      '.admin-droits { display: grid; grid-template-columns: 1fr; gap: 8px; }',
      '.admin-droit { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 8px 10px; background: var(--carte-2); }',
      '.admin-droit .case { padding: 0; color: var(--encre-3); }',          // suit le rôle : grisé
      '.admin-droit .case .t { font-weight: 500; }',
      '.admin-droit .case .puce { margin-left: auto; }',
      '.admin-droit .aide { font-size: 11.5px; color: var(--encre-4); line-height: 1.35; margin: 3px 0 0 23px; }',
      '.admin-droit.perso { border-color: var(--ambre-bord); background: var(--ambre-bg); }', // différent du rôle
      '.admin-droit.perso .case { color: var(--encre); }',
      '.admin-droit.perso .aide { color: var(--encre-3); }',
      '.admin-droit .aide.admin-ecart { color: var(--ambre); font-weight: 500; }',
      '.admin-droit.bloque { opacity: .55; }',
      '.admin-droit.bloque .case { cursor: default; }',
      '.admin-pied { margin: 10px 0 0; font-size: 11.5px; color: var(--encre-3); line-height: 1.45; }',
      // Grille des accès supplémentaires : une ligne par concession, une case par domaine.
      '.admin-acces { width: 100%; border-collapse: collapse; font-size: 12.5px; }',
      '.admin-acces th, .admin-acces td { padding: 5px 2px; border-bottom: 1px solid var(--ligne); text-align: center; }',
      '.admin-acces th { font-weight: 600; color: var(--encre-3); font-size: 11px; line-height: 1.2; vertical-align: bottom; }',
      '.admin-acces td:first-child { font-size: 12px; line-height: 1.25; }',
      '.admin-acces th:first-child, .admin-acces td:first-child { text-align: left; white-space: normal; }',
      '.admin-acces tr.toutes td { background: var(--carte-2); font-weight: 600; }',
      '.admin-acces input[type=checkbox] { width: 15px; height: 15px; margin: 0; accent-color: var(--bleu); cursor: pointer; }',
      '.admin-acces input[type=checkbox]:disabled { cursor: default; opacity: .45; }',
      '.admin-acces .implicite { color: var(--encre-4); font-size: 11px; }',
      '.admin-acces-enveloppe { overflow-x: auto; margin-top: 4px; }',
      // Cases « Concessions » : une par concession, plus « Tout le groupe ».
      '.admin-concessions { display: flex; flex-direction: column; gap: 4px; }',
      '.admin-concessions .case { padding: 5px 8px; border: 1px solid var(--ligne); border-radius: var(--rayon-s); background: var(--carte-2); min-height: 32px; }',
      '.admin-concessions .case.cochee { border-color: var(--vert); background: var(--vert-clair); }',
      '.admin-concessions .case .puce { margin-left: auto; }',
      '.admin-concessions input[type=checkbox]:disabled + span { color: var(--encre-4); }',
      '.admin-details { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 0 10px; background: var(--carte-2); }',
      '.admin-details summary { cursor: pointer; padding: 9px 0; font-size: 12.5px; font-weight: 600; color: var(--encre-2); list-style: none; display: flex; align-items: center; gap: 8px; }',
      '.admin-details summary::-webkit-details-marker { display: none; }',
      '.admin-details summary::before { content: "▸"; color: var(--encre-4); transition: transform .15s; }',
      '.admin-details[open] summary::before { transform: rotate(90deg); }',
      '.admin-details .admin-details-corps { padding: 0 0 10px; }',
      '.admin-page .saisie.fixe, .modale .saisie.fixe { display: flex; align-items: center; min-height: 34px; padding: 0 10px; border: 1px solid var(--ligne); border-radius: var(--rayon-s); font-size: 13px; color: var(--encre-2); background: var(--carte-2); cursor: default; }',
      // Modale d'ajout.
      '.admin-form { display: flex; flex-direction: column; gap: 12px; }',
      '.admin-form .intro { margin: 0; color: var(--encre-3); line-height: 1.5; }',
      '.admin-form .case { min-height: 34px; }',
      '.admin-erreur { color: var(--rouge); font-size: 12px; min-height: 16px; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ Section ------------------------------ */
  AMX.section('admin', {
    titre: 'Admin', icone: 'admin', ordre: 90,
    visible: function () { return AMX.estAdmin(); },
    monter: function (conteneur, ctx) {
      var vue = new VueAdmin(conteneur, ctx);
      return { demonter: function () { vue.demonter(); } };
    }
  });

  function VueAdmin(conteneur, ctx) {
    injecterCss();
    this.conteneur = conteneur;
    this.moi = AMX.session.courriel || '';
    this.utilisateurs = null;     // null tant que la liste n'est pas chargée
    this.reference = null;        // { liste, defauts } ou null
    this.refus = ''; this.erreur = '';
    this.enChargement = false;
    this.selection = (ctx && ctx.params && ctx.params.u) ? String(ctx.params.u) : '';   // #/admin?u=courriel
    this.brouillons = {};         // courriel (minuscule) → { role, actif, acheteur, note, ecarts }
    this.filtres = { recherche: '', role: '' };
    this.lignes = {};             // courriel (minuscule) → élément .ligne
    this.generation = 0;
    this.detruit = false;
    this.construire();
    this.charger();
  }

  VueAdmin.prototype.demonter = function () { this.detruit = true; this.generation++; };

  /* --------------------------- Construction ---------------------------- */
  VueAdmin.prototype.construire = function () {
    var self = this;
    AMX.vider(this.conteneur);

    this.elEtat = h('p', { text: 'Chargement des comptes…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnAjouter = h('button.btn.primaire', { type: 'button', html: I.plus + '<span>Ajouter un compte</span>', onclick: function () { self.modaleAjouter(); } });
    this.elActions = h('div.actions', [this.btnRafraichir, this.btnAjouter]);
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Accès et utilisateurs'), this.elEtat]),
      this.elActions
    ]);

    // Recherche + filtre de rôle
    this.elRecherche = h('input.saisie', {
      type: 'search', placeholder: 'Courriel ou note…', autocomplete: 'off',
      oninput: AMX.debounce(function (e) { self.filtres.recherche = e.target.value; self.rendreListe(); }, 120)
    });
    this.elSegment = h('div.segment');
    this.elCompte = h('span.compte');
    var filtre = h('div.carte.admin-filtre', [h('div.carte-corps', [h('div.admin-outils', [
      h('div.recherche', [h('span', { html: I.recherche }), this.elRecherche]),
      this.elSegment,
      this.elCompte
    ])])]);

    this.elListe = h('div.liste');
    this.elVide = h('div');
    this.elNote = h('p.doux.petit.admin-note', 'Le rôle donne les droits de départ ; les droits personnalisés permettent d\'en accorder ou d\'en retirer à une personne précise. Chaque personne se connecte avec son propre courriel et un code reçu par courriel. Désactiver un compte coupe l\'accès au site et à l\'app ScanAutomax sans effacer l\'historique ; toute modification est immédiate.');
    this.elPanneau = h('aside.panneau', { style: { display: 'none' } });
    this.elParametres = this.construireParametres();
    this.elAlertes = this.construireAlertes();
    this.elAgencement = h('div.agencement.sans-rail', [h('div.admin-principal', [filtre, this.elListe, this.elNote, this.elAlertes, this.elParametres]), this.elPanneau]);

    this.elPage = h('div.page.etroite.admin-page', [entete, this.elVide, this.elAgencement]);
    this.conteneur.appendChild(this.elPage);
    this.rendre();
  };

  /* ------------------------------ Données ------------------------------ */
  /* ------------------- Paramètres serveur (clé MarketCheck) ------------------
     Routes : GET ?parametres=1 → { ok, parametres: { MARKETCHECK_KEY: { present, fin } } }
              POST { action: 'reglerParametre', cle: 'MARKETCHECK_KEY', valeur } → { ok, present, fin }
     La clé est gardée dans les propriétés du script ; le serveur n'en renvoie
     jamais que les 4 derniers caractères. Tant que le script n'est pas
     redéployé, la route manque : la carte le dit sans bloquer le reste. */
  VueAdmin.prototype.construireParametres = function () {
    var self = this;
    this.elEtatCle = h('span.etat-cle', [h('span.badge.gris.sans-point', { text: 'Vérification…' })]);
    this.elCle = h('input#adm-cle-marketcheck', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'Collez la clé API MarketCheck ici' });
    this.elCle.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); self.enregistrerCle(); } });
    this.btnCle = h('button.btn.primaire#adm-cle-enregistrer', { type: 'button', html: I.ok + '<span>Enregistrer la clé</span>', onclick: function () { self.enregistrerCle(); } });
    this.btnCleRetirer = h('button.btn.danger.petit#adm-cle-retirer', { type: 'button', text: 'Retirer la clé', onclick: function () { self.retirerCle(); } });
    var voir = h('button.btn.petit.fantome', { type: 'button', text: 'Afficher', onclick: function () { var p = self.elCle.type === 'password'; self.elCle.type = p ? 'text' : 'password'; voir.textContent = p ? 'Masquer' : 'Afficher'; } });
    var corps = [
      h('p.doux.petit', { style: { margin: 0 }, text: 'L\'analyse de marché de la fiche d\'évaluation (Outils › Évaluation marché) interroge MarketCheck : annonces actives et ventes récentes au Canada et aux États-Unis. La clé est gardée sur le serveur, jamais renvoyée au navigateur ni enregistrée dans l\'app.' }),
      h('div.ligne-cle', [h('div.champ', [h('label', { 'for': 'adm-cle-marketcheck', text: 'Clé API MarketCheck' }), this.elCle]), voir, this.btnCle, this.btnCleRetirer]),
      h('div', [h('span.etiquette', { text: 'État : ' }), this.elEtatCle]),
      h('details', [h('summary.doux.petit', { style: { cursor: 'pointer' }, text: 'Obtenir ou renouveler une clé (plan gratuit : 500 appels par mois)' }), h('ol', [
        h('li', 'Créez un compte sur marketcheck.com (connexion Google avec le courriel du travail), plan Free.'),
        h('li', 'Dans le tableau de bord, créez une application (« ScanAutomax ») : la clé API s\'affiche.'),
        h('li', 'Collez-la ci-dessus et enregistrez. Pour la remplacer, collez la nouvelle : l\'ancienne est écrasée. Chaque analyse fait 2 appels (annonces + ventes), mis en cache 6 heures.')
      ])])
    ];
    return h('div.carte.admin-parametres', [h('div.carte-entete', [h('h2', 'Données de marché (MarketCheck)')]), h('div.carte-corps', corps)]);
  };
  /* ------------------- Alertes aux directeurs : textos (Infobip) -----------------
     Maxime, 6 oct. : « quand une évaluation est faite dans une concession puis dans
     une autre, le directeur général doit recevoir une notification ; on pourrait
     ajouter des numéros de téléphone pour faire des textos ». Le courriel part
     toujours ; le texto demande un compte Infobip (adresse de base de l'API, clé
     API, numéro d'envoi canadien), gardé sur le serveur (Notif.gs), et un numéro
     sur chaque compte (ci-contre). Twilio reste accepté côté serveur en repli. */
  VueAdmin.prototype.construireAlertes = function () {
    var self = this;
    this.elEtatSms = h('span.etat-cle', [h('span.badge.gris.sans-point', { text: 'Vérification…' })]);
    var champ = function (id, libelle, placeholder, type) { var i = h('input#' + id, { type: type || 'text', autocomplete: 'off', spellcheck: 'false', placeholder: placeholder }); return { el: i, champ: h('div.champ', [h('label', { 'for': id, text: libelle }), i]) }; };
    this.elSmsUrl = champ('adm-sms-url', 'Adresse de base (Base URL)', 'xxxxx.api.infobip.com');
    this.elSmsCle = champ('adm-sms-cle', 'Clé API', 'clé Infobip', 'password');
    this.elSmsFrom = champ('adm-sms-from', 'Numéro d\'envoi', '+1 450 555 0123');
    var btn = h('button.btn.primaire#adm-sms-enregistrer', { type: 'button', html: I.ok + '<span>Enregistrer Infobip</span>', onclick: function () { self.enregistrerSms(btn); } });
    var btnRetirer = h('button.btn.danger.petit', { type: 'button', text: 'Retirer', onclick: function () { self.retirerSms(); } });
    this.btnSmsRetirer = btnRetirer;
    var corps = [
      h('p.doux.petit', { style: { margin: 0 }, text: 'Quand le même véhicule est évalué dans deux concessions du groupe à moins de 30 jours d\'écart, les directeurs généraux des deux concessions (les administrateurs de concession) reçoivent une alerte par courriel — et par texto si leur compte a un numéro de téléphone et qu\'Infobip est configuré ici.' }),
      h('div.ligne-cle', [this.elSmsUrl.champ, this.elSmsCle.champ, this.elSmsFrom.champ, btn, btnRetirer]),
      h('div', [h('span.etiquette', { text: 'Textos : ' }), this.elEtatSms]),
      this.elCompteTextos = h('div.compte-textos'),
      h('details', [h('summary.doux.petit', { style: { cursor: 'pointer' }, text: 'Compte Infobip (environ 0,01 $ par texto, numéro canadien 1 $/mois)' }), h('ol', [
        h('li', 'portal.infobip.com : ajoutez des fonds (le compte d\'essai ne texte que votre propre numéro), puis Canaux et numéros › Numéros › Acheter un numéro › Canada, SMS, numéro long virtuel.'),
        h('li', 'Outils pour les développeurs › Clés API : créez une clé ; l\'adresse de base (xxxxx.api.infobip.com) est affichée sur la même page.'),
        h('li', 'Collez les trois valeurs ci-dessus et enregistrez. Ajoutez ensuite un numéro de téléphone aux comptes des directeurs (panneau du compte › Téléphone).')
      ])])
    ];
    return h('div.carte.admin-parametres', [h('div.carte-entete', [h('h2', 'Alertes aux directeurs (textos)')]), h('div.carte-corps', corps)]);
  };
  // Qui recevra les textos : compte des numéros inscrits, directeurs sans numéro nommés.
  VueAdmin.prototype.rendreCompteTextos = function () {
    if (!this.elCompteTextos) return;
    AMX.vider(this.elCompteTextos);
    var liste = (this.utilisateurs || []).filter(estActif);
    if (!liste.length) return;
    var avec = liste.filter(function (u) { return u.telephone; });
    var directeursSans = liste.filter(function (u) { var r = roleConnu(u); return (r === 'admin' || r === 'proprietaire') && !u.telephone; });
    this.elCompteTextos.appendChild(h('span.puce.texto', { text: pluriel(avec.length, 'compte') + ' avec numéro' }));
    if (directeursSans.length) {
      this.elCompteTextos.appendChild(h('span.puce.attention', { title: directeursSans.map(function (u) { return u.nomComplet || u.nom; }).join(', '), text: pluriel(directeursSans.length, 'directeur') + ' sans numéro — courriel seulement' }));
    } else {
      this.elCompteTextos.appendChild(h('span.doux.petit', { text: 'Tous les directeurs ont un numéro.' }));
    }
  };
  VueAdmin.prototype.rendreEtatSms = function (p) {
    AMX.vider(this.elEtatSms);
    if (p === null) { this.elEtatSms.appendChild(h('span.badge.ambre.sans-point', { text: 'Route absente — redéployez le script' })); return; }
    var present = function (cle) { return !!(p && p[cle] && p[cle].present); };
    var infobip = present('INFOBIP_URL') && present('INFOBIP_CLE') && present('INFOBIP_FROM');
    var twilio = present('TWILIO_SID') && present('TWILIO_TOKEN') && present('TWILIO_FROM');
    if (infobip || twilio) {
      this.elEtatSms.appendChild(h('span.badge.vert', { text: 'Textos actifs (' + (infobip ? 'Infobip' : 'Twilio') + ')' }));
      this.elEtatSms.appendChild(h('span.mono.doux', { text: (infobip ? p.INFOBIP_FROM.valeur : p.TWILIO_FROM.valeur) || '' }));
      this.btnSmsRetirer.classList.remove('cache');
    } else {
      this.elEtatSms.appendChild(h('span.badge.gris.sans-point', { text: 'Courriel seulement — aucun fournisseur de textos' }));
      this.btnSmsRetirer.classList.add('cache');
    }
  };
  VueAdmin.prototype.enregistrerSms = function (btn) {
    var self = this;
    var url = this.elSmsUrl.el.value.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, ''), cle = this.elSmsCle.el.value.trim(), de = this.elSmsFrom.el.value.replace(/[^\d+]/g, '');
    if (!/^[\w.-]+\.api\.infobip\.com$/i.test(url)) { AMX.toast('L\'adresse de base ressemble à xxxxx.api.infobip.com (page Clés API d\'Infobip).', 'attention'); return; }
    if (cle.length < 16) { AMX.toast('Collez la clé API complète.', 'attention'); return; }
    if (!/^\+?1?\d{10}$/.test(de)) { AMX.toast('Numéro d\'envoi : 10 chiffres (ex. +1 450 555 0123).', 'attention'); return; }
    if (de.charAt(0) !== '+') de = '+' + (de.length === 10 ? '1' + de : de);
    btn.classList.add('occupe');
    var poser = function (cle, valeur) { return AMX.post({ action: 'reglerParametre', cle: cle, valeur: valeur }).then(function (d) { AMX.verifier(d, 'Refusé : ' + cle); }); };
    poser('INFOBIP_URL', url).then(function () { return poser('INFOBIP_CLE', cle); }).then(function () { return poser('INFOBIP_FROM', de); }).then(function () {
      self.elSmsUrl.el.value = ''; self.elSmsCle.el.value = ''; self.elSmsFrom.el.value = '';
      self.rendreEtatSms({ INFOBIP_URL: { present: true }, INFOBIP_CLE: { present: true }, INFOBIP_FROM: { present: true, valeur: de } });
      AMX.toast('Infobip enregistré : les alertes partiront aussi par texto.', 'ok');
    }).catch(function (e) { AMX.toast('Non enregistré — ' + AMX.erreurTexte(e), 'erreur'); }).then(function () { btn.classList.remove('occupe'); });
  };
  VueAdmin.prototype.retirerSms = function () {
    var self = this;
    AMX.confirmer('Retirer les textos ?', 'Les alertes continueront par courriel seulement.', { danger: true, ok: 'Retirer' }).then(function (oui) {
      if (!oui) return;
      return Promise.all(['INFOBIP_URL', 'INFOBIP_CLE', 'INFOBIP_FROM', 'TWILIO_SID', 'TWILIO_TOKEN', 'TWILIO_FROM'].map(function (cle) { return AMX.post({ action: 'reglerParametre', cle: cle, valeur: '' }); })).then(function () {
        self.rendreEtatSms({});
        AMX.toast('Textos retirés.', 'ok');
      });
    }).catch(function (e) { AMX.toast('Échec — ' + AMX.erreurTexte(e), 'erreur'); });
  };
  VueAdmin.prototype.rendreEtatCle = function (p) {
    AMX.vider(this.elEtatCle);
    if (p === null) { this.elEtatCle.appendChild(h('span.badge.ambre.sans-point', { text: 'Route absente — redéployez le script (Marche.gs)' })); this.btnCle.disabled = true; return; }
    this.btnCle.disabled = false;
    if (p && p.present) {
      this.elEtatCle.appendChild(h('span.badge.vert', { text: 'Clé en place' }));
      this.elEtatCle.appendChild(h('span.mono.doux', { text: '…' + (p.fin || '') }));
      this.btnCleRetirer.classList.remove('cache');
    } else {
      this.elEtatCle.appendChild(h('span.badge.rouge', { text: 'Aucune clé — l\'analyse de marché est inactive' }));
      this.btnCleRetirer.classList.add('cache');
    }
  };
  VueAdmin.prototype.chargerParametres = function () {
    var self = this;
    return AMX.get({ parametres: 1 }).then(function (d) {
      if (self.detruit) return;
      if (!d || d.refuse || !d.ok || !d.parametres) { self.rendreEtatCle(null); self.rendreEtatSms(null); return; }
      self.rendreEtatCle(d.parametres.MARKETCHECK_KEY || { present: false });
      self.rendreEtatSms(d.parametres);
    }).catch(function () { if (!self.detruit) { self.rendreEtatCle(null); self.rendreEtatSms(null); } });
  };
  VueAdmin.prototype.enregistrerCle = function () {
    var self = this, valeur = this.elCle.value.trim();
    if (valeur.length < 8) { AMX.toast('Collez la clé API complète avant d\'enregistrer.', 'attention'); this.elCle.focus(); return; }
    this.btnCle.classList.add('occupe');
    AMX.post({ action: 'reglerParametre', cle: 'MARKETCHECK_KEY', valeur: valeur }).then(function (d) {
      AMX.verifier(d, 'Le serveur a refusé la clé');
      self.elCle.value = '';
      self.rendreEtatCle({ present: !!d.present, fin: d.fin });
      AMX.toast('Clé MarketCheck enregistrée sur le serveur.', 'ok');
    }).catch(function (e) { AMX.toast('Clé non enregistrée — ' + AMX.erreurTexte(e), 'erreur'); })
      .then(function () { self.btnCle.classList.remove('occupe'); });
  };
  VueAdmin.prototype.retirerCle = function () {
    var self = this;
    AMX.confirmer('Retirer la clé MarketCheck ?', 'L\'analyse de marché cessera de fonctionner jusqu\'à ce qu\'une clé soit collée de nouveau.', { danger: true, ok: 'Retirer' }).then(function (oui) {
      if (!oui) return;
      return AMX.post({ action: 'reglerParametre', cle: 'MARKETCHECK_KEY', valeur: '' }).then(function (d) {
        AMX.verifier(d, 'Le serveur a refusé');
        self.rendreEtatCle({ present: false });
        AMX.toast('Clé retirée.', 'ok');
      });
    }).catch(function (e) { AMX.toast('Échec — ' + AMX.erreurTexte(e), 'erreur'); });
  };

  VueAdmin.prototype.charger = function (manuel) {
    var self = this, gen = ++this.generation;
    this.enChargement = true;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    this.chargerParametres();
    return AMX.get('utilisateurs=1').then(function (d) {
      if (self.detruit || gen !== self.generation) return;
      self.enChargement = false;
      self.btnRafraichir.classList.remove('occupe');
      if (d && d.refuse) {
        self.refus = d.erreur || d.message || 'Ce menu demande le droit « Gérer les utilisateurs ».';
        self.rendre();
        return;
      }
      if (!d || d.ok === false) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
      self.utilisateurs = (d.utilisateurs || []).filter(function (u) { return u && u.nom; });
      self.reference = lireReference(d);
      self.moiInfo = d.moi || null;   // { courriel, role, concession, gererAdmins, concessions, noms }
      self.erreur = ''; self.refus = '';
      self.rendre();
      if (manuel) AMX.toast('Liste des comptes mise à jour', 'ok');
    }, function (e) {
      if (self.detruit || gen !== self.generation) return;
      self.enChargement = false;
      self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e);
      self.rendre();
      AMX.toast('Impossible de charger les comptes — ' + self.erreur, 'erreur');
    });
  };

  VueAdmin.prototype.utilisateur = function (nom) {
    return (this.utilisateurs || []).filter(function (u) { return memeCourriel(u.nom, nom); })[0] || null;
  };

  // Brouillon d'édition d'une personne (créé à la demande, conservé entre deux rendus).
  VueAdmin.prototype.brouillonDe = function (u) {
    var cle = nomCle(u.nom);
    if (!this.brouillons[cle]) {
      this.brouillons[cle] = { role: roleConnu(u), actif: estActif(u), acheteur: !!u.acheteur, note: String(u.note || ''), ecarts: ecartsDe(u, this.reference),
        concession: String(u.concession || ''), nomComplet: String(u.nomComplet || ''), acces: accesNorm(u.acces), telephone: String(u.telephone || '') };
    }
    return this.brouillons[cle];
  };
  VueAdmin.prototype.estModifie = function (u) {
    var b = this.brouillons[nomCle(u.nom)];
    if (!b) return false;
    return b.role !== roleConnu(u) || b.actif !== estActif(u) || b.acheteur !== !!u.acheteur ||
      b.note.trim() !== String(u.note || '').trim() || !memesEcarts(b.ecarts, ecartsDe(u, this.reference)) ||
      b.concession !== String(u.concession || '') || b.nomComplet.trim() !== String(u.nomComplet || '').trim() ||
      accesCle(b.acces) !== accesCle(u.acces) || b.telephone.trim() !== String(u.telephone || '').trim();
  };

  VueAdmin.prototype.passeFiltres = function (u) {
    var f = this.filtres, t = f.recherche.trim().toLowerCase();
    if (f.role === 'inactif') { if (estActif(u)) return false; }
    else if (f.role) { var ru = roleConnu(u); if (!estActif(u) || (ru !== f.role && !(f.role === 'admin' && ru === 'proprietaire'))) return false; }
    if (t && String(u.nom).toLowerCase().indexOf(t) < 0 && String(u.note || '').toLowerCase().indexOf(t) < 0) return false;
    return true;
  };
  // Tri : admins, gestionnaires, utilisateurs, puis les comptes désactivés ; alphabétique ensuite.
  VueAdmin.prototype.filtrees = function () {
    var self = this;
    var rang = function (u) { return estActif(u) ? (ORDRE_ROLE[u.role] !== undefined ? ORDRE_ROLE[u.role] : 4) : 9; };
    return (this.utilisateurs || []).filter(function (u) { return self.passeFiltres(u); }).sort(function (a, b) {
      var da = rang(a), db = rang(b);
      if (da !== db) return da - db;
      return String(a.nom).localeCompare(String(b.nom), 'fr');
    });
  };

  /* -------------------------------- Rendu ------------------------------ */
  VueAdmin.prototype.rendre = function () {
    this.rendreEntete();
    this.rendreVide();
    this.rendreSegment();
    this.rendreListe();
    this.rendrePanneau();
  };

  VueAdmin.prototype.rendreEntete = function () {
    if (this.refus) { this.elEtat.textContent = 'Menu réservé aux comptes ayant le droit « Gérer les utilisateurs ».'; this.elActions.classList.add('cache'); return; }
    this.elActions.classList.remove('cache');
    this.btnAjouter.disabled = !this.utilisateurs;
    if (!this.utilisateurs) { this.elEtat.textContent = this.erreur ? 'Serveur injoignable.' : 'Chargement des comptes…'; return; }
    var n = this.utilisateurs.length, admins = 0, gest = 0, util = 0, inactifs = 0;
    this.utilisateurs.forEach(function (u) {
      if (!estActif(u)) { inactifs++; return; }
      var r = roleConnu(u);
      if (r === 'admin' || r === 'proprietaire') admins++; else if (r === 'gestionnaire') gest++; else util++;
    });
    var ou = (this.moiInfo && this.moiInfo.concession && this.moiInfo.concession !== TOUTES) ? nomConcession(this.moiInfo.concession, this.moiInfo) + ' · ' : '';
    this.elEtat.textContent = ou + pluriel(n, 'compte') + ' · ' + pluriel(admins, 'admin') + ' · ' + pluriel(gest, 'gestionnaire') + ' · ' + pluriel(util, 'utilisateur') + (inactifs ? ' · ' + pluriel(inactifs, 'inactif') : '');
  };

  // États pleine largeur : accès refusé (verrouillé) ou serveur injoignable sans données.
  VueAdmin.prototype.rendreVide = function () {
    var self = this;
    AMX.vider(this.elVide);
    var plein = !!this.refus || (!this.utilisateurs && !!this.erreur);
    this.elAgencement.classList.toggle('cache', plein);
    if (this.refus) {
      this.elVide.appendChild(h('div.vide', [h('div', { html: I.cadenas }), h('h3', 'Menu réservé aux administrateurs'), h('div', { text: this.refus })]));
    } else if (plein) {
      this.elVide.appendChild(h('div.vide', [h('div', { html: I.alerte }), h('h3', 'Serveur injoignable'), h('div', { text: this.erreur }),
        h('div', { style: { marginTop: '12px' } }, [h('button.btn', { type: 'button', html: I.rafraichir + '<span>Réessayer</span>', onclick: function () { self.charger(true); } })])]));
    }
  };

  VueAdmin.prototype.rendreSegment = function () {
    var self = this;
    AMX.vider(this.elSegment);
    FILTRES_ROLE.forEach(function (o) {
      self.elSegment.appendChild(h('button' + (self.filtres.role === o[0] ? '.actif' : ''), { type: 'button', text: o[1], onclick: function () {
        if (self.filtres.role === o[0]) return;
        self.filtres.role = o[0];
        self.rendreSegment(); self.rendreListe();
      } }));
    });
  };

  VueAdmin.prototype.reinitialiserFiltres = function () {
    this.filtres.recherche = ''; this.filtres.role = '';
    this.elRecherche.value = '';
    this.rendreSegment(); this.rendreListe();
  };

  VueAdmin.prototype.rendreListe = function () {
    var self = this;
    AMX.vider(this.elListe);
    this.lignes = {};
    this.elCompte.textContent = '';
    if (!this.utilisateurs) {
      this.elListe.appendChild(AMX.chargeur('Comptes et accès'));
      return;
    }
    var liste = this.filtrees(), total = this.utilisateurs.length;
    this.rendreCompteTextos();
    AMX.vider(this.elCompte);
    this.elCompte.appendChild(h('b', { text: String(liste.length) }));
    this.elCompte.appendChild(document.createTextNode(' ' + (liste.length > 1 ? 'comptes' : 'compte') + (liste.length !== total ? ' sur ' + total : '')));
    if (!total) {
      this.elListe.appendChild(h('div.vide', [h('div', { html: I.admin }), h('h3', 'Aucun compte'), h('div', 'Ajoutez un premier compte pour donner accès au site et à l\'app.'),
        h('div', { style: { marginTop: '12px' } }, [h('button.btn.primaire', { type: 'button', html: I.plus + '<span>Ajouter un compte</span>', onclick: function () { self.modaleAjouter(); } })])]));
      return;
    }
    if (!liste.length) {
      this.elListe.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucun compte ne correspond'), h('div', 'Modifiez la recherche ou le filtre de rôle.'),
        h('div', { style: { marginTop: '12px' } }, [h('button.btn', { type: 'button', text: 'Réinitialiser les filtres', onclick: function () { self.reinitialiserFiltres(); } })])]));
      return;
    }
    liste.forEach(function (u) { self.elListe.appendChild(self.ligne(u)); });
  };

  // Textos (6 oct.) : un numéro = la personne reçoit les alertes par texto ; un directeur sans numéro est signalé.
  function telephoneTexte(brut) { return AMX.telephoneTexte ? AMX.telephoneTexte(brut) : String(brut || ''); }
  function puceTexto(u, role, actif) {
    if (!actif) return null;
    var directeur = role === 'admin' || role === 'proprietaire';
    if (u.telephone) return h('span.puce.texto', { title: directeur ? 'Directeur : reçoit les alertes d\'évaluation par texto au ' + telephoneTexte(u.telephone) : 'Numéro inscrit (' + telephoneTexte(u.telephone) + '). Les alertes d\'évaluation vont aux directeurs seulement.', text: directeur ? 'Texto · alertes évaluation' : 'Texto' });
    if (directeur) return h('span.puce.attention', { title: 'Directeur sans numéro de cellulaire : il reçoit les alertes d\'évaluation par courriel seulement. Ajoutez son numéro dans le panneau (Téléphone).', text: 'Pas de texto' });
    return null;
  }
  // Une ligne = l'état enregistré sur le serveur, plus un repère si un brouillon diffère.
  VueAdmin.prototype.ligne = function (u) {
    var self = this, cle = nomCle(u.nom);
    var moi = memeCourriel(u.nom, this.moi), actif = estActif(u), role = roleConnu(u);
    var modifiee = this.estModifie(u);
    var ecarts = Object.keys(ecartsDe(u, this.reference));
    var groupe = !this.moiInfo || !this.moiInfo.concession || this.moiInfo.concession === TOUTES;
    var badges = [
      badgeRole(role, actif, u.role),
      groupe ? h('span.puce' + (u.concession === TOUTES ? '.info' : (u.concession ? '' : '.alerte')), { text: nomsConcessions(u.concession, u.acces, this.moiInfo) }) : null,
      verrouille(u) ? h('span.puce', { title: 'Seul le propriétaire peut modifier ou retirer un administrateur.', text: 'Géré par le propriétaire' }) : null,
      (u.concession !== TOUTES && u.acces && Object.keys(accesNorm(u.acces).domaines).length) ? h('span.puce.info', { title: accesTexte(u.acces, this.moiInfo), text: 'Accès +' }) : null,
      u.acheteur ? h('span.puce', { text: 'Acheteur' }) : null,
      puceTexto(u, role, actif),
      ecarts.length ? h('span.puce.attention', { title: pluriel(ecarts.length, 'droit') + ' différent' + (ecarts.length > 1 ? 's' : '') + ' du rôle : ' + ecarts.join(', '), text: 'Droits personnalisés' }) : null,
      moi ? h('span.puce.info', { text: 'Vous' }) : null,
      !estCourriel(u.nom) ? h('span.puce.alerte', { title: 'Cette ligne du registre n\'est pas une adresse courriel valide.', text: 'Courriel invalide' }) : null,
      modifiee ? h('span.puce.attention', { title: 'Des modifications ne sont pas encore enregistrées.', text: 'Non enregistrée' }) : null
    ];
    var el = h('div.ligne.admin-ligne' + (actif ? '' : '.verrouille') + (modifiee ? '.admin-modifiee' : '') + (this.selection && memeCourriel(u.nom, this.selection) ? '.actif' : ''), { dataset: { nom: cle } }, [
      avatar(u.nom, role, actif, false),
      h('div', { style: { minWidth: 0 } }, [
        h('div.titre', { text: u.nomComplet ? u.nomComplet + ' — ' + u.nom : u.nom }),
        h('div.sous', [u.note ? h('span.admin-note-ligne', { title: u.note, text: u.note }) : null].concat(badges))
      ]),
      h('button.btn.petit', { type: 'button', text: 'Modifier', onclick: function (e) { e.stopPropagation(); self.selectionner(u.nom); } })
    ]);
    el.addEventListener('click', function () { self.selectionner(u.nom); });
    this.lignes[cle] = el;
    return el;
  };

  VueAdmin.prototype.majLigne = function (u) {
    var ancien = this.lignes[nomCle(u.nom)];
    if (!ancien || !ancien.parentNode) return;
    ancien.parentNode.replaceChild(this.ligne(u), ancien);
  };

  VueAdmin.prototype.selectionner = function (nom) {
    this.selection = nom || '';
    history.replaceState(null, '', AMX.lien('admin', '', nom ? { u: nom } : {}));
    this.rendreListe();
    this.rendrePanneau();
  };

  /* ------------------------------ Panneau ------------------------------ */
  VueAdmin.prototype.rendrePanneau = function () {
    var self = this;
    var u = this.selection ? this.utilisateur(this.selection) : null;
    this.elAgencement.classList.toggle('avec-panneau', !!u);
    AMX.vider(this.elPanneau);
    this.pSous = null; this.pBtnAnnuler = null;
    if (!u) {
      this.elPanneau.style.display = 'none';
      // Lien profond vers un compte qui n'existe pas (ou plus) : on oublie la sélection.
      if (this.selection && this.utilisateurs) { this.selection = ''; history.replaceState(null, '', AMX.lien('admin', '')); }
      return;
    }
    this.elPanneau.style.display = '';
    var b = this.brouillonDe(u), ref = this.reference, moi = memeCourriel(u.nom, this.moi), cle = nomCle(u.nom);
    var fermer = function () { self.selectionner(''); };
    var rafraichir = function () { self.rendrePanneau(); self.majLigne(u); };     // changement structurel (rôle, accès, droits)
    var leger = function () { self.rendreSous(u); self.majLigne(u); };           // changement sans refaire le panneau (note, acheteur)

    // En-tête
    this.pSous = h('div.sous');
    var entete = h('div.panneau-entete', [
      h('div.admin-entete-id', [
        avatar(u.nom, b.role, b.actif, true),
        h('div', { style: { minWidth: 0 } }, [h('h2', { text: u.nom }), this.pSous])
      ]),
      h('button.fermer', { type: 'button', title: 'Fermer', html: I.fermer, onclick: fermer })
    ]);

    // Compte : rôle, concession, nom, accès, acheteur, note
    var verrou = verrouille(u), moiInfo = this.moiInfo, groupe = !moiInfo || !moiInfo.concession || moiInfo.concession === TOUTES;
    var choix = choixRoles(moiInfo);
    if (!choix.some(function (o) { return o[0] === b.role; })) choix = choix.concat([[b.role, ROLES[b.role] || b.role]]);   // rôle actuel non attribuable d'ici (admin, propriétaire) : affiché, pas proposé
    var selRole = h('select', { disabled: moi || verrou, title: moi ? 'Vous ne pouvez pas changer votre propre rôle.' : (verrou ? 'Seul le propriétaire peut modifier un administrateur.' : null) },
      choix.map(function (o) { return h('option', { value: o[0], text: o[1], selected: b.role === o[0] }); }));
    // Concessions : des cases à cocher (une ou plusieurs ; « Tout le groupe » pour voir tout).
    // Un admin de concession ne gère que la sienne : texte fixe.
    var codesTous = (moiInfo && moiInfo.toutes) || Object.keys(AMX.COMPAGNIES_TOUTES);
    var champConc = groupe
      ? casesConcessions(b, { codes: codesTous, moiInfo: moiInfo, bloque: verrou || moi, apres: rafraichir })
      : h('div.saisie.fixe', { text: nomConcession(moiInfo.concession, moiInfo), title: 'Les comptes que vous gérez sont dans votre concession.' });
    var inpNom = h('input', { type: 'text', value: b.nomComplet, placeholder: 'Prénom Nom', autocomplete: 'off', disabled: verrou, oninput: function (e) { b.nomComplet = e.target.value; leger(); } });
    var inpTel = h('input', { type: 'tel', value: b.telephone, placeholder: '450 555 0123 (textos d\'alerte)', autocomplete: 'off', disabled: verrou, oninput: function (e) { b.telephone = e.target.value; leger(); } });
    selRole.addEventListener('change', function () { b.role = selRole.value; nettoyerEcarts(b, ref); rafraichir(); });
    var segActif = h('div.segment.bloc', { title: moi ? 'Vous ne pouvez pas couper votre propre accès.' : null }, [
      h('button' + (b.actif ? '.actif' : ''), { type: 'button', text: 'Actif', disabled: moi || verrou, onclick: function () { if (!b.actif) { b.actif = true; rafraichir(); } } }),
      h('button' + (!b.actif ? '.actif' : ''), { type: 'button', text: 'Désactivé', disabled: moi || verrou, onclick: function () { if (b.actif) { b.actif = false; rafraichir(); } } })
    ]);
    var cbAcheteur = h('input', { type: 'checkbox', checked: b.acheteur, disabled: verrou, onchange: function (e) { b.acheteur = e.target.checked; leger(); } });
    var inpNote = h('input', { type: 'text', value: b.note, placeholder: 'ex. Hawkesbury, service', autocomplete: 'off', disabled: verrou, oninput: function (e) { b.note = e.target.value; leger(); } });
    inpNote.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); btnEnregistrer.click(); } });
    var blocCompte = h('div.bloc', [
      h('h3', 'Compte'),
      moi ? h('div.alerte-bloc.info.admin-avis', [h('span', { html: I.info }), h('div', 'C\'est votre compte : votre rôle, votre accès et le droit « Gérer les utilisateurs » ne peuvent pas être modifiés d\'ici.')]) : null,
      verrou ? h('div.alerte-bloc.attention.admin-avis', [h('span', { html: I.cadenas }), h('div', 'Administrateur de concession : seul le propriétaire (Maxime Allard) peut modifier ou retirer ce compte.')]) : null,
      h('div.grille.c2', [
        h('div.champ', [h('label', 'Rôle'), selRole]),
        h('div.champ', [h('label', 'Nom'), inpNom]),
        h('div.champ.plein', [h('label', groupe ? 'Concessions — cochez une ou plusieurs' : 'Concession'), champConc]),
        h('div.champ', [h('label', 'Accès'), segActif]),
        h('div.champ.champ-texto', [h('label', 'Téléphone (textos)'), inpTel, h('span.aide', { text: (b.role === 'admin' || b.role === 'proprietaire') ? 'Directeur : les alertes d\'évaluation (même véhicule évalué dans deux concessions) arrivent par texto à ce numéro, en plus du courriel.' : 'Les alertes d\'évaluation vont aux directeurs seulement ; ce numéro sert aux autres textos du groupe. Chacun peut aussi inscrire le sien depuis le menu de son compte.' })]),
        h('div.champ.plein', [h('label', 'Note'), inpNote]),
        h('label.case.plein', [cbAcheteur, h('span', 'Acheteur')])
      ])
    ]);

    // Droits : défauts du rôle, écarts en ambre, bouton de retour au rôle.
    var blocDroits;
    if (!ref) {
      blocDroits = h('div.bloc', [h('h3', 'Droits'),
        h('div.alerte-bloc.info', [h('span', { html: I.info }), h('div', 'Les droits personnalisés ne sont pas disponibles : le serveur n\'a pas renvoyé la liste des droits (script à redéployer). Seul le rôle s\'applique.')])]);
    } else {
      var nEcarts = Object.keys(b.ecarts).length;
      var btnReset = h('button.btn.petit', { type: 'button', text: 'Revenir aux droits du rôle', disabled: !nEcarts, onclick: function () { b.ecarts = {}; rafraichir(); } });
      var grille = h('div.admin-droits');
      ref.liste.forEach(function (d) {
        var def = defautDe(ref, b.role, d.cle);
        var perso = possede(b.ecarts, d.cle);
        var coche = perso ? b.ecarts[d.cle] === true : def;
        var verrouMoi = moi && d.cle === 'gererUtilisateurs';
        var bloque = !b.actif || verrouMoi || verrou;
        var cb = h('input', { type: 'checkbox', checked: coche, disabled: bloque, dataset: { cle: d.cle }, onchange: function (e) {
          if (e.target.checked === def) delete b.ecarts[d.cle]; else b.ecarts[d.cle] = e.target.checked;
          rafraichir();
        } });
        grille.appendChild(h('div.admin-droit' + (perso ? '.perso' : '') + (bloque ? '.bloque' : ''), [
          h('label.case', [cb, h('span.t', { text: d.libelle || d.cle }),
            perso ? h('span.puce.attention', { text: 'Modifié' }) : h('span.compte', { text: 'rôle : ' + (def ? 'oui' : 'non') })]),
          d.aide ? h('div.aide', { text: d.aide }) : null,
          perso ? h('div.aide.admin-ecart', { text: 'Le rôle ' + ROLES[b.role] + ' dit « ' + (def ? 'oui' : 'non') + ' » — modifié pour cette personne.' }) : null,
          verrouMoi ? h('div.aide', 'Vous ne pouvez pas vous retirer ce droit.') : null
        ]));
      });
      blocDroits = h('div.bloc', [
        h('h3', ['Droits', btnReset]),
        !b.actif ? h('div.alerte-bloc.attention.admin-avis', [h('span', { html: I.alerte }), h('div', 'Compte désactivé : aucun droit ne s\'applique tant qu\'il n\'est pas réactivé.')]) : null,
        grille,
        h('p.admin-pied', { text: 'Rôle ' + ROLES[b.role] + ' : les cases grises suivent le rôle, les cases ambre ont été modifiées pour cette personne. N\'oubliez pas d\'enregistrer.' })
      ]);
    }

    // Accès supplémentaires : d'autres concessions, en entier ou par domaine (compte limité à une concession seulement).
    var blocAcces = this.rendreAcces(u, b, { verrou: verrou, moi: moi, rafraichir: rafraichir });

    // Actions
    var btnEnregistrer = h('button.btn.primaire', { type: 'button', disabled: verrou, html: I.ok + '<span>Enregistrer</span>', onclick: function () { self.enregistrer(u, btnEnregistrer); } });
    this.pBtnAnnuler = h('button.btn', { type: 'button', text: 'Annuler', title: 'Abandonner les modifications non enregistrées', onclick: function () { delete self.brouillons[cle]; rafraichir(); } });
    var btnSupprimer = (moi || verrou) ? null : h('button.btn.danger', { type: 'button', html: I.corbeille + '<span>Supprimer</span>', onclick: function () { self.supprimer(u, btnSupprimer); } });
    var blocActions = h('div.bloc', [h('div.actions-ligne', [btnEnregistrer, this.pBtnAnnuler, btnSupprimer])]);

    this.elPanneau.appendChild(h('div.carte', [entete, blocCompte, blocDroits, blocAcces, blocActions]));
    this.rendreSous(u);
  };

  // Grille des accès supplémentaires : une ligne « Toutes les concessions » puis une
  // ligne par autre concession ; colonnes « En entier » + un domaine par colonne.
  // Seul un compte du groupe (moi.accorderAcces) peut cocher ; un admin de concession
  // voit le résumé de ce qui a été accordé.
  VueAdmin.prototype.rendreAcces = function (u, b, o) {
    var moiInfo = this.moiInfo, self = this;
    var peut = !!(moiInfo && (moiInfo.accorderAcces || !moiInfo.concession || moiInfo.concession === TOUTES));
    if (!b.concession || b.concession === TOUTES) return null;   // le groupe voit tout : rien à accorder
    var codes = ((moiInfo && moiInfo.toutes) || Object.keys(AMX.COMPAGNIES_TOUTES)).filter(function (c) { return c !== b.concession; });
    var domaines = (moiInfo && moiInfo.domaines) || DOMAINES;
    var noms = (moiInfo && moiInfo.domaineNoms) || {};
    var a = b.acces, bloque = o.verrou || !peut || !b.actif;
    var entier = function (c) { return a.concessions.indexOf(c) >= 0; };
    var domaineTout = function (d) { return a.domaines[d] === TOUTES; };
    var domaineA = function (d, c) { return domaineTout(d) || (Array.isArray(a.domaines[d]) && a.domaines[d].indexOf(c) >= 0); };
    var majDomaine = function (d, c, oui) {
      var l = Array.isArray(a.domaines[d]) ? a.domaines[d].slice() : [];
      if (oui) { if (l.indexOf(c) < 0) l.push(c); } else l = l.filter(function (x) { return x !== c; });
      if (l.length) a.domaines[d] = l; else delete a.domaines[d];
    };
    var caseA = function (coche, desactive, implicite, onchange) {
      if (implicite) return h('span.implicite', { title: 'Compris dans un accès plus large', text: '✓' });
      return h('input', { type: 'checkbox', checked: coche, disabled: desactive, onchange: function (e) { onchange(e.target.checked); o.rafraichir(); } });
    };
    var lignes = [];
    // Toutes les concessions
    lignes.push(h('tr.toutes', [h('td', 'Toutes'),
      h('td', [caseA(codes.every(entier), bloque, false, function (oui) { a.concessions = oui ? codes.slice() : []; })])
    ].concat(domaines.map(function (d) {
      return h('td', [caseA(domaineTout(d), bloque, codes.every(entier), function (oui) { if (oui) a.domaines[d] = TOUTES; else delete a.domaines[d]; })]);
    }))));
    codes.forEach(function (c) {
      lignes.push(h('tr', [h('td', { text: AMX.COMPAGNIES_TOUTES[c] || nomConcession(c, moiInfo), title: nomConcession(c, moiInfo) }),
        h('td', [caseA(entier(c), bloque, false, function (oui) { if (oui) { if (a.concessions.indexOf(c) < 0) a.concessions.push(c); } else a.concessions = a.concessions.filter(function (x) { return x !== c; }); })])
      ].concat(domaines.map(function (d) {
        return h('td', [caseA(domaineA(d, c), bloque, entier(c) || domaineTout(d), function (oui) { majDomaine(d, c, oui); })]);
      }))));
    });
    var table = h('table.admin-acces', [
      h('thead', [h('tr', [h('th', ''), h('th', { text: 'En entier', title: 'Tout voir de cette concession, comme un membre de son équipe' })].concat(domaines.map(function (d) { return h('th', { text: DOMAINE_NOMS[d] || d, title: noms[d] || DOMAINE_AIDE[d] || '' }); })))]),
      h('tbody', lignes)
    ]);
    var resume = accesTexte(a, moiInfo), parDomaine = Object.keys(a.domaines).length > 0;
    var btnRien = h('button.btn.petit', { type: 'button', text: 'Retirer les accès par domaine', disabled: bloque || !parDomaine, onclick: function () { b.acces = accesNorm({ concessions: a.concessions }); o.rafraichir(); } });
    var details = h('details.admin-details', [
      h('summary', ['Accès par domaine (avancé)', parDomaine ? h('span.puce.info', { text: 'en place' }) : null]),
      h('div.admin-details-corps', [
        h('p.admin-pied', { style: { margin: '0 0 8px' }, text: 'Pour donner un seul domaine d\'une autre concession — par exemple toutes les évaluations du groupe sans le reste. Les concessions cochées plus haut sont déjà vues en entier.' }),
        !peut ? h('div.alerte-bloc.info.admin-avis', [h('span', { html: I.info }), h('div', 'Les accès par domaine sont accordés par le propriétaire ou le groupe' + (resume ? ' — accordés : ' + resume + '.' : '. Aucun pour ce compte.'))]) : null,
        !b.actif && peut ? h('div.alerte-bloc.attention.admin-avis', [h('span', { html: I.alerte }), h('div', 'Compte désactivé : les accès ne s\'appliquent pas tant qu\'il n\'est pas réactivé.')]) : null,
        h('div.admin-acces-enveloppe', [table]),
        h('div.actions-ligne', { style: { marginTop: '8px' } }, [peut ? btnRien : null])
      ])
    ]);
    if (parDomaine) details.open = true;
    return h('div.bloc', [
      h('h3', 'Accès supplémentaires'),
      h('p.admin-pied', { style: { margin: '0 0 8px' }, text: resume ? 'Ce compte voit : ' + nomsConcessions(b.concession, a, moiInfo) + (Object.keys(a.domaines).length ? ' · ' + accesTexte({ domaines: a.domaines }, moiInfo) : '') + '.' : 'Ce compte ne voit que ' + nomConcession(b.concession, moiInfo) + '. Pour une deuxième concession, cochez-la dans « Concessions » plus haut.' }),
      details
    ]);
  };

  // Sous-titre du panneau (badge, « Vous », « Non enregistrée ») et état du bouton Annuler.
  VueAdmin.prototype.rendreSous = function (u) {
    var el = this.pSous; if (!el) return;
    var b = this.brouillonDe(u), modifie = this.estModifie(u);
    AMX.vider(el);
    el.appendChild(badgeRole(b.role, b.actif, u.role));
    el.appendChild(h('span.puce' + (b.concession === TOUTES ? '.info' : ''), { text: nomsConcessions(b.concession, b.acces, this.moiInfo) }));
    if (memeCourriel(u.nom, this.moi)) el.appendChild(h('span.puce.info', { text: 'Vous' }));
    if (b.acheteur) el.appendChild(h('span.puce', { text: 'Acheteur' }));
    if (b.concession !== TOUTES && Object.keys(accesNorm(b.acces).domaines).length) el.appendChild(h('span.puce.info', { title: accesTexte(b.acces, this.moiInfo), text: 'Accès +' }));
    if (modifie) el.appendChild(h('span.puce.attention', { text: 'Non enregistrée' }));
    if (this.pBtnAnnuler) this.pBtnAnnuler.disabled = !modifie;
  };

  /* ------------------------------ Actions ------------------------------ */
  VueAdmin.prototype.enregistrer = function (u, btn) {
    var self = this, cle = nomCle(u.nom), b = this.brouillonDe(u);
    var corps = { action: 'majUtilisateur', nom: u.nom, role: b.role, actif: b.actif, acheteur: b.acheteur, note: b.note.trim(), concession: b.concession, nomComplet: b.nomComplet.trim(), telephone: b.telephone.trim() };
    if (this.reference) corps.droits = copier(b.ecarts);
    var moiInfo = this.moiInfo, accorde = !!(moiInfo && (moiInfo.accorderAcces || !moiInfo.concession || moiInfo.concession === TOUTES));
    if (accorde) corps.acces = (b.concession && b.concession !== TOUTES) ? accesNettoyer(b.acces, b.concession) : { concessions: [], domaines: {} };
    btn.classList.add('occupe');
    return AMX.post(corps, { rejouer: true }).then(function (r) {
      AMX.verifier(r, 'Mise à jour refusée par le serveur');
      if (r.ok !== true) throw new Error(r.erreur || r.message || 'Le serveur n\'a pas confirmé la mise à jour.');
      AMX.toast(u.nom + ' mis à jour', 'ok');
      // Reflet immédiat, puis rechargement de la liste pour rester fidèle au serveur.
      u.role = b.role; u.actif = b.actif; u.acheteur = b.acheteur; u.note = corps.note; u.concession = b.concession; u.nomComplet = corps.nomComplet; u.telephone = corps.telephone;
      if (corps.acces) u.acces = corps.acces;
      if (self.reference) u.droits = copier(b.ecarts);
      delete self.brouillons[cle];
      self.rendre();
      return self.charger();
    }).catch(function (e) {
      AMX.toast('Échec de la mise à jour de ' + u.nom + ' — ' + AMX.erreurTexte(e), 'erreur');
    }).then(function () { btn.classList.remove('occupe'); });
  };

  VueAdmin.prototype.supprimer = function (u, btn) {
    var self = this, cle = nomCle(u.nom);
    var message = h('div', [
      h('p', { style: { margin: '0 0 10px', color: 'var(--encre-2)', lineHeight: '1.5' } }, ['Supprimer définitivement ', h('b', { text: u.nom }), ' du registre des utilisateurs ? L\'accès au site et à l\'app est coupé immédiatement.']),
      h('p', { style: { margin: 0, color: 'var(--encre-3)', lineHeight: '1.5' }, text: 'Pour seulement retirer l\'accès en gardant l\'historique, mettez plutôt le compte « Désactivé ».' })
    ]);
    AMX.confirmer('Supprimer ce compte ?', message, { ok: 'Supprimer', danger: true }).then(function (ok) {
      if (!ok) return;
      btn.classList.add('occupe');
      return AMX.post({ action: 'supprimerUtilisateur', nom: u.nom }, { rejouer: true }).then(function (r) {
        if (r && r.refuse) throw new Error(r.erreur || r.message || 'Action refusée pour ce compte.');
        // Rejouée après un premier envoi qui a réussi sans réponse lisible : le compte n'est plus là, c'est bon.
        if (r && r.ok === false && /introuvable/i.test(r.erreur || '')) r = { ok: true, supprime: true };
        if (!r || r.supprime !== true) throw new Error((r && (r.erreur || r.message)) || 'La suppression n\'est pas activée côté serveur (action « supprimerUtilisateur » absente). Utilisez « Désactivé » en attendant.');
        AMX.toast(u.nom + ' supprimé', 'ok');
        delete self.brouillons[cle];
        self.utilisateurs = (self.utilisateurs || []).filter(function (x) { return x !== u; });
        self.selection = '';
        history.replaceState(null, '', AMX.lien('admin', ''));
        self.rendre();
        return self.charger();
      }).catch(function (e) {
        // Le serveur a peut-être supprimé sans répondre (404 passager, délai) : on relit la liste avant de conclure.
        return self.charger().then(function () {
          if (!(self.utilisateurs || []).some(function (x) { return memeCourriel(x.nom, u.nom); })) { AMX.toast(u.nom + ' supprimé', 'ok'); self.selection = ''; history.replaceState(null, '', AMX.lien('admin', '')); self.rendre(); return; }
          AMX.toast('Suppression impossible — ' + AMX.erreurTexte(e), 'erreur', 8000);
          btn.classList.remove('occupe');
        });
      });
    });
  };

  // Ajout d'un compte (même action serveur que la mise à jour).
  VueAdmin.prototype.modaleAjouter = function () {
    var self = this;
    var moiInfo = this.moiInfo, groupe = !moiInfo || !moiInfo.concession || moiInfo.concession === TOUTES;
    var inpMail = h('input', { type: 'email', placeholder: 'prenom@groupeautomax.com', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });
    var inpNomC = h('input', { type: 'text', placeholder: 'Prénom Nom', autocomplete: 'off' });
    var selRole = h('select', choixRoles(moiInfo).map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    // Concessions : cases à cocher (groupe) ou la sienne, fixe (admin de concession).
    var brouillonConc = { concession: groupe ? '' : moiInfo.concession, acces: accesNorm(null) };
    var zoneConc = h('div');
    var dessinerConc = function () {
      AMX.vider(zoneConc);
      zoneConc.appendChild(groupe
        ? casesConcessions(brouillonConc, { codes: (moiInfo && moiInfo.toutes) || Object.keys(AMX.COMPAGNIES_TOUTES), moiInfo: moiInfo, bloque: false, apres: dessinerConc })
        : h('div.saisie.fixe', { text: nomConcession(moiInfo.concession, moiInfo) }));
    };
    dessinerConc();
    var cbAcheteur = h('input', { type: 'checkbox' });
    var inpNote = h('input', { type: 'text', placeholder: 'ex. Hawkesbury, service', autocomplete: 'off' });
    var elErreur = h('div.admin-erreur');
    var corps = h('div.admin-form', [
      h('p.intro', 'Le courriel doit être celui que la personne utilisera pour se connecter au site et dans l\'app ScanAutomax. Elle recevra un code à six chiffres à chaque connexion ; il n\'y a pas de mot de passe.'),
      h('div.champ', [h('label', 'Courriel'), inpMail]),
      h('div.grille.c2', [
        h('div.champ', [h('label', 'Nom'), inpNomC]),
        h('div.champ', [h('label', 'Rôle'), selRole]),
        h('div.champ.plein', [h('label', groupe ? 'Concessions — cochez une ou plusieurs' : 'Concession'), zoneConc]),
        h('div.champ', [h('label', 'Acheteur'), h('label.case', [cbAcheteur, h('span', 'Compte d\'acheteur')])])
      ]),
      h('div.champ', [h('label', 'Note (facultatif)'), inpNote]),
      elErreur
    ]);

    var ajouter = function () {
      var mail = inpMail.value.trim().toLowerCase();
      elErreur.textContent = '';
      if (!estCourriel(mail)) { elErreur.textContent = 'Entrez une adresse courriel valide.'; inpMail.focus(); return false; }
      if ((self.utilisateurs || []).some(function (u) { return memeCourriel(u.nom, mail); })) {
        elErreur.textContent = 'Ce courriel est déjà dans la liste — modifiez plutôt ce compte.';
        inpMail.focus();
        return false;
      }
      if (groupe && !brouillonConc.concession) { elErreur.textContent = 'Cochez au moins une concession (ou « Tout le groupe »).'; return false; }
      var accesN = accesNettoyer(brouillonConc.acces, brouillonConc.concession);
      var nouveau = { nom: mail, role: selRole.value, actif: true, acheteur: cbAcheteur.checked, note: inpNote.value.trim(), droits: {}, concession: brouillonConc.concession, acces: accesN, nomComplet: inpNomC.value.trim(), modifiable: true };
      return AMX.post({ action: 'majUtilisateur', nom: nouveau.nom, role: nouveau.role, actif: true, acheteur: nouveau.acheteur, note: nouveau.note, concession: nouveau.concession, acces: groupe ? accesN : undefined, nomComplet: nouveau.nomComplet }, { rejouer: true }).then(function (r) {
        AMX.verifier(r, 'Ajout refusé par le serveur');
        if (r.ok !== true) throw new Error(r.erreur || r.message || 'Le serveur n\'a pas confirmé l\'ajout.');
        AMX.toast(mail + ' ajouté', 'ok');
        self.utilisateurs = (self.utilisateurs || []).concat([nouveau]);
        if (!self.passeFiltres(nouveau)) { self.filtres.recherche = ''; self.filtres.role = ''; self.elRecherche.value = ''; }
        self.selection = mail;
        history.replaceState(null, '', AMX.lien('admin', '', { u: mail }));
        self.rendre();
        self.charger();
        return true;
      }, function (e) {
        elErreur.textContent = 'Échec de l\'ajout — ' + AMX.erreurTexte(e);
        AMX.toast('Échec de l\'ajout de ' + mail + ' — ' + AMX.erreurTexte(e), 'erreur');
        throw e;
      });
    };

    var m = AMX.modale({
      titre: 'Ajouter un compte', corps: corps,
      boutons: [
        { texte: 'Annuler' },
        { texte: 'Ajouter le compte', classe: 'primaire', action: function () { return ajouter(); } }
      ]
    });
    var surEntree = function (e) { if (e.key === 'Enter') { e.preventDefault(); var b = m.el.querySelector('.modale-pied .btn.primaire'); if (b) b.click(); } };
    inpMail.addEventListener('keydown', surEntree);
    inpNote.addEventListener('keydown', surEntree);
  };
})();
