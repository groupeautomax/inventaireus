/* =========================================================================
   pwa.js — le site installé comme une application, et le NIV lu par la caméra (10 novembre 2026)

   Maxime : « comment est-ce qu'on peut le mettre sur Android ? » → « Oui, prépare-le ».
   1) Installation : manifest.webmanifest (nom Automax 2.0, icône, plein écran, raccourci « Scanner un NIV ») et sw.js
      (rien de gardé : seulement une page « Pas de connexion »). Chrome sur Android propose « Installer l'application » ;
      on garde son invitation (beforeinstallprompt) pour la montrer : ligne « Installer l'application » du menu du compte,
      et un bandeau sur un téléphone (une fois, « Plus tard » le retire de cet appareil). Sur iPhone : l'app de l'App Store.
   2) Scanner un NIV : le code-barres du NIV (cadre de la porte du conducteur, étiquette du pare-brise ; Code 39, Code 128,
      Data Matrix ou QR) lu par la caméra arrière avec BarcodeDetector (Chrome sur Android, Samsung Internet). Un bouton
      caméra s'ajoute à la recherche du haut et aux champs NIV (évaluation, demande d'évaluation, fiche d'achat, vente,
      échange de neufs, OpenLane, estimé Texto). Seulement sur un appareil tactile dont le navigateur lit les codes-barres :
      ailleurs, rien ne change. Aucune image n'est gardée ni envoyée : la lecture se fait dans le téléphone.
   API : AMX.installation { autonome(), plateforme(), possible(), installer() } · AMX.ligneInstaller(fermerMenu)
         AMX.niv { extraire(texte), cleValide(vin) } · AMX.scanNiv { possible(), ouvrir(opts), attacher(input, opts),
         dansRecherche(boite) }
   ========================================================================= */
