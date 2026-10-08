/* =========================================================================
   Section « Admin » : remplace admin.html (accès et utilisateurs).
   Réservée aux comptes qui ont le droit « gererUtilisateurs » (le rôle admin
   l'a d'office). Le serveur reste juge : s'il répond { refuse: true }, la
   page affiche un état verrouillé.

   8 oct. 2026 (soir) — menu « plus exhaustif » (Maxime) :
     · rôles complets, par département (Role.gs › ROLES_) : propriétaire,
       administrateur de concession, gestionnaire, direction des ventes,
       vendeur, BDC, direction service, service (conseiller), marketing,
       utilisateur — la liste vient du serveur (`roles`), avec un repli local
       tant que le script n'est pas redéployé ;
     · département par personne (colonne M, vide = celui du rôle) ;
     · vue Tableau (tri, filtres par département et concession, export Excel)
       en plus de la vue Liste ; dernière connexion par compte (colonne N) ;
     · carte « Réglages des avis » (seuil, heures d'envoi, rappel, qui reçoit
       les alertes par département, fiches Google ↔ département) ;
     · carte « Journal » : qui a créé, modifié ou désactivé quel compte.

   Routes serveur utilisées :
     GET  ?utilisateurs=1  → { ok, utilisateurs: [{ nom (= courriel), nomComplet, role, roleLibelle, actif,
                              acheteur, note, concession, nomConcession, modifiable, droits: { cle: bool },
                              acces, telephone, departement, departementExplicite, derniereConnexion, ajouteLe }],
                              droits: { liste: [{ cle, libelle, aide }], defauts: { role: { cle: bool } } },
                              roles: { roles: [{ cle, libelle, departement, niveau, aide }], departements: [{ cle, libelle }] },
                              moi: { courriel, role, concession, gererAdmins, concessions, noms,
                                     toutes, domaines, domaineNoms, accorderAcces } }
     POST { action: 'majUtilisateur', nom, role, actif, acheteur, note, concession, nomComplet, telephone, departement, droits?, acces? } → { ok }
     POST { action: 'supprimerUtilisateur', nom } → { supprime }
     GET  ?avisReglages=1 / POST avisReglages { reglages } / POST avisFiche { nom, departement, lienAvis }
     GET  ?journalAdmin=150 → { ok, entrees: [{ date, action, avant, apres, utilisateur, nomUtilisateur, cible }] }
     GET  ?parametres=1 / POST reglerParametre (clé MarketCheck, Infobip)

   Les blocs `droits`, `roles`, les réglages des avis et le journal peuvent
   manquer tant que le script Apps Script n'est pas redéployé : chaque carte
   le dit sans bloquer le reste.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, esc = AMX.esc, I = AMX.icones;

  /* ------------------------------ Rôles ------------------------------- */
  // Repli local = la liste de Role.gs (ROLES_) ; le serveur l'envoie dans `roles`.
  var ROLES_DEFAUT = [
    { cle: 'proprietaire',      libelle: 'Propriétaire',                 departement: 'direction', niveau: 'admin',        aide: 'Maxime Allard seul : tout voir, nommer et retirer les administrateurs de concession.' },
    { cle: 'admin',             libelle: 'Administrateur de concession', departement: 'direction', niveau: 'admin',        aide: 'Directeur général : gère les comptes de sa concession, reçoit les alertes (évaluations, avis, sondages).' },
    { cle: 'gestionnaire',      libelle: 'Gestionnaire',                 departement: '',          niveau: 'gestionnaire', aide: 'Coûts, résultats et inventaire de sa concession.' },
    { cle: 'direction_ventes',  libelle: 'Direction des ventes',         departement: 'ventes',    niveau: 'gestionnaire', aide: 'Directeur des ventes : coûts et résultats ; reçoit les alertes des avis et sondages de vente.' },
    { cle: 'vendeur',           libelle: 'Vendeur',                      departement: 'ventes',    niveau: 'utilisateur',  aide: 'Conseiller aux ventes : inventaire, fiches, photos ; ses demandes d\'avis et ses notes dans Avis.' },
    { cle: 'bdc',               libelle: 'BDC',                          departement: 'ventes',    niveau: 'utilisateur',  aide: 'Centre d\'appels / rendez-vous : demandes d\'avis et suivi des sondages.' },
    { cle: 'direction_service', libelle: 'Direction service',            departement: 'service',   niveau: 'direction',    aide: 'Directeur du service : suivi service, reçoit les alertes des avis et sondages du service.' },
    { cle: 'service',           libelle: 'Service (conseiller)',         departement: 'service',   niveau: 'utilisateur',  aide: 'Conseiller technique / aviseur : suivi service, demandes d\'avis après un service.' },
    { cle: 'marketing',         libelle: 'Marketing',                    departement: 'marketing', niveau: 'utilisateur',  aide: 'Photos, fiches, avis Google (réponses).' },
    { cle: 'utilisateur',       libelle: 'Utilisateur',                  departement: '',          niveau: 'utilisateur',  aide: 'Accès de base : consulter, scanner, fiche d\'achat, photos.' }
  ];
  var DEPARTEMENTS_DEFAUT = [
    { cle: 'direction', libelle: 'Direction' }, { cle: 'ventes', libelle: 'Ventes' }, { cle: 'service', libelle: 'Service' },
    { cle: 'pieces', libelle: 'Pièces' }, { cle: 'marketing', libelle: 'Marketing' }, { cle: 'administration', libelle: 'Administration' }
  ];
  var REF = { roles: ROLES_DEFAUT.slice(), parCle: {}, departements: DEPARTEMENTS_DEFAUT.slice(), depNoms: {} };
  function poserReference(roles) {
    var r = roles && Array.isArray(roles.roles) && roles.roles.length ? roles.roles : ROLES_DEFAUT;
    var d = roles && Array.isArray(roles.departements) && roles.departements.length ? roles.departements : DEPARTEMENTS_DEFAUT;
    REF.roles = r.filter(function (x) { return x && x.cle; });
    REF.parCle = {}; REF.roles.forEach(function (x) { REF.parCle[x.cle] = x; });
    REF.departements = d.filter(function (x) { return x && x.cle; });
    REF.depNoms = {}; REF.departements.forEach(function (x) { REF.depNoms[x.cle] = x.libelle; });
  }
  poserReference(null);
  function roleInfo(cle) { return REF.parCle[String(cle || '').toLowerCase()] || null; }
  function libelleRole(cle, brut) { var r = roleInfo(cle); return r ? r.libelle : (brut ? String(brut) : 'Utilisateur'); }
  function niveauRole(cle) { var r = roleInfo(cle); return r ? r.niveau : 'utilisateur'; }
  function estAdminRole(cle) { return cle === 'admin' || cle === 'proprietaire'; }
  function nomDepartement(cle) { return cle ? (REF.depNoms[cle] || cle) : '—'; }
  // Le département effectif d'un compte : le sien (colonne M), sinon celui du rôle.
  function departementDe(role, explicite) { if (explicite) return explicite; var r = roleInfo(role); return r ? (r.departement || '') : ''; }
  // Le département effectif d'un compte reçu du serveur : le sien (colonne M), sinon celui calculé par le serveur, sinon celui du rôle (repli local).
  function departementU(u) { return u.departementExplicite || u.departement || departementDe(roleConnu(u), ''); }
  // Couleur du badge et de l'avatar selon le niveau du rôle (admin sombre, direction bleu, les autres gris).
  function couleurRole(cle) { var n = niveauRole(cle); return n === 'admin' ? 'sombre' : (n === 'gestionnaire' || n === 'direction') ? 'bleu' : 'gris'; }
  var COULEUR_DEP = { direction: 'sombre', ventes: 'vert', service: 'ambre', pieces: 'ambre', marketing: 'violet', administration: 'gris' };
  // Rôles qu'on peut donner d'ici : jamais « propriétaire » ; « Administrateur » seulement pour le propriétaire.
  function choixRoles(moiInfo) {
    return REF.roles.filter(function (r) {
      if (r.cle === 'proprietaire') return false;
      if (r.cle === 'admin') return !!(moiInfo && moiInfo.gererAdmins);
      return true;
    });
  }
  var GROUPES_ROLE = [['direction', 'Direction'], ['gestion', 'Gestion'], ['ventes', 'Ventes'], ['service', 'Service'], ['autres', 'Autres']];
  function groupeDuRole(r) {
    if (r.cle === 'utilisateur') return 'autres';
    var d = r.departement || '';
    if (d === 'direction') return 'direction';
    if (d === '') return 'gestion';
    if (d === 'ventes') return 'ventes';
    if (d === 'service' || d === 'pieces') return 'service';
    return 'autres';
  }
  // <select> des rôles, groupé (direction, gestion, ventes, service, autres), avec le rôle actuel même s'il n'est pas attribuable d'ici.
  function selectRoles(valeur, moiInfo, attrs) {
    var liste = choixRoles(moiInfo).slice();
    if (valeur && !liste.some(function (r) { return r.cle === valeur; })) liste.push(roleInfo(valeur) || { cle: valeur, libelle: libelleRole(valeur, valeur), departement: '' });
    var sel = h('select', attrs || {});
    GROUPES_ROLE.forEach(function (g) {
      var dans = liste.filter(function (r) { return groupeDuRole(r) === g[0]; });
      if (!dans.length) return;
      var og = h('optgroup', { label: g[1] });
      dans.forEach(function (r) { og.appendChild(h('option', { value: r.cle, text: r.libelle, title: r.aide || '', selected: r.cle === valeur })); });
      sel.appendChild(og);
    });
    return sel;
  }
  function selectDepartement(role, valeur, attrs) {
    var duRole = departementDe(role, '');
    var sel = h('select', attrs || {}, [h('option', { value: '', text: 'Celui du rôle' + (duRole ? ' (' + nomDepartement(duRole) + ')' : ' (aucun)'), selected: !valeur })]);
    REF.departements.forEach(function (d) { sel.appendChild(h('option', { value: d.cle, text: d.libelle, selected: valeur === d.cle })); });
    return sel;
  }

  var FILTRES = [['', 'Tous'], ['direction', 'Direction'], ['ventes', 'Ventes'], ['service', 'Service'], ['autres', 'Autres'], ['inactif', 'Inactifs']];
  function groupeFiltre(u) {
    if (!estActif(u)) return 'inactif';
    var role = roleConnu(u), dep = departementU(u);
    if (estAdminRole(role) || dep === 'direction') return 'direction';
    if (dep === 'ventes') return 'ventes';
    if (dep === 'service' || dep === 'pieces') return 'service';
    return 'autres';
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
  function roleConnu(u) { var r = String(u.role || '').toLowerCase(); return roleInfo(r) ? r : 'utilisateur'; }
  function estActif(u) { return u.actif !== false; }
  function possede(o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); }
  function copier(o) { return Object.assign({}, o || {}); }
  function lireLocal(cle, defaut) { try { return localStorage.getItem(cle) || defaut; } catch (e) { return defaut; } }
  function ecrireLocal(cle, v) { try { localStorage.setItem(cle, v); } catch (e) {} }
  function dateRelative(iso) {
    var j = AMX.joursDepuis(iso);
    if (j === null) return '';
    if (j === 0) return 'aujourd\'hui';
    if (j === 1) return 'hier';
    if (j < 30) return 'il y a ' + j + ' j';
    if (j < 365) return 'il y a ' + Math.round(j / 30) + ' mois';
    return 'il y a plus d\'un an';
  }

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
    return h('span.badge.' + couleurRole(role), { text: libelleRole(role, roleBrut) });
  }
  function puceDepartement(dep) {
    if (!dep) return null;
    return h('span.puce.admin-dep.admin-dep-' + (COULEUR_DEP[dep] || 'gris'), { text: nomDepartement(dep), title: 'Département' });
  }
  function avatar(nom, role, actif, grand) {
    var n = niveauRole(role);
    var cls = !actif ? 'inactif' : (n === 'admin' ? 'admin' : (n === 'gestionnaire' || n === 'direction') ? 'gestionnaire' : 'utilisateur');
    return h('div.admin-avatar' + (grand ? '.grand' : '') + '.admin-av-' + cls, { text: AMX.initiales(nom) });
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
      '.admin-page .admin-outils select.saisie { width: auto; height: 34px; }',
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
      // Puce de département (liste, tableau, panneau).
      '.puce.admin-dep { border-color: transparent; }',
      '.puce.admin-dep-vert { background: var(--vert-clair); color: var(--vert); }',
      '.puce.admin-dep-ambre { background: var(--ambre-bg); color: var(--ambre); }',
      '.puce.admin-dep-violet { background: #efe9fb; color: #6b3fd1; }',
      '.puce.admin-dep-sombre { background: var(--noir-2); color: #fff; }',
      // Ligne de compte : avatar · courriel + note + badges · bouton.
      '.ligne.admin-ligne { grid-template-columns: 40px minmax(0, 1fr) auto; min-height: 58px; padding: 9px 12px; }',
      '.ligne.admin-ligne .titre { overflow-wrap: anywhere; white-space: normal; }',
      '.ligne.admin-ligne .admin-note-ligne { color: var(--encre-3); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }',
      '.ligne.admin-ligne.admin-modifiee::before { content: ""; position: absolute; left: -1px; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; background: var(--ambre); }',
      '.ligne.admin-ligne .btn { justify-self: end; }',
      // Vue tableau.
      '.admin-tableau-enveloppe { overflow-x: auto; border: 1px solid var(--ligne); border-radius: var(--rayon); background: var(--carte); }',
      '.admin-tableau { width: 100%; border-collapse: collapse; font-size: 12.5px; }',
      '.admin-tableau th, .admin-tableau td { padding: 8px 10px; border-bottom: 1px solid var(--ligne); text-align: left; white-space: nowrap; vertical-align: middle; }',
      '.admin-tableau th { font-size: 11px; font-weight: 600; color: var(--encre-3); text-transform: uppercase; letter-spacing: .04em; cursor: pointer; user-select: none; position: sticky; top: 0; background: var(--carte-2); }',
      '.admin-tableau th.tri { color: var(--encre); }',
      '.admin-tableau th .fleche { font-size: 10px; margin-left: 4px; }',
      '.admin-tableau tr.cliquable { cursor: pointer; }',
      '.admin-tableau tr.cliquable:hover td { background: var(--carte-2); }',
      '.admin-tableau tr.actif td { background: var(--vert-clair); }',
      '.admin-tableau tr.inactif td { color: var(--encre-4); }',
      '.admin-tableau td .mini { font-size: 11px; color: var(--encre-4); }',
      '.admin-tableau td .puces { display: flex; gap: 4px; flex-wrap: wrap; }',
      '.admin-tableau tbody tr:last-child td { border-bottom: none; }',
      '.admin-vue .segment button { white-space: nowrap; }',
      '.admin-roles .admin-tableau td { white-space: normal; vertical-align: top; }',
      '.admin-roles .admin-tableau th { cursor: default; }',
      // Panneau d'édition.
      '.admin-page .admin-entete-id { display: flex; gap: 12px; align-items: center; min-width: 0; }',
      '.admin-page .admin-entete-id h2 { overflow-wrap: anywhere; }',
      '.admin-page .panneau .segment button:disabled { opacity: .5; cursor: not-allowed; }',
      '.admin-page .panneau .case.plein { min-height: 34px; }',
      '.admin-page .admin-avis { margin-bottom: 10px; }',
      '.admin-page .panneau .admin-connexion { font-size: 12px; color: var(--encre-3); margin: 2px 0 0; }',
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
      '.admin-role-aide { font-size: 11.5px; color: var(--encre-3); line-height: 1.4; margin: 4px 0 0; min-height: 16px; }',
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
      // Réglages des avis.
      '.admin-reglages .grille.c3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }',
      '.admin-reglages .admin-cases { display: flex; gap: 6px 14px; flex-wrap: wrap; }',
      '.admin-reglages .admin-cases .case { padding: 4px 0; }',
      '.admin-reglages textarea { width: 100%; min-height: 54px; font: inherit; font-size: 12.5px; padding: 6px 8px; border: 1px solid var(--ligne); border-radius: var(--rayon-s); resize: vertical; }',
      '.admin-reglages h4 { margin: 6px 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--encre-3); }',
      '.admin-reglages .admin-apercu { width: 100%; border-collapse: collapse; font-size: 12px; }',
      '.admin-reglages .admin-apercu th, .admin-reglages .admin-apercu td { padding: 5px 8px; border-bottom: 1px solid var(--ligne); text-align: left; vertical-align: top; }',
      '.admin-reglages .admin-apercu th { font-size: 11px; color: var(--encre-3); font-weight: 600; }',
      '.admin-reglages .admin-fiches td select, .admin-reglages .admin-fiches td input { height: 30px; font-size: 12.5px; }',
      '.admin-reglages .admin-fiches td input { width: 100%; min-width: 180px; }',
      '@media (max-width: 760px) { .admin-reglages .grille.c3 { grid-template-columns: 1fr 1fr; } }',
      // Journal.
      '.admin-journal .admin-journal-outils { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }',
      '.admin-journal .admin-journal-outils input { flex: 1 1 200px; height: 32px; }',
      '.admin-journal table { width: 100%; border-collapse: collapse; font-size: 12.5px; }',
      '.admin-journal th, .admin-journal td { padding: 6px 8px; border-bottom: 1px solid var(--ligne); text-align: left; vertical-align: top; }',
      '.admin-journal th { font-size: 11px; color: var(--encre-3); font-weight: 600; white-space: nowrap; }',
      '.admin-journal td.date { white-space: nowrap; color: var(--encre-3); }',
      '.admin-journal td.detail { overflow-wrap: anywhere; }',
      '.admin-journal td.detail .avant { color: var(--encre-4); text-decoration: line-through; }',
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
    this.brouillons = {};         // courriel (minuscule) → { role, actif, acheteur, note, ecarts, departement… }
    this.filtres = { recherche: '', groupe: '', concession: '' };
    this.vue = lireLocal('amx_admin_vue', 'liste') === 'tableau' ? 'tableau' : 'liste';
    this.tri = { cle: 'nom', sens: 1 };
    this.lignes = {};             // courriel (minuscule) → élément .ligne ou <tr>
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
    this.btnExporter = h('button.btn', { type: 'button', title: 'Exporter la liste des comptes (Excel)', html: I.telecharger + '<span>Exporter</span>', onclick: function () { self.exporter(); } });
    this.btnAjouter = h('button.btn.primaire', { type: 'button', html: I.plus + '<span>Ajouter un compte</span>', onclick: function () { self.modaleAjouter(); } });
    this.elActions = h('div.actions', [this.btnRafraichir, this.btnExporter, this.btnAjouter]);
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Accès et utilisateurs'), this.elEtat]),
      this.elActions
    ]);

    // Recherche + filtre par département + concession (groupe) + vue
    this.elRecherche = h('input.saisie', {
      type: 'search', placeholder: 'Nom, courriel, rôle ou note…', autocomplete: 'off',
      oninput: AMX.debounce(function (e) { self.filtres.recherche = e.target.value; self.rendreListe(); }, 120)
    });
    this.elSegment = h('div.segment');
    this.elConcession = h('select.saisie', { title: 'Concession', onchange: function (e) { self.filtres.concession = e.target.value; self.rendreListe(); } });
    this.elVue = h('div.segment.admin-vue');
    this.elCompte = h('span.compte');
    var filtre = h('div.carte.admin-filtre', [h('div.carte-corps', [h('div.admin-outils', [
      h('div.recherche', [h('span', { html: I.recherche }), this.elRecherche]),
      this.elSegment,
      this.elConcession,
      this.elVue,
      this.elCompte
    ])])]);

    this.elListe = h('div.liste');
    this.elVide = h('div');
    this.elNote = h('p.doux.petit.admin-note', 'Le rôle donne les droits de départ et le département ; les droits personnalisés permettent d\'en accorder ou d\'en retirer à une personne précise. Chaque personne se connecte avec son propre courriel et un code reçu par courriel ou par texto. Désactiver un compte coupe l\'accès au site et à l\'app ScanAutomax sans effacer l\'historique ; toute modification est immédiate.');
    this.elPanneau = h('aside.panneau', { style: { display: 'none' } });
    this.elRoles = this.construireRoles();
    this.elReglagesAvis = this.construireReglagesAvis();
    this.elJournal = this.construireJournal();
    this.elParametres = this.construireParametres();
    this.elAlertes = this.construireAlertes();
    this.elAgencement = h('div.agencement.sans-rail', [h('div.admin-principal', [filtre, this.elListe, this.elNote, this.elRoles, this.elReglagesAvis, this.elJournal, this.elAlertes, this.elParametres]), this.elPanneau]);

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
      h('p.doux.petit', { style: { margin: 0 }, text: 'Quand le même véhicule est évalué dans deux concessions du groupe à moins de 30 jours d\'écart, les directeurs généraux des deux concessions (les administrateurs de concession) reçoivent une alerte par courriel — et par texto si leur compte a un numéro de téléphone et qu\'Infobip est configuré ici. Les textos aux clients (sondages) et les alertes des avis passent par le même compte.' }),
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
    var directeursSans = liste.filter(function (u) { var r = roleConnu(u); return (estAdminRole(r) || r === 'direction_ventes' || r === 'direction_service') && !u.telephone; });
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

  /* ------------------------ Carte « Les rôles » ------------------------ */
  // Tableau de référence : chaque rôle, son département, son niveau, ce qu'il donne.
  VueAdmin.prototype.construireRoles = function () {
    this.elRolesCorps = h('div.carte-corps');
    var carte = h('div.carte.admin-parametres.admin-roles', [h('div.carte-entete', [h('h2', 'Les rôles et leurs droits')]), this.elRolesCorps]);
    this.rendreRoles();
    return carte;
  };
  VueAdmin.prototype.rendreRoles = function () {
    var self = this, ref = this.reference;
    AMX.vider(this.elRolesCorps);
    var compte = {};
    (this.utilisateurs || []).forEach(function (u) { if (estActif(u)) { var r = roleConnu(u); compte[r] = (compte[r] || 0) + 1; } });
    var NIVEAUX = { admin: 'Administration', direction: 'Direction', gestionnaire: 'Gestion', utilisateur: 'Base' };
    var lignes = REF.roles.map(function (r) {
      var droits = ref ? ref.liste.filter(function (d) { return defautDe(ref, r.cle, d.cle); }).map(function (d) { return d.libelle; }) : null;
      return h('tr', [
        h('td', [h('div', { style: { fontWeight: 600 } }, [badgeRole(r.cle, true)]), h('div.mini', { text: r.cle })]),
        h('td', puceDepartement(r.departement) || h('span.doux', '—')),
        h('td', NIVEAUX[r.niveau] || r.niveau || '—'),
        h('td', { style: { whiteSpace: 'normal', minWidth: '220px' } }, [h('div', { text: r.aide || '' }), droits ? h('div.mini', { text: droits.length ? 'Droits : ' + droits.join(', ') : 'Droits : consulter, scanner, fiche d\'achat, photos' }) : null]),
        h('td', { style: { textAlign: 'right' } }, compte[r.cle] ? h('b', String(compte[r.cle])) : h('span.doux', '0'))
      ]);
    });
    this.elRolesCorps.appendChild(h('p.doux.petit', { style: { margin: 0 }, text: 'Le rôle fixe le département (modifiable par personne dans le panneau du compte) et les droits de départ. Les alertes des avis et des sondages vont aux rôles choisis dans « Réglages des avis » plus bas.' }));
    this.elRolesCorps.appendChild(h('div.admin-tableau-enveloppe', [h('table.admin-tableau', [
      h('thead', [h('tr', [h('th', { style: { cursor: 'default' } }, 'Rôle'), h('th', { style: { cursor: 'default' } }, 'Département'), h('th', { style: { cursor: 'default' } }, 'Niveau'), h('th', { style: { cursor: 'default' } }, 'Ce qu\'il donne'), h('th', { style: { cursor: 'default', textAlign: 'right' } }, 'Comptes')])]),
      h('tbody', lignes)
    ])]));
    if (!this.rolesServeur) this.elRolesCorps.appendChild(h('div.alerte-bloc.info.admin-avis', { style: { marginTop: '8px' } }, [h('span', { html: I.info }), h('div', 'Liste locale des rôles : le serveur ne l\'a pas encore envoyée (script à redéployer). Les nouveaux rôles (vendeur, direction des ventes, service, direction service, BDC, marketing) seront refusés par le serveur tant qu\'il n\'est pas à jour.')]));
  };

  /* ----------------------- Carte « Réglages des avis » ----------------------- */
  VueAdmin.prototype.construireReglagesAvis = function () {
    var self = this;
    this.elReglagesCorps = h('div.carte-corps', [h('p.doux.petit', { style: { margin: 0 } }, 'Chargement des réglages…')]);
    var btn = h('button.btn.petit', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.chargerReglagesAvis(); } });
    return h('div.carte.admin-parametres.admin-reglages', [h('div.carte-entete', [h('h2', 'Réglages des avis Google et des sondages'), btn]), this.elReglagesCorps]);
  };
  VueAdmin.prototype.chargerReglagesAvis = function () {
    var self = this;
    return AMX.get({ avisReglages: 1 }).then(function (d) {
      if (self.detruit) return;
      if (!d || d.refuse || !d.ok || !d.reglages) { self.rendreReglagesAvis(null, d); return; }
      self.reglagesAvis = d;
      self.rendreReglagesAvis(d);
    }).catch(function (e) { if (!self.detruit) self.rendreReglagesAvis(null, { erreur: AMX.erreurTexte(e) }); });
  };
  VueAdmin.prototype.rendreReglagesAvis = function (d, echec) {
    var self = this;
    AMX.vider(this.elReglagesCorps);
    if (!d) {
      var msg = echec && echec.refuse ? (echec.erreur || 'Réservé aux administrateurs.') : 'Route absente — redéployez le script (AvisSuivi.gs, Api.gs). Les réglages par défaut s\'appliquent : seuil 3 étoiles, envois de 9 h à 20 h, un rappel après 3 jours, alertes aux administrateurs et aux directions (ventes / service).';
      this.elReglagesCorps.appendChild(h('div.alerte-bloc.info', [h('span', { html: I.info }), h('div', { text: msg })]));
      return;
    }
    var r = JSON.parse(JSON.stringify(d.reglages)), peut = !!d.peutModifier, roles = (d.roles && d.roles.length ? d.roles : REF.roles).filter(function (x) { return x.cle !== 'proprietaire'; });
    var champ = function (libelle, el, aide) { return h('div.champ', [h('label', { text: libelle }), el, aide ? h('span.aide', { text: aide }) : null]); };
    var selNum = function (valeurs, actuel, texte, onchange) { return h('select', { disabled: !peut, onchange: function (e) { onchange(parseInt(e.target.value, 10)); } }, valeurs.map(function (v) { return h('option', { value: String(v), text: texte(v), selected: v === actuel }); })); };
    var heures = []; for (var hh = 6; hh <= 23; hh++) heures.push(hh);
    var grille = h('div.grille.c3', [
      champ('Note négative (alerte)', selNum([1, 2, 3, 4], r.seuil, function (v) { return v + ' étoile' + (v > 1 ? 's' : '') + ' ou moins'; }, function (v) { r.seuil = v; }), 'Avis Google ou sondage à cette note ou moins : directeurs prévenus.'),
      champ('Envois aux clients — début', selNum(heures.slice(0, 12), r.heureMin, function (v) { return v + ' h'; }, function (v) { r.heureMin = v; }), 'Avant cette heure, le sondage attend.'),
      champ('Envois aux clients — fin', selNum(heures.slice(6), r.heureMax, function (v) { return v + ' h'; }, function (v) { r.heureMax = v; }), 'Après cette heure, il part le lendemain matin.'),
      champ('Rappel sans réponse', selNum([0, 1, 2, 3, 4, 5, 7], r.rappelJours, function (v) { return v === 0 ? 'Aucun rappel' : 'Après ' + v + ' jour' + (v > 1 ? 's' : ''); }, function (v) { r.rappelJours = v; }), 'Un seul rappel au plus, jamais après STOP.')
    ]);
    var cases = h('div.admin-cases', [
      h('label.case', [h('input', { type: 'checkbox', checked: !!r.textoDirecteurs, disabled: !peut, onchange: function (e) { r.textoDirecteurs = e.target.checked; } }), h('span', 'Alertes aussi par texto (comptes avec numéro)')]),
      h('label.case', [h('input', { type: 'checkbox', checked: !!r.attribuerVendeur, disabled: !peut, onchange: function (e) { r.attribuerVendeur = e.target.checked; } }), h('span', 'La demande d\'avis crédite d\'office le vendeur / conseiller choisi')])
    ]);
    // Qui reçoit les alertes, par département.
    var blocAlertes = function (type, titre) {
      var liste = r.alertes[type] || [];
      var cs = h('div.admin-cases', roles.map(function (ro) {
        return h('label.case', { title: ro.aide || '' }, [h('input', { type: 'checkbox', checked: liste.indexOf(ro.cle) >= 0, disabled: !peut, onchange: function (e) {
          var l = (r.alertes[type] || []).filter(function (x) { return x !== ro.cle; });
          if (e.target.checked) l.push(ro.cle);
          r.alertes[type] = l;
        } }), h('span', { text: ro.libelle })]);
      }));
      var ta = h('textarea', { disabled: !peut, placeholder: 'Courriels supplémentaires, un par ligne (toutes les concessions)', oninput: function (e) { r.extras[type] = e.target.value.split(/[\n,;]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean); } });
      ta.value = (r.extras[type] || []).join('\n');
      return h('div', [h('h4', titre), h('p.doux.petit', { style: { margin: '0 0 6px' }, text: 'Rôles de la concession prévenus (courriel + texto). Le droit « Recevoir les alertes des avis » du panneau du compte ajoute une personne précise.' }), cs, ta]);
    };
    // Aperçu : qui recevrait l'alerte aujourd'hui.
    var apercu = function (ap) {
      var codes = Object.keys(ap || {});
      if (!codes.length) return h('p.doux.petit', 'Aucune concession visible.');
      var noms = function (l) { return l && l.length ? l.map(function (x) { return x.nom + (x.texto ? ' 📱' : ''); }).join(', ') : '— personne (repli : directeurs du groupe)'; };
      return h('table.admin-apercu', [h('thead', [h('tr', [h('th', 'Concession'), h('th', 'Vente'), h('th', 'Service')])]),
        h('tbody', codes.map(function (c) { return h('tr', [h('td', { text: nomConcession(c, self.moiInfo) }), h('td', { text: noms(ap[c].vente) }), h('td', { text: noms(ap[c].service) })]); }))]);
    };
    this.elApercuAlertes = h('div', [apercu(d.destinatairesApercu)]);
    // Fiches Google ↔ département.
    var fiches = h('table.admin-tableau.admin-fiches', [h('thead', [h('tr', [h('th', { style: { cursor: 'default' } }, 'Fiche Google'), h('th', { style: { cursor: 'default' } }, 'Concession'), h('th', { style: { cursor: 'default' } }, 'Département'), h('th', { style: { cursor: 'default' } }, 'Lien « laisser un avis »'), h('th', { style: { cursor: 'default' } }, '')])]),
      h('tbody', (d.fiches || []).map(function (f) {
        var sel = h('select', { disabled: !peut }, (d.departementsFiche || ['ventes', 'occasion', 'service', 'pieces']).map(function (x) { return h('option', { value: x, text: { ventes: 'Ventes', occasion: 'Occasion', service: 'Service', pieces: 'Pièces' }[x] || x, selected: f.departement === x }); }));
        var lien = h('input', { type: 'url', value: f.lienAvis || '', placeholder: 'https://search.google.com/local/writereview?placeid=…', disabled: !peut, spellcheck: 'false' });
        var btn = h('button.btn.petit', { type: 'button', text: 'Enregistrer', disabled: !peut, onclick: function () {
          btn.classList.add('occupe');
          AMX.post({ action: 'avisFiche', nom: f.nom, departement: sel.value, lienAvis: lien.value.trim() }).then(function (x) {
            AMX.verifier(x, 'Fiche non enregistrée');
            AMX.toast('Fiche « ' + f.nom + ' » enregistrée.', 'ok');
          }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }).then(function () { btn.classList.remove('occupe'); });
        } });
        return h('tr', [h('td', { style: { whiteSpace: 'normal' } }, [h('div', { style: { fontWeight: 600 } }, f.nom), f.placeId ? null : h('div.mini', 'sans placeId — en attente de l\'API Google')]), h('td', { text: nomConcession(f.code, self.moiInfo) }), h('td', [sel]), h('td', [lien]), h('td', [btn])]);
      }))]);
    var btnEnregistrer = h('button.btn.primaire', { type: 'button', disabled: !peut, html: I.ok + '<span>Enregistrer les réglages</span>', onclick: function () {
      btnEnregistrer.classList.add('occupe');
      AMX.post({ action: 'avisReglages', reglages: r }).then(function (x) {
        AMX.verifier(x, 'Réglages refusés');
        if (x.reglages) { self.reglagesAvis.reglages = x.reglages; }
        if (x.destinatairesApercu) { AMX.vider(self.elApercuAlertes); self.elApercuAlertes.appendChild(apercu(x.destinatairesApercu)); }
        AMX.toast('Réglages des avis enregistrés.', 'ok');
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }).then(function () { btnEnregistrer.classList.remove('occupe'); });
    } });
    var btnDefauts = h('button.btn', { type: 'button', text: 'Revenir aux défauts', disabled: !peut, onclick: function () { self.reglagesAvis.reglages = d.defauts; self.rendreReglagesAvis(self.reglagesAvis); } });
    this.elReglagesCorps.appendChild(h('p.doux.petit', { style: { margin: 0 }, text: 'Le sondage part à tous les clients et le lien Google est montré à tous (règle de Google). Une note négative prévient tout de suite les directeurs choisis ici, par département : vente (livraison) ou service.' }));
    if (!peut) this.elReglagesCorps.appendChild(h('div.alerte-bloc.info.admin-avis', [h('span', { html: I.info }), h('div', 'Ces réglages sont modifiés par le propriétaire ou un compte du groupe (Marc-André). Vous les voyez tels qu\'ils s\'appliquent à votre concession.')]));
    this.elReglagesCorps.appendChild(grille);
    this.elReglagesCorps.appendChild(cases);
    this.elReglagesCorps.appendChild(h('div.grille.c2', [blocAlertes('vente', 'Alertes — vente / livraison'), blocAlertes('service', 'Alertes — service')]));
    this.elReglagesCorps.appendChild(h('div', [h('h4', 'Qui recevrait l\'alerte aujourd\'hui'), this.elApercuAlertes]));
    this.elReglagesCorps.appendChild(h('div', [h('h4', 'Fiches Google et département'), h('p.doux.petit', { style: { margin: '0 0 6px' }, text: 'Le sondage « service » envoie le client vers la fiche Service de la concession quand elle existe (ex. Ste-Marie Pièces et Service), sinon vers la fiche Ventes.' }), h('div.admin-tableau-enveloppe', [fiches])]));
    this.elReglagesCorps.appendChild(h('div.actions-ligne', [btnEnregistrer, btnDefauts]));
  };

  /* --------------------------- Carte « Journal » --------------------------- */
  VueAdmin.prototype.construireJournal = function () {
    var self = this;
    this.journal = null; this.journalFiltre = '';
    this.elJournalCorps = h('div.carte-corps');
    this.elJournalRecherche = h('input.saisie', { type: 'search', placeholder: 'Filtrer : courriel, action…', oninput: AMX.debounce(function (e) { self.journalFiltre = e.target.value.trim().toLowerCase(); self.rendreJournal(); }, 120) });
    var btn = h('button.btn.petit', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.chargerJournal(true); } });
    return h('div.carte.admin-parametres.admin-journal', [h('div.carte-entete', [h('h2', 'Journal des actions'), btn]), this.elJournalCorps]);
  };
  VueAdmin.prototype.chargerJournal = function (manuel) {
    var self = this;
    return AMX.get({ journalAdmin: 150 }).then(function (d) {
      if (self.detruit) return;
      if (!d || d.refuse || !d.ok || !Array.isArray(d.entrees)) { self.journal = null; self.journalEchec = d; self.rendreJournal(); return; }
      self.journal = d.entrees; self.journalEchec = null;
      self.rendreJournal();
      if (manuel) AMX.toast('Journal mis à jour', 'ok');
    }).catch(function (e) { if (!self.detruit) { self.journal = null; self.journalEchec = { erreur: AMX.erreurTexte(e) }; self.rendreJournal(); } });
  };
  VueAdmin.prototype.rendreJournal = function () {
    var self = this;
    AMX.vider(this.elJournalCorps);
    this.elJournalCorps.appendChild(h('p.doux.petit', { style: { margin: 0 }, text: 'Qui a créé, modifié, désactivé ou supprimé quel compte, les droits et accès accordés, les réglages changés. Les actions sur les véhicules restent dans le journal de l\'inventaire.' }));
    if (!this.journal) {
      var e = this.journalEchec;
      this.elJournalCorps.appendChild(h('div.alerte-bloc.info', [h('span', { html: I.info }), h('div', { text: e && e.refuse ? (e.erreur || 'Réservé aux administrateurs.') : (e && e.erreur ? 'Journal indisponible — ' + e.erreur : 'Route absente — redéployez le script (Role.gs, Api.gs).') })]));
      return;
    }
    var q = this.journalFiltre;
    var liste = this.journal.filter(function (l) { if (!q) return true; return (l.action + ' ' + l.avant + ' ' + l.apres + ' ' + l.utilisateur + ' ' + (l.nomUtilisateur || '') + ' ' + (l.cible || '')).toLowerCase().indexOf(q) >= 0; });
    this.elJournalCorps.appendChild(h('div.admin-journal-outils', [this.elJournalRecherche, h('span.doux.petit', { text: liste.length + ' entrée' + (liste.length > 1 ? 's' : '') + (liste.length !== this.journal.length ? ' sur ' + this.journal.length : '') })]));
    if (!liste.length) { this.elJournalCorps.appendChild(h('p.doux.petit', { text: this.journal.length ? 'Rien ne correspond.' : 'Aucune action enregistrée encore.' })); return; }
    var nomDe = function (c) { var u = self.utilisateur(c); return u && u.nomComplet ? u.nomComplet : c; };
    var lignes = liste.slice(0, 150).map(function (l) {
      var detail = [];
      if (l.avant && l.apres) detail = [h('span.avant', { text: l.avant.length > 80 ? l.avant.slice(0, 80) + '…' : l.avant }), ' → ', h('span', { text: l.apres })];
      else detail = [h('span', { text: l.apres || l.avant || '' })];
      return h('tr', [
        h('td.date', { text: AMX.fmtDate(l.date, true) }),
        h('td', [h('div', { text: l.nomUtilisateur && l.nomUtilisateur !== l.utilisateur ? l.nomUtilisateur : nomDe(l.utilisateur) }), h('div.mini', { text: l.utilisateur })]),
        h('td', [h('span.badge.' + (/supprim|désactiv/i.test(l.action) ? 'rouge' : /ajout|réactiv/i.test(l.action) ? 'vert' : /droits|accès/i.test(l.action) ? 'ambre' : 'gris'), { text: l.action })]),
        h('td.detail', detail)
      ]);
    });
    this.elJournalCorps.appendChild(h('div', { style: { overflowX: 'auto' } }, [h('table', [h('thead', [h('tr', [h('th', 'Quand'), h('th', 'Qui'), h('th', 'Action'), h('th', 'Détail')])]), h('tbody', lignes)])]));
  };

  VueAdmin.prototype.charger = function (manuel) {
    var self = this, gen = ++this.generation;
    this.enChargement = true;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    this.chargerParametres();
    this.chargerReglagesAvis();
    this.chargerJournal();
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
      self.rolesServeur = !!(d.roles && Array.isArray(d.roles.roles) && d.roles.roles.length);
      poserReference(d.roles);
      self.moiInfo = d.moi || null;   // { courriel, role, concession, gererAdmins, concessions, noms }
      self.erreur = ''; self.refus = '';
      self.rendre();
      self.rendreRoles();
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
        concession: String(u.concession || ''), nomComplet: String(u.nomComplet || ''), acces: accesNorm(u.acces), telephone: String(u.telephone || ''),
        departement: String(u.departementExplicite || '') };
    }
    return this.brouillons[cle];
  };
  VueAdmin.prototype.estModifie = function (u) {
    var b = this.brouillons[nomCle(u.nom)];
    if (!b) return false;
    return b.role !== roleConnu(u) || b.actif !== estActif(u) || b.acheteur !== !!u.acheteur ||
      b.note.trim() !== String(u.note || '').trim() || !memesEcarts(b.ecarts, ecartsDe(u, this.reference)) ||
      b.concession !== String(u.concession || '') || b.nomComplet.trim() !== String(u.nomComplet || '').trim() ||
      accesCle(b.acces) !== accesCle(u.acces) || b.telephone.trim() !== String(u.telephone || '').trim() ||
      b.departement !== String(u.departementExplicite || '');
  };

  VueAdmin.prototype.passeFiltres = function (u) {
    var f = this.filtres, t = f.recherche.trim().toLowerCase();
    if (f.groupe) { if (groupeFiltre(u) !== f.groupe) return false; }
    if (f.concession && concessionsDe(u.concession, u.acces).indexOf(f.concession) < 0) return false;
    if (t) {
      var texte = [u.nom, u.nomComplet, u.note, libelleRole(roleConnu(u)), nomDepartement(departementU(u)), nomsConcessions(u.concession, u.acces, this.moiInfo), u.telephone].join(' ').toLowerCase();
      if (texte.indexOf(t) < 0) return false;
    }
    return true;
  };
  // Tri de la liste : admins, direction, gestion, les autres, puis les comptes désactivés ; alphabétique ensuite.
  VueAdmin.prototype.filtrees = function () {
    var self = this;
    var rang = function (u) { if (!estActif(u)) return 9; var n = niveauRole(roleConnu(u)); return n === 'admin' ? 0 : n === 'direction' || n === 'gestionnaire' ? 1 : 2; };
    var liste = (this.utilisateurs || []).filter(function (u) { return self.passeFiltres(u); });
    if (this.vue === 'tableau') return this.trier(liste);
    return liste.sort(function (a, b) {
      var da = rang(a), db = rang(b);
      if (da !== db) return da - db;
      return String(a.nomComplet || a.nom).localeCompare(String(b.nomComplet || b.nom), 'fr');
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
    this.btnExporter.disabled = !this.utilisateurs;
    if (!this.utilisateurs) { this.elEtat.textContent = this.erreur ? 'Serveur injoignable.' : 'Chargement des comptes…'; return; }
    var n = this.utilisateurs.length, groupes = { direction: 0, ventes: 0, service: 0, autres: 0, inactif: 0 };
    this.utilisateurs.forEach(function (u) { groupes[groupeFiltre(u)]++; });
    var ou = (this.moiInfo && this.moiInfo.concession && this.moiInfo.concession !== TOUTES) ? nomConcession(this.moiInfo.concession, this.moiInfo) + ' · ' : '';
    this.elEtat.textContent = ou + pluriel(n, 'compte') + ' · direction ' + groupes.direction + ' · ventes ' + groupes.ventes + ' · service ' + groupes.service + ' · autres ' + groupes.autres + (groupes.inactif ? ' · ' + pluriel(groupes.inactif, 'inactif') : '');
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
    FILTRES.forEach(function (o) {
      self.elSegment.appendChild(h('button' + (self.filtres.groupe === o[0] ? '.actif' : ''), { type: 'button', text: o[1], onclick: function () {
        if (self.filtres.groupe === o[0]) return;
        self.filtres.groupe = o[0];
        self.rendreSegment(); self.rendreListe();
      } }));
    });
    // Concession : seulement pour un compte du groupe (un admin de concession ne voit que la sienne).
    var groupe = !this.moiInfo || !this.moiInfo.concession || this.moiInfo.concession === TOUTES;
    AMX.vider(this.elConcession);
    this.elConcession.classList.toggle('cache', !groupe);
    if (groupe) {
      var codes = (this.moiInfo && this.moiInfo.toutes) || Object.keys(AMX.COMPAGNIES_TOUTES);
      this.elConcession.appendChild(h('option', { value: '', text: 'Toutes les concessions', selected: !this.filtres.concession }));
      codes.forEach(function (c) { self.elConcession.appendChild(h('option', { value: c, text: nomConcession(c, self.moiInfo), selected: self.filtres.concession === c })); });
      this.elConcession.appendChild(h('option', { value: TOUTES, text: 'Groupe (toutes)', selected: this.filtres.concession === TOUTES }));
    }
    AMX.vider(this.elVue);
    [['liste', 'Liste'], ['tableau', 'Tableau']].forEach(function (o) {
      self.elVue.appendChild(h('button' + (self.vue === o[0] ? '.actif' : ''), { type: 'button', text: o[1], title: o[0] === 'tableau' ? 'Toutes les colonnes, tri par en-tête, export' : 'Une carte par compte', onclick: function () {
        if (self.vue === o[0]) return;
        self.vue = o[0]; ecrireLocal('amx_admin_vue', o[0]);
        self.rendreSegment(); self.rendreListe();
      } }));
    });
  };

  VueAdmin.prototype.reinitialiserFiltres = function () {
    this.filtres.recherche = ''; this.filtres.groupe = ''; this.filtres.concession = '';
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
      this.elListe.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucun compte ne correspond'), h('div', 'Modifiez la recherche ou les filtres.'),
        h('div', { style: { marginTop: '12px' } }, [h('button.btn', { type: 'button', text: 'Réinitialiser les filtres', onclick: function () { self.reinitialiserFiltres(); } })])]));
      return;
    }
    if (this.vue === 'tableau') { this.elListe.appendChild(this.tableau(liste)); return; }
    liste.forEach(function (u) { self.elListe.appendChild(self.ligne(u)); });
  };

  // Textos (6 oct.) : un numéro = la personne reçoit les alertes par texto ; un directeur sans numéro est signalé.
  function telephoneTexte(brut) { return AMX.telephoneTexte ? AMX.telephoneTexte(brut) : String(brut || ''); }
  function puceTexto(u, role, actif) {
    if (!actif) return null;
    var directeur = estAdminRole(role) || role === 'direction_ventes' || role === 'direction_service';
    if (u.telephone) return h('span.puce.texto', { title: directeur ? 'Directeur : reçoit les alertes par texto au ' + telephoneTexte(u.telephone) : 'Numéro inscrit (' + telephoneTexte(u.telephone) + ').', text: directeur ? 'Texto · alertes' : 'Texto' });
    if (directeur) return h('span.puce.attention', { title: 'Directeur sans numéro de cellulaire : il reçoit les alertes par courriel seulement. Ajoutez son numéro dans le panneau (Téléphone).', text: 'Pas de texto' });
    return null;
  }
  VueAdmin.prototype.puces = function (u, role, actif) {
    var groupe = !this.moiInfo || !this.moiInfo.concession || this.moiInfo.concession === TOUTES;
    var ecarts = Object.keys(ecartsDe(u, this.reference));
    var moi = memeCourriel(u.nom, this.moi);
    return [
      puceDepartement(departementU(u)),
      groupe ? h('span.puce' + (u.concession === TOUTES ? '.info' : (u.concession ? '' : '.alerte')), { text: nomsConcessions(u.concession, u.acces, this.moiInfo) }) : null,
      verrouille(u) ? h('span.puce', { title: 'Seul le propriétaire peut modifier ou retirer un administrateur.', text: 'Géré par le propriétaire' }) : null,
      (u.concession !== TOUTES && u.acces && Object.keys(accesNorm(u.acces).domaines).length) ? h('span.puce.info', { title: accesTexte(u.acces, this.moiInfo), text: 'Accès +' }) : null,
      u.acheteur ? h('span.puce', { text: 'Acheteur' }) : null,
      puceTexto(u, role, actif),
      ecarts.length ? h('span.puce.attention', { title: pluriel(ecarts.length, 'droit') + ' différent' + (ecarts.length > 1 ? 's' : '') + ' du rôle : ' + ecarts.join(', '), text: 'Droits personnalisés' }) : null,
      moi ? h('span.puce.info', { text: 'Vous' }) : null,
      !estCourriel(u.nom) ? h('span.puce.alerte', { title: 'Cette ligne du registre n\'est pas une adresse courriel valide.', text: 'Courriel invalide' }) : null,
      this.estModifie(u) ? h('span.puce.attention', { title: 'Des modifications ne sont pas encore enregistrées.', text: 'Non enregistrée' }) : null
    ];
  };
  // Une ligne = l'état enregistré sur le serveur, plus un repère si un brouillon diffère.
  VueAdmin.prototype.ligne = function (u) {
    var self = this, cle = nomCle(u.nom);
    var actif = estActif(u), role = roleConnu(u);
    var modifiee = this.estModifie(u);
    var badges = [badgeRole(role, actif, u.role)].concat(this.puces(u, role, actif));
    var connexion = u.derniereConnexion ? 'Connexion ' + dateRelative(u.derniereConnexion) : '';
    var el = h('div.ligne.admin-ligne' + (actif ? '' : '.verrouille') + (modifiee ? '.admin-modifiee' : '') + (this.selection && memeCourriel(u.nom, this.selection) ? '.actif' : ''), { dataset: { nom: cle } }, [
      avatar(u.nomComplet || u.nom, role, actif, false),
      h('div', { style: { minWidth: 0 } }, [
        h('div.titre', { text: u.nomComplet ? u.nomComplet + ' — ' + u.nom : u.nom }),
        h('div.sous', [u.note ? h('span.admin-note-ligne', { title: u.note, text: u.note }) : null, connexion ? h('span.admin-note-ligne', { title: AMX.fmtDate(u.derniereConnexion, true), text: connexion }) : null].concat(badges))
      ]),
      h('button.btn.petit', { type: 'button', text: 'Modifier', onclick: function (e) { e.stopPropagation(); self.selectionner(u.nom); } })
    ]);
    el.addEventListener('click', function () { self.selectionner(u.nom); });
    this.lignes[cle] = el;
    return el;
  };

  /* ------------------------------ Tableau ------------------------------ */
  VueAdmin.prototype.colonnes = function () {
    var self = this;
    return [
      { cle: 'nom', titre: 'Nom', val: function (u) { return u.nomComplet || ''; }, tri: function (u) { return (u.nomComplet || u.nom).toLowerCase(); } },
      { cle: 'courriel', titre: 'Courriel', val: function (u) { return u.nom; } },
      { cle: 'role', titre: 'Rôle', val: function (u) { return libelleRole(roleConnu(u), u.role); }, tri: function (u) { var n = niveauRole(roleConnu(u)); return (n === 'admin' ? '0' : n === 'direction' || n === 'gestionnaire' ? '1' : '2') + libelleRole(roleConnu(u)); } },
      { cle: 'departement', titre: 'Département', val: function (u) { return departementU(u) ? nomDepartement(departementU(u)) : ''; } },
      { cle: 'concession', titre: 'Concession', val: function (u) { return nomsConcessions(u.concession, u.acces, self.moiInfo); } },
      { cle: 'telephone', titre: 'Téléphone', val: function (u) { return u.telephone ? telephoneTexte(u.telephone) : ''; } },
      { cle: 'connexion', titre: 'Dernière connexion', val: function (u) { return u.derniereConnexion ? AMX.fmtDate(u.derniereConnexion, true) : ''; }, tri: function (u) { return u.derniereConnexion || ''; } },
      { cle: 'acces', titre: 'Accès et droits', val: function (u) { var p = []; if (u.acheteur) p.push('Acheteur'); var a = accesTexte(u.acces, self.moiInfo); if (a) p.push('Accès : ' + a); var e = Object.keys(ecartsDe(u, self.reference)); if (e.length) p.push('Droits : ' + e.join(', ')); return p.join(' · '); } },
      { cle: 'note', titre: 'Note', val: function (u) { return u.note || ''; } },
      { cle: 'etat', titre: 'État', val: function (u) { return estActif(u) ? 'Actif' : 'Désactivé'; }, tri: function (u) { return estActif(u) ? '0' : '1'; } }
    ];
  };
  VueAdmin.prototype.trier = function (liste) {
    var col = this.colonnes().filter(function (c) { return c.cle === this.tri.cle; }, this)[0] || this.colonnes()[0];
    var sens = this.tri.sens, cle = function (u) { return String((col.tri || col.val)(u) || ''); };
    return liste.slice().sort(function (a, b) {
      var x = cle(a), y = cle(b);
      if (x === y) return String(a.nom).localeCompare(String(b.nom), 'fr');
      if (!x) return 1; if (!y) return -1;
      return x.localeCompare(y, 'fr', { numeric: true }) * sens;
    });
  };
  VueAdmin.prototype.tableau = function (liste) {
    var self = this, cols = this.colonnes();
    var entetes = cols.map(function (c) {
      var actif = self.tri.cle === c.cle;
      return h('th' + (actif ? '.tri' : ''), { title: 'Trier par ' + c.titre.toLowerCase(), onclick: function () {
        if (self.tri.cle === c.cle) self.tri.sens = -self.tri.sens; else self.tri = { cle: c.cle, sens: 1 };
        self.rendreListe();
      } }, [c.titre, actif ? h('span.fleche', { text: self.tri.sens > 0 ? '▲' : '▼' }) : null]);
    });
    var lignes = liste.map(function (u) {
      var role = roleConnu(u), actif = estActif(u), cle = nomCle(u.nom);
      var tr = h('tr.cliquable' + (actif ? '' : '.inactif') + (self.selection && memeCourriel(u.nom, self.selection) ? '.actif' : ''), { dataset: { nom: cle }, onclick: function () { self.selectionner(u.nom); } }, [
        h('td', [h('div', { style: { fontWeight: 600 } }, u.nomComplet || h('span.doux', '—')), self.estModifie(u) ? h('div.mini', { style: { color: 'var(--ambre)' } }, 'Non enregistrée') : null]),
        h('td', [h('span', { text: u.nom }), memeCourriel(u.nom, self.moi) ? h('span.puce.info', { style: { marginLeft: '6px' }, text: 'Vous' }) : null]),
        h('td', [badgeRole(role, true, u.role)]),
        h('td', [puceDepartement(departementU(u)) || h('span.doux', '—')]),
        h('td', { text: nomsConcessions(u.concession, u.acces, self.moiInfo) }),
        h('td', u.telephone ? { text: telephoneTexte(u.telephone) } : [h('span.doux', '—')]),
        h('td', u.derniereConnexion ? [h('div', { text: dateRelative(u.derniereConnexion) }), h('div.mini', { text: AMX.fmtDate(u.derniereConnexion, true) })] : [h('span.doux', 'jamais')]),
        h('td', [h('div.puces', self.puces(u, role, actif).filter(function (p) { return p && !/admin-dep/.test(p.className) && !/Vous|Non enregistrée/.test(p.textContent); }))]),
        h('td', { title: u.note || '' }, [h('span.mini', { text: u.note ? (u.note.length > 28 ? u.note.slice(0, 28) + '…' : u.note) : '' })]),
        h('td', [actif ? h('span.badge.vert', 'Actif') : h('span.badge.rouge', 'Désactivé')])
      ]);
      self.lignes[cle] = tr;
      return tr;
    });
    return h('div.admin-tableau-enveloppe', [h('table.admin-tableau', [h('thead', [h('tr', entetes)]), h('tbody', lignes)])]);
  };
  // Export Excel (SheetJS, déjà chargé par index.html) ; CSV en repli.
  VueAdmin.prototype.exporter = function () {
    var self = this, cols = this.colonnes();
    var liste = this.trier((this.utilisateurs || []).filter(function (u) { return self.passeFiltres(u); }));
    if (!liste.length) { AMX.toast('Aucun compte à exporter.', 'attention'); return; }
    var rows = liste.map(function (u) { var o = {}; cols.forEach(function (c) { o[c.titre] = c.val(u) || ''; }); o['Ajouté le'] = u.ajouteLe ? AMX.fmtDate(u.ajouteLe) : ''; return o; });
    var nom = 'comptes-scanautomax-' + new Date().toISOString().slice(0, 10);
    if (typeof XLSX !== 'undefined') {
      var ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = Object.keys(rows[0]).map(function (k) { return { wch: Math.min(48, Math.max(10, k.length + 2, rows.reduce(function (m, r) { return Math.max(m, String(r[k] || '').length); }, 0))) }; });
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Comptes');
      XLSX.writeFile(wb, nom + '.xlsx');
      AMX.toast(pluriel(rows.length, 'compte') + ' exporté' + (rows.length > 1 ? 's' : '') + ' (Excel).', 'ok');
      return;
    }
    var cles = Object.keys(rows[0]);
    var csv = [cles.join(';')].concat(rows.map(function (r) { return cles.map(function (k) { return '"' + String(r[k] || '').replace(/"/g, '""') + '"'; }).join(';'); })).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = nom + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    AMX.toast(pluriel(rows.length, 'compte') + ' exporté' + (rows.length > 1 ? 's' : '') + ' (CSV).', 'ok');
  };

  VueAdmin.prototype.majLigne = function (u) {
    var ancien = this.lignes[nomCle(u.nom)];
    if (!ancien || !ancien.parentNode) return;
    if (this.vue === 'tableau') { this.rendreListe(); return; }
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
        avatar(b.nomComplet || u.nom, b.role, b.actif, true),
        h('div', { style: { minWidth: 0 } }, [h('h2', { text: u.nom }), this.pSous,
          h('p.admin-connexion', { text: u.derniereConnexion ? 'Dernière connexion ' + dateRelative(u.derniereConnexion) + ' (' + AMX.fmtDate(u.derniereConnexion, true) + ')' : 'Jamais connecté' + (u.ajouteLe ? ' · ajouté le ' + AMX.fmtDate(u.ajouteLe) : '') })])
      ]),
      h('button.fermer', { type: 'button', title: 'Fermer', html: I.fermer, onclick: fermer })
    ]);

    // Compte : rôle, département, concession, nom, accès, acheteur, note
    var verrou = verrouille(u), moiInfo = this.moiInfo, groupe = !moiInfo || !moiInfo.concession || moiInfo.concession === TOUTES;
    var selRole = selectRoles(b.role, moiInfo, { disabled: moi || verrou, title: moi ? 'Vous ne pouvez pas changer votre propre rôle.' : (verrou ? 'Seul le propriétaire peut modifier un administrateur.' : null) });
    var aideRole = h('p.admin-role-aide', { text: (roleInfo(b.role) || {}).aide || '' });
    var selDep = selectDepartement(b.role, b.departement, { disabled: verrou, onchange: function (e) { b.departement = e.target.value; leger(); } });
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
    var directeur = estAdminRole(b.role) || b.role === 'direction_ventes' || b.role === 'direction_service';
    var blocCompte = h('div.bloc', [
      h('h3', 'Compte'),
      moi ? h('div.alerte-bloc.info.admin-avis', [h('span', { html: I.info }), h('div', 'C\'est votre compte : votre rôle, votre accès et le droit « Gérer les utilisateurs » ne peuvent pas être modifiés d\'ici.')]) : null,
      verrou ? h('div.alerte-bloc.attention.admin-avis', [h('span', { html: I.cadenas }), h('div', 'Administrateur de concession : seul le propriétaire (Maxime Allard) peut modifier ou retirer ce compte.')]) : null,
      h('div.grille.c2', [
        h('div.champ', [h('label', 'Rôle'), selRole, aideRole]),
        h('div.champ', [h('label', 'Nom'), inpNom]),
        h('div.champ', [h('label', 'Département'), selDep, h('span.aide', { text: 'Sert au filtre, aux avis (vente / service) et aux alertes.' })]),
        h('div.champ', [h('label', 'Accès'), segActif]),
        h('div.champ.plein', [h('label', groupe ? 'Concessions — cochez une ou plusieurs' : 'Concession'), champConc]),
        h('div.champ.champ-texto', [h('label', 'Téléphone (textos)'), inpTel, h('span.aide', { text: directeur ? 'Directeur : les alertes (évaluation dans deux concessions, avis négatif, sondage ≤ seuil) arrivent par texto à ce numéro, en plus du courriel.' : 'Ce numéro sert aux textos du groupe (code de connexion, alertes si le droit est accordé). Chacun peut aussi inscrire le sien depuis le menu de son compte.' })]),
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
          perso ? h('div.aide.admin-ecart', { text: 'Le rôle ' + libelleRole(b.role) + ' dit « ' + (def ? 'oui' : 'non') + ' » — modifié pour cette personne.' }) : null,
          verrouMoi ? h('div.aide', 'Vous ne pouvez pas vous retirer ce droit.') : null
        ]));
      });
      blocDroits = h('div.bloc', [
        h('h3', ['Droits', btnReset]),
        !b.actif ? h('div.alerte-bloc.attention.admin-avis', [h('span', { html: I.alerte }), h('div', 'Compte désactivé : aucun droit ne s\'applique tant qu\'il n\'est pas réactivé.')]) : null,
        grille,
        h('p.admin-pied', { text: 'Rôle ' + libelleRole(b.role) + ' : les cases grises suivent le rôle, les cases ambre ont été modifiées pour cette personne. N\'oubliez pas d\'enregistrer.' })
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

  // Sous-titre du panneau (badge, département, « Vous », « Non enregistrée ») et état du bouton Annuler.
  VueAdmin.prototype.rendreSous = function (u) {
    var el = this.pSous; if (!el) return;
    var b = this.brouillonDe(u), modifie = this.estModifie(u);
    AMX.vider(el);
    el.appendChild(badgeRole(b.role, b.actif, u.role));
    var dep = departementDe(b.role, b.departement);
    if (dep) el.appendChild(puceDepartement(dep));
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
    var corps = { action: 'majUtilisateur', nom: u.nom, role: b.role, actif: b.actif, acheteur: b.acheteur, note: b.note.trim(), concession: b.concession, nomComplet: b.nomComplet.trim(), telephone: b.telephone.trim(), departement: b.departement };
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
      u.departementExplicite = b.departement; u.departement = departementDe(b.role, b.departement);
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
    var selRole = selectRoles('utilisateur', moiInfo, {});
    var aideRole = h('p.admin-role-aide', { text: (roleInfo('utilisateur') || {}).aide || '' });
    var selDep = selectDepartement('utilisateur', '', {});
    selRole.addEventListener('change', function () {
      aideRole.textContent = (roleInfo(selRole.value) || {}).aide || '';
      var nouveau = selectDepartement(selRole.value, selDep.value, {});
      selDep.parentNode.replaceChild(nouveau, selDep); selDep = nouveau;
    });
    var inpTel = h('input', { type: 'tel', placeholder: '450 555 0123 (facultatif)', autocomplete: 'off' });
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
      h('p.intro', 'Le courriel doit être celui que la personne utilisera pour se connecter au site et dans l\'app ScanAutomax. Elle recevra un code à six chiffres à chaque connexion (par courriel ou par texto) ; il n\'y a pas de mot de passe.'),
      h('div.champ', [h('label', 'Courriel'), inpMail]),
      h('div.grille.c2', [
        h('div.champ', [h('label', 'Nom'), inpNomC]),
        h('div.champ', [h('label', 'Rôle'), selRole, aideRole]),
        h('div.champ', [h('label', 'Département'), selDep]),
        h('div.champ', [h('label', 'Téléphone (textos)'), inpTel]),
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
      var nouveau = { nom: mail, role: selRole.value, actif: true, acheteur: cbAcheteur.checked, note: inpNote.value.trim(), droits: {}, concession: brouillonConc.concession, acces: accesN, nomComplet: inpNomC.value.trim(), modifiable: true,
        telephone: inpTel.value.trim(), departementExplicite: selDep.value, departement: departementDe(selRole.value, selDep.value) };
      return AMX.post({ action: 'majUtilisateur', nom: nouveau.nom, role: nouveau.role, actif: true, acheteur: nouveau.acheteur, note: nouveau.note, concession: nouveau.concession, acces: groupe ? accesN : undefined, nomComplet: nouveau.nomComplet, telephone: nouveau.telephone, departement: selDep.value }, { rejouer: true }).then(function (r) {
        AMX.verifier(r, 'Ajout refusé par le serveur');
        if (r.ok !== true) throw new Error(r.erreur || r.message || 'Le serveur n\'a pas confirmé l\'ajout.');
        AMX.toast(mail + ' ajouté', 'ok');
        self.utilisateurs = (self.utilisateurs || []).concat([nouveau]);
        if (!self.passeFiltres(nouveau)) { self.filtres.recherche = ''; self.filtres.groupe = ''; self.filtres.concession = ''; self.elRecherche.value = ''; self.rendreSegment(); }
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
