/* =========================================================================
   Connexion du site d'inventaire — Groupe Automax
   =========================================================================

   Ce fichier remplace la porte a mot de passe qui etait recopiee dans les
   neuf pages du site.

   Pourquoi le changement :

   Le mot de passe etait ecrit en clair dans chaque page, et le depot est
   public — n'importe qui pouvait le lire. Pire : il ne protegeait rien.
   L'adresse du serveur est publique elle aussi, et une requete sans mot de
   passe, sans compte et sans jeton renvoyait l'inventaire complet, cout
   inclus, avec les droits d'un gestionnaire.

   Ce qui le remplace : la meme connexion que l'application iPhone. La
   personne entre son courriel, recoit un code a six chiffres, et obtient un
   jeton. Le jeton part avec chaque requete. Il n'y a plus aucun secret dans
   le code, et un compte retire de la feuille Utilisateurs perd son acces
   immediatement.

   Rien a changer dans le code des pages : l'enveloppe de `fetch` ci-dessous
   ajoute le jeton a toutes les requetes vers le serveur, quelle que soit la
   facon dont la page les construit.

   Pour restreindre une page a un role, ajouter l'attribut :
       <script src="assets/auth.js" data-role="admin"></script>
   ========================================================================= */

(function () {
  'use strict';

  var URL_BACKEND = 'https://script.google.com/macros/s/AKfycbwZsbAEELfW5Ce80l3v39unBI6L3js8IQ3iYilrGDNK2zUzlv16XxkoZYZuf4t3tgfX/exec';

  var CLE_MAIL  = 'pg_utilisateur_v1';
  var CLE_NOM   = 'pg_nom_v1';
  var CLE_ROLE  = 'pg_role_v1';
  var CLE_JETON = 'pg_jeton_v1';

  var _fetch = window.fetch.bind(window);
  var roleExige = (document.currentScript && document.currentScript.getAttribute('data-role')) || '';

  /* ------------------------------ Memoire ------------------------------ */
  function lire(c)   { try { return localStorage.getItem(c) || ''; } catch (e) { return ''; } }
  function ecrire(c, v) { try { localStorage.setItem(c, v); } catch (e) {} }
  function effacer(c) { try { localStorage.removeItem(c); } catch (e) {} }

  function oublier() {
    [CLE_MAIL, CLE_NOM, CLE_ROLE, CLE_JETON, 'pg_unlocked_v1', 'pg_unlocked_scan_v1'].forEach(effacer);
  }

  window.utilisateurCourant = function () { return lire(CLE_MAIL); };
  window.roleCourant = function () { return lire(CLE_ROLE); };

  /* --------------------------- Requetes serveur ------------------------ */

  function estBackend(url) { return String(url).indexOf('script.google.com') !== -1; }

  // Apps Script renvoie par intermittence un 404 en HTML au lieu du JSON.
  // On reessaie les LECTURES, jamais les ecritures : un POST rejoue
  // pourrait dedoubler une donnee.
  function lectureAvecReessai(entree, init, reste) {
    return _fetch(entree, init).then(function (r) {
      if (r.ok || reste <= 0) return r;
      return new Promise(function (res) {
        setTimeout(function () { res(lectureAvecReessai(entree, init, reste - 1)); }, 800 * (4 - reste));
      });
    }).catch(function (err) {
      if (reste <= 0) throw err;
      return new Promise(function (res) {
        setTimeout(function () { res(lectureAvecReessai(entree, init, reste - 1)); }, 800 * (4 - reste));
      });
    });
  }

  // Un jeton refuse veut dire que la session est finie : on redemande la
  // connexion au lieu de laisser la page afficher des erreurs incomprehensibles.
  function surveillerRefus(reponse) {
    try {
      reponse.clone().json().then(function (d) {
        if (d && d.refuse && d.code === 'jeton') {
          oublier();
          montrerPorte('Votre session a expiré. Reconnectez-vous.');
        }
      }).catch(function () {});
    } catch (e) {}
    return reponse;
  }

  window.fetch = function (entree, init) {
    var estEcriture = !!(init && init.method && init.method.toUpperCase() !== 'GET');
    var url = '';
    try {
      url = (typeof entree === 'string') ? entree : (entree && entree.url) || '';
      var mail  = lire(CLE_MAIL);
      var jeton = lire(CLE_JETON);
      if (estBackend(url)) {
        if (estEcriture && typeof init.body === 'string') {
          var corps = JSON.parse(init.body);
          if (corps && typeof corps === 'object') {
            if (!corps.utilisateur && mail) corps.utilisateur = mail;
            if (!corps.jeton && jeton) corps.jeton = jeton;
            init = Object.assign({}, init, { body: JSON.stringify(corps) });
          }
        } else if (!estEcriture && typeof entree === 'string') {
          var ajouts = '';
          if (mail && url.indexOf('utilisateur=') === -1) ajouts += '&utilisateur=' + encodeURIComponent(mail);
          if (jeton && url.indexOf('jeton=') === -1)      ajouts += '&jeton=' + encodeURIComponent(jeton);
          if (ajouts) entree = url + (url.indexOf('?') === -1 ? '?' : '') + ajouts.slice(url.indexOf('?') === -1 ? 1 : 0);
        }
      }
    } catch (e) { /* corps non-JSON : on envoie tel quel */ }

    if (!estEcriture && estBackend(url)) return lectureAvecReessai(entree, init, 3).then(surveillerRefus);
    if (estBackend(url)) return _fetch(entree, init).then(surveillerRefus);
    return _fetch(entree, init);
  };

  /* ------------------------------ La porte ----------------------------- */

  var porte = document.getElementById('password-gate');
  var etape = 'courriel';   // 'courriel' puis 'code'
  var courrielEnCours = '';

  function titrePage() {
    // Chaque page avait son propre titre de porte : on le garde.
    if (!porte) return 'ACCÈS PROTÉGÉ';
    var t = porte.querySelector('div > div > div');
    return (t && t.textContent.trim()) || 'ACCÈS PROTÉGÉ';
  }

  var TITRE = titrePage();

  function dessinerPorte(message) {
    if (!porte) return;
    var enCourriel = (etape === 'courriel');
    porte.innerHTML =
      '<div style="background:#fff;border:1px solid #E4E7EC;border-radius:12px;box-shadow:0 4px 16px rgba(16,24,40,0.08);padding:28px 32px;max-width:360px;width:90%;text-align:center;">' +
        '<div style="font-family:Inter,Arial,sans-serif;font-weight:600;font-size:15px;letter-spacing:0.3px;color:#1E2A3A;margin-bottom:6px;">' + TITRE + '</div>' +
        '<p id="pg-sous" style="font-size:12.5px;color:#6B7684;margin:0 0 16px;line-height:1.5;">' +
          (enCourriel
            ? 'Entrez votre adresse courriel. Un code à six chiffres vous sera envoyé.'
            : 'Un code vient d\'être envoyé à<br><strong>' + courrielEnCours + '</strong>') +
        '</p>' +
        (enCourriel
          ? '<input type="email" id="pg-mail" autocomplete="username" placeholder="prenom@groupeautomax.com" style="width:100%;padding:10px;border:1px solid #E4E7EC;border-radius:8px;font-size:14px;margin-bottom:10px;box-sizing:border-box;">'
          : '<input type="text" id="pg-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" style="width:100%;padding:10px;border:1px solid #E4E7EC;border-radius:8px;font-size:22px;letter-spacing:6px;text-align:center;font-family:ui-monospace,monospace;margin-bottom:10px;box-sizing:border-box;">') +
        '<button id="pg-submit" style="width:100%;background:#2563EB;color:#fff;border:none;border-radius:8px;padding:11px;font-size:13px;font-weight:500;cursor:pointer;">' +
          (enCourriel ? 'Recevoir mon code' : 'Se connecter') + '</button>' +
        (enCourriel ? '' :
          '<button id="pg-retour" style="width:100%;background:none;border:none;color:#6B7684;font-size:12px;margin-top:10px;cursor:pointer;text-decoration:underline;">Changer d\'adresse</button>') +
        '<div id="pg-error" style="color:#B3392F;font-size:12px;margin-top:10px;' + (message ? '' : 'display:none;') + '">' + (message || '') + '</div>' +
      '</div>';

    var champ = document.getElementById(enCourriel ? 'pg-mail' : 'pg-code');
    if (champ) {
      if (enCourriel && lire(CLE_MAIL)) champ.value = lire(CLE_MAIL);
      champ.addEventListener('keydown', function (e) { if (e.key === 'Enter') envoyer(); });
      setTimeout(function () { champ.focus(); }, 50);
    }
    document.getElementById('pg-submit').addEventListener('click', envoyer);
    var retour = document.getElementById('pg-retour');
    if (retour) retour.addEventListener('click', function () { etape = 'courriel'; dessinerPorte(''); });
  }

  function montrerPorte(message) {
    if (!porte) return;
    porte.style.display = 'flex';
    etape = 'courriel';
    dessinerPorte(message || '');
  }

  function erreur(msg) {
    var e = document.getElementById('pg-error');
    if (e) { e.textContent = msg; e.style.display = 'block'; }
  }

  function occupe(oui, texte) {
    var b = document.getElementById('pg-submit');
    if (!b) return;
    b.disabled = oui;
    b.textContent = texte;
  }

  function envoyer() {
    if (etape === 'courriel') {
      var mail = ((document.getElementById('pg-mail') || {}).value || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { erreur('Entrez une adresse courriel valide.'); return; }
      occupe(true, 'Envoi du code...');
      _fetch(URL_BACKEND + '?demanderCode=' + encodeURIComponent(mail) + '&_=' + Date.now())
        .then(function (r) { return r.json(); })
        .then(function (d) {
          occupe(false, 'Recevoir mon code');
          if (!d || !d.ok) { erreur((d && d.erreur) || 'Envoi impossible. Réessayez.'); return; }
          courrielEnCours = mail;
          etape = 'code';
          dessinerPorte('');
        })
        .catch(function () { occupe(false, 'Recevoir mon code'); erreur('Serveur injoignable. Vérifiez votre connexion.'); });
      return;
    }

    var code = ((document.getElementById('pg-code') || {}).value || '').replace(/\D/g, '');
    if (code.length !== 6) { erreur('Le code a six chiffres.'); return; }
    occupe(true, 'Vérification...');
    _fetch(URL_BACKEND + '?courriel=' + encodeURIComponent(courrielEnCours) + '&verifierCode=' + encodeURIComponent(code) + '&_=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.jeton) { occupe(false, 'Se connecter'); erreur((d && d.erreur) || 'Code refusé.'); return; }
        ecrire(CLE_JETON, d.jeton);
        ecrire(CLE_MAIL, courrielEnCours);
        return chargerProfil().then(function () {
          if (roleExige && lire(CLE_ROLE) !== roleExige) {
            oublier();
            occupe(false, 'Se connecter');
            erreur('Cette page est réservée aux administrateurs.');
            return;
          }
          ouvrir();
        });
      })
      .catch(function () { occupe(false, 'Se connecter'); erreur('Serveur injoignable. Réessayez.'); });
  }

  function chargerProfil() {
    return _fetch(URL_BACKEND + '?permissions=1&jeton=' + encodeURIComponent(lire(CLE_JETON)) + '&_=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var p = d && d.permissions;
        if (p) { ecrire(CLE_NOM, p.nom || ''); ecrire(CLE_ROLE, p.role || ''); }
      })
      .catch(function () {});
  }

  function ouvrir() {
    if (porte) porte.style.display = 'none';
    ecrire('pg_unlocked_v1', '1');
    badge();
    menu();
  }

  /* ------------------ Menu principal, commun aux pages ----------------- */

  var PAGES = [
    { f: 'index.html',        t: 'Suivi É.-U.' },
    { f: 'canada.html',       t: 'Canada' },
    { f: 'detail.html',       t: 'Detail' },
    { f: 'achat.html',        t: "Fiche d'achat" },
    { f: 'evaluation.html',   t: 'Évaluation' },
    { f: 'verification.html', t: 'Vérification' },
    { f: 'resultat.html',     t: 'Résultat' },
    { f: 'admin.html',        t: 'Admin', admin: true }
  ];

  function pageCourante() {
    var p = location.pathname.split('/').pop();
    return p ? p.toLowerCase() : 'index.html';
  }

  function menu() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { menu(); }, { once: true });
      return;
    }
    if (document.getElementById('menu-principal')) { majMenuAdmin(); return; }

    var style = document.createElement('style');
    style.textContent =
      '#menu-principal{display:flex;flex-wrap:wrap;align-items:center;gap:2px;margin:0 0 16px;' +
        'padding:5px;background:#fff;border:1px solid #E4E7EC;border-radius:11px;' +
        'box-shadow:0 1px 2px rgba(16,24,40,.05);}' +
      '#menu-principal a{font-family:Inter,system-ui,sans-serif;font-size:12.5px;font-weight:500;' +
        'color:#6B7684;text-decoration:none;padding:7px 14px;border-radius:7px;white-space:nowrap;' +
        'transition:background .12s ease,color .12s ease;}' +
      '#menu-principal a:hover{background:#F4F6F9;color:#1E2A3A;}' +
      '#menu-principal a.actif{background:#2563EB;color:#fff;box-shadow:0 1px 2px rgba(37,99,235,.35);}' +
      '#menu-principal a.actif:hover{background:#1D4ED8;color:#fff;}' +
      '#menu-principal .mp-espace{flex:1 1 auto;min-width:8px;}' +
      '#menu-principal a.mp-admin{color:#1E2A3A;border:1px solid #E4E7EC;}' +
      '#menu-principal a.mp-admin.actif{border-color:#2563EB;color:#fff;}' +
      '@media print{#menu-principal{display:none !important;}}';
    document.head.appendChild(style);

    var nav = document.createElement('nav');
    nav.id = 'menu-principal';
    var courante = pageCourante();

    PAGES.forEach(function (p) {
      if (p.admin) {
        var espace = document.createElement('span');
        espace.className = 'mp-espace';
        nav.appendChild(espace);
      }
      var a = document.createElement('a');
      a.href = p.f;
      a.textContent = p.t;
      a.setAttribute('data-page', p.f);
      if (p.admin) { a.className = 'mp-admin'; a.style.display = 'none'; }
      if (p.f === courante) a.className = (a.className ? a.className + ' ' : '') + 'actif';
      nav.appendChild(a);
    });

    var hote = document.querySelector('.wrap') || document.body;
    hote.insertBefore(nav, hote.firstChild);
    majMenuAdmin();
  }

  function majMenuAdmin() {
    var lien = document.querySelector('#menu-principal a[data-page="admin.html"]');
    if (!lien) return;
    lien.style.display = (lire(CLE_ROLE) === 'admin') ? '' : 'none';
  }

  /* ------------------------------- Badge ------------------------------- */

  function badge() {
    if (document.getElementById('pg-badge')) return;
    var mail = lire(CLE_MAIL);
    if (!mail) return;
    var style = document.createElement('style');
    style.textContent = '@media print{#pg-badge{display:none !important;}}';
    document.head.appendChild(style);
    var d = document.createElement('div');
    d.id = 'pg-badge';
    d.style.cssText = 'position:fixed;top:8px;right:10px;z-index:9998;background:#fff;border:1px solid #E4E7EC;border-radius:999px;padding:5px 12px;font-family:Inter,system-ui,sans-serif;font-size:11.5px;color:#3A4250;box-shadow:0 1px 4px rgba(0,0,0,.10);display:flex;gap:9px;align-items:center;';
    var s = document.createElement('span');
    s.textContent = lire(CLE_NOM) || mail;
    var a = document.createElement('a');
    a.href = '#';
    a.textContent = 'Déconnexion';
    a.style.cssText = 'color:#2563EB;text-decoration:none;font-weight:500;';
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      oublier();
      location.reload();
    });
    d.appendChild(s); d.appendChild(a);
    document.body.appendChild(d);
  }

  /* ------------------------------ Demarrage ---------------------------- */

  if (lire(CLE_JETON) && lire(CLE_MAIL)) {
    // Deja connecte : on ouvre tout de suite et on rafraichit le profil en
    // arriere-plan. Si le jeton n'est plus valide, la premiere requete de la
    // page declenchera `surveillerRefus` et la porte reviendra.
    if (roleExige && lire(CLE_ROLE) && lire(CLE_ROLE) !== roleExige) {
      montrerPorte('Cette page est réservée aux administrateurs.');
    } else {
      ouvrir();
      chargerProfil().then(majMenuAdmin);
    }
  } else {
    montrerPorte('');
  }
})();