(function () {
  'use strict';
  var AMX = window.AMX, h = AMX.h;
  var APP_STORE = 'https://apps.apple.com/app/scanautomax/id6806342880';

  function css() {
    if (document.getElementById('css-pwa')) return;
    var s = document.createElement('style'); s.id = 'css-pwa';
    s.textContent = [
      /* Menu du compte */
      '.barre .usager .menu .installer-menu { display: flex; align-items: center; gap: 8px; color: var(--vert); font-weight: 600; }',
      '.barre .usager .menu .installer-menu svg { width: 16px; height: 16px; flex: 0 0 auto; }',
      /* Bandeau d'installation (téléphone) */
      '.pwa-bandeau { position: fixed; left: 10px; right: 10px; bottom: calc(72px + env(safe-area-inset-bottom)); z-index: 47; display: flex; align-items: center; gap: 10px;',
      '  padding: 10px 10px 10px 12px; background: var(--carte, #fff); border: 1px solid var(--ligne, #E5E7EB); border-radius: 14px; box-shadow: 0 8px 28px rgba(16, 24, 40, .18); }',
      '.pwa-bandeau img { width: 42px; height: 42px; border-radius: 10px; flex: 0 0 auto; box-shadow: 0 1px 4px rgba(16, 24, 40, .12); }',
      '.pwa-bandeau .txt { flex: 1 1 auto; min-width: 0; font-size: 13px; line-height: 1.3; }',
      '.pwa-bandeau .txt b { display: block; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.pwa-bandeau .btn { flex: 0 0 auto; min-height: 38px; }',
      '.pwa-bandeau .pwa-fermer { flex: 0 0 auto; width: 34px; height: 34px; border: 0; background: none; color: var(--encre-3, #4B5563); border-radius: 8px; padding: 0; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }',
      '.pwa-bandeau .pwa-fermer svg { width: 16px; height: 16px; }',
      'body.avec-bandeau-pwa #maxai-bulle { display: none; }',
      '@media (min-width: 861px) { .pwa-bandeau { left: auto; right: 20px; bottom: 20px; max-width: 420px; } }',
      /* Bouton caméra dans un champ NIV */
      '.scan-env { position: relative; display: block; }',
      '.scan-env > input { width: 100%; padding-right: 46px !important; }',
      '.scan-niv-btn { position: absolute; right: 3px; top: 50%; transform: translateY(-50%); width: 40px; height: 34px; display: inline-flex; align-items: center; justify-content: center;',
      '  border: 0; border-radius: 8px; background: var(--vert-clair, #E6F4EC); color: var(--vert-fonce, #006B32); cursor: pointer; padding: 0; }',
      '.scan-niv-btn svg { width: 20px; height: 20px; }',
      '.scan-niv-btn:focus-visible { outline: 3px solid rgba(0, 136, 64, .35); outline-offset: 1px; }',
      '.barre .recherche-globale.avec-scan input { padding-right: 46px; }',
      '.barre .recherche-globale.avec-scan kbd { display: none; }',
      '.barre .recherche-globale .scan-niv-btn { height: 30px; width: 38px; border-radius: 999px; right: 3px; }',
      '.barre .recherche-globale .scan-niv-btn svg { position: static; transform: none; width: 18px; height: 18px; color: inherit; }',
      /* Fenêtre de lecture */
      '.voile.scan-voile .modale { max-width: 560px; }',
      '.scan-cadre { position: relative; background: #000; border-radius: 12px; overflow: hidden; aspect-ratio: 4 / 3; max-height: 58vh; width: 100%; }',
      '.scan-cadre video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }',
      '.scan-viseur { position: absolute; left: 7%; right: 7%; top: 34%; bottom: 34%; border: 3px solid rgba(255, 255, 255, .9); border-radius: 10px; box-shadow: 0 0 0 999px rgba(0, 0, 0, .38); }',
      '.scan-viseur::after { content: ""; position: absolute; left: 6px; right: 6px; top: 50%; height: 2px; background: #E5484D; box-shadow: 0 0 8px #E5484D; animation: scanBalai 1.6s ease-in-out infinite alternate; }',
      '@keyframes scanBalai { from { transform: translateY(-22px); } to { transform: translateY(22px); } }',
      '@media (prefers-reduced-motion: reduce) { .scan-viseur::after { animation: none; } }',
      '.scan-cadre.lu .scan-viseur { border-color: #2FBF71; }',
      '.scan-etat { margin: 10px 0 0; font-size: 14px; min-height: 20px; }',
      '.scan-etat.erreur { color: var(--rouge, #B42318); }',
      '.scan-etat.ok { color: var(--vert-fonce, #006B32); font-weight: 600; }',
      '.scan-outils { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }',
      '.scan-outils .btn { min-height: 44px; }',
      '.scan-manuel { display: flex; gap: 8px; margin-top: 10px; }',
      '.scan-manuel input { flex: 1 1 auto; min-width: 0; height: 44px; font-family: var(--mono, monospace); text-transform: uppercase; letter-spacing: .04em; }',
      '.scan-aide { font-size: 13px; color: var(--encre-3, #4B5563); margin: 8px 0 0; }',
      /* Instructions d'installation */
      '.pwa-etapes { margin: 6px 0 0; padding-left: 20px; } .pwa-etapes li { margin: 6px 0; }',
      '.pwa-titre { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; } .pwa-titre img { width: 52px; height: 52px; border-radius: 12px; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ============================== Installation =============================== */
  var invite = null;          // l'invitation de Chrome, gardée pour la montrer au bon moment
  var urlIcone = 'assets/icones/icone-192.png';

  function autonome() {
    try { if (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: minimal-ui)').matches) return true; } catch (e) {}
    return window.navigator.standalone === true;
  }
  function plateforme() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'ordinateur';
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    invite = e;
    majInstallation();
  });
  window.addEventListener('appinstalled', function () {
    invite = null;
    retirerBandeau();
    if (AMX.toast) AMX.toast('Automax 2.0 est installé : ouvrez-le depuis l\'écran d\'accueil.', 'ok', 6000);
    majInstallation();
  });

  function installer() {
    if (invite) {
      var ev = invite;
      return ev.prompt().then(function () { return ev.userChoice; }).then(function (c) {
        invite = null; retirerBandeau(); majInstallation();
        if (c && c.outcome === 'dismissed') AMX.toast('Installation annulée. Le menu du compte la propose encore.', 'info', 4500);
      }).catch(function () { instructions(); });
    }
    instructions();
    return Promise.resolve();
  }

  /* Sans invitation (Chrome l'a déjà montrée, autre navigateur, iPhone) : comment faire à la main. */
  function instructions() {
    var pf = plateforme();
    var corps = h('div', [
      h('div.pwa-titre', [h('img', { src: urlIcone, alt: '' }), h('div', [h('b', { text: 'Automax 2.0' }), h('div.mini', { text: 'Le site installé comme une application : icône sur l\'écran d\'accueil, plein écran.' })])])
    ]);
    if (pf === 'ios') {
      corps.appendChild(h('p', { text: 'Sur iPhone et iPad, prenez l\'application Automax 2.0 de l\'App Store : elle a le scanner de NIV, les photos et les alertes.' }));
      corps.appendChild(h('p.mini', { text: 'Pour ajouter plutôt le site : dans Safari, touchez Partager (le carré avec une flèche) › « Sur l\'écran d\'accueil ».' }));
    } else if (pf === 'android') {
      corps.appendChild(h('ol.pwa-etapes', [
        h('li', { html: 'Ouvrez le site dans <b>Chrome</b> (ou Samsung Internet).' }),
        h('li', { html: 'Chrome : touchez <b>⋮</b> en haut à droite › <b>Installer l\'application</b> (ou « Ajouter à l\'écran d\'accueil » › « Installer »).' }),
        h('li', { html: 'Samsung Internet : touchez <b>☰</b> › <b>Ajouter la page à</b> › <b>Écran d\'accueil</b>.' }),
        h('li', { text: 'L\'icône Automax 2.0 apparaît sur l\'écran d\'accueil. Gardez-la appuyée pour le raccourci « Scanner un NIV ».' })
      ]));
    } else {
      corps.appendChild(h('ol.pwa-etapes', [
        h('li', { html: 'Dans <b>Chrome</b> ou <b>Edge</b>, cliquez l\'icône d\'installation au bout de la barre d\'adresse (un écran avec une flèche).' }),
        h('li', { html: 'Sinon : <b>⋮</b> › « Caster, enregistrer et partager » › <b>Installer la page en tant qu\'application</b> (Chrome) ou <b>…</b> › Applications › Installer ce site (Edge).' }),
        h('li', { text: 'Automax 2.0 s\'ouvre ensuite dans sa propre fenêtre, comme un logiciel.' })
      ]));
    }
    var boutons = pf === 'ios'
      ? [{ texte: 'Fermer' }, { texte: 'Ouvrir l\'App Store', classe: 'primaire', action: function () { window.open(APP_STORE, '_blank', 'noopener'); } }]
      : [{ texte: 'Compris', classe: 'primaire' }];
    AMX.modale({ titre: pf === 'ios' ? 'Automax 2.0 sur iPhone' : 'Installer Automax 2.0', corps: corps, boutons: boutons, proteger: false });
  }

  /* Ligne du menu du compte (appelée par dessinerBarre, app.js). Rien quand le site est déjà ouvert comme application. */
  AMX.ligneInstaller = function (fermerMenu) {
    if (autonome()) return null;
    css();
    var ios = plateforme() === 'ios';
    return h('button.installer-menu', {
      type: 'button',
      html: (AMX.icones.telecharger || '') + '<span>' + (ios ? 'App iPhone (App Store)' : 'Installer l\'application') + '</span>',
      onclick: function () { if (fermerMenu) fermerMenu(); installer(); }
    });
  };

  /* Bandeau d'un téléphone Android quand Chrome offre l'installation (une fois par appareil). */
  var bandeau = null;
  function bandeauFerme() { try { return !!(AMX.memo && AMX.memo.lire('pwa_bandeau', '')); } catch (e) { return false; } }
  function retirerBandeau() { if (bandeau) { bandeau.remove(); bandeau = null; } document.body.classList.remove('avec-bandeau-pwa'); }
  function majInstallation() {
    var appli = document.getElementById('appli');
    var connecte = !!(appli && appli.classList.contains('pret') && AMX.session && AMX.session.courriel);
    if (!invite || autonome() || !connecte || bandeauFerme() || window.innerWidth > 860) { if (!invite || autonome()) retirerBandeau(); return; }
    if (bandeau) return;
    css();
    bandeau = h('div.pwa-bandeau', { role: 'region', 'aria-label': 'Installer l\'application' }, [
      h('img', { src: urlIcone, alt: '' }),
      h('div.txt', [h('b', { text: 'Installer Automax 2.0' }), 'Icône sur l\'écran d\'accueil, scanner de NIV.']),
      h('button.btn.primaire', { type: 'button', text: 'Installer', onclick: function () { installer(); } }),
      h('button.pwa-fermer', { type: 'button', title: 'Plus tard (le menu du compte la propose encore)', 'aria-label': 'Plus tard', html: AMX.icones.fermer || '×',
        onclick: function () { try { AMX.memo.ecrire('pwa_bandeau', new Date().toISOString().slice(0, 10)); } catch (e) {} retirerBandeau(); } })
    ]);
    document.body.appendChild(bandeau);
    document.body.classList.add('avec-bandeau-pwa');
  }
  document.addEventListener('automax:connecte', function () { setTimeout(majInstallation, 1500); });

  AMX.installation = { autonome: autonome, plateforme: plateforme, possible: function () { return !!invite; }, installer: installer, instructions: instructions };

  /* Le service worker : seulement la page « Pas de connexion » (sw.js). Jamais sur la maquette locale. */
  (function () {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
    var src = (document.currentScript && document.currentScript.src) || '';
    if (!src) return;
    var url = new URL('../sw.js', src);
    if (url.origin !== location.origin) return;
    window.addEventListener('load', function () { navigator.serviceWorker.register(url.href).catch(function () {}); });
  })();

  /* ================================= Le NIV ================================== */
  var TRANSLIT = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  var POIDS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  function cleValide(vin) {
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false;
    var s = 0;
    for (var i = 0; i < 17; i++) { var c = vin.charAt(i); var v = /\d/.test(c) ? Number(c) : TRANSLIT[c]; s += v * POIDS[i]; }
    var r = s % 11;
    return vin.charAt(8) === (r === 10 ? 'X' : String(r));
  }
  /* Le texte d'un code-barres → le NIV qu'il contient. Les codes Code 39 des véhicules importés commencent souvent par un « I »
     (ou finissent par un caractère de contrôle) : on essaie chaque suite de 17 caractères permis, celle dont le chiffre de
     contrôle est bon d'abord. Renvoie { vin, cle } ou null. */
  function extraire(texte) {
    var t = String(texte || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (t.length < 17) return null;
    var sans = null;
    for (var i = 0; i + 17 <= t.length; i++) {
      var c = t.substr(i, 17);
      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(c)) continue;
      if (cleValide(c)) return { vin: c, cle: true };
      if (!sans) sans = c;
    }
    return sans ? { vin: sans, cle: false } : null;
  }
  AMX.niv = { extraire: extraire, cleValide: cleValide };

  /* ============================ Lecture par la caméra ============================ */
  var tactile = false;
  try { tactile = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0; } catch (e) {}
  function possible() {
    return !!(tactile && 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
  var FORMATS_VOULUS = ['code_39', 'code_128', 'data_matrix', 'qr_code', 'pdf417', 'code_93', 'itf'];
  var detecteurPromesse = null;
  function detecteur() {
    if (!detecteurPromesse) {
      detecteurPromesse = Promise.resolve(window.BarcodeDetector.getSupportedFormats ? window.BarcodeDetector.getSupportedFormats() : FORMATS_VOULUS)
        .catch(function () { return FORMATS_VOULUS; })
        .then(function (dispo) {
          var f = FORMATS_VOULUS.filter(function (x) { return dispo.indexOf(x) >= 0; });
          return f.length ? new window.BarcodeDetector({ formats: f }) : new window.BarcodeDetector();
        });
    }
    return detecteurPromesse;
  }

  /* La fenêtre de lecture. opts : { titre, surNiv(vin, { cle, manuel }) }. */
  function ouvrir(opts) {
    opts = opts || {};
    css();
    var video = h('video', { muted: true, playsinline: true, autoplay: true, 'aria-hidden': 'true' });
    video.muted = true; video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
    var cadre = h('div.scan-cadre', [video, h('div.scan-viseur')]);
    var etat = h('p.scan-etat', { role: 'status', 'aria-live': 'polite', text: 'Ouverture de la caméra…' });
    var btnLampe = h('button.btn', { type: 'button', html: '<span>Lampe</span>', style: { display: 'none' } });   // .btn l'emporte sur [hidden]
    var inManuel = h('input.saisie', { type: 'text', maxlength: '20', placeholder: 'Ou tapez le NIV (17 caractères)', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', inputmode: 'text' });
    var btnManuel = h('button.btn', { type: 'button', text: 'OK' });
    var corps = h('div', [
      cadre, etat,
      h('p.scan-aide', { text: 'Visez le code-barres du NIV : sur le cadre de la porte du conducteur, ou sous le pare-brise côté conducteur. Tenez le téléphone à 15-25 cm, l\'image bien nette.' }),
      h('div.scan-outils', [btnLampe]),
      h('div.scan-manuel', [inManuel, btnManuel])
    ]);
    var flux = null, piste = null, fini = false, minuterie = null, lampe = false, dernier = '', vu = 0;

    var arreter = function () {
      fini = true;
      if (minuterie) { clearTimeout(minuterie); minuterie = null; }
      if (flux) { flux.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); flux = null; }
      try { video.srcObject = null; } catch (e) {}
    };
    var m = AMX.modale({ titre: opts.titre || 'Scanner un NIV', corps: corps, boutons: [{ texte: 'Annuler' }], classe: 'scan-voile', proteger: false, onFermer: arreter });

    var accepter = function (vin, info) {
      if (fini) return;
      arreter();
      cadre.classList.add('lu');
      try { if (navigator.vibrate) navigator.vibrate(80); } catch (e) {}
      etat.className = 'scan-etat ok';
      etat.textContent = 'NIV lu : ' + vin + (info && info.cle === false ? ' (chiffre de contrôle à vérifier)' : '');
      setTimeout(function () {
        m.fermer();
        if (opts.surNiv) opts.surNiv(vin, info || {});
        if (info && info.cle === false && !info.manuel) AMX.toast('NIV lu, mais son chiffre de contrôle ne correspond pas : vérifiez-le sur le véhicule.', 'attention', 6000);
      }, 450);
    };

    var manuel = function () {
      var r = extraire(inManuel.value);
      var brut = String(inManuel.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!r || brut.length !== 17) { etat.className = 'scan-etat erreur'; etat.textContent = 'Un NIV a 17 caractères, sans I, O ni Q.'; inManuel.focus(); return; }
      accepter(r.vin, { cle: r.cle, manuel: true });
    };
    btnManuel.addEventListener('click', manuel);
    inManuel.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); manuel(); } });

    btnLampe.addEventListener('click', function () {
      if (!piste) return;
      lampe = !lampe;
      piste.applyConstraints({ advanced: [{ torch: lampe }] }).then(function () { btnLampe.classList.toggle('primaire', lampe); }).catch(function () { lampe = false; });
    });

    var lire = function (det) {
      if (fini) return;
      if (video.readyState < 2) { minuterie = setTimeout(function () { lire(det); }, 200); return; }
      det.detect(video).then(function (codes) {
        if (fini) return;
        for (var i = 0; i < (codes || []).length; i++) {
          var r = extraire(codes[i].rawValue);
          if (!r) continue;
          if (r.cle) { accepter(r.vin, { cle: true, format: codes[i].format }); return; }
          // Chiffre de contrôle pas bon (véhicule fait pour un autre marché, ou mauvaise lecture) : deux lectures pareilles d'abord.
          if (r.vin === dernier) { vu++; if (vu >= 2) { accepter(r.vin, { cle: false, format: codes[i].format }); return; } }
          else { dernier = r.vin; vu = 1; }
          etat.className = 'scan-etat'; etat.textContent = 'Lecture… gardez le code dans le cadre.';
        }
        minuterie = setTimeout(function () { lire(det); }, 160);
      }).catch(function () { minuterie = setTimeout(function () { lire(det); }, 400); });
    };

    if (!possible()) {
      etat.className = 'scan-etat erreur';
      etat.textContent = 'Ce navigateur ne lit pas les codes-barres. Tapez le NIV ci-dessous (sur Android : Chrome).';
      cadre.hidden = true;
      setTimeout(function () { inManuel.focus(); }, 60);
      return m;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(function (f) {
        if (fini) { f.getTracks().forEach(function (t) { t.stop(); }); return; }
        flux = f; piste = f.getVideoTracks()[0] || null;
        video.srcObject = f;
        var p = video.play(); if (p && p.catch) p.catch(function () {});
        try {
          var cap = piste && piste.getCapabilities ? piste.getCapabilities() : {};
          if (cap.torch) btnLampe.style.display = '';
          if (cap.focusMode && cap.focusMode.indexOf('continuous') >= 0) piste.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
        } catch (e) {}
        etat.className = 'scan-etat'; etat.textContent = 'Placez le code-barres du NIV dans le cadre.';
        return detecteur().then(function (det) { lire(det); });
      })
      .catch(function (err) {
        var n = err && err.name;
        etat.className = 'scan-etat erreur';
        etat.textContent = n === 'NotAllowedError' ? 'Accès à la caméra refusé. Permettez la caméra pour ce site (cadenas de la barre d\'adresse › Autorisations), ou tapez le NIV.'
          : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'Aucune caméra trouvée. Tapez le NIV ci-dessous.'
          : n === 'NotReadableError' ? 'La caméra est déjà utilisée par une autre application. Fermez-la, ou tapez le NIV.'
          : 'La caméra ne s\'ouvre pas. Tapez le NIV ci-dessous.';
        cadre.hidden = true;
      });
    return m;
  }

  /* Le NIV lu va dans le champ comme si on l'avait tapé, puis « Entrée » (charge l'évaluation, cherche la vente, etc.). */
  function remplir(input, vin, entree) {
    var proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (proto && proto.set) proto.set.call(input, vin); else input.value = vin;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (entree !== false) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  }

  function boutonScan(titre, surClic) {
    return h('button.scan-niv-btn', { type: 'button', title: titre, 'aria-label': titre, html: AMX.icones.scan || '', onmousedown: function (e) { e.preventDefault(); }, onclick: function (e) { e.preventDefault(); e.stopPropagation(); surClic(); } });
  }

  /* Un champ NIV reçoit un bouton caméra (à droite, dans le champ). opts : { entree (false = pas d'Entrée), titre, surNiv } */
  function attacher(input, opts) {
    opts = opts || {};
    if (!input || input.dataset.scan || !possible() || !input.parentNode) return;
    input.dataset.scan = '1';
    css();
    var env = h('span.scan-env');
    var focusAvant = document.activeElement === input;
    input.parentNode.insertBefore(env, input);
    env.appendChild(input);
    env.appendChild(boutonScan('Scanner le NIV avec la caméra', function () {
      ouvrir({ titre: opts.titre || 'Scanner un NIV', surNiv: function (vin, info) { remplir(input, vin, opts.entree); if (opts.surNiv) opts.surNiv(vin, info); } });
    }));
    if (focusAvant) { try { input.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* La recherche du haut : le NIV lu y est cherché (la boîte des résultats s'ouvre). */
  function chercherNiv(vin) {
    var input = document.getElementById('recherche-globale');
    if (!input) return;
    remplir(input, vin, false);
    try { input.focus(); } catch (e) {}
  }
  function dansRecherche(boite) {
    if (!boite || boite.querySelector('.scan-niv-btn') || !possible()) return;
    css();
    boite.classList.add('avec-scan');
    boite.appendChild(boutonScan('Scanner un NIV et le chercher', function () { ouvrir({ titre: 'Scanner un NIV', surNiv: chercherNiv }); }));
  }

  /* Les champs NIV du site, trouvés à mesure que les pages se dessinent (aucun module à modifier). */
  var CHAMPS_NIV = [
    '#e-niv',                                     // Évaluation
    '#vin-lookup',                                // Fiche d'achat
    '#vente-recherche', '#vente-echange-vin',     // Livre des ventes : véhicule vendu, échange
    'input[placeholder="NIV (17 caractères)"]',   // Demande d'évaluation, NIV d'une vente
    'input.ech-vin',                              // Échange de neufs
    'input.saisie.niv',                           // Valeurs OpenLane
    'input[placeholder="NIV"][maxlength="17"]'    // Estimé (Texto)
  ].map(function (s) { return s + ':not([data-scan])'; }).join(', ');
  var attente = null;
  function balayer() {
    attente = null;
    var l = document.querySelectorAll(CHAMPS_NIV);
    for (var i = 0; i < l.length; i++) attacher(l[i]);
  }
  if (possible()) {
    var obs = new MutationObserver(function () { if (!attente) attente = setTimeout(balayer, 250); });
    var demarrer = function () { obs.observe(document.body, { childList: true, subtree: true }); balayer(); };
    if (document.body) demarrer(); else document.addEventListener('DOMContentLoaded', demarrer);
  }

  /* Raccourci « Scanner un NIV » de l'icône (manifest : ./?scan=1) : la caméra s'ouvre une fois connecté. */
  var scanDemande = false;
  try {
    var u = new URL(location.href);
    if (u.searchParams.get('scan') === '1') { scanDemande = true; u.searchParams.delete('scan'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); }
  } catch (e) {}
  document.addEventListener('automax:connecte', function () {
    if (!scanDemande) return;
    scanDemande = false;
    setTimeout(function () {
      if (possible()) ouvrir({ titre: 'Scanner un NIV', surNiv: chercherNiv });
      else { var input = document.getElementById('recherche-globale'); if (input) input.focus(); }
    }, 500);
  });

  AMX.scanNiv = { possible: possible, ouvrir: ouvrir, attacher: attacher, dansRecherche: dansRecherche, chercher: chercherNiv };
})();
