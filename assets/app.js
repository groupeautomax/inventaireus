/* =========================================================================
   Groupe Automax — interface d'inventaire v2 : noyau de l'application
   -------------------------------------------------------------------------
   Une seule page (index.html), des sections chargées par le routeur
   (#/inventaire/us, #/offres/recues, #/achat?vin=…). Chaque section est un
   module séparé (assets/*.js) qui s'enregistre avec AMX.section(...).

   Ce fichier fournit :
     - la session (courriel → code à six chiffres → jeton), même backend que
       l'app iPhone (Auth.gs) ;
     - le client API (GET avec reprise, POST sans reprise, jeton ajouté,
       session expirée détectée) ;
     - le routeur, la barre du haut, les sous-onglets ;
     - le cache d'inventaire partagé (US / CAN / DETAIL) ;
     - des utilitaires d'interface (h, esc, toast, modale, confirmer…).
   ========================================================================= */
(function () {
  'use strict';

  var URL_BACKEND = 'https://script.google.com/macros/s/AKfycbwZsbAEELfW5Ce80l3v39unBI6L3js8IQ3iYilrGDNK2zUzlv16XxkoZYZuf4t3tgfX/exec';
  var SITE_PUBLIC = 'https://groupeautomax.github.io/inventaireus/';

  // Mêmes clés que l'ancien site : une session ouverte reste ouverte.
  var CLE = { mail: 'pg_utilisateur_v1', nom: 'pg_nom_v1', role: 'pg_role_v1', jeton: 'pg_jeton_v1', perms: 'amx_perms_v1', expire: 'amx_session_expire_v1', tel: 'amx_tel_v1', textos: 'amx_textos_v1', canal: 'amx_canal_code_v1' };
  // CLE.canal (8 oct.) : par où cette personne a reçu son dernier code sur CET appareil — 'courriel' ou
  // 'texto'. Propre à l'appareil, gardé à la déconnexion : le bouton proposé en premier s'en souvient.

  var AMX = window.AMX = { URL: URL_BACKEND, SITE: SITE_PUBLIC, sections: {}, session: { courriel: '', nom: '', role: '', perms: null, telephone: '', textos: null } };

  // Session (6 oct.) : une connexion vaut 30 jours, sur le site comme dans l'app — c'est le serveur
  // (Auth.gs, AUTH_DUREE_JETON_J) qui tranche ; ici on garde la date pour l'afficher et éviter un aller-retour inutile.
  AMX.sessionExpire = function () { var t = parseInt(lire(CLE.expire), 10); return isFinite(t) && t > 0 ? new Date(t) : null; };
  AMX.sessionTexte = function () { var d = AMX.sessionExpire(); if (!d) return ''; var j = Math.ceil((d.getTime() - Date.now()) / 86400000); return 'Connecté jusqu\'au ' + d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' }) + (j > 0 ? ' (' + j + ' jour' + (j > 1 ? 's' : '') + ')' : ''); };

  /* ------------------------------ Mémoire ------------------------------ */
  function lire(c) { try { return localStorage.getItem(c) || ''; } catch (e) { return ''; } }
  function ecrire(c, v) { try { localStorage.setItem(c, v); } catch (e) {} }
  function effacer(c) { try { localStorage.removeItem(c); } catch (e) {} }
  AMX.memo = {
    lire: function (k, defaut) { var v = lire('amx_' + k); if (v === '') return defaut; try { return JSON.parse(v); } catch (e) { return defaut; } },
    ecrire: function (k, v) { ecrire('amx_' + k, JSON.stringify(v)); }
  };

  /* ---------------------- Nouvelle interface (v131, 23 oct.) ----------------------
     Maxime : « la nouvelle interface derrière un interrupteur : barre latérale, concession dans la barre, Ctrl+K,
     Accueil « À faire », puis la page Usagé refaite ». html.ui2 l'allume. Propre à l'appareil (localStorage amx_ui) ;
     ?ui=2 / ?ui=1 dans l'adresse l'allume / l'éteint d'un lien ; menu du compte → « Essayer la nouvelle interface ».
     v132 (Maxime : « allume la nouvelle interface par défaut pour tout le monde, avec l'option de revenir à l'ancienne ») :
     allumée partout, sauf sur un appareil où quelqu'un a choisi « Revenir à l'ancienne interface » (amx_ui = '1'). */
  (function () {
    try { var p = new URLSearchParams(location.search).get('ui'); if (p === '2' || p === '1') ecrire('amx_ui', p); } catch (e) {}
    if (lire('amx_ui') !== '1') document.documentElement.classList.add('ui2');
  })();
  AMX.ui2 = function () { return document.documentElement.classList.contains('ui2'); };
  AMX.basculerInterface = function (nouvelle) {
    ecrire('amx_ui', nouvelle ? '2' : '1');
    try { var u = new URL(location.href); u.searchParams.delete('ui'); history.replaceState(null, '', u.toString()); } catch (e) {}
    location.reload();
  };

  /* ---------------------------- Utilitaires ---------------------------- */
  var esc = AMX.esc = function (s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  // h('div.classe#id', {attr: ...}, [enfants]) — petit constructeur de DOM.
  var h = AMX.h = function (sel, attrs, enfants) {
    if (Array.isArray(attrs) || typeof attrs === 'string' || attrs instanceof Node) { enfants = attrs; attrs = {}; }
    attrs = attrs || {};
    var parts = String(sel).split(/(?=[.#])/);
    var el = document.createElement(parts[0] || 'div');
    parts.slice(1).forEach(function (p) { if (p[0] === '.') el.classList.add(p.slice(1)); else if (p[0] === '#') el.id = p.slice(1); });
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    (function ajouter(e) {
      if (e === undefined || e === null || e === false) return;
      if (Array.isArray(e)) { e.forEach(ajouter); return; }
      if (e instanceof Node) { el.appendChild(e); return; }
      el.appendChild(document.createTextNode(String(e)));
    })(enfants);
    return el;
  };
  AMX.vider = function (el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; };

  // Chargement « Groupe Automax » (Maxime, 6 oct. : « quand une page load, indique
  // quelque chose de le fun qui tourne »). Un anneau vert qui tourne, une petite
  // auto qui roule, la marque, et une phrase qui change toutes les deux secondes.
  // AMX.chargeur('Inventaire Detail') → élément à poser à la place des squelettes ;
  // il arrête son horloge tout seul quand on le retire de la page.
  var CHARGEUR_PHRASES = ['On réchauffe le moteur…', 'On fait le tour du lot…', 'On compte les clés…', 'On vérifie les NIV…',
    'On remplit le réservoir…', 'On ajuste les miroirs…', 'On gonfle les pneus…', 'On lave les vitres…', 'On sort les véhicules…'];
  var chargeurIndex = Math.floor(Math.random() * CHARGEUR_PHRASES.length);
  AMX.chargeur = function (libelle, opts) {
    opts = opts || {};
    var auto = '<svg viewBox="0 0 64 34" aria-hidden="true"><path d="M7 23 L11 15 Q14 9 21 9 L37 9 Q45 9 51 15 L57 17 Q61 18 61 22 L61 25 L7 25 Z" fill="currentColor"/>' +
      '<path d="M22 11 L36 11 Q42 11 46 15 L24 15 Z" fill="#fff" opacity=".9"/><path d="M13 16 L20 16 L20 12 Q15 12 13 16 Z" fill="#fff" opacity=".9"/>' +
      '<circle cx="19" cy="26" r="4.5" fill="#fff"/><circle cx="19" cy="26" r="2.2" fill="currentColor"/><circle cx="48" cy="26" r="4.5" fill="#fff"/><circle cx="48" cy="26" r="2.2" fill="currentColor"/></svg>';
    var phrase = h('div.amx-chargeur-phrase', { text: CHARGEUR_PHRASES[chargeurIndex % CHARGEUR_PHRASES.length] });
    var el = h('div.amx-chargeur' + (opts.compact ? '.compact' : ''), { role: 'status', 'aria-live': 'polite' }, [
      h('div.amx-chargeur-roue', [h('div.amx-chargeur-anneau'), h('div.amx-chargeur-auto', { html: auto }), h('div.amx-chargeur-route')]),
      h('div.amx-chargeur-marque', [h('span', 'Groupe'), h('b', 'Automax')]),
      libelle ? h('div.amx-chargeur-libelle', { text: libelle }) : null,
      phrase
    ]);
    var horloge = setInterval(function () {
      if (!el.isConnected) { clearInterval(horloge); return; }
      chargeurIndex = (chargeurIndex + 1) % CHARGEUR_PHRASES.length;
      phrase.classList.remove('monte'); void phrase.offsetWidth;   // relance l'animation
      phrase.textContent = CHARGEUR_PHRASES[chargeurIndex]; phrase.classList.add('monte');
    }, 2000);
    return el;
  };

  var ICONES = AMX.icones = {
    accueil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5L12 4l9 7.5"/><path d="M5.5 10v9.5h5v-5.5h3v5.5h5V10"/></svg>',
    suggestions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V17h5v-1.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/></svg>',
    inventaire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l1.5-5A2 2 0 0 1 6.4 4.5h11.2a2 2 0 0 1 1.9 1.5L21 11"/><rect x="3" y="11" width="18" height="7" rx="1.5"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="16.5" cy="18" r="1.8"/></svg>',
    neufs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l1.5-5A2 2 0 0 1 6.4 5.5h7.1"/><rect x="3" y="12" width="18" height="6.5" rx="1.5"/><circle cx="7.5" cy="18.5" r="1.8"/><circle cx="16.5" cy="18.5" r="1.8"/><path d="M18 2.5l1 2.2 2.4.3-1.8 1.6.5 2.4L18 7.8l-2.1 1.2.5-2.4-1.8-1.6 2.4-.3z"/></svg>',
    offres: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 13.5l-7 7-10-10V3.5h7l10 10z"/><circle cx="8" cy="8" r="1.5"/></svg>',
    /* 21 oct. : tuiles Vente (poignée de main) et Relance (téléphone qui rappelle). */
    vente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l3-3h4l2 2h3l2-2h4"/><path d="M3 10l5 6a2 2 0 0 0 3 0l1-1 1 1a2 2 0 0 0 3 0l5-6"/><path d="M8 7l4 4"/></svg>',
    relance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h3.5l1.5 4-2 1.5a10 10 0 0 0 6.5 6.5L16 14l4 1.5V19a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/><path d="M15 3a6 6 0 0 1 6 6"/><path d="M15 6.5a2.5 2.5 0 0 1 2.5 2.5"/></svg>',
    achat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>',
    service: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4.5a4.5 4.5 0 0 0-5.6 5.6L4 15v5h5l4.9-4.9a4.5 4.5 0 0 0 5.6-5.6l-2.6 2.6-2.6-.9-.9-2.6z"/></svg>',
    outils: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.1 2.1 0 0 1-3-3l9.4-9.4z"/><path d="M15 5l4 4"/></svg>',
    resultat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l4-5 3 3 5-7"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
    recherche: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    fermer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    texto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    points: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/></svg>',
    voiture: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l2-5h14l2 5"/><rect x="2.5" y="12" width="19" height="6" rx="1.5"/><circle cx="7" cy="18.5" r="1.5"/><circle cx="17" cy="18.5" r="1.5"/></svg>',
    lien: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    copier: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    courriel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    rafraichir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    telecharger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>',
    alerte: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    filtre: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16l-6 8v6l-4-2v-4z"/></svg>',
    externe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
    corbeille: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>',
    cadenas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    imprimer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>',
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/></svg>'
  };
  AMX.svg = function (nom, cls) { var s = document.createElement('span'); s.className = 'ico' + (cls ? ' ' + cls : ''); s.innerHTML = ICONES[nom] || ''; return s.firstChild; };

  // Une date seule (« 2026-10-20 ») est lue comme une date locale : new Date('2026-10-20') la prend à minuit UTC,
  // ce qui donnait la veille à Montréal (11 oct.).
  AMX.dateDe = function (iso) {
    if (iso instanceof Date) return iso;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0) : new Date(iso);
  };
  AMX.fmtDate = function (iso, avecHeure) {
    if (!iso) return '—';
    var d = AMX.dateDe(iso);
    if (isNaN(d.getTime())) return String(iso);
    var date = d.toLocaleDateString('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    if (!avecHeure) return date;
    return date + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
  };
  AMX.fmtDateCourte = function (iso) {
    if (!iso) return '—';
    var d = AMX.dateDe(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' }).replace('.', '');
  };
  AMX.joursDepuis = function (iso) {
    if (!iso) return null;
    var d = new Date(iso); if (isNaN(d.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  };
  AMX.montant = function (v) {
    if (v === null || v === undefined) return NaN;
    var s = String(v).replace(/\s| |\$/g, '').replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  };
  AMX.fmtArgent = function (v, decimales) {
    var n = typeof v === 'number' ? v : AMX.montant(v);
    if (isNaN(n)) return '—';
    var d = decimales === undefined ? 0 : decimales;
    return n.toLocaleString('fr-CA', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ /g, ' ') + ' $';
  };
  // Un kilométrage valide (> 0, chiffres seulement) ou null — même règle que Stock.gs.
  AMX.kmValide = function (x) { if (x === null || x === undefined) return null; var n = Number(String(x).replace(/[^\d.]/g, '')); return isNaN(n) || n <= 0 ? null : Math.round(n); };
  AMX.fmtNombre = function (n) { return isNaN(n) ? '—' : Number(n).toLocaleString('fr-CA').replace(/ /g, ' '); };
  AMX.initiales = function (nom) {
    var p = String(nom || '').trim().split(/[\s.@_-]+/).filter(Boolean);
    return ((p[0] || '')[0] || '?').toUpperCase() + ((p[1] || '')[0] || '').toUpperCase();
  };
  AMX.copier = function (texte, message) {
    var fini = function () { AMX.toast(message || 'Copié', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texte).then(fini, function () { AMX.toast('Copie impossible', 'erreur'); });
    else { var t = document.createElement('textarea'); t.value = texte; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); fini(); } catch (e) {} document.body.removeChild(t); }
  };
  AMX.debounce = function (fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; };
  AMX.telechargerBase64 = function (base64, nom, mime) {
    var oct = atob(base64), tab = new Uint8Array(oct.length);
    for (var i = 0; i < oct.length; i++) tab[i] = oct.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([tab], { type: mime || 'application/pdf' }));
    var a = document.createElement('a'); a.href = url; a.download = nom || 'fichier'; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  };
  AMX.idDrive = function (u) {
    var m = String(u || '').match(/\/d\/([A-Za-z0-9_-]{15,})/) || String(u || '').match(/[?&]id=([A-Za-z0-9_-]{15,})/);
    return m ? m[1] : '';
  };
  AMX.vignetteDrive = function (u, largeur) {
    var id = AMX.idDrive(u);
    return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (largeur || 400) : String(u || '');
  };

  /* ------------------------------ Toasts ------------------------------- */
  AMX.toast = function (texte, type, duree) {
    var zone = document.getElementById('toasts');
    if (!zone) { zone = h('div#toasts'); document.body.appendChild(zone); }
    var t = h('div.toast' + (type ? '.' + type : ''), [h('span', { text: texte })]);
    zone.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .25s'; setTimeout(function () { t.remove(); }, 260); }, duree || (type === 'erreur' ? 6000 : 3200));
    return t;
  };

  /* ------------------------------ Modales ------------------------------ */
  // AMX.modale({ titre, corps (Node|string), boutons: [{texte, classe, action(fermer), primaire}], large })
  AMX.modale = function (o) {
    /* v130 (rapport « Refonte ergonomique », gain rapide 8) : la fenêtre est annoncée comme dialogue, le clavier reste
       dedans (Tab tourne entre ses boutons), le focus revient où il était à la fermeture, et une saisie modifiée n'est
       plus perdue par Échap ou un clic à côté : on demande d'abord (o.proteger === false pour s'en passer). Seule la
       fenêtre du dessus répond à Échap (une confirmation ouverte par-dessus une fiche ne ferme plus les deux). */
    var avant = document.activeElement;
    var idTitre = 'modale-titre-' + (++AMX.modale.n);
    var voile = h('div.voile' + (o.classe ? '.' + o.classe : ''));
    var corps = h('div.modale-corps');
    if (typeof o.corps === 'string') corps.innerHTML = o.corps; else if (o.corps) corps.appendChild(o.corps);
    var pied = h('div.modale-pied');
    var ferme = false, modifie = false, avis = null;
    var fermer = function () {
      if (ferme) return; ferme = true;
      voile.remove(); document.removeEventListener('keydown', surTouche, true);
      AMX.modale.pile = AMX.modale.pile.filter(function (x) { return x !== modale; });
      if (avant && avant.isConnected && typeof avant.focus === 'function') { try { avant.focus({ preventScroll: true }); } catch (e) {} }
      if (o.onFermer) o.onFermer();
    };
    // 14 oct. : `boutons(liste)` sur l'objet renvoyé remplace les boutons (modale remplie après un chargement).
    var poserBoutons = function (liste) {
      AMX.vider(pied);
      (liste || [{ texte: 'Fermer' }]).forEach(function (b) {
        var btn = h('button.btn' + (b.classe ? '.' + b.classe.split(' ').join('.') : ''), { text: b.texte, type: 'button' });
        btn.addEventListener('click', function () {
          if (!b.action) { fermer(); return; }
          var r = b.action(fermer, btn);
          if (r && typeof r.then === 'function') { btn.classList.add('occupe'); r.then(function (res) { btn.classList.remove('occupe'); if (res !== false) fermer(); }, function () { btn.classList.remove('occupe'); }); }
          else if (r !== false) fermer();
        });
        pied.appendChild(btn);
      });
    };
    poserBoutons(o.boutons);
    var modale = h('div.modale' + (o.large ? '.large' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': idTitre, tabindex: '-1' }, [
      h('div.modale-entete', [h('h2', { id: idTitre, text: o.titre || '' }), h('button.fermer', { type: 'button', 'aria-label': 'Fermer', html: ICONES.fermer, onclick: fermer })]),
      corps,
      o.sansPied ? null : pied
    ]);
    voile.appendChild(modale);
    // Une saisie dans la fenêtre la rend « modifiée ».
    var marquer = function (e) { if (avis && avis.contains(e.target)) return; if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) modifie = true; else if (e.target && e.target.isContentEditable) modifie = true; };
    modale.addEventListener('input', marquer); modale.addEventListener('change', marquer);
    var demanderFermeture = function () {
      if (o.bloquante) return;
      if (!modifie || o.proteger === false) { fermer(); return; }
      if (avis) { avis.querySelector('button').focus(); return; }
      avis = h('div.modale-avis', { role: 'alert' }, [
        h('span', { text: 'Vos changements ne sont pas enregistrés.' }),
        h('button.btn.petit', { type: 'button', text: 'Continuer la saisie', onclick: function () { avis.remove(); avis = null; var c = corps.querySelector('input, select, textarea'); if (c) c.focus(); } }),
        h('button.btn.petit.danger', { type: 'button', text: 'Fermer sans enregistrer', onclick: fermer })
      ]);
      modale.insertBefore(avis, corps);
      avis.querySelector('button').focus();
    };
    voile.addEventListener('mousedown', function (e) { if (e.target === voile) { e.preventDefault(); demanderFermeture(); } });
    var focusables = function () {
      return Array.prototype.slice.call(modale.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
    };
    function surTouche(e) {
      var pile = AMX.modale.pile;
      if (pile[pile.length - 1] !== modale) return;   // une autre fenêtre est par-dessus
      if (e.key === 'Escape') { e.stopPropagation(); demanderFermeture(); return; }
      if (e.key === 'Tab') {
        var l = focusables(); if (!l.length) { e.preventDefault(); modale.focus(); return; }
        var i = l.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); l[l.length - 1].focus(); }
        else if (!e.shiftKey && (i < 0 || i === l.length - 1)) { e.preventDefault(); l[0].focus(); }
      }
    }
    document.addEventListener('keydown', surTouche, true);
    AMX.modale.pile.push(modale);
    document.body.appendChild(voile);
    var premier = corps.querySelector('input, select, textarea, button');
    if (premier && !o.sansFocus) { try { premier.focus(); } catch (e) {} }
    else { try { modale.focus({ preventScroll: true }); } catch (e) {} }
    return { fermer: fermer, el: modale, corps: corps, boutons: poserBoutons, modifie: function (v) { if (v !== undefined) modifie = !!v; return modifie; } };
  };
  AMX.modale.n = 0;
  AMX.modale.pile = [];
  AMX.confirmer = function (titre, message, opts) {
    opts = opts || {};
    return new Promise(function (res) {
      var corps = h('div', [typeof message === 'string' ? h('p', { style: { margin: 0, color: 'var(--encre-2)', lineHeight: '1.5' }, text: message }) : message]);
      AMX.modale({
        titre: titre, corps: corps,
        boutons: [
          { texte: opts.annuler || 'Annuler', action: function (f) { res(false); f(); return false; } },
          { texte: opts.ok || 'Confirmer', classe: opts.danger ? 'danger' : 'primaire', action: function (f) { res(true); f(); return false; } }
        ],
        onFermer: function () { res(false); }
      });
    });
  };
  // Demande de retaper une valeur (ex. le VIN) avant une action irréversible.
  AMX.confirmerSaisie = function (titre, message, attendu, opts) {
    opts = opts || {};
    return new Promise(function (res) {
      var champ = h('input.saisie', { type: 'text', placeholder: opts.placeholder || attendu, autocomplete: 'off', spellcheck: 'false' });
      var corps = h('div', [h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)', lineHeight: '1.5' }, text: message }), champ]);
      var m = AMX.modale({
        titre: titre, corps: corps,
        boutons: [
          { texte: 'Annuler', action: function (f) { res(false); f(); return false; } },
          { texte: opts.ok || 'Confirmer', classe: opts.danger ? 'danger' : 'primaire', action: function (f) {
            if (champ.value.trim().toUpperCase() !== String(attendu).trim().toUpperCase()) { champ.style.borderColor = 'var(--rouge)'; champ.focus(); return false; }
            res(true); f(); return false;
          } }
        ],
        onFermer: function () { res(false); }
      });
      champ.addEventListener('keydown', function (e) { if (e.key === 'Enter') m.el.querySelector('.modale-pied .btn.primaire, .modale-pied .btn.danger').click(); });
    });
  };
  AMX.galerie = function (photos, index) {
    var i = index || 0;
    var img = h('img', { alt: '' });
    var legende = h('div.legende');
    var montrer = function () { var p = photos[i]; img.src = p.url || p; legende.textContent = (p.angle ? p.angle + ' · ' : '') + (i + 1) + ' / ' + photos.length; };
    var fermer = function () { g.remove(); document.removeEventListener('keydown', touche); };
    var touche = function (e) { if (e.key === 'Escape') fermer(); if (e.key === 'ArrowRight') { i = (i + 1) % photos.length; montrer(); } if (e.key === 'ArrowLeft') { i = (i - 1 + photos.length) % photos.length; montrer(); } };
    var g = h('div.galerie', [img, legende,
      h('button.fermer', { html: ICONES.fermer, onclick: fermer }),
      photos.length > 1 ? h('button.fleche.g', { text: '‹', onclick: function () { i = (i - 1 + photos.length) % photos.length; montrer(); } }) : null,
      photos.length > 1 ? h('button.fleche.d', { text: '›', onclick: function () { i = (i + 1) % photos.length; montrer(); } }) : null]);
    g.addEventListener('click', function (e) { if (e.target === g) fermer(); });
    document.addEventListener('keydown', touche);
    document.body.appendChild(g);
    montrer();
  };

  /* ------------------------------ Client API --------------------------- */
  var _fetch = window.fetch.bind(window);
  var enCours = 0;
  function majEtat(err) {
    var e = document.getElementById('etat-sync'); if (!e) return;
    var lent = AMX.reseau && AMX.reseau.lent;
    e.className = 'etat-sync' + (err ? ' erreur' : (enCours > 0 ? ' occupe' : '')) + (lent ? ' lent' : '');
    e.title = (err ? 'Dernière requête en erreur' : (enCours > 0 ? 'Synchronisation…' : 'Connecté au serveur')) + (lent ? ' — Google répond lentement : les pages attendent plus longtemps et montrent leur dernière copie' : '');
  }
  function attendre(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Déconnexions intempestives (Maxime, 7 oct. : « les utilisateurs se font déconnecter à tout
  // bout de champ, il faut que ça arrête »). Diagnostic côté serveur : aucun jeton expiré ni
  // révoqué, mais des reconnexions à 1–3 minutes d'intervalle — juste après la connexion, Google
  // ne « voyait » pas encore le jeton (lecture périmée des propriétés) et répondait
  // « Session expirée » ; une seule réponse suffisait pour tout effacer. Désormais : un refus
  // « jeton » rend la session DOUTEUSE, jamais fermée d'emblée. On revérifie 1,5 s puis 3 s plus
  // tard avec un appel de permissions ; seule une double confirmation déconnecte. Un serveur
  // injoignable pendant la vérification ne déconnecte pas non plus. La requête refusée est
  // rejouée une fois si la session tient.
  var SESSION_VERIF_MS = [1500, 3000];
  var verifSession = null;
  function refusJeton(d) { return !!(d && d.refuse && d.code === 'jeton'); }
  function refusTemporaire(d) { return !!(d && d.refuse && d.code === 'temporaire'); }
  AMX.sessionDouteuse = function () {
    if (verifSession) return verifSession;
    if (!lire(CLE.jeton)) { AMX.deconnecter('Reconnectez-vous pour continuer.'); return Promise.resolve(false); }
    var essai = function (ms) {
      return attendre(ms).then(function () {
        return _fetch(URL_BACKEND + '?permissions=1&jeton=' + encodeURIComponent(lire(CLE.jeton)) + '&utilisateur=' + encodeURIComponent(lire(CLE.mail)) + '&_=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (d) { return refusJeton(d) ? 'refus' : 'ok'; }, function () { return 'muet'; });
      });
    };
    verifSession = essai(SESSION_VERIF_MS[0]).then(function (v) { return v === 'refus' ? essai(SESSION_VERIF_MS[1]) : v; }).then(function (v) {
      verifSession = null;
      if (v === 'refus') { AMX.deconnecter('Votre session a expiré. Reconnectez-vous.'); return false; }
      return true;   // 'ok' ou serveur muet : on garde la session
    }, function () { verifSession = null; return true; });
    return verifSession;
  };
  // Un refus « jeton » sur une requête : vérification, puis rejeu (une fois) si la session tient.
  function surRefusJeton(rejouer, dejaRejoue) {
    if (dejaRejoue) { AMX.sessionDouteuse(); throw new Error('Session en cours de vérification. Réessayez dans un instant.'); }
    return AMX.sessionDouteuse().then(function (valide) {
      if (!valide) throw new Error('Session expirée');
      return rejouer();
    });
  }

  // GET avec reprise et requête de secours. Apps Script (/exec) a deux
  // humeurs : un 404 HTML passager, et une requête qui reste « en attente »
  // 20 à 60 s alors que la même, relancée, répond en 3 s (mesuré le 6 oct. :
  // 2 à 4 s côté script, 12 à 30 s vus du navigateur). Donc : chaque tentative
  // a une durée maximale (GET_DELAI_MS), un 404 est repris tout de suite, et si
  // rien n'est arrivé après GET_SECOURS_MS une deuxième tentative part en
  // parallèle — la première réponse valable gagne, l'autre est annulée. Un GET
  // ne modifie rien : le doublon est sans danger.
  var GET_SECOURS_MS = 6000;   // (GET_DELAI_MS = 25 s jusqu'au 16 oct. → AMX.reseau.delais.premier = 30 s)
  // 16 oct. (Maxime, matin où Google retenait tout : « Pas de réponse en 25 s » sur Neufs, Résultat, CSI alors que chaque
  // exécution durait 2-4 s côté Google ; ?resultatRaw=1 revenu en 96 s puis en 2 s) : PATIENCE ADAPTATIVE.
  //   - AMX.reseau suit la lenteur observée (réponses > LENT_SEUIL_MS ou délais dépassés). Tant que Google est lent :
  //     une seule requête patiente (GET_DELAI_LENT_MS), PAS de requête de secours (elle ne gagnait plus rien, elle
  //     doublait la charge), une seule relance (GET_DELAI_RELANCE_MS) ; l'état revient à « rapide » après
  //     LENT_OUBLI_MS sans lenteur ou trois réponses vives d'affilée.
  //   - Au calme : première tentative 30 s, secours à 6 s, une seule relance patiente (au lieu de 4 tentatives de 25 s).
  //   - Les pages lourdes montrent d'abord leur dernière copie (AMX.cacheLocal.lireGz / ecrireGz) et attendent.
  var LENT_SEUIL_MS = 10000, LENT_OUBLI_MS = 180000, VIF_MS = 6000;
  AMX.reseau = { lent: false, depuis: 0, dernierLent: 0, vives: 0, mesures: [],
    delais: Object.assign({ premier: 30000, lent: 90000, relance: 60000, secours: GET_SECOURS_MS }, window.__amxDelais || {}) };   // réglables (tests : window.__amxDelais)
  function noterReponse(ms, echec) {
    var r = AMX.reseau;
    r.mesures.push({ ms: ms, le: Date.now(), echec: !!echec }); if (r.mesures.length > 12) r.mesures.shift();
    if (echec || ms > LENT_SEUIL_MS) {
      r.dernierLent = Date.now(); r.vives = 0;
      if (!r.lent) { r.lent = true; r.depuis = Date.now(); majEtat(false); }
    } else if (ms < VIF_MS) {
      r.vives++;
      if (r.lent && (r.vives >= 3 || Date.now() - r.dernierLent > LENT_OUBLI_MS)) { r.lent = false; r.depuis = 0; majEtat(false); }
    }
  }
  AMX.reseau.estLent = function () { var r = AMX.reseau; if (r.lent && Date.now() - r.dernierLent > LENT_OUBLI_MS) { r.lent = false; r.depuis = 0; } return r.lent; };
  // 13 oct. (vitesse) : `opts.gz` demande la réponse compressée (?gz=1 → { ok, gz } = JSON gzip + base64, CacheGz.gs :
  // 1,4 Mo → 125 Ko pour les neufs) quand le navigateur sait la décompresser ; un script pas encore redéployé répond en
  // clair et tout continue.
  var GZ_POSSIBLE = (typeof DecompressionStream === 'function') && (typeof Response === 'function') && (typeof Blob === 'function');
  function degonfler(b64) {
    var bin = atob(b64), octets = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    return new Response(new Blob([octets]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  AMX.get = function (params, opts) {
    opts = opts || {};
    if (opts.gz && GZ_POSSIBLE && params && typeof params === 'object' && !params.gz) params = Object.assign({}, params, { gz: 1 });
    var q = typeof params === 'string' ? params : Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    var base = URL_BACKEND + '?' + q + '&utilisateur=' + encodeURIComponent(AMX.session.courriel) + '&jeton=' + encodeURIComponent(lire(CLE.jeton));
    enCours++; majEtat(false);
    var lent = AMX.reseau.estLent(), courrielReq = AMX.session.courriel;
    // Nombre de requêtes HTTP au plus : au calme 3 (première, secours, une relance) ; Google lent : 2 (patiente + une relance).
    var essais = opts.essais === undefined ? (lent ? 2 : 3) : opts.essais;
    var D = AMX.reseau.delais;
    var delaiPremier = opts.delai || (lent ? D.lent : D.premier);
    var delaiRelance = opts.delaiRelance || (opts.delai ? opts.delai : D.relance);
    var aborts = [], attenteTotale = 0, debutTout = Date.now();
    var unAppel = function (delai) {
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      if (ctrl) aborts.push(ctrl);
      var t0 = Date.now();
      var minuterie = ctrl ? setTimeout(function () { ctrl.abort(); }, delai) : null;
      var fin = function () { if (minuterie) clearTimeout(minuterie); };
      return _fetch(base + '&_=' + Date.now() + Math.floor(Math.random() * 1000), { method: 'GET', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }).then(function (t) {
        fin(); noterReponse(Date.now() - t0, false);
        var d; try { d = JSON.parse(t); } catch (e) { throw new Error('Réponse illisible du serveur'); }
        if (refusTemporaire(d)) throw new Error(d.erreur || 'Le serveur n\'a pas pu vérifier la session.');   // panne passagère côté Google : on réessaie, on ne déconnecte pas
        if (d && d.ok === true && typeof d.gz === 'string' && GZ_POSSIBLE) return degonfler(d.gz).then(function (t2) { try { return JSON.parse(t2); } catch (e2) { throw new Error('Réponse compressée illisible'); } });
        return d;
      }, function (err) {
        fin();
        if (err && err.name === 'AbortError') { attenteTotale += delai; noterReponse(delai, true); throw new Error('Pas de réponse en ' + Math.round(Math.max(attenteTotale, Date.now() - debutTout) / 1000) + ' s'); }
        throw err;
      });
    };
    var course = new Promise(function (resolve, reject) {
      var restants = essais, enVol = 0, fini = false, derniere = null, secours = null, premiere = true;
      var lancer = function () {
        if (fini || restants <= 0) return;
        restants--; enVol++;
        var delai = premiere ? delaiPremier : delaiRelance; premiere = false;
        unAppel(delai).then(function (d) {
          if (fini) return;
          fini = true; if (secours) clearTimeout(secours);
          aborts.forEach(function (c) { try { c.abort(); } catch (e) {} });
          resolve(d);
        }, function (err) {
          enVol--;
          if (fini) return;
          derniere = err;
          if (restants > 0) setTimeout(lancer, /HTTP 404/.test(String(err && err.message)) ? 250 : 700);
          else if (enVol === 0) { fini = true; reject(derniere); }
        });
      };
      lancer();
      // Requête de secours (course) seulement quand Google est vif : quand il est lent, elle ne gagnait plus rien
      // (mesuré le 16 oct. : les deux restaient 90 s) et doublait la charge.
      if (!lent && opts.secours !== false) secours = setTimeout(function () { if (!fini && !AMX.reseau.estLent()) lancer(); }, opts.secours || D.secours);
    });
    return course.then(function (d) {
      enCours--; majEtat(false);
      if (refusJeton(d)) return surRefusJeton(function () { return AMX.get(params, Object.assign({}, opts, { rejoue: true })); }, opts.rejoue);
      if (opts.copie && d && !d.refuse && d.ok !== false && courrielReq && AMX.session.courriel === courrielReq && lire(CLE.jeton)) AMX.cacheLocal.ecrireGz(opts.copie, d);   // dernière bonne réponse, pour s'afficher d'un coup la prochaine fois — jamais après une déconnexion
      return d;
    }, function (err) { enCours--; majEtat(true); throw err; });
  };
  // POST : jamais rejoué par défaut (une écriture dédoublée coûte plus cher
  // qu'un échec). `opts.rejouer` : pour une action idempotente (modifier ou
  // supprimer un compte), un 404 HTML passager de Google ou un délai dépassé
  // est renvoyé une fois (6 oct. : « on ne peut pas supprimer un utilisateur »
  // — le serveur avait supprimé, mais la réponse n'était jamais arrivée).
  // 7 oct. (vitesse) : pour une écriture IDEMPOTENTE (statut, étape du service, # stock, coût,
  // registre reçu…), `opts.secours` lance une deuxième requête identique si rien n'est revenu après
  // POST_SECOURS_MS — Google laisse parfois un appel « en attente » 20 à 60 s alors que le même,
  // relancé, répond en 3 s. La première réponse valable gagne, l'autre est annulée. Jamais pour
  // une action qui crée quelque chose (ajout, envoi de courriel, import).
  var POST_SECOURS_MS = 7000;
  AMX.post = function (corps, opts) {
    opts = opts || {};
    var envoyer = function (ctrlExterne) {
      var b = Object.assign({}, corps, { utilisateur: AMX.session.courriel, jeton: lire(CLE.jeton) });
      enCours++; majEtat(false);
      var ctrl = ctrlExterne || ((typeof AbortController !== 'undefined') ? new AbortController() : null);
      var minuterie = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.delai || 60000) : null;
      return _fetch(URL_BACKEND, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(b), signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { return r.text(); })
        .then(function (t) {
          if (minuterie) clearTimeout(minuterie);
          enCours--; majEtat(false);
          var d; try { d = JSON.parse(t); } catch (e) { throw new Error('Réponse illisible du serveur (' + t.slice(0, 60).replace(/<[^>]+>/g, '') + '…)'); }
          if (refusTemporaire(d)) throw new Error(d.erreur || 'Le serveur n\'a pas pu vérifier la session. Réessayez.');
          // Refus « jeton » : le serveur n'a rien fait, rejouer l'écriture est sans danger.
          if (refusJeton(d)) return surRefusJeton(function () { return AMX.post(corps, Object.assign({}, opts, { rejoue: true })); }, opts.rejoue);
          return d;
        }, function (err) { if (minuterie) clearTimeout(minuterie); enCours--; majEtat(true); throw (err && err.name === 'AbortError') ? new Error('Le serveur met trop de temps à répondre.') : err; });
    };
    var course = function () {
      if (!opts.secours || typeof AbortController === 'undefined') return envoyer();
      return new Promise(function (res, rej) {
        var ctrls = [], fini = false, erreurs = 0, total = 1, minuterie = null;
        var lancer = function () {
          var ctrl = new AbortController(); ctrls.push(ctrl);
          envoyer(ctrl).then(function (d) {
            if (fini) return; fini = true; if (minuterie) clearTimeout(minuterie);
            ctrls.forEach(function (c) { if (c !== ctrl) { try { c.abort(); } catch (e) {} } });
            res(d);
          }, function (e) { if (fini) return; erreurs++; if (erreurs >= total) { fini = true; if (minuterie) clearTimeout(minuterie); rej(e); } });
        };
        lancer();
        minuterie = setTimeout(function () { if (!fini) { total = 2; lancer(); } }, opts.secours === true ? POST_SECOURS_MS : opts.secours);
      });
    };
    if (!opts.rejouer) return course();
    return course().catch(function (e) {
      var msg = AMX.erreurTexte(e);
      if (!/illisible|trop de temps|pas pu vérifier|Failed to fetch|NetworkError|Load failed|network/i.test(msg)) throw e;
      return new Promise(function (res) { setTimeout(res, 500); }).then(course);
    });
  };
  // Lève une erreur lisible si le serveur dit non.
  AMX.verifier = function (d, defaut) {
    if (!d) throw new Error(defaut || 'Aucune réponse');
    if (d.refuse) throw new Error(d.erreur || d.message || 'Action refusée pour ce compte.');
    if (d.ok === false) throw new Error(d.erreur || d.message || defaut || 'Le serveur a refusé.');
    return d;
  };
  AMX.erreurTexte = function (e) { return (e && e.message) ? e.message : String(e || 'Erreur'); };

  /* ------------------------------ Session ------------------------------ */
  AMX.perm = function (cle) {
    var p = AMX.session.perms;
    if (!p) return AMX.session.role === 'admin';
    if (p[cle] !== undefined) return !!p[cle];
    return AMX.session.role === 'admin';
  };
  AMX.estAdmin = function () { return AMX.session.role === 'admin' || AMX.session.role === 'proprietaire' || AMX.perm('gererUtilisateurs'); };
  AMX.estProprietaire = function () { return AMX.session.role === 'proprietaire' || AMX.perm('gererAdmins'); };

  function chargerProfil(deuxieme) {
    return _fetch(URL_BACKEND + '?permissions=1&jeton=' + encodeURIComponent(lire(CLE.jeton)) + '&utilisateur=' + encodeURIComponent(lire(CLE.mail)) + '&_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (refusTemporaire(d) && !deuxieme) return attendre(1200).then(function () { return chargerProfil(true); });
        if (refusJeton(d)) {
          // Jamais de déconnexion sur une seule réponse : on revérifie, puis on recharge le profil si la session tient.
          if (deuxieme) return null;
          return AMX.sessionDouteuse().then(function (valide) { return valide ? chargerProfil(true) : null; });
        }
        var p = d && d.permissions;
        if (p) {
          ecrire(CLE.nom, p.nom || ''); ecrire(CLE.role, p.role || ''); ecrire(CLE.perms, JSON.stringify(p));
          AMX.session.nom = p.nom || ''; AMX.session.role = p.role || ''; AMX.session.perms = p;
          // Textos (6 oct.) : le numéro de la personne et l'état du service, pour le menu du compte.
          if (d.telephone !== undefined) { AMX.session.telephone = String(d.telephone || ''); ecrire(CLE.tel, AMX.session.telephone); }
          if (d.textos) { AMX.session.textos = d.textos; ecrire(CLE.textos, JSON.stringify(d.textos)); }
          AMX.appliquerPortee();
          document.dispatchEvent(new CustomEvent('amx:profil'));
        }
        return p;
      }).catch(function () { return null; });
  }

  AMX.deconnecter = function (message) {
    [CLE.mail, CLE.nom, CLE.role, CLE.jeton, CLE.perms, CLE.expire, CLE.tel, CLE.textos, 'pg_unlocked_v1', 'pg_unlocked_scan_v1'].forEach(effacer);
    try { if (AMX.inventaire) AMX.inventaire.vider(); if (AMX.service && AMX.service.vider) AMX.service.vider(); AMX.cacheLocal.oublier('eblock'); } catch (e) {}
    try { if (AMX.recherche && AMX.recherche.vider) AMX.recherche.vider(); if (AMX.maxai && AMX.maxai.vider) AMX.maxai.vider(); } catch (e2) {}   // 22 oct. : recherche et discussion Einstein AI
    try { Object.keys(localStorage).filter(function (k) { return /^amx_cache_/.test(k); }).forEach(effacer); } catch (e3) {}   // 16 oct. : toutes les copies locales, jamais celles d'une autre personne
    AMX.session = { courriel: '', nom: '', role: '', perms: null, telephone: '', textos: null };
    document.getElementById('appli').classList.remove('pret');
    porte(message || '');
  };

  // Porte (8 oct.) : « on pourrait donner le choix » — le code arrive par courriel ou par texto, au
  // choix de la personne. Le serveur (Auth.gs, `canal`) prend le numéro dans SON compte, jamais ici ;
  // sans numéro inscrit, il envoie par courriel et l'explique (`message`). Le dernier canal utilisé
  // sur cet appareil (CLE.canal) est proposé en premier la fois suivante.
  function porte(message) {
    var p = document.getElementById('porte');
    p.style.display = 'flex';
    var etape = 'courriel', courrielEnCours = lire(CLE.mail);
    var canal = lire(CLE.canal) === 'texto' ? 'texto' : 'courriel';   // dernier canal utilisé ici
    var envoi = null;   // dernière réponse de demanderCode : { canal, destination, message, textoPossible }
    var dessiner = function (msg) {
      var enCourriel = etape === 'courriel';
      var parTexto = !!(envoi && envoi.canal === 'texto');
      AMX.vider(p);
      var champ = enCourriel
        ? h('input', { type: 'email', id: 'porte-mail', autocomplete: 'username', placeholder: 'prenom@groupeautomax.com', value: courrielEnCours })
        : h('input.code', { type: 'text', id: 'porte-code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '000000' });
      var erreur = h('div.erreur', { text: msg || '' });
      var boutons, bouton = null;
      if (enCourriel) {
        var bCourriel = h('button.btn.large.bloc', { type: 'button', id: 'porte-courriel', text: 'Recevoir mon code par courriel', onclick: function () { demander('courriel', this); } });
        var bTexto = h('button.btn.large.bloc', { type: 'button', id: 'porte-texto', text: 'Recevoir mon code par texto', onclick: function () { demander('texto', this); } });
        (canal === 'texto' ? bTexto : bCourriel).classList.add('primaire');
        boutons = h('div.porte-canaux', canal === 'texto' ? [bTexto, bCourriel] : [bCourriel, bTexto]);
      } else {
        bouton = h('button.btn.primaire.large.bloc', { type: 'button', id: 'porte-valider', text: 'Se connecter' });
        boutons = bouton;
      }
      var liens = null;
      if (!enCourriel) {
        var autre = parTexto ? 'courriel' : 'texto';
        liens = h('div.porte-liens', [
          // « Plutôt par texto » seulement si le compte a un numéro et que les textos sont actifs ; sinon le
          // serveur l'a déjà expliqué dans `message`, inutile de proposer un bouton qui finirait en courriel.
          (autre === 'texto' && envoi && envoi.textoPossible === false) ? null
            : h('button.lien', { type: 'button', id: 'porte-autre-canal', text: 'Recevoir plutôt par ' + autre, onclick: function () { demander(autre, this); } }),
          h('button.lien', { type: 'button', id: 'porte-changer', text: 'Changer d\'adresse', onclick: function () { etape = 'courriel'; envoi = null; dessiner(''); } })
        ]);
      }
      var carte = h('div.porte-carte', [
        h('div.porte-logo', [h('img', { src: 'assets/logo.png', alt: 'Groupe Automax' })]),
        h('h1', { text: enCourriel ? 'Inventaire et ventes' : 'Code de vérification' }),
        h('p', enCourriel
          ? 'Entrez votre adresse courriel, puis choisissez où recevoir votre code à six chiffres.'
          : ['Un code vient d\'être envoyé par ', h('strong', { text: parTexto ? 'texto' : 'courriel' }), parTexto ? ' au ' : ' à ', h('strong', { text: (envoi && envoi.destination) || courrielEnCours }), '.']),
        (!enCourriel && envoi && envoi.message) ? h('p.porte-avis', { text: envoi.message }) : null,
        champ, boutons, erreur, liens,
        h('p.porte-note', enCourriel
          ? 'Par texto, le code va au cellulaire inscrit à votre compte (« Mon compte »). Une connexion vaut 30 jours sur cet appareil, comme dans l\'app ScanAutomax. Sur iPhone, ajoutez le site à l\'écran d\'accueil (Partager → « Sur l\'écran d\'accueil ») pour que Safari garde la session.'
          : 'Le code est valide 10 minutes.')
      ]);
      p.appendChild(carte);

      // Demande (ou redemande) un code par `choix` ; `declencheur` = le bouton cliqué, mis en attente.
      var demander = function (choix, declencheur) {
        var mail = enCourriel ? champ.value.trim().toLowerCase() : courrielEnCours;
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { erreur.textContent = 'Entrez une adresse courriel valide.'; return; }
        erreur.textContent = '';
        var tous = Array.prototype.slice.call(carte.querySelectorAll('button'));
        var texteAvant = declencheur ? declencheur.textContent : '';
        tous.forEach(function (b) { b.disabled = true; });
        if (declencheur) declencheur.textContent = 'Envoi du code…';
        var retablir = function () { tous.forEach(function (b) { b.disabled = false; }); if (declencheur) declencheur.textContent = texteAvant; };
        _fetch(URL_BACKEND + '?demanderCode=' + encodeURIComponent(mail) + '&canal=' + encodeURIComponent(choix) + '&_=' + Date.now()).then(function (r) { return r.json(); }).then(function (d) {
          retablir();
          if (!d || !d.ok) { erreur.textContent = (d && d.erreur) || 'Envoi impossible. Réessayez.'; return; }
          courrielEnCours = mail;
          envoi = { canal: d.canal === 'texto' ? 'texto' : 'courriel', destination: d.destination || '', message: d.message || '', textoPossible: d.textoPossible !== false };
          canal = envoi.canal; ecrire(CLE.canal, canal);   // on retient le canal vraiment utilisé, pas celui demandé
          etape = 'code'; dessiner('');
        }).catch(function () { retablir(); erreur.textContent = 'Serveur injoignable. Vérifiez votre connexion.'; });
      };

      var valider = function () {
        erreur.textContent = '';
        var code = champ.value.replace(/\D/g, '');
        if (code.length !== 6) { erreur.textContent = 'Le code a six chiffres.'; return; }
        bouton.disabled = true; bouton.textContent = 'Vérification…';
        _fetch(URL_BACKEND + '?courriel=' + encodeURIComponent(courrielEnCours) + '&verifierCode=' + encodeURIComponent(code) + '&_=' + Date.now()).then(function (r) { return r.json(); }).then(function (d) {
          if (!d || !d.ok || !d.jeton) { bouton.disabled = false; bouton.textContent = 'Se connecter'; erreur.textContent = (d && d.erreur) || 'Code refusé.'; return; }
          ecrire(CLE.jeton, d.jeton); ecrire(CLE.mail, courrielEnCours);
          ecrire(CLE.expire, d.expire ? String(d.expire) : String(Date.now() + 30 * 86400000));
          // 7 oct. : si le navigateur n'a pas gardé le jeton (mémoire pleine, navigation privée),
          // on libère les caches et on réessaie ; sinon on le dit clairement plutôt que de
          // laisser la personne se reconnecter en boucle.
          if (lire(CLE.jeton) !== d.jeton) {
            try { Object.keys(localStorage).filter(function (k) { return /^amx_cache_|^__amx|^amx_carfax_attente$/.test(k); }).forEach(effacer); } catch (e4) {}
            ecrire(CLE.jeton, d.jeton); ecrire(CLE.mail, courrielEnCours);
            ecrire(CLE.expire, d.expire ? String(d.expire) : String(Date.now() + 30 * 86400000));
            if (lire(CLE.jeton) !== d.jeton) { bouton.disabled = false; bouton.textContent = 'Se connecter'; erreur.textContent = 'Ce navigateur refuse de garder la session (navigation privée ? stockage bloqué ?). Ouvrez le site dans Safari ou Chrome en mode normal.'; return; }
          }
          AMX.session.courriel = courrielEnCours;
          try { AMX.inventaire.vider(); if (AMX.service && AMX.service.vider) AMX.service.vider(); AMX.cacheLocal.oublier('eblock'); } catch (e2) {}   // jamais les listes d'une autre personne
          return chargerProfil().then(function () { ouvrir(); AMX.toast('Connecté pour ' + (d.dureeJours || 30) + ' jours sur cet appareil.', 'ok', 5000); try { AMX.inventaire.precharger(); if (AMX.service && AMX.service.precharger) AMX.service.precharger(); } catch (e3) {} });
        }).catch(function () { bouton.disabled = false; bouton.textContent = 'Se connecter'; erreur.textContent = 'Serveur injoignable. Réessayez.'; });
      };

      // Entrée dans le champ : le canal proposé en premier (étape courriel) ou la vérification (étape code).
      champ.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        if (enCourriel) demander(canal, carte.querySelector('.porte-canaux .primaire')); else valider();
      });
      if (bouton) bouton.addEventListener('click', valider);
      setTimeout(function () { champ.focus(); }, 40);
    };
    dessiner(message);
  }

  function ouvrir() {
    document.getElementById('porte').style.display = 'none';
    document.getElementById('appli').classList.add('pret');
    appliquerTuiles();   /* 21 oct. : les modules sont tous enregistrés (scripts chargés) — on regroupe en tuiles */
    dessinerBarre();
    document.dispatchEvent(new CustomEvent('automax:connecte'));
    router();
  }

  /* ---------------------------- Sections -------------------------------- */
  // AMX.section('inventaire', { titre, icone, ordre, visible(), onglets: [{id, titre, compteur()}], monter(conteneur, ctx) })
  AMX.section = function (id, def) { def.id = id; AMX.sections[id] = def; };
  AMX.listeSections = function () {
    return Object.keys(AMX.sections).map(function (k) { return AMX.sections[k]; })
      .filter(function (s) { return !s.absorbee && (!s.visible || s.visible()); })
      .sort(function (a, b) { return (a.ordre || 50) - (b.ordre || 50); });
  };

  /* ------------------------- Tuiles (21 octobre 2026) -------------------------
     Maxime : « conserver Accueil et débuter avec cela, après 6 grosses tuiles : Vente, Inventaire, Relance, Service
     après-vente, Outils et Aide ; regrouper les sous-menus dans les tuiles appropriées ». Les modules continuent de
     s'enregistrer avec AMX.section(...) : ce sont les « sources » (gardées dans AMX.sources, et dans AMX.sections pour
     leurs visible() et liens). TUILES dit sous quelle tuile et quel onglet chaque source apparaît. Un onglet de tuile peut
     offrir des « vues » (pastilles à droite de la sous-barre, ex. Résultats › É.-U. · Wholesale Canada · Neufs) : ce sont
     les anciens onglets de la source. AMX.lien / AMX.aller / le routeur traduisent les anciennes adresses
     (#/offres/recues → #/vente/offres, #/outils/evaluation → #/inventaire/evaluations?vue=evaluation…), donc les liens
     écrits dans les modules n'ont pas changé. `fixes` = paramètres ajoutés à l'adresse de la source (mode d'une page). */
  var TUILES = [
    { id: 'vente', titre: 'Vente', icone: 'vente', ordre: 10, onglets: [
      { id: 'ventes', titre: 'Livre des ventes', de: 'ventes', vues: [{ id: 'liste', titre: 'Liste' }, { id: 'recap', titre: 'Récapitulatif' }] },   /* 21 oct. : la vente s'inscrit ici, ScanAutomax remplit le Livre des ventes ; Liste par mois · Récapitulatif (ventes.js) */
      { id: 'offres', titre: 'Offres reçues', de: 'offres', onglet: 'recues' },
      { id: 'envente', titre: 'En vente', de: 'offres', onglet: 'vente' },
      { id: 'acheteurs', titre: 'Acheteurs', de: 'offres', onglet: 'acheteurs' },
      { id: 'soumissions', titre: 'Soumissions', de: 'inventaire', onglet: 'soumissions' },
      { id: 'echanges', titre: 'Échanges de neufs', de: 'inventaire', onglet: 'neufs', fixes: { seul: 'echanges' }, compteur: function () { return AMX.neufs && AMX.neufs.compteurEchanges ? AMX.neufs.compteurEchanges() : ''; } },
      { id: 'resultats', titre: 'Résultats', de: 'resultat', vues: [{ id: 'us', titre: 'É.-U.' }, { id: 'can', titre: 'Wholesale Canada' }, { id: 'neuf', titre: 'Neufs' }] },
      { id: 'kpi', titre: 'KPI', de: 'kpi', vues: [{ id: 'sommaire', titre: 'Sommaire' }, { id: 'indicateurs', titre: 'Indicateurs' }, { id: 'departements', titre: 'Départements' }] }   /* 22 oct. : le tableau de bord KPI du Groupe (Réalisés et états financiers lus dans les Drive partagés, kpi.js) */
    ] },
    { id: 'inventaire', titre: 'Inventaire', icone: 'inventaire', ordre: 20, onglets: [
      { id: 'neufs', titre: 'Neufs', de: 'inventaire', onglet: 'neufs' },
      { id: 'usage', titre: 'Usagé', de: 'inventaire', onglet: 'usage' },
      { id: 'analyse', titre: 'Analyse usagé', de: 'analyse', onglet: '' },   /* 24 oct. : façon vAuto — % du marché, rang, jours, MDS, profil de prix par âge (analyse-usage.js) */
      { id: 'achat', titre: 'Fiche d\'achat', de: 'achat', onglet: '' },
      { id: 'evaluations', titre: 'Évaluations', de: 'outils', vues: [{ id: 'evaluation', titre: 'Nouvelle' }, { id: 'evaluations', titre: 'Registre' }, { id: 'torque', titre: 'Archive Torque' }] },
      { id: 'listes', titre: 'Listes et audits', de: 'listes', onglet: '' },   /* 22 oct. : dépôt d'une liste (PDF, Excel, CSV) → où est chaque véhicule ; audit dans l'app (listes.js) */
      { id: 'transports', titre: 'Transports', de: 'transports', onglet: '', compteur: function () { return AMX.transport ? AMX.transport.compteur() : ''; } }   /* 23 oct. : transport des achats par Central Fleet (transport.js) */
    ] },
    { id: 'relance', titre: 'Relance', icone: 'relance', ordre: 30, onglets: [
      { id: 'equite', titre: 'Équité', visible: function () { return !!(AMX.relance && AMX.equite); }, monter: function (c, ctx) { return AMX.relance.equite(c, ctx); }, vues: [{ id: 'clients', titre: 'Clients' }, { id: 'import', titre: 'Importer le portefeuille', de: 'outils', onglet: 'equite' }] },
      { id: 'leads', titre: 'Leads', de: 'offres', onglet: 'leads' },
      { id: 'avis', titre: 'Avis Google', de: 'avis', vues: [{ id: 'apercu', titre: 'Aperçu' }, { id: 'avis', titre: 'Avis' }, { id: 'sondages', titre: 'Sondages' }] },
      { id: 'csi', titre: 'CSI', de: 'csi', onglet: '' }
    ] },
    { id: 'service', titre: 'Service après-vente', court: 'Service', icone: 'service', ordre: 40, onglets: [
      { id: 'suivi', titre: 'Suivi service', de: 'service', vues: [{ id: 'encours', titre: 'En cours' }, { id: 'autoriser', titre: 'Direction' }, { id: 'termines', titre: 'Terminés' }] },
      { id: 'rendezvous', titre: 'Rendez-vous', de: 'service', onglet: 'rendezvous' },
      { id: 'texto', titre: 'Texto', de: 'service', onglet: 'texto' }
    ] },
    { id: 'outils', titre: 'Outils', icone: 'outils', ordre: 50, onglets: [
      { id: 'opportunites', titre: 'Opportunités d\'achat', de: 'outils', onglet: 'opportunites' },   /* 24 oct. : Occasions.gs */
      { id: 'eblock', titre: 'Fiches eBlock', de: 'outils', onglet: 'eblock' },
      { id: 'openlane', titre: 'Valeurs OpenLane', de: 'outils', onglet: 'openlane' },
      { id: 'carfax', titre: 'Import CARFAX', de: 'outils', onglet: 'carfax' },
      { id: 'd2c', titre: 'Import D2C', de: 'outils', onglet: 'd2c' },
      { id: 'verification', titre: 'Vérification Excel', de: 'outils', onglet: 'verification' },
      { id: 'admin', titre: 'Comptes et droits', de: 'admin', onglet: '' }
    ] },
    { id: 'aide', titre: 'Aide', icone: 'aide', ordre: 60, onglets: [{ de: 'aide', tous: true }] }
  ];
  var TRAD = {};            // 'source/onglet' → { section, onglet, vue }
  AMX.sources = {};         // sections sources absorbées par les tuiles (id → définition d'origine)
  AMX.TUILES = TUILES;

  function ongletSource(src, id) { return ((src && src.onglets) || []).filter(function (o) { return o.id === id; })[0] || null; }
  function ongletVisible(src, id) { if (!src || (src.visible && !src.visible())) return false; var o = id ? ongletSource(src, id) : null; return o ? (!o.visible || o.visible()) : true; }
  function compteurSource(src, id) { var o = ongletSource(src, id); if (!o || !o.compteur) return ''; try { return o.compteur(); } catch (e) { return ''; } }
  /* La source et l'onglet de source derrière une vue (la vue peut avoir sa propre source, ex. Équité › Importer). */
  function sourceDeVue(o, v) { return { de: (v && v.de) || o.de, onglet: v ? (v.de ? v.onglet : v.id) : (o.onglet || '') }; }
  function vuesVisibles(o) {
    return (o.vues || []).filter(function (v) {
      if (v.visible && !v.visible()) return false;
      var s = sourceDeVue(o, v); if (!s.de) return true;
      return ongletVisible(AMX.sources[s.de] || AMX.sections[s.de], s.onglet);
    });
  }
  /* Vue courante d'un onglet à vues : l'adresse (?vue=), sinon la dernière choisie sur cet appareil, sinon la première. */
  function vueCourante(tuile, o, params) {
    var vis = vuesVisibles(o); if (!vis.length) return '';
    var demandee = String((params && params.vue) || '');
    if (vis.some(function (v) { return v.id === demandee; })) return demandee;
    var memo = String(AMX.memo.lire('vue_' + tuile.id + '_' + o.id, '') || '');
    if (vis.some(function (v) { return v.id === memo; })) return memo;
    return vis[0].id;
  }
  function definirTuile(t) {
    var onglets = [];
    t.onglets.forEach(function (o) {
      if (o.tous) {   /* tous les onglets de la source, tels quels (Aide) */
        var src = AMX.sources[o.de] || AMX.sections[o.de];
        ((src && src.onglets) || []).forEach(function (so) { onglets.push({ id: so.id, titre: so.titre, de: o.de, onglet: so.id }); });
      } else onglets.push(o);
    });
    var def = { id: t.id, titre: t.titre, court: t.court, icone: t.icone, ordre: t.ordre, tuile: true };
    def.onglets = onglets.map(function (o) {
      var src = function () { return o.de ? (AMX.sources[o.de] || AMX.sections[o.de]) : null; };
      return {
        id: o.id, titre: o.titre, de: o.de, onglet: o.onglet, fixes: o.fixes, vues: o.vues, monter: o.monter,
        visible: function () {
          if (o.visible && !o.visible()) return false;
          if (o.vues) return vuesVisibles(o).length > 0;
          return o.de ? ongletVisible(src(), o.onglet) : true;
        },
        compteur: function () {
          if (o.compteur) { try { return o.compteur(); } catch (e) { return ''; } }
          if (o.vues) { var n = ''; o.vues.some(function (v) { var s = sourceDeVue(o, v); var c = s.de ? compteurSource(AMX.sources[s.de] || AMX.sections[s.de], s.onglet) : ''; if (c !== '' && c !== null && c !== undefined) { n = c; return true; } return false; }); return n; }
          return o.de ? compteurSource(src(), o.onglet) : '';
        }
      };
    });
    def.visible = function () { return def.onglets.some(function (o) { return o.visible(); }); };
    def.monter = function (conteneur, ctx) { return new Tuile(def, conteneur, ctx); };
    return def;
  }
  /* L'instance d'une tuile : monte la page de la source derrière l'onglet (et la vue) demandés, change de page quand
     l'onglet mène à une autre source, sinon délègue naviguer() à la page en place. */
  function Tuile(def, conteneur, ctx) { this.def = def; this.conteneur = conteneur; this.enfant = null; this.cle = ''; this.monterEnfant(ctx); }
  Tuile.prototype.resoudre = function (ctx) {
    var o = this.def.onglets.filter(function (x) { return x.id === ctx.onglet; })[0] || this.def.onglets[0];
    var params = {}; Object.keys(ctx.params || {}).forEach(function (k) { if (k !== 'vue') params[k] = ctx.params[k]; });
    var vue = o.vues ? vueCourante(this.def, o, ctx.params) : '';
    if (vue) AMX.memo.ecrire('vue_' + this.def.id + '_' + o.id, vue);
    var v = o.vues ? o.vues.filter(function (x) { return x.id === vue; })[0] : null;
    var s = sourceDeVue(o, v);
    if (o.fixes) Object.keys(o.fixes).forEach(function (k) { params[k] = o.fixes[k]; });
    var propre = v ? !v.de && !!o.monter : !!o.monter;   /* page propre à la tuile (ex. Relance › Équité › Clients) */
    return { onglet: o, vue: vue, source: propre ? null : (AMX.sources[s.de] || AMX.sections[s.de]), ongletSource: propre ? vue : s.onglet, params: params, cle: propre ? 'propre:' + o.id : 'source:' + s.de, monter: propre ? o.monter : null };
  };
  Tuile.prototype.monterEnfant = function (ctx) {
    var r = this.resoudre(ctx);
    if (this.enfant && this.enfant.demonter) { try { this.enfant.demonter(); } catch (e) {} }
    AMX.vider(this.conteneur);
    this.cle = r.cle;
    var sous = { onglet: r.ongletSource, params: r.params };
    this.enfant = (r.monter ? r.monter(this.conteneur, sous) : (r.source ? r.source.monter(this.conteneur, sous) : null)) || {};
  };
  Tuile.prototype.naviguer = function (ctx) {
    var r = this.resoudre(ctx);
    if (r.cle !== this.cle || !this.enfant || !this.enfant.naviguer) { this.monterEnfant(ctx); return; }
    this.enfant.naviguer({ onglet: r.ongletSource, params: r.params });
  };
  Tuile.prototype.demonter = function () { if (this.enfant && this.enfant.demonter) { try { this.enfant.demonter(); } catch (e) {} } this.enfant = null; };

  function appliquerTuiles() {
    if (appliquerTuiles.fait) return; appliquerTuiles.fait = true;
    // 1. Les sources absorbées quittent la barre (gardées dans AMX.sources et AMX.sections pour leurs visible() et liens).
    TUILES.forEach(function (t) { t.onglets.forEach(function (o) {
      var ids = [o.de].concat((o.vues || []).map(function (v) { return v.de; })).filter(Boolean);
      ids.forEach(function (id) { if (AMX.sections[id] && !AMX.sources[id]) { AMX.sources[id] = AMX.sections[id]; AMX.sections[id].absorbee = true; } });
    }); });
    // 2. Les tuiles prennent place (une tuile peut porter l'id d'une source : Inventaire, Service, Outils, Aide).
    TUILES.forEach(function (t) { AMX.sections[t.id] = definirTuile(t); });
    // 3. Table de traduction des anciennes adresses. Un onglet « fixes » (page en mode spécial) ne traduit rien.
    TUILES.forEach(function (t) { AMX.sections[t.id].onglets.forEach(function (o) {
      if (o.fixes) return;
      if (o.vues) { o.vues.forEach(function (v) { var s = sourceDeVue(o, v); if (!s.de) return; var cle = s.de + '/' + s.onglet; if (!TRAD[cle]) TRAD[cle] = { section: t.id, onglet: o.id, vue: v.id }; }); return; }
      if (!o.de) return;
      var cle = o.de + '/' + (o.onglet || ''); if (!TRAD[cle]) TRAD[cle] = { section: t.id, onglet: o.id };
      if (!o.onglet && !TRAD[o.de + '/*']) TRAD[o.de + '/*'] = { section: t.id, onglet: o.id };
    }); });
  }
  /* L'adresse d'une ancienne section / d'un ancien onglet dans les tuiles ; null si rien à changer. */
  AMX.traduire = function (section, onglet, params) {
    if (!appliquerTuiles.fait) return null;
    var t = TRAD[section + '/' + (onglet || '')] || TRAD[section + '/*'];
    if (!t && AMX.sources[section] && !(AMX.sections[section] && AMX.sections[section].tuile)) {   /* onglet inconnu d'une source absorbée : son premier onglet */
      var pre = section + '/'; Object.keys(TRAD).some(function (k) { if (k.indexOf(pre) === 0) { t = TRAD[k]; return true; } return false; });
    }
    if (!t) return null;
    var p = {}; Object.keys(params || {}).forEach(function (k) { p[k] = params[k]; });
    if (t.vue) p.vue = t.vue;
    if (t.section === section && t.onglet === (onglet || '') && !t.vue) return null;
    return { section: t.section, onglet: t.onglet, params: p };
  };

  var courante = { section: null, onglet: null, params: null, instance: null };
  AMX.courante = courante;

  /* v130 (rapport « Refonte ergonomique », gain rapide 5) : une tuile cliquée dans la barre rouvre le dernier onglet
     visité sur cet appareil ; la première fois, l'onglet le plus utilisé (Inventaire → Usagé, Relance → Avis Google). */
  var ONGLET_DEFAUT = { inventaire: 'usage', relance: 'avis' };
  function ongletDeDepart(sec, onglets) {
    var veut = function (id) { return id ? onglets.filter(function (o) { return o.id === id; })[0] : null; };
    if (!sec.tuile) return onglets[0];
    return veut(String(AMX.memo.lire('onglet_' + sec.id, '') || '')) || veut(ONGLET_DEFAUT[sec.id]) || onglets[0];
  }

  function lireHash() {
    var hsh = location.hash.replace(/^#\/?/, '');
    var q = {}; var i = hsh.indexOf('?');
    if (i >= 0) { hsh.slice(i + 1).split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')); }); hsh = hsh.slice(0, i); }
    var parts = hsh.split('/').filter(Boolean);
    return { section: parts[0] || '', onglet: parts[1] || '', params: q };
  }
  AMX.aller = function (section, onglet, params) {
    var t = AMX.traduire(section, onglet, params);   /* 21 oct. : les anciennes adresses mènent aux tuiles */
    if (t) { section = t.section; onglet = t.onglet; params = t.params; }
    var hsh = '#/' + section + (onglet ? '/' + onglet : '');
    if (params && Object.keys(params).length) hsh += '?' + Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    if (location.hash === hsh) router(); else location.hash = hsh;
  };
  AMX.lien = function (section, onglet, params) {
    var t = AMX.traduire(section, onglet, params);
    if (t) { section = t.section; onglet = t.onglet; params = t.params; }
    var hsh = '#/' + section + (onglet ? '/' + onglet : '');
    if (params && Object.keys(params).length) hsh += '?' + Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return hsh;
  };

  function router() {
    if (!AMX.session.courriel) return;
    var r = lireHash();
    // 9 oct. : adresse vide (connexion, ouverture du site) → la page de départ choisie par l'utilisateur (accueil.js), sinon l'Accueil.
    if (!r.section && AMX.accueil) { var dep = AMX.accueil.depart(); if (dep) { AMX.aller(dep.section, dep.onglet, r.params); return; } }
    // 9 oct. : Suggestions est devenu un onglet d'Aide ; l'ancienne adresse reste valable.
    if (r.section === 'suggestions' && !AMX.sections.suggestions && AMX.sections.aide) { AMX.aller('aide', 'suggestions', r.params); return; }
    // 11 oct. : une seule section Inventaire (Neufs · Usagé). Anciennes adresses : #/neufs → #/inventaire/neufs ;
    // #/inventaire/us|can|detail → #/inventaire/usage?registre=… (les trois registres sont des pastilles dans la page Usagé).
    if (r.section === 'neufs' && !AMX.sections.neufs && AMX.sections.inventaire) { AMX.aller('inventaire', 'neufs', r.params); return; }
    if (r.section === 'inventaire' && /^(us|can|detail)$/.test(r.onglet) && AMX.inventaire && AMX.inventaire.registres) { var pr = { registre: r.onglet }; Object.keys(r.params || {}).forEach(function (k) { pr[k] = r.params[k]; }); AMX.aller('inventaire', 'usage', pr); return; }
    // 21 oct. : anciennes sections (offres, resultat, achat, avis, csi, admin…) et anciens onglets → leur tuile.
    var trad = AMX.traduire(r.section, r.onglet, r.params);
    if (trad) { AMX.aller(trad.section, trad.onglet, trad.params); return; }
    var secs = AMX.listeSections();
    var sec = AMX.sections[r.section];
    if (sec && sec.absorbee) sec = null;
    if (!sec || (sec.visible && !sec.visible())) {
      // Ancien lien (ex. index.html?vin=…) : fiche d'achat ; sinon la première section.
      var vinUrl = new URLSearchParams(location.search).get('vin');
      if (vinUrl && AMX.sections.achat) { history.replaceState(null, '', location.pathname); AMX.aller('achat', '', { vin: vinUrl }); return; }
      AMX.aller(secs[0].id, (secs[0].onglets && secs[0].onglets[0]) ? secs[0].onglets[0].id : '');
      return;
    }
    var onglets = (sec.onglets || []).filter(function (o) { return !o.visible || o.visible(); });
    var ong = onglets.length ? (onglets.filter(function (o) { return o.id === r.onglet; })[0] || ongletDeDepart(sec, onglets)) : null;
    if (onglets.length && ong.id !== r.onglet) { AMX.aller(sec.id, ong.id, r.params); return; }
    if (sec.tuile && ong) AMX.memo.ecrire('onglet_' + sec.id, ong.id);   /* v130 : la tuile rouvrira cet onglet */

    // Démonter la section précédente si on change.
    var memeSection = courante.section && courante.section.id === sec.id;
    if (!memeSection && courante.instance && courante.instance.demonter) { try { courante.instance.demonter(); } catch (e) {} }
    courante.section = sec; courante.onglet = ong; courante.params = r.params;

    majNav(sec.id);
    dessinerSousBarre(sec, ong);
    document.title = (ong && ong.titre ? (sec.id === 'aide' ? 'Aide · ' + ong.titre : ong.titre) : sec.titre) + ' — ScanAutomax';   /* v130 : le nom de la page d'abord */

    var vue = document.getElementById('vue');
    if (!memeSection || !courante.instance) {
      AMX.vider(vue);
      courante.instance = sec.monter(vue, { onglet: ong ? ong.id : '', params: r.params }) || {};
    } else if (courante.instance.naviguer) {
      courante.instance.naviguer({ onglet: ong ? ong.id : '', params: r.params });
    } else {
      AMX.vider(vue);
      courante.instance = sec.monter(vue, { onglet: ong ? ong.id : '', params: r.params }) || {};
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', router);
  AMX.rafraichirSousBarre = function () { if (courante.section) dessinerSousBarre(courante.section, courante.onglet); };
  /* v131 : remonte la page courante (changement de concession dans la barre du haut, pour une page qui ne l'écoute pas). */
  AMX.remonter = function () {
    if (courante.instance && courante.instance.demonter) { try { courante.instance.demonter(); } catch (e) {} }
    courante.instance = null; router();
  };

  /* ------------------------------ Barre -------------------------------- */
  function dessinerBarre() {
    var barre = document.getElementById('barre');
    AMX.vider(barre);
    var nav = h('nav');
    AMX.listeSections().forEach(function (s) {
      var a = h('a', { href: s.tuile ? '#/' + s.id : AMX.lien(s.id, (s.onglets && s.onglets[0]) ? s.onglets[0].id : ''), dataset: { section: s.id }, title: s.titre }, [
        h('span', { html: ICONES[s.icone] || ICONES.inventaire }), h('span.texte', { text: s.titre }), h('span.court', { text: s.court || s.titre })
      ]);
      nav.appendChild(a);
    });
    var rech = h('div.recherche-globale', [h('span', { html: ICONES.recherche }), h('input', { type: 'search', id: 'recherche-globale', placeholder: 'NIV, # stock, modèle, client, téléphone…', autocomplete: 'off' }), h('kbd', '/')]);
    var usager = h('div.usager', { tabindex: '0' }, [
      h('div.avatar', { text: AMX.initiales(AMX.session.nom || AMX.session.courriel) }),
      h('div', [h('div.nom', { text: AMX.session.nom || AMX.session.courriel }), h('div.role', { text: AMX.session.role || '' })]),
      h('div.menu', [
        h('div.info', [h('div', { text: AMX.session.nom || '' }), h('div', { text: AMX.session.courriel }), AMX.sessionTexte() ? h('div.doux', { text: AMX.sessionTexte() }) : null]),
        h('div.sep'),
        AMX.ligneTextos(),
        h('div.sep'),
        // Guide et aide (7 oct.) : la référence de toutes les fonctions, avec recherche par question (assets/aide.js).
        AMX.sections.aide ? h('button.aide-menu', { type: 'button', html: (ICONES.aide || '') + '<span>Guide et aide</span>', onclick: function () { usager.classList.remove('ouvert'); AMX.aller('aide', 'questions'); } }) : null,
        h('button.ui-bascule', { type: 'button', text: AMX.ui2() ? 'Revenir à l\'ancienne interface' : 'Passer à la nouvelle interface', onclick: function () { AMX.basculerInterface(!AMX.ui2()); } }),
        h('button', { type: 'button', text: 'Déconnexion', onclick: function () { AMX.deconnecter(''); } })
      ])
    ]);
    usager.addEventListener('click', function (e) { if (e.target.closest('.menu')) return; usager.classList.toggle('ouvert'); });
    document.addEventListener('click', function (e) { if (!usager.contains(e.target)) usager.classList.remove('ouvert'); });
    barre.appendChild(h('a.marque', { href: AMX.sections.accueil ? '#/accueil' : '#/', title: 'Groupe Automax — Accueil' }, [h('img', { src: 'assets/logo.png', alt: 'Groupe Automax' })]));
    barre.appendChild(nav);
    if (AMX.ui2()) {
      /* v131 : la concession se choisit une fois, ici, pour tout le site ; Ctrl+K ouvre la palette. */
      var cie = selecteurConcession(); if (cie) barre.appendChild(cie);
      barre.appendChild(rech);
      var kbd = rech.querySelector('kbd'); if (kbd) { kbd.textContent = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘K' : 'Ctrl K'; kbd.title = 'Ouvrir la palette (pages, actions, véhicules)'; kbd.addEventListener('mousedown', function (e) { e.preventDefault(); AMX.palette(); }); }
      barre.appendChild(h('div.espace'));
    } else {
      barre.appendChild(h('div.espace'));
      barre.appendChild(rech);
    }
    barre.appendChild(h('span#etat-sync.etat-sync', { title: 'Connecté au serveur' }));
    barre.appendChild(usager);
    dessinerCote();
    (AMX.brancherRecherche || brancherRechercheGlobale)(rech.querySelector('input'));   // 22 oct. : recherche.js (partout) remplace l'ancienne
    if (!dessinerBarre.branche) {
      dessinerBarre.branche = true;
      document.addEventListener('amx:profil', function () { dessinerBarre(); majNav(courante.section ? courante.section.id : ''); });
      document.addEventListener('amx:compagnie', function () { var el = document.querySelector('#barre .cie-globale'); if (el && el.__maj) el.__maj(); });
    }
  }

  /* ------------------------------ Textos (6 oct.) ------------------------------
     Chacun inscrit son propre cellulaire depuis le menu du compte : c'est là qu'arrivent
     les alertes aux directeurs (même véhicule évalué dans deux concessions) en plus du
     courriel. Le serveur garde le numéro dans la colonne L de la feuille Utilisateurs
     (POST monTelephone, Notif.gs) ; l'app ScanAutomax a le même réglage. */
  AMX.telephoneTexte = function (brut) {
    var s = String(brut || '').replace(/\D/g, '');
    if (s.length === 11 && s.charAt(0) === '1') s = s.slice(1);
    return s.length === 10 ? s.slice(0, 3) + ' ' + s.slice(3, 6) + ' ' + s.slice(6) : String(brut || '');
  };
  AMX.ligneTextos = function () {
    var tel = AMX.session.telephone || '';
    var textos = AMX.session.textos;
    var directeur = AMX.session.role === 'admin' || AMX.session.role === 'proprietaire';
    var ligne = h('div.textos' + (tel || !directeur ? '' : '.sans'), [
      h('span', { html: ICONES.texto || '' }),
      h('span.texte', [
        h('span.etiquette', { text: directeur ? 'Alertes par texto' : 'Mon cellulaire (textos)' }),
        h('span.valeur', { text: tel ? AMX.telephoneTexte(tel) : (directeur ? 'Aucun numéro — courriel seulement' : 'Aucun numéro') })
      ]),
      h('button.btn.petit', { type: 'button', text: tel ? 'Modifier' : 'Ajouter', onclick: function (e) { e.stopPropagation(); AMX.modifierTextos(); } })
    ]);
    if (textos && textos.actif === false) ligne.title = 'Les textos ne sont pas encore activés par l\'administrateur (Outils › Comptes et droits › Alertes aux directeurs).';
    return ligne;
  };
  AMX.modifierTextos = function () {
    var champ = h('input.saisie', { type: 'tel', placeholder: '514 555 0123', autocomplete: 'tel', value: AMX.telephoneTexte(AMX.session.telephone || '') });
    var corps = h('div', [
      h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)', lineHeight: '1.5' }, text: (AMX.session.role === 'admin' || AMX.session.role === 'proprietaire') ? 'Directeur : votre cellulaire reçoit les alertes d\'évaluation par texto — quand un même véhicule est évalué dans deux concessions du groupe. Le courriel part toujours.' : 'Votre cellulaire pour les textos du groupe. Les alertes d\'évaluation (même véhicule évalué dans deux concessions) vont aux directeurs seulement.' }),
      champ,
      h('p.doux.petit', { style: { margin: '10px 0 0' }, text: '10 chiffres. Laissez vide pour ne plus recevoir de textos.' })
    ]);
    AMX.modale({
      titre: 'Mon numéro pour les textos', corps: corps,
      boutons: [
        { texte: 'Annuler' },
        { texte: 'Enregistrer', classe: 'primaire', action: function () {
          var brut = champ.value.replace(/[^\d]/g, '');
          if (brut.length === 11 && brut.charAt(0) === '1') brut = brut.slice(1);
          if (brut && brut.length !== 10) { champ.style.borderColor = 'var(--rouge)'; champ.focus(); AMX.toast('Numéro : 10 chiffres (ex. 514 555 0123).', 'attention'); return false; }
          return AMX.post({ action: 'monTelephone', telephone: brut }, { rejouer: true }).then(function (d) {
            AMX.verifier(d, 'Numéro non enregistré');
            AMX.session.telephone = brut; ecrire(CLE.tel, brut);
            document.dispatchEvent(new CustomEvent('amx:profil'));
            AMX.toast(brut ? 'Textos activés au ' + AMX.telephoneTexte(brut) + '.' : 'Numéro retiré : alertes par courriel seulement.', 'ok');
          }).catch(function (e) { AMX.toast('Échec — ' + AMX.erreurTexte(e), 'erreur'); return false; });
        } }
      ]
    });
    setTimeout(function () { champ.focus(); champ.select(); }, 50);
  };
  /* ------------------------- Nouvelle interface : coquille (v131) -------------------------
     Barre latérale à deux niveaux (tuile › onglet), concession dans la barre du haut, palette Ctrl+K, menu « … ». */
  function bureauUi2() { try { return window.matchMedia('(min-width: 861px)').matches; } catch (e) { return true; } }
  if (window.matchMedia) { try { window.matchMedia('(min-width: 861px)').addEventListener('change', function () { if (AMX.ui2()) AMX.rafraichirSousBarre(); }); } catch (e) {} }
  // Toutes les concessions que le compte voit, quel que soit le domaine, dans l'ordre du groupe.
  function codesGlobaux() {
    var vus = {};
    ['inventaire', 'service', 'evaluations', 'resultats'].forEach(function (d) { (AMX.codesPour ? AMX.codesPour(d) : []).forEach(function (c) { vus[c] = true; }); });
    return Object.keys(AMX.COMPAGNIES_TOUTES || {}).filter(function (c) { return vus[c]; });
  }
  function selecteurConcession() {
    var codes = codesGlobaux();
    if (!codes.length) return null;
    var point = h('i.cie-point');
    if (codes.length === 1) return h('div.cie-globale.seule', { title: 'Votre concession' }, [point, h('span', { text: AMX.COMPAGNIES_TOUTES[codes[0]] || codes[0] })]);
    var sel = h('select', { 'aria-label': 'Concession', title: 'La concession affichée sur toutes les pages' },
      [h('option', { value: '', text: 'Toutes les concessions' })].concat(codes.map(function (c) { return h('option', { value: c, text: AMX.COMPAGNIES_TOUTES[c] || c }); })));
    var maj = function () {
      var c = String(AMX.memo.lire('compagnie', '') || ''); if (codes.indexOf(c) < 0) c = '';
      sel.value = c; point.className = 'cie-point ' + (c ? ((AMX.COULEUR_COMPAGNIE || {})[c] || 'gris') : 'toutes');
    };
    sel.addEventListener('change', function () { var c = sel.value; AMX.choisirCompagnie(c); maj(); remonterSiBesoin(c); });
    maj();
    var el = h('label.cie-globale', [point, sel, h('span.fleche', { html: ICONES.chevron })]);
    el.__maj = maj;
    return el;
  }
  // Pages qui écoutent déjà amx:compagnie (elles se redessinent seules) ; les autres sont remontées.
  var SUIT_COMPAGNIE = { 'service/': 1, 'csi/': 1, 'listes/': 1, 'kpi/': 1, 'ventes/': 1, 'inventaire/soumissions': 1, 'inventaire/neufs': 1, 'inventaire/usage': 1, 'service/rendezvous': 1, 'service/texto': 1 };
  function remonterSiBesoin(code) {
    var o = courante.onglet, cle = o ? (o.de || '') + '/' + (o.onglet || '') : '';
    if (SUIT_COMPAGNIE[cle]) return;
    setTimeout(function () {
      var vue = document.getElementById('vue'), liste = vue && vue.querySelector('.choix-cie.suit-site');
      if (!liste) return;
      var offerts = Array.prototype.map.call(liste.querySelectorAll('button.choix'), function (b) { return b.getAttribute('data-compagnie') || ''; });
      if (offerts.indexOf(code) < 0) return;
      var actif = liste.querySelector('button.choix.actif');
      if ((actif ? actif.getAttribute('data-compagnie') || '' : null) !== code) AMX.remonter();
    }, 80);
  }
  function dessinerCote() {
    var app = document.getElementById('appli'); if (!app) return;
    var cote = document.getElementById('cote');
    if (!AMX.ui2()) { if (cote) cote.remove(); return; }
    if (!cote) { cote = h('nav#cote.cote', { 'aria-label': 'Navigation principale' }); app.insertBefore(cote, app.firstChild); }
    brancherCoteAuto(cote);
    majCote();
  }

  /* 26 oct. (Maxime : « le menu de gauche : cache-le quand on travaille la page principale et fais-le réapparaître quand
     l'utilisateur envoie son curseur à gauche ») : en ui2, sur un ordinateur avec souris, la barre latérale est cachée et la
     page prend toute la largeur ; le menu glisse quand le curseur touche le bord gauche de l'écran (bande #cote-bord), au
     bouton ☰ de la barre du haut ou au clavier (Tab), et repart quand le curseur le quitte, après un clic dans la page ou
     avec Échap. « Garder le menu affiché » (bas du menu) l'épingle comme avant (mémo cote_epingle, par appareil).
     Sur tablette ou écran tactile (pas de survol), le menu reste affiché : tout est dans le CSS (hover: hover). */
  var COTE_MEMO = 'cote_epingle', coteMinuterie = null;
  function coteEpingle() { return AMX.memo.lire(COTE_MEMO, '') === '1'; }
  function coteAuto() { var de = document.documentElement; de.classList.toggle('cote-auto', !!AMX.ui2() && !coteEpingle()); return de.classList.contains('cote-auto'); }
  function coteMontrer() { var c = document.getElementById('cote'); if (!c) return; clearTimeout(coteMinuterie); c.classList.add('visible'); }
  function coteCacher(delai) {
    var c = document.getElementById('cote'); if (!c) return;
    clearTimeout(coteMinuterie);
    coteMinuterie = setTimeout(function () { if (!c.matches(':hover') && !c.contains(document.activeElement)) c.classList.remove('visible'); }, delai === undefined ? 350 : delai);
  }
  function brancherCoteAuto(cote) {
    coteAuto();
    var barre = document.getElementById('barre');
    if (barre && !barre.querySelector('.cote-ouvrir')) {
      barre.insertBefore(h('button.cote-ouvrir', { type: 'button', 'aria-label': 'Afficher le menu', title: 'Menu (ou amenez le curseur au bord gauche de l\'écran)',
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
        onclick: function (e) { e.stopPropagation(); var c = document.getElementById('cote'); if (c && c.classList.contains('visible')) c.classList.remove('visible'); else coteMontrer(); } }), barre.firstChild);
    }
    if (cote._auto) return;
    cote._auto = true;
    var bord = document.getElementById('cote-bord');
    if (!bord) { bord = h('div#cote-bord', { 'aria-hidden': 'true' }); document.body.appendChild(bord); }
    bord.addEventListener('mouseenter', function () { if (coteAuto()) coteMontrer(); });
    cote.addEventListener('mouseenter', function () { if (coteAuto()) coteMontrer(); });
    cote.addEventListener('mouseleave', function () { if (coteAuto()) coteCacher(); });
    cote.addEventListener('focusin', function () { if (coteAuto()) coteMontrer(); });
    cote.addEventListener('focusout', function () { if (coteAuto()) coteCacher(0); });
    // Un lien choisi : la page change, le menu repart tout de suite.
    cote.addEventListener('click', function (e) {
      if (!coteAuto() || !e.target.closest('a')) return;
      setTimeout(function () { var a = document.activeElement; if (a && cote.contains(a) && a.blur) a.blur(); cote.classList.remove('visible'); }, 0);
    });
    document.addEventListener('mousedown', function (e) { if (coteAuto() && cote.classList.contains('visible') && !cote.contains(e.target) && !(e.target.closest && e.target.closest('.cote-ouvrir'))) cote.classList.remove('visible'); }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && coteAuto() && cote.classList.contains('visible')) { cote.classList.remove('visible'); var a = document.activeElement; if (a && cote.contains(a) && a.blur) a.blur(); } });
  }
  function majCote() {
    var cote = document.getElementById('cote'); if (!cote || !AMX.ui2()) return;
    var ouverts = majCote.ouverts = majCote.ouverts || {};
    var secId = courante.section ? courante.section.id : '', ongId = courante.onglet ? courante.onglet.id : '';
    var defile = cote.scrollTop;
    AMX.vider(cote);
    cote.appendChild(h('a.cote-marque', { href: AMX.sections.accueil ? '#/accueil' : '#/', title: 'Groupe Automax — Accueil' }, [h('img', { src: 'assets/logo.png', alt: 'Groupe Automax' })]));
    var liste = h('ul.cote-liste');
    AMX.listeSections().forEach(function (s) {
      var onglets = (s.onglets || []).filter(function (o) { return !o.visible || o.visible(); });
      var plusieurs = onglets.length > 1, ici = s.id === secId;
      var ouvert = plusieurs && (ouverts[s.id] !== undefined ? ouverts[s.id] : ici);
      var li = h('li.cote-tuile' + (ici ? '.actif' : '') + (ouvert ? '.ouvert' : ''));
      li.appendChild(h('div.cote-ligne', [
        h('a.cote-titre', { href: s.tuile ? '#/' + s.id : AMX.lien(s.id, onglets[0] ? onglets[0].id : ''), 'aria-current': ici && !plusieurs ? 'page' : null, onclick: function () { if (plusieurs) ouverts[s.id] = true; } }, [h('span.ic', { html: ICONES[s.icone] || ICONES.inventaire }), h('span.t', { text: s.titre })]),
        plusieurs ? h('button.cote-plier', { type: 'button', 'aria-expanded': ouvert ? 'true' : 'false', 'aria-label': (ouvert ? 'Replier ' : 'Déplier ') + s.titre, html: ICONES.chevron, onclick: function () { ouverts[s.id] = !ouvert; majCote(); } }) : null
      ]));
      if (ouvert) {
        li.appendChild(h('ul.cote-onglets', onglets.map(function (o) {
          var c = ''; try { c = o.compteur ? o.compteur() : ''; } catch (e) {}
          var actif = ici && o.id === ongId;
          return h('li', [h('a' + (actif ? '.actif' : ''), { href: AMX.lien(s.id, o.id), 'aria-current': actif ? 'page' : null }, [h('span.t', { text: o.titre }), (c !== '' && c !== null && c !== undefined) ? h('span.n', { text: String(c) }) : null])]);
        })));
      }
      liste.appendChild(li);
    });
    cote.appendChild(liste);
    cote.appendChild(h('div.cote-pied', [
      h('button.cote-palette', { type: 'button', onclick: function () { AMX.palette(); } }, [h('span', { html: ICONES.recherche }), h('span', 'Aller à…'), h('kbd', { text: /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘K' : 'Ctrl K' })]),
      h('button.cote-epingle', { type: 'button', text: coteEpingle() ? 'Cacher le menu automatiquement' : 'Garder le menu affiché',
        title: coteEpingle() ? 'Le menu se cache quand vous travaillez dans la page ; amenez le curseur au bord gauche pour le revoir.' : 'Le menu reste toujours visible à gauche.',
        onclick: function () { AMX.memo.ecrire(COTE_MEMO, coteEpingle() ? '' : '1'); coteAuto(); var c = document.getElementById('cote'); if (c) c.classList.remove('visible'); majCote(); } }),
      h('button.cote-bascule', { type: 'button', text: 'Revenir à l\'ancienne interface', onclick: function () { AMX.basculerInterface(false); } })
    ]));
    cote.scrollTop = defile;
  }

  /* Menu « … » : les actions secondaires d'une page (Rafraîchir, Exporter, Actions en lot…). */
  AMX.menuActions = function (actions, opts) {
    opts = opts || {};
    var menu = h('div.menu-actions-liste', { role: 'menu', hidden: true });
    var btn = h('button.btn.menu-actions-bouton', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: opts.titre || 'Autres actions', 'aria-label': opts.titre || 'Autres actions', html: (ICONES.points || '…') + (opts.texte ? '<span>' + esc(opts.texte) + '</span>' : '') });
    var env = h('div.menu-actions', [btn, menu]);
    var dehors = function (e) { if (!env.contains(e.target)) fermer(); };
    var fermer = function () { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', dehors, true); };
    var proxies = [];
    (actions || []).filter(Boolean).forEach(function (a) {
      // v135 : `bouton` = un bouton existant de la page (il garde son code) ; l'élément du menu le clique et suit son état.
      var it = h('button', { type: 'button', role: 'menuitem', html: (a.icone || '') + '<span>' + esc(a.texte || '') + '</span>' });
      it.addEventListener('click', function () { fermer(); if (a.bouton) a.bouton.click(); else a.action(); });
      if (a.bouton) proxies.push({ it: it, b: a.bouton });
      menu.appendChild(it);
    });
    var suivre = function () {
      proxies.forEach(function (p) {
        var b = p.b, cache = b.hidden || b.style.display === 'none' || b.classList.contains('cache');
        var svg = b.querySelector('svg');
        p.it.innerHTML = (svg ? svg.outerHTML : '') + '<span>' + esc((b.textContent || b.title || '').trim() || b.getAttribute('aria-label') || '') + '</span>';
        p.it.hidden = cache; p.it.disabled = !!b.disabled;
      });
    };
    btn.addEventListener('click', function () {
      if (!menu.hidden) { fermer(); return; }
      suivre();
      menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
      document.addEventListener('mousedown', dehors, true);
      var p = menu.querySelector('button'); if (p) p.focus();
    });
    menu.addEventListener('keydown', function (e) {
      var l = Array.prototype.slice.call(menu.querySelectorAll('button')), i = l.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.stopPropagation(); fermer(); btn.focus(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length].focus(); }
      else if (e.key === 'Tab') fermer();
    });
    suivre();
    return env;
  };
  /* 26 oct. — Maxime : « je veux le mode glisser et cliquer », « effacer plus d'un véhicule à la fois », « peu importe où je
     les vois ». Mode « Sélectionner » d'une liste dont les lignes portent data-vin : un clic coche ou décoche une ligne, on
     appuie et on glisse sur d'autres lignes pour les cocher d'un seul trait, Maj + clic coche tout l'intervalle (au doigt :
     un toucher coche). Une barre en bas donne le nombre et les actions. La sélection (des NIV) survit aux redessins de la
     liste (filtres, tri). o = { liste, selecteur ('.ligne'), tous: function () → NIV affichés, actions: [{ texte, icone,
     danger, action: function (vins, vider) }] }. Renvoie { bouton, activer, quitter, actif, vins }. */
  AMX.modeSelection = function (o) {
    var sel = {}, actif = false, dernier = null, trait = null, obs = null, typePointeur = '';
    var nb = function () { return Object.keys(sel).length; };
    var lignes = function () { return Array.prototype.slice.call(o.liste.querySelectorAll(o.selecteur + '[data-vin]')); };
    var elCompte = h('b'), elActions = h('div.barre-selection-actions');
    var barre = h('div.barre-selection', { role: 'region', 'aria-label': 'Sélection' }, [h('div.barre-selection-compte', [elCompte]), elActions]);
    var etiquette = h('span', { text: 'Sélectionner' });
    var bouton = h('button.btn.bouton-selection', { type: 'button', title: 'Cocher plusieurs véhicules : cliquez, ou appuyez et glissez sur les lignes', onclick: function () { if (actif) quitter(); else activer(); } });
    bouton.innerHTML = ICONES.check || ''; bouton.appendChild(etiquette);
    function compte() {
      var n = nb();
      elCompte.textContent = n ? n + ' véhicule' + (n > 1 ? 's' : '') + ' sélectionné' + (n > 1 ? 's' : '') : 'Cliquez ou glissez sur les lignes pour les cocher';
      elActions.querySelectorAll('[data-action]').forEach(function (b) { b.disabled = !n; var c = b.querySelector('.n'); if (c) c.textContent = n ? ' (' + n + ')' : ''; });
    }
    function appliquer() {
      lignes().forEach(function (l) { l.classList.toggle('choisie', !!sel[l.dataset.vin]); });
      AMX.vider(elActions);
      var tous = (o.tous ? o.tous() : lignes().map(function (l) { return l.dataset.vin; })).filter(Boolean);
      var tousCoches = tous.length > 0 && tous.every(function (v) { return sel[v]; });
      elActions.appendChild(h('button.btn', { type: 'button', text: tousCoches ? 'Tout décocher' : 'Tout sélectionner (' + tous.length + ')', onclick: function () { if (tousCoches) sel = {}; else tous.forEach(function (v) { sel[v] = true; }); appliquer(); } }));
      (o.actions || []).filter(Boolean).forEach(function (a, i) {
        var b = h('button.btn' + (a.danger ? '.danger' : '.primaire'), { type: 'button', 'data-action': String(i), onclick: function () { a.action(Object.keys(sel), function () { sel = {}; appliquer(); }); } });
        b.innerHTML = a.icone || ''; b.appendChild(h('span', { text: a.texte })); b.appendChild(h('span.n'));
        elActions.appendChild(b);
      });
      elActions.appendChild(h('button.btn.fantome', { type: 'button', text: 'Terminer', onclick: quitter }));
      compte();
    }
    function ligneDe(e) { var l = e.target && e.target.closest ? e.target.closest(o.selecteur + '[data-vin]') : null; return l && o.liste.contains(l) ? l : null; }
    function poser(l, etat) { if (etat) sel[l.dataset.vin] = true; else delete sel[l.dataset.vin]; l.classList.toggle('choisie', etat); }
    // `dernier` est un NIV (la liste peut s'être redessinée entre deux clics).
    function intervalle(vinA, b) { var l = lignes(), i = -1, j = l.indexOf(b); l.forEach(function (x, k) { if (x.dataset.vin === vinA) i = k; }); if (i < 0 || j < 0) return [b]; return l.slice(Math.min(i, j), Math.max(i, j) + 1); }
    var surDown = function (e) {
      typePointeur = e.pointerType || 'mouse';
      if (!actif || typePointeur === 'touch' || e.button !== 0) return;      // au doigt : le toucher (click) coche, le glisser fait défiler
      var l = ligneDe(e); if (!l || e.target.closest('input, select, textarea')) return;   // un lien de la ligne coche aussi (pas de départ de la page)
      e.preventDefault();
      if (e.shiftKey && dernier) intervalle(dernier, l).forEach(function (x) { poser(x, true); });
      else { var etat = !sel[l.dataset.vin]; poser(l, etat); trait = { etat: etat }; }
      dernier = l.dataset.vin; compte();
    };
    var surOver = function (e) { if (!actif || !trait) return; var l = ligneDe(e); if (!l) return; poser(l, trait.etat); dernier = l.dataset.vin; compte(); };
    var surUp = function () { if (trait) { trait = null; appliquer(); } };
    var surClic = function (e) {
      if (!actif) return; var l = ligneDe(e); if (!l || e.target.closest('input, select, textarea')) return;
      e.preventDefault(); e.stopPropagation();
      if (typePointeur === 'touch' || e.detail === 0) { poser(l, !sel[l.dataset.vin]); dernier = l.dataset.vin; appliquer(); }   // doigt ou clavier
    };
    var surTouche = function (e) { if (actif && e.key === 'Escape' && !document.querySelector('.voile')) quitter(); };
    function activer() {
      if (actif) return;
      actif = true; sel = {}; dernier = null; trait = null;
      o.liste.classList.add('mode-selection'); bouton.classList.add('actif'); etiquette.textContent = 'Terminer la sélection';
      o.liste.addEventListener('pointerdown', surDown, true);
      o.liste.addEventListener('pointerover', surOver, true);
      o.liste.addEventListener('click', surClic, true);
      document.addEventListener('pointerup', surUp, true);
      document.addEventListener('keydown', surTouche);
      obs = new MutationObserver(function () { if (actif) appliquer(); });
      obs.observe(o.liste, { childList: true, subtree: true });
      document.body.appendChild(barre); document.body.classList.add('avec-barre-selection');
      appliquer();
    }
    function quitter() {
      if (!actif) return;
      actif = false; trait = null; sel = {};
      if (obs) obs.disconnect(); obs = null;
      o.liste.removeEventListener('pointerdown', surDown, true);
      o.liste.removeEventListener('pointerover', surOver, true);
      o.liste.removeEventListener('click', surClic, true);
      document.removeEventListener('pointerup', surUp, true);
      document.removeEventListener('keydown', surTouche);
      o.liste.classList.remove('mode-selection'); bouton.classList.remove('actif'); etiquette.textContent = 'Sélectionner';
      lignes().forEach(function (l) { l.classList.remove('choisie'); });
      if (barre.parentNode) barre.parentNode.removeChild(barre);
      document.body.classList.remove('avec-barre-selection');
    }
    return { bouton: bouton, activer: activer, quitter: quitter, actif: function () { return actif; }, vins: function () { return Object.keys(sel); } };
  };
  /* v135 : en ui2, seuls `garder` restent visibles dans l'en-tête ; les autres boutons de `liste` descendent dans « … » (ce
     sont toujours les mêmes boutons). Hors ui2, `liste` telle quelle. */
  AMX.actionsEntete = function (liste, garder) {
    liste = (liste || []).filter(Boolean);
    if (!AMX.ui2()) return liste;
    garder = (garder || []).filter(Boolean);
    var autres = liste.filter(function (el) { return garder.indexOf(el) < 0; });
    if (!autres.length) return liste;
    return [AMX.menuActions(autres.map(function (el) { return { bouton: el }; }))].concat(liste.filter(function (el) { return garder.indexOf(el) >= 0; }));
  };

  /* Palette Ctrl+K (⌘K) : pages, actions et véhicules au même endroit, au clavier. */
  function sansAccent(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function entreesPalette() {
    var out = [];
    AMX.listeSections().forEach(function (s) {
      var onglets = (s.onglets || []).filter(function (o) { return !o.visible || o.visible(); });
      if (onglets.length > 1) onglets.forEach(function (o) { out.push({ groupe: 'Pages', t: o.titre, s: s.titre, ic: s.icone, href: AMX.lien(s.id, o.id) }); });
      else out.push({ groupe: 'Pages', t: s.titre, s: '', ic: s.icone, href: s.tuile ? '#/' + s.id : AMX.lien(s.id, onglets[0] ? onglets[0].id : '') });
    });
    var voit = function (id) { var x = AMX.sources[id] || AMX.sections[id]; return !!x && (!x.visible || x.visible()); };
    var actions = [
      voit('outils') && { t: 'Nouvelle évaluation', ic: 'achat', href: AMX.lien('outils', 'evaluation') },
      voit('achat') && { t: 'Nouvelle fiche d\'achat', ic: 'achat', href: AMX.lien('achat', '') },
      voit('ventes') && AMX.ventes && AMX.ventes.peutDeclarer && AMX.ventes.peutDeclarer() && { t: 'Inscrire une vente', ic: 'vente', href: AMX.lien('ventes', 'liste', { nouvelle: Date.now() }) },
      voit('service') && { t: 'Nouveau rendez-vous', ic: 'service', href: AMX.lien('service', 'rendezvous', { nouveau: 1 }) },
      voit('aide') && { t: 'Écrire une suggestion', ic: 'suggestions', href: AMX.lien('aide', 'suggestions') },
      { t: 'Revenir à l\'ancienne interface', ic: 'rafraichir', faire: function () { AMX.basculerInterface(false); } }
    ];
    actions.filter(Boolean).forEach(function (a) { a.groupe = 'Actions'; a.s = a.s || ''; out.push(a); });
    return out;
  }
  AMX.palette = function () {
    if (document.querySelector('.voile.palette')) return;
    var input = h('input.palette-saisie', { type: 'search', placeholder: 'Aller à une page, une action ou un véhicule (NIV, # stock, client…)', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-liste', 'aria-autocomplete': 'list', 'aria-label': 'Aller à' });
    var liste = h('div.palette-liste#palette-liste', { role: 'listbox', 'aria-label': 'Résultats' });
    var m = AMX.modale({ titre: 'Aller à…', classe: 'palette', sansPied: true, proteger: false, corps: h('div.palette', [input, liste, h('div.palette-aide', { text: '↑ ↓ pour choisir · Entrée pour ouvrir · Échap pour fermer' })]) });
    var base = entreesPalette(), choisi = 0, items = [];
    var ouvrir = function (it) { m.fermer(); if (it.faire) it.faire(); else location.hash = String(it.href).replace(/^.*#/, '#'); };
    var marquer = function (i) {
      var els = liste.querySelectorAll('.palette-item'); if (!els.length) return;
      choisi = Math.max(0, Math.min(els.length - 1, i));
      Array.prototype.forEach.call(els, function (e, k) { e.classList.toggle('sel', k === choisi); e.setAttribute('aria-selected', k === choisi ? 'true' : 'false'); });
      input.setAttribute('aria-activedescendant', els[choisi].id); els[choisi].scrollIntoView({ block: 'nearest' });
    };
    var dessiner = function () {
      var q = sansAccent(input.value.trim()), mots = q.split(/\s+/).filter(Boolean);
      items = base.filter(function (it) { var t = sansAccent(it.t + ' ' + it.s); return mots.every(function (m2) { return t.indexOf(m2) >= 0; }); });
      if (!q) items = items.filter(function (it) { return it.groupe === 'Actions'; }).concat(items.filter(function (it) { return it.groupe === 'Pages'; }));
      if (q.length >= 2 && AMX.recherche) {
        var cie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
        var r = AMX.recherche.resultats(input.value.trim(), cie);
        r.vehicules.slice(0, 8).forEach(function (g) {
          var titre = '', href = '';
          g.items.forEach(function (i) { if (!titre && i.src.modele) titre = i.src.modele(i.x) || ''; var p = i.src.puce(i.x); if (!href && p.principal) href = p.href; });
          if (!href && g.items.length) href = g.items[0].src.puce(g.items[0].x).href;
          items.push({ groupe: 'Véhicules', t: titre || g.vin, s: g.vin + (g.cie ? ' · ' + (AMX.COMPAGNIES_TOUTES[g.cie] || g.cie) : ''), ic: 'voiture', href: href });
        });
        if (r.enLecture.length) items.push({ groupe: 'Véhicules', t: 'Recherche en cours…', s: r.enLecture.join(', '), ic: 'recherche', inactif: true });
      }
      AMX.vider(liste);
      var groupe = '';
      items.forEach(function (it, k) {
        if (it.groupe !== groupe) { groupe = it.groupe; liste.appendChild(h('div.palette-groupe', { text: groupe })); }
        var el = h(it.inactif ? 'div.palette-item.inactif' : 'a.palette-item', { id: 'palette-o-' + k, role: 'option', href: it.inactif || it.faire ? null : it.href }, [h('span.ic', { html: ICONES[it.ic] || ICONES.chevron }), h('span.t', { text: it.t }), it.s ? h('span.s', { text: it.s }) : null]);
        if (!it.inactif) el.addEventListener('click', function (e) { e.preventDefault(); ouvrir(it); });
        liste.appendChild(el);
      });
      if (!items.length) liste.appendChild(h('div.palette-vide', { text: 'Rien trouvé pour « ' + input.value.trim() + ' ».' }));
      marquer(0);
    };
    input.addEventListener('input', AMX.debounce(dessiner, 90));
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); marquer(choisi + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); marquer(choisi - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); var vrais = items.filter(function (it) { return true; }); var it = vrais[choisi]; if (it && !it.inactif) ouvrir(it); }
    });
    if (AMX.recherche && AMX.recherche.prechauffer) AMX.recherche.prechauffer(function () { if (document.body.contains(liste) && input.value.trim().length >= 2) dessiner(); });
    dessiner();
  };
  document.addEventListener('keydown', function (e) {
    if (!(e.metaKey || e.ctrlKey) || String(e.key).toLowerCase() !== 'k' || e.altKey || e.shiftKey) return;
    if (!AMX.ui2() || !AMX.session.courriel || !document.getElementById('appli') || !document.getElementById('appli').classList.contains('pret')) return;
    e.preventDefault(); AMX.palette();
  });

  function majNav(id) {
    document.querySelectorAll('#barre nav a').forEach(function (a) { var ici = a.dataset.section === id; a.classList.toggle('actif', ici); if (ici) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    majCote();
  }
  function dessinerSousBarre(sec, ong) {
    var sb = document.getElementById('sous-barre');
    AMX.vider(sb);
    var onglets = (sec.onglets || []).filter(function (o) { return !o.visible || o.visible(); });
    if (!onglets.length) { sb.style.display = 'none'; document.documentElement.style.setProperty('--sous-h', '0px'); return; }
    sb.style.display = 'flex'; document.documentElement.style.setProperty('--sous-h', '44px');
    onglets.forEach(function (o) {
      var c = o.compteur ? o.compteur() : null;
      sb.appendChild(h('a' + (ong && ong.id === o.id ? '.actif' : ''), { href: AMX.lien(sec.id, o.id), 'aria-current': ong && ong.id === o.id ? 'page' : null }, [o.titre, (c !== null && c !== undefined && c !== '') ? h('span.compteur', { text: String(c) }) : null]));
    });
    sb.appendChild(h('div.espace'));
    // 21 oct. : les vues de l'onglet actif (anciens onglets regroupés : Résultats › É.-U. · Wholesale Canada · Neufs…).
    if (ong && ong.vues && sec.tuile) {
      var vis = vuesVisibles(ong), courante = vueCourante(sec, ong, (AMX.courante && AMX.courante.params) || {});
      if (vis.length > 1) {
        var seg = h('div.vues.segment', { role: 'group', 'aria-label': ong.titre });
        vis.forEach(function (v) {
          var s = sourceDeVue(ong, v), c = s.de ? compteurSource(AMX.sources[s.de] || AMX.sections[s.de], s.onglet) : '';
          var p = {}; Object.keys((AMX.courante && AMX.courante.params) || {}).forEach(function (k) { if (k !== 'vue') p[k] = AMX.courante.params[k]; }); p.vue = v.id;
          seg.appendChild(h('a' + (v.id === courante ? '.actif' : ''), { href: AMX.lien(sec.id, ong.id, p), 'data-vue': v.id }, [v.titre, (c !== '' && c !== null && c !== undefined) ? h('span.compteur', { text: String(c) }) : null]));
        });
        sb.appendChild(seg);
      }
    }
    if (sec.outils) { var out = h('div.outils'); sec.outils(out); sb.appendChild(out); }
    var sansVues = !sb.querySelector('.vues, .outils');
    sb.classList.toggle('sans-vues', sansVues);
    if (AMX.ui2() && sansVues && bureauUi2()) document.documentElement.style.setProperty('--sous-h', '0px');
    majCote();
  }

  /* --------------------------- Cache inventaire ------------------------- */
  /* --------------------------- Cache local (v=39) --------------------------
     Vitesse (Maxime, 6 oct. soir) : Google met 1,5 à 11 s à répondre, même pour
     une réponse que le script sort en 1 s. Donc on garde les grosses listes dans
     localStorage et on les affiche TOUT DE SUITE au prochain chargement, puis on
     rafraîchit en arrière-plan (l'écran se redessine si ça a changé). Le serveur
     reste la vérité ; le cache n'est qu'une avance. */
  AMX.cacheLocal = {
    lire: function (cle, maxAge) {
      try {
        var t = localStorage.getItem('amx_cache_' + cle); if (!t) return null;
        var o = JSON.parse(t);
        if (!o || !o.quand || (maxAge && Date.now() - o.quand > maxAge)) return null;
        return o;
      } catch (e) { return null; }
    },
    ecrire: function (cle, donnees) {
      try { localStorage.setItem('amx_cache_' + cle, JSON.stringify({ quand: Date.now(), donnees: donnees })); } catch (e) { /* quota : tant pis */ }
    },
    oublier: function (cle) { try { localStorage.removeItem('amx_cache_' + cle); localStorage.removeItem('amx_cache_' + cle + '_gz'); } catch (e) {} },
    // 16 oct. : copies COMPRESSÉES (gzip + base64) pour les grosses réponses (neufs 1,4 Mo → ~125 Ko, portail, résultats,
    // OpenLane…) — localStorage n'a que ~5 Mo. Asynchrones ; sans CompressionStream (vieux Safari) on ne garde rien.
    ecrireGz: function (cle, donnees) {
      if (!GZ_ECRIRE_POSSIBLE) return Promise.resolve(false);
      var quand = Date.now();
      return gonfler(JSON.stringify(donnees)).then(function (b64) {
        if (b64.length > CACHE_GZ_MAX) return false;
        try { localStorage.setItem('amx_cache_' + cle + '_gz', JSON.stringify({ quand: quand, gz: b64 })); return true; } catch (e) { return false; }
      }).catch(function () { return false; });
    },
    lireGz: function (cle, maxAge) {
      if (!GZ_POSSIBLE) return Promise.resolve(null);
      var o; try { var t = localStorage.getItem('amx_cache_' + cle + '_gz'); o = t ? JSON.parse(t) : null; } catch (e) { o = null; }
      if (!o || !o.quand || !o.gz || (maxAge && Date.now() - o.quand > maxAge)) return Promise.resolve(null);
      return degonfler(o.gz).then(function (t2) { return { quand: o.quand, donnees: JSON.parse(t2) }; }).catch(function () { return null; });
    }
  };
  var CACHE_GZ_MAX = 900000;   // ~900 Ko de base64 par copie, au-delà on n'encombre pas le navigateur
  var GZ_ECRIRE_POSSIBLE = GZ_POSSIBLE && (typeof CompressionStream === 'function');
  function gonfler(texte) {
    return new Response(new Blob([texte]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer().then(function (buf) {
      var octets = new Uint8Array(buf), s = '', PAS = 8192;
      for (var i = 0; i < octets.length; i += PAS) s += String.fromCharCode.apply(null, octets.subarray(i, i + PAS));
      return btoa(s);
    });
  }
  // Heure d'une copie locale, en clair (« hier 16 h 02 », « il y a 12 min »).
  AMX.copieTexte = function (quand) {
    if (!quand) return '';
    var d = Date.now() - quand, m = Math.round(d / 60000);
    if (m < 1) return 'à l\'instant';
    if (m < 60) return 'il y a ' + m + ' min';
    var dt = new Date(quand), hh = dt.getHours() + ' h ' + String(dt.getMinutes()).padStart(2, '0');
    var auj = new Date(); auj.setHours(0, 0, 0, 0);
    if (quand >= auj.getTime()) return 'aujourd\'hui ' + hh;
    if (quand >= auj.getTime() - 86400000) return 'hier ' + hh;
    return AMX.fmtDate ? AMX.fmtDate(dt) + ' ' + hh : dt.toLocaleDateString('fr-CA') + ' ' + hh;
  };
  var CACHE_LOCAL_MAX = 7 * 86400000;   // au-delà d'une semaine on ne s'en sert plus

  // Partagé entre les sections : la liste US / CAN / DETAIL, rechargée sur
  // demande, et un index par VIN pour la recherche globale et les offres.
  // v=39 : les trois registres arrivent en UNE requête (?registres=1, cache
  // serveur 120 s, ?frais=1 après une écriture) au lieu de trois — mesuré le
  // 6 oct. : 3 × 4-5 s en série contre 2-3 s pour l'ensemble — et le dernier
  // état est gardé dans localStorage pour s'afficher d'un coup au chargement.
  var FEUILLES = AMX.FEUILLES = ['US', 'CAN', 'DETAIL'];
  var cache = { US: null, CAN: null, DETAIL: null, quand: {} };
  var promesses = {};
  var promesseTout = null;
  (function () {   // avance depuis le cache local
    var o = AMX.cacheLocal.lire('registres', CACHE_LOCAL_MAX);
    if (o && o.donnees) FEUILLES.forEach(function (f) { if (Array.isArray(o.donnees[f])) { cache[f] = o.donnees[f]; cache[f].forEach(function (v) { v._feuille = f; }); cache.quand[f] = o.quand; } });
  })();
  function sauverRegistres() { AMX.cacheLocal.ecrire('registres', { US: cache.US || [], CAN: cache.CAN || [], DETAIL: cache.DETAIL || [] }); }
  function poserFeuille(feuille, liste) {
    liste.forEach(function (v) { v._feuille = feuille; });
    cache[feuille] = liste; cache.quand[feuille] = Date.now();
    document.dispatchEvent(new CustomEvent('amx:inventaire', { detail: { feuille: feuille } }));
  }
  // Les trois registres d'un coup ; repli sur ?sheet= par feuille si le script en ligne ne connaît pas encore la route.
  // `force` = relire le serveur (son cache de 120 s suffit : il est vidé à chaque écriture) ;
  // `force === 'frais'` = le bouton Rafraîchir : on exige un recalcul (?frais=1, ~5 s de plus).
  function chargerTout(force) {
    if (promesseTout) return promesseTout;
    promesseTout = AMX.get(force === 'frais' ? { registres: 1, frais: 1 } : { registres: 1 }).then(function (d) {
      if (!d || !d.ok || !Array.isArray(d.US)) throw new Error('route registres absente');
      FEUILLES.forEach(function (f) { poserFeuille(f, Array.isArray(d[f]) ? d[f] : []); });
      sauverRegistres();
      promesseTout = null;
      return cache;
    }, function (e) {
      promesseTout = null;
      if (!/registres absente/.test(String(e && e.message))) throw e;
      return Promise.all(FEUILLES.map(function (f) { return AMX.get({ sheet: f }).then(function (d) { poserFeuille(f, (d && d.vehicules) || []); }); })).then(function () { sauverRegistres(); return cache; });
    });
    return promesseTout;
  }
  AMX.inventaire = {
    lire: function (feuille, force) {
      if (!force && cache[feuille]) return Promise.resolve(cache[feuille]);
      if (promesses[feuille]) return promesses[feuille];
      promesses[feuille] = chargerTout(force).then(function () { delete promesses[feuille]; return cache[feuille] || []; }, function (e) { delete promesses[feuille]; throw e; });
      return promesses[feuille];
    },
    remplacer: function (feuille, liste) { if (Array.isArray(liste)) { poserFeuille(feuille, liste); sauverRegistres(); } },
    // 7 oct. (vitesse) : retouche UN véhicule en place (mise à jour optimiste avant la réponse du
    // serveur, ou `vehicule` renvoyé par lui). Renvoie les anciennes valeurs pour pouvoir revenir en
    // arrière, ou null si le véhicule n'est pas dans la liste. `cle` = id ou NIV.
    retoucher: function (feuille, cle, champs) {
      var l = cache[feuille]; if (!l || !champs) return null;
      var k = String(cle || '').toUpperCase(), v = null;
      for (var i = 0; i < l.length; i++) { if (String(l[i].id) === String(cle) || String(l[i].vin).toUpperCase() === k) { v = l[i]; break; } }
      if (!v) return null;
      var avant = {};
      Object.keys(champs).forEach(function (c) { avant[c] = v[c]; v[c] = champs[c]; });
      sauverRegistres();
      return avant;
    },
    enCache: function (feuille) { return cache[feuille]; },
    quand: function (feuille) { return cache.quand[feuille] || 0; },
    tout: function (force) {
      var manque = FEUILLES.some(function (f) { return !cache[f]; });
      var p = (force || manque) ? chargerTout(force).catch(function () { return cache; }) : Promise.resolve(cache);
      return p.then(function () { return [].concat(cache.US || [], cache.CAN || [], cache.DETAIL || []); });
    },
    precharger: function () { if (FEUILLES.some(function (f) { return !cache[f]; }) || Date.now() - Math.min(cache.quand.US || 0, cache.quand.CAN || 0, cache.quand.DETAIL || 0) > 120000) chargerTout(false).catch(function () {}); },
    parVin: function (vin) {
      vin = String(vin || '').toUpperCase();
      for (var i = 0; i < FEUILLES.length; i++) { var l = cache[FEUILLES[i]]; if (!l) continue; for (var j = 0; j < l.length; j++) if (String(l[j].vin).toUpperCase() === vin) return l[j]; }
      return null;
    },
    nomFeuille: function (f) { return { US: 'É.-U.', CAN: 'Canada', DETAIL: 'Detail' }[f] || f; },
    vider: function () { FEUILLES.forEach(function (f) { cache[f] = null; }); cache.quand = {}; AMX.cacheLocal.oublier('registres'); },
    // 26 oct. : retirer des NIV de la liste en mémoire (après une suppression) sans relire le serveur.
    retirer: function (feuille, vins) {
      var k = {}; (vins || []).forEach(function (v) { k[String(v).toUpperCase()] = true; });
      if (cache[feuille]) { poserFeuille(feuille, cache[feuille].filter(function (v) { return !k[String(v.vin).toUpperCase()]; })); sauverRegistres(); }
    }
  };
  /* 26 oct. — Maxime : « je dois pouvoir effacer des inventaires peu importe où je les vois », « plus d'un véhicule à la
     fois ». Une seule suppression pour toutes les pages (Usagé, Analyse usagé, Prix du marché, Suivi service) : le registre
     de chaque NIV est retrouvé en mémoire, une confirmation (taper SUPPRIMER), puis deleteByVinBulk par registre (droit
     « Supprimer »). La liste en mémoire est mise à jour (événement amx:inventaire) : chaque page le retire tout de suite.
     opts.feuille = registre par défaut d'un NIV absent de la mémoire. Renvoie la liste des NIV supprimés (null si annulé). */
  /* 26 oct. : les usagés effacés à la main que le DMS et D2C ne rajoutent plus (Supprimes.gs) — liste et « Laisser revenir ». */
  AMX.inventaire.effaces = function () {
    var corps = h('div', [h('p.doux', { text: 'Lecture…' })]);
    var m = AMX.modale({ titre: 'Usagés effacés', corps: corps, large: true, proteger: false, boutons: [{ texte: 'Fermer' }] });
    var dessiner = function (r) {
      AMX.vider(corps);
      corps.appendChild(h('p.doux.petit', { style: { marginTop: 0 }, text: 'Un usagé effacé du registre n\'est pas rajouté par la relecture du DMS, de la Synchro ou de D2C pendant ' + (r.jours || 365) + ' jours. Il revient seulement sous un nouveau # stock (repris plus tard en échange) ou si on l\'ajoute à la main.' }));
      if (!r.supprimes.length) { corps.appendChild(h('p', { text: 'Aucun usagé effacé pour l\'instant.' })); return; }
      var tb = h('tbody');
      r.supprimes.forEach(function (x) {
        var lever = r.peutLever ? h('button.btn.petit', { type: 'button', text: 'Laisser revenir', onclick: function () {
          lever.classList.add('occupe');
          AMX.post({ action: 'usageSupprimeLever', vin: x.vin }).then(function (y) { if (!y || y.refuse || y.ok === false) throw new Error((y && y.erreur) || 'Refusé'); AMX.toast(y.message || 'Fait', 'ok', 6000); charger(); }, function (e) { lever.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(e), 'erreur'); });
        } }) : null;
        tb.appendChild(h('tr', [
          h('td', [h('b', { text: x.modele || '—' }), h('span.sous.mono', { style: { display: 'block' }, text: x.vin + (x.stock ? ' · #' + x.stock : '') })]),
          h('td', { text: ((AMX.COMPAGNIES_TOUTES || {})[x.compagnie] || x.compagnie || '—') + (x.registre ? ' · ' + (AMX.inventaire.nomFeuille ? AMX.inventaire.nomFeuille(x.registre) : x.registre) : '') }),
          h('td', [h('span', { text: AMX.fmtDate(x.le, true) }), h('span.sous', { style: { display: 'block' }, text: x.par || '' })]),
          h('td', { text: x.revu ? 'Proposé de nouveau par ' + x.revuPar + ' le ' + AMX.fmtDateCourte(String(x.revu).slice(0, 10)) : '—' }),
          h('td', [lever])
        ]));
      });
      corps.appendChild(h('div', { style: { overflowX: 'auto' } }, [h('table.tableau', [h('thead', [h('tr', ['Véhicule', 'Concession', 'Effacé le', 'Depuis', ''].map(function (t) { return h('th', { text: t }); }))]), tb])]));
    };
    var charger = function () {
      AMX.get({ usagesSupprimes: 1 }, { secours: false }).then(function (r) {
        if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Refusé');
        if (!Array.isArray(r.supprimes)) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (Supprimes.gs).');
        dessiner(r);
      }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('p', { text: AMX.erreurTexte(e) })); });
    };
    charger();
    return m;
  };
  AMX.inventaire.supprimer = function (vins, opts) {
    opts = opts || {};
    if (!AMX.perm('supprimer')) { AMX.toast('Supprimer des véhicules demande le droit « Supprimer » (Admin › Droits).', 'attention', 7000); return Promise.resolve(null); }
    var par = {}, liste = [], vus = {};
    (vins || []).forEach(function (vin) {
      var k = String(vin || '').toUpperCase(); if (!k || vus[k]) return; vus[k] = true;
      var v = AMX.inventaire.parVin(k), f = (v && v._feuille) || opts.feuille || '';
      if (!f) return;
      (par[f] = par[f] || []).push(k); liste.push(v || { vin: k });
    });
    if (!liste.length) { AMX.toast('Aucun de ces véhicules n\'est au registre (déjà supprimés ?).', 'attention'); return Promise.resolve(null); }
    var n = liste.length;
    var noms = liste.slice(0, 6).map(function (v) { return (v.modele || v.vin) + (v.stock ? ' (# ' + v.stock + ')' : ''); }).join(' · ') + (n > 6 ? ' · et ' + (n - 6) + ' autre' + (n - 6 > 1 ? 's' : '') : '');
    var titre = n > 1 ? 'Supprimer ' + n + ' véhicules' : 'Supprimer le véhicule';
    var message = noms + '. Retiré' + (n > 1 ? 's' : '') + ' du registre pour de bon — et donc de l\'analyse, du prix du marché et du suivi service. La relecture du DMS ou de D2C ne ' + (n > 1 ? 'les' : 'le') + ' rajoutera pas (sauf sous un nouveau # stock). Tapez SUPPRIMER pour confirmer.';
    return AMX.confirmerSaisie(titre, message, 'SUPPRIMER', { ok: n > 1 ? 'Supprimer les ' + n : 'Supprimer', danger: true }).then(function (ok) {
      if (!ok) return null;
      var feuilles = Object.keys(par), faits = [], refus = [], introuvables = [];
      var suite = Promise.resolve();
      feuilles.forEach(function (f) {
        suite = suite.then(function () {
          return AMX.post({ action: 'deleteByVinBulk', sheet: f, vins: par[f] }, { secours: false }).then(function (d) {
            if (!d || d.refuse || d.ok === false) { refus.push((d && (d.erreur || d.message)) || 'refusé'); return; }
            var absents = d.notFound || [];
            introuvables = introuvables.concat(absents);
            if (Array.isArray(d.vehicules)) AMX.inventaire.remplacer(f, d.vehicules); else AMX.inventaire.retirer(f, par[f]);
            faits = faits.concat(par[f].filter(function (v) { return absents.indexOf(v) < 0; }));
          });
        });
      });
      return suite.then(function () {
        if (refus.length) AMX.toast('Suppression refusée : ' + refus[0], 'erreur', 8000);
        if (faits.length) AMX.toast(faits.length + ' véhicule' + (faits.length > 1 ? 's' : '') + ' supprimé' + (faits.length > 1 ? 's' : '') + (introuvables.length ? ' · ' + introuvables.length + ' déjà absent' + (introuvables.length > 1 ? 's' : '') : ''), 'ok');
        try { document.dispatchEvent(new CustomEvent('amx:supprimes', { detail: { vins: faits } })); } catch (e) {}
        return faits;
      }, function (e) { AMX.toast('Suppression : ' + AMX.erreurTexte(e) + ' — rechargez la page pour voir ce qui a été fait.', 'erreur', 9000); return null; });
    });
  };

  /* ------------------------- Fiche d'achat (lecture) ---------------------- */
  // Les autres sections (panneau d'inventaire) lisent la fiche d'achat d'un
  // véhicule pour en montrer le rapport d'état eBlock et les dommages
  // répertoriés. Petit cache en mémoire ; la section Fiche d'achat l'invalide
  // quand elle enregistre.
  var fichesCache = {};
  AMX.ficheDe = function (vin, force) {
    var k = String(vin || '').toUpperCase();
    if (!k) return Promise.resolve(null);
    if (!force && fichesCache[k]) return fichesCache[k];
    fichesCache[k] = AMX.get('ficheVin=' + encodeURIComponent(k)).then(function (d) {
      return (d && d.trouve) ? (d.donnees || {}) : null;
    }).catch(function (e) { delete fichesCache[k]; throw e; });
    return fichesCache[k];
  };
  AMX.ficheOublier = function (vin) { delete fichesCache[String(vin || '').toUpperCase()]; };
  // Lien de partage d'un véhicule acheté sur eBlock (rapport d'état, photos).
  AMX.eblockValide = function (lien) { var l = String(lien || '').trim(); return /^https:\/\/(graph|app)\.eblock\.com\/\S+/i.test(l) ? l : ''; };
  // « Hood, Tires / Rims » ou une ligne par dommage → liste propre sans doublon.
  AMX.listeDommages = function (texte) {
    var vus = {}, out = [];
    String(texte || '').split(/\r?\n|;|,(?!\s*\d)/).forEach(function (s) { s = s.trim(); if (s && !vus[s.toLowerCase()]) { vus[s.toLowerCase()] = 1; out.push(s); } });
    return out;
  };
  // Nombre de dommages d'une liste : « Capot ×2 » en compte deux (comme les photos d'eBlock).
  AMX.nbDommages = function (liste) { return (liste || []).reduce(function (n, x) { var m = String(x).match(/×\s*(\d+)\s*$/); return n + (m ? parseInt(m[1], 10) : 1); }, 0); };

  /* -------------------------- Logos des marques --------------------------- */
  // Dans la liste, la vignette d'un véhicule sans photo montre le logo du
  // constructeur plutôt que « HYU ». Ordre d'essai : un fichier déposé dans
  // assets/marques/<marque>.png (logo officiel du fabricant, à fournir), puis
  // l'icône du site du constructeur (service d'icônes de Google), puis les
  // trois premières lettres si rien ne charge.
  var DOMAINES_MARQUES = {
    CHEVROLET: 'chevrolet.com', GMC: 'gmc.com', BUICK: 'buick.com', CADILLAC: 'cadillac.com',
    FORD: 'ford.com', LINCOLN: 'lincoln.com', RAM: 'ramtrucks.com', JEEP: 'jeep.com', DODGE: 'dodge.com', CHRYSLER: 'chrysler.com',
    HYUNDAI: 'hyundaiusa.com', KIA: 'kia.com', GENESIS: 'genesis.com', TOYOTA: 'toyota.com', LEXUS: 'lexus.com',
    HONDA: 'honda.com', ACURA: 'acura.com', NISSAN: 'nissanusa.com', INFINITI: 'infinitiusa.com', MAZDA: 'mazdausa.com', SUBARU: 'subaru.com',
    VOLKSWAGEN: 'vw.com', VW: 'vw.com', AUDI: 'audiusa.com', BMW: 'bmwusa.com', MINI: 'miniusa.com', 'MERCEDES-BENZ': 'mbusa.com', MERCEDES: 'mbusa.com',
    PORSCHE: 'porsche.com', TESLA: 'tesla.com', VOLVO: 'volvocars.com', 'LAND': 'landroverusa.com', 'LAND ROVER': 'landroverusa.com', JAGUAR: 'jaguarusa.com',
    MITSUBISHI: 'mitsubishicars.com', RIVIAN: 'rivian.com', POLESTAR: 'polestar.com', 'ALFA': 'alfaromeousa.com', 'ALFA ROMEO': 'alfaromeousa.com', FIAT: 'fiatusa.com',
    MASERATI: 'maserati.com', LUCID: 'lucidmotors.com', 'RANGE': 'landroverusa.com', 'RANGE ROVER': 'landroverusa.com',
    SATURN: 'gm.com', PONTIAC: 'gm.com', SMART: 'mbusa.com', SCION: 'toyota.com', SUZUKI: 'globalsuzuki.com', ISUZU: 'isuzu.com', HUMMER: 'gmc.com'
  };
  // Seules les marques connues ont une icône : pour un mot inattendu
  // (« (modèle », « RANGE »…), deviner un domaine afficherait n'importe quoi.
  AMX.domaineMarque = function (marque) {
    return DOMAINES_MARQUES[String(marque || '').trim().toUpperCase()] || '';
  };
  // Logos officiels déposés dans le dépôt (assets/marques/…), par marque en
  // majuscules. Vide = on prend l'icône du site du constructeur. On ne tente
  // pas le fichier à l'aveugle : chaque essai manqué ferait un 404 par ligne.
  AMX.LOGOS_LOCAUX = {};
  AMX.logoMarque = function (marque, cls) {
    var m = String(marque || '').trim().toUpperCase();
    var abrege = m.slice(0, 3) || '—';
    var el = h('span.logo-marque' + (cls ? '.' + cls : ''), { title: m || 'Marque inconnue' });
    var domaine = AMX.domaineMarque(m);
    var local = AMX.LOGOS_LOCAUX[m] || '';
    if (!m || (!domaine && !local)) { el.textContent = abrege; el.classList.add('texte'); return el; }
    var favicon = domaine ? 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domaine) + '&sz=64' : '';
    var img = h('img', { alt: m, loading: 'lazy', decoding: 'async', src: local || favicon });
    img.addEventListener('error', function () {
      if (local && favicon && img.src.indexOf(local) >= 0) { img.src = favicon; return; }
      AMX.vider(el); el.textContent = abrege; el.classList.add('texte');
    });
    el.appendChild(img);
    return el;
  };

  /* ------------------------------ CARFAX --------------------------------- */
  // Liens publics des rapports CARFAX Canada (vhr.carfax.ca/?id=…), par VIN,
  // tirés du compte concessionnaire. Cache partagé par les sections.
  var carfaxCache = null, carfaxPromesse = null;
  AMX.carfax = {
    valide: function (lien) { var l = String(lien || '').trim(); return /^https:\/\/vhr\.carfax\.ca\/(?:main)?\?id=[^\s&]+/i.test(l) ? l : ''; },
    charger: function (force) {
      if (!force && carfaxCache) return Promise.resolve(carfaxCache);
      if (carfaxPromesse) return carfaxPromesse;
      carfaxPromesse = AMX.get({ carfaxLiens: 1 }).then(function (d) {
        carfaxCache = (d && d.liens) || {}; carfaxPromesse = null;
        document.dispatchEvent(new CustomEvent('amx:carfax'));
        return carfaxCache;
      }, function (e) { carfaxPromesse = null; if (!carfaxCache) carfaxCache = {}; throw e; });
      return carfaxPromesse;
    },
    lien: function (vin) { return (carfaxCache && carfaxCache[String(vin || '').toUpperCase()]) || ''; },
    enCache: function () { return carfaxCache; },
    // Enregistre un ou plusieurs liens : [{vin, lien}] ; lien vide = effacer.
    enregistrer: function (liens) {
      return AMX.post({ action: 'carfaxLiens', liens: liens }).then(function (d) {
        AMX.verifier(d, 'Enregistrement impossible');
        carfaxCache = carfaxCache || {};
        (d.enregistres || []).forEach(function (vin) {
          var l = liens.filter(function (x) { return String(x.vin).toUpperCase() === vin; })[0];
          if (l && l.lien) carfaxCache[vin] = String(l.lien).trim(); else delete carfaxCache[vin];
        });
        document.dispatchEvent(new CustomEvent('amx:carfax'));
        return d;
      });
    }
  };

  /* ------------------------ Référentiels partagés ----------------------- */
  AMX.STATUTS = {
    achete:       { libelle: 'Acheté',       couleur: 'gris',     ordre: 1 },
    transitqc:    { libelle: 'Transit QC',   couleur: 'violet',   ordre: 2 },
    stock:        { libelle: 'En stock',     couleur: 'bleu',     ordre: 3 },
    transit:      { libelle: 'Expédié',      couleur: 'ambre',    ordre: 4 },
    manheimpa:    { libelle: 'Manheim PA',   couleur: 'sarcelle', ordre: 5 },
    arrive:       { libelle: 'Vendu',        couleur: 'vert',     ordre: 6 },
    comptabilise: { libelle: 'Comptabilisé', couleur: 'prune',    ordre: 7 }
  };
  AMX.statut = function (id, feuille) {
    var s = AMX.STATUTS[id] || { libelle: id || '—', couleur: 'gris', ordre: 99 };
    if (id === 'arrive' && feuille === 'US') return Object.assign({}, s, { libelle: 'Vendu É.-U.' });
    return s;
  };
  AMX.badgeStatut = function (id, feuille) { var s = AMX.statut(id, feuille); return h('span.badge.' + s.couleur, { text: s.libelle }); };
  // Les cinq concessions du groupe (6 oct.) : STM, HAWKS, BMW, VW, HYUNDAI.
  // Maxime (6 oct.) : « Ste Marie Automobiles Ltée » s'écrit comme ça partout.
  AMX.COMPAGNIES_TOUTES = { STM: 'Ste Marie Automobiles Ltée', HAWKS: 'Hawkesbury', BMW: 'BMW Sherbrooke', VW: 'VW Brossard', HYUNDAI: 'Hyundai Longueuil' };
  // Compagnie du registre → clé de concession (contrats, évaluation, offres).
  AMX.COMPAGNIE_CONCESSION = { STM: 'stemarie', HAWKS: 'hawkesbury', BMW: 'bmwsherbrooke', VW: 'vwbrossard', HYUNDAI: 'hyundailongueuil' };
  AMX.CONCESSION_COMPAGNIE = { stemarie: 'STM', hawkesbury: 'HAWKS', bmwsherbrooke: 'BMW', vwbrossard: 'VW', hyundailongueuil: 'HYUNDAI' };
  AMX.CONCESSIONS_TOUTES = {
    stemarie: 'Ste Marie Automobiles Ltée', hawkesbury: 'Hawkesbury Chevrolet Buick Cadillac', vwbrossard: 'VW Brossard', bmwsherbrooke: 'BMW Sherbrooke', hyundailongueuil: 'Hyundai Longueuil'
  };
  // Portée (Maxime, 6 oct.) : « chaque concession voit uniquement les informations
  // de sa concession ». Le serveur filtre tout ; ici on limite les sélecteurs et
  // les filtres à ce que le compte peut choisir (perms.concessions, perms.toutes).
  // AMX.COMPAGNIES / AMX.CONCESSIONS sont les listes VISIBLES ; les modules les
  // lisent au rendu, donc elles suivent le profil (amx:profil).
  AMX.COMPAGNIES = Object.assign({}, AMX.COMPAGNIES_TOUTES);
  AMX.CONCESSIONS = Object.assign({}, AMX.CONCESSIONS_TOUTES);
  AMX.appliquerPortee = function () {
    // Listes du domaine « inventaire » (sa concession, ses accès entiers, ses accès inventaire) ;
    // les autres domaines passent par AMX.compagniesPour / AMX.concessionsPour ci-dessous.
    AMX.COMPAGNIES = AMX.compagniesPour('inventaire'); AMX.CONCESSIONS = AMX.concessionsPour('inventaire');
  };
  AMX.estGroupe = function () { var p = AMX.session.perms; return !p || p.toutes !== false; };
  AMX.maConcession = function () { var p = AMX.session.perms; return (p && !p.toutes && p.concession) ? p.concession : ''; };
  // Accès supplémentaires (6 oct., soir) : perms.portees = { inventaire | evaluations | resultats | service : '*' | [codes] }.
  // Un compte limité à sa concession peut voir d'autres concessions en entier, ou un
  // seul domaine (ex. Maxime Fabian : toutes les évaluations du groupe). Les pages qui
  // ont leur domaine lisent ces listes au lieu de AMX.COMPAGNIES / AMX.CONCESSIONS.
  AMX.DOMAINES = ['inventaire', 'evaluations', 'resultats', 'service'];
  AMX.codesPour = function (domaine) {
    var p = AMX.session.perms, tous = Object.keys(AMX.COMPAGNIES_TOUTES);
    if (!p || p.toutes !== false) return tous;
    var v = p.portees && p.portees[domaine];
    if (v === '*') return tous;
    var codes = (v && v.length) ? v : (p.concessions && p.concessions.length ? p.concessions : (p.concession ? [p.concession] : tous));
    return codes.filter(function (c) { return AMX.COMPAGNIES_TOUTES[c]; });
  };
  AMX.compagniesPour = function (domaine) { var o = {}; AMX.codesPour(domaine).forEach(function (c) { o[c] = AMX.COMPAGNIES_TOUTES[c]; }); return o; };
  AMX.concessionsPour = function (domaine) { var o = {}; AMX.codesPour(domaine).forEach(function (c) { var k = AMX.COMPAGNIE_CONCESSION[c]; if (k) o[k] = AMX.CONCESSIONS_TOUTES[k]; }); return o; };
  AMX.estGroupePour = function (domaine) { return AMX.codesPour(domaine).length === Object.keys(AMX.COMPAGNIES_TOUTES).length; };
  // Bandeau « Recherche dans : … » (Maxime, 6 oct. : « rendre visible dès le début dans quelle
  // concession on cherche, ou le groupe au complet »). `compagnie` = filtre choisi ('' = tout ce
  // que le compte voit dans ce domaine) ; `partout` = la recherche ignore statuts et registres.
  AMX.bandeauPortee = function (domaine, compagnie, partout) {
    /* v130 (rapport « Refonte ergonomique », gain rapide 10) : la concession se lit déjà dans la rangée de pastilles en
       haut de la page ; le rail ne garde que l'avis utile pendant une recherche (statuts et registres ignorés). */
    if (!partout) return h('span.portee-vide', { hidden: true });
    return h('div.portee-recherche.partout', [h('span.puce.ok', { text: 'partout' }), h('span', { text: 'tous statuts et tous registres' })]);
  };
  AMX.bandeauPorteeComplet = function (domaine, compagnie, partout) {
    var codes = AMX.codesPour(domaine);
    var texte, classe = '';
    if (compagnie) { texte = AMX.COMPAGNIES_TOUTES[compagnie] || compagnie; }
    else if (AMX.estGroupePour(domaine)) { texte = 'Tout le groupe (' + codes.length + ' concessions)'; classe = '.groupe'; }
    else if (codes.length === 1) { texte = AMX.COMPAGNIES_TOUTES[codes[0]] || codes[0]; }
    else { texte = codes.map(function (c) { return AMX.COMPAGNIES_TOUTES[c] || c; }).join(' + '); }
    return h('div.portee-recherche' + classe, { title: 'La recherche porte sur ' + texte + (partout ? ', tous statuts et tous registres confondus' : '') }, [
      h('span.ic', { html: ICONES.recherche }),
      h('span', [h('span.l', 'Recherche dans : '), h('b', { text: texte })]),
      partout ? h('span.puce.ok', { text: 'partout' }) : null
    ]);
  };
  AMX.optionsCompagnies = function (vide) { var l = vide ? [h('option', { value: '', text: vide })] : []; Object.keys(AMX.COMPAGNIES).forEach(function (c) { l.push(h('option', { value: c, text: c })); }); return l; };

  /* --------------------- Concession choisie (7 oct.) ----------------------
     Maxime : « quand je suis dans une concession ça doit pas changer à moins que
     je le change ». UN seul choix pour tout le site (Inventaire, Service…), gardé
     dans localStorage : les onglets, les pages et les rechargements le gardent ;
     seul un clic sur une autre concession (ou « Toutes ») le change. '' = toutes. */
  AMX.COULEUR_COMPAGNIE = { STM: 'vert', HAWKS: 'bleu', VW: 'violet', BMW: 'sombre', HYUNDAI: 'ambre' };
  AMX.compagnieChoisie = function (domaine) {
    var c = String(AMX.memo.lire('compagnie', '') || '').toUpperCase();
    return (c && AMX.codesPour(domaine || 'inventaire').indexOf(c) >= 0) ? c : '';
  };
  AMX.choisirCompagnie = function (code) {
    code = String(code || '').toUpperCase();
    if (code === String(AMX.memo.lire('compagnie', '') || '')) return;
    AMX.memo.ecrire('compagnie', code);
    try { document.dispatchEvent(new CustomEvent('amx:compagnie', { detail: { compagnie: code } })); } catch (e) {}
  };
  // Liste verticale dans le rail (une ligne par concession : pastille, nom complet,
  // compte). Remplace le segment horizontal où 2 concessions sur 5 débordaient du
  // rail (248 px) et restaient cachées. null quand le compte n'a qu'une concession.
  // 16 oct. (Maxime : « le choix des concessions pour le neuf et l'usagé est différent — rends le site uniforme ») :
  // UNE présentation partout, la rangée de pastilles (.barre) sous l'en-tête de la page ; opts.vertical garde la
  // liste du rail ; opts.sous(code) ajoute une petite ligne de chiffres sous le nom (Torque, eBlock, OpenLane, Registre) ;
  // opts.garder === false : le clic ne change pas la concession du site (filtre local).
  AMX.choixCompagnie = function (opts) {
    var codes = AMX.codesPour(opts.domaine), valeur = opts.valeur || '';
    if (codes.length < 2) return null;
    var suit = !opts.vertical && opts.garder !== false && !opts.sansToutes;   /* v131 : suit le choix du site → en ui2, la barre du haut suffit */
    var liste = h('div.choix-cie' + (opts.vertical ? '' : '.rangee') + (suit ? '.suit-site' : ''), { role: 'radiogroup', 'aria-label': 'Concession' });
    (opts.sansToutes ? [] : [['', 'Toutes les concessions']]).concat(codes.map(function (c) { return [c, AMX.COMPAGNIES_TOUTES[c] || c]; })).forEach(function (l) {   /* sansToutes (21 oct.) : pages par concession seulement (Relance › Équité) */
      var actif = valeur === l[0], n = opts.compte ? opts.compte(l[0]) : null, sous = opts.sous ? opts.sous(l[0]) : null;
      liste.appendChild(h('button.choix' + (actif ? '.actif' : '') + (l[0] ? '.' + (AMX.COULEUR_COMPAGNIE[l[0]] || 'gris') : '.toutes') + (sous ? '.avec-sous' : ''), {
        type: 'button', role: 'radio', 'aria-checked': actif ? 'true' : 'false', 'aria-pressed': actif ? 'true' : 'false', 'data-compagnie': l[0], title: l[1],
        onclick: function () { if (!actif) { if (opts.garder !== false) AMX.choisirCompagnie(l[0]); opts.onchange(l[0]); } }
      }, [h('i.pastille'), h('span.nom', { text: l[1] }), (n === null || n === undefined) ? null : h('span.n', { text: n }), sous ? h('span.sous', { text: sous }) : null]));
    });
    /* v130 : sur téléphone, les pastilles laissent place à une seule liste déroulante (CSS ≤ 640 px). */
    if (!opts.vertical) {
      var sel = h('select.choix-cie-liste', { 'aria-label': 'Concession', onchange: function () { var c = sel.value; if (c === valeur) return; if (opts.garder !== false) AMX.choisirCompagnie(c); opts.onchange(c); } });
      liste.querySelectorAll('button.choix').forEach(function (b) {
        var c = b.getAttribute('data-compagnie') || '', n = b.querySelector('.n');
        sel.appendChild(h('option', { value: c, selected: c === valeur, text: b.title + (n && n.textContent ? ' (' + n.textContent + ')' : '') }));
      });
      liste.appendChild(sel);
    }
    return liste;
  };
  /** Pose la rangée de concessions dans `conteneur` (div.barre-cies, vidé d'abord) ; opts.extra = éléments à droite. */
  AMX.barreConcessions = function (conteneur, opts) {
    AMX.vider(conteneur);
    conteneur.classList.add('barre-cies');
    var choix = AMX.choixCompagnie(opts);
    if (choix) conteneur.appendChild(choix);
    var extra = opts.extra ? [].concat(opts.extra).filter(Boolean) : [];
    if (extra.length) conteneur.appendChild(h('div.extra', extra));
    conteneur.classList.toggle('sans-choix', !choix && !extra.length);
    return choix;
  };
  /* v138 — la même recherche partout (Usagé, Neufs, Suivi service, Livre des ventes, recherche du haut). Maxime, 23 oct. :
     « les recherches de stock dans inventaire ne fonctionnent pas, j'ai fait des tests avec Série 3 2015 » — l'export du DMS
     BMW écrit « BMW SERIE 3 2015 » sans accent (d'autres « 3 Series », « 328i xDrive »), et les pages cherchaient le texte
     tapé tel quel. Maintenant : accents, majuscules et ponctuation ignorés, chaque mot doit se trouver mais dans n'importe
     quel ordre, et « série 3 » = « 3 series » = « 3er » = 320i / 328i / 330e / M340i / M3 pour une BMW. */
  AMX.texteCherche = function (s, champs) {
    var t = String(s === undefined || s === null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    t = t.replace(/\bseries? ([1-8])\b/g, 'serie$1').replace(/\b([1-8]) series?\b/g, 'serie$1').replace(/\b([1-8])er\b/g, 'serie$1');
    if (champs && /\bbmw\b/.test(t)) {
      var plus = [];
      t.replace(/\bm?([1-8])\d\d[a-z]{0,2}\b|\bm([2-8])\b/g, function (x, a, b) { var n = a || b; if (plus.indexOf('serie' + n) < 0 && t.indexOf('serie' + n) < 0) plus.push('serie' + n); return x; });
      if (plus.length) t += ' ' + plus.join(' ');
    }
    return t;
  };
  AMX.motsCherches = function (q) { var t = AMX.texteCherche(q); return t ? t.split(' ') : []; };
  /** Le véhicule (ou la vente…) répond-il à la recherche ? champs = texte ou liste de textes ; q = texte tapé ou motsCherches(q). */
  AMX.correspond = function (champs, q) {
    var mots = Array.isArray(q) ? q : AMX.motsCherches(q);
    if (!mots.length) return true;
    var t = AMX.texteCherche(Array.isArray(champs) ? champs.join(' ') : champs, true), colle = t.replace(/ /g, '');
    return mots.every(function (m) { return t.indexOf(m) >= 0 || colle.indexOf(m) >= 0; });
  };
  /* v138 (Maxime, 23 oct. : « mettre la recherche et les onglets avant les carrés ; quand je choisis Au livre, le calcul doit
     changer pour représenter Au livre — concept qui doit s'appliquer partout ») : sur une page à filtres, l'ordre est
     filtres → cette ligne → chiffres → liste, et les chiffres portent sur ce que les filtres gardent. La ligne le dit :
     « 3 ventes · Octobre 2026 · Au livre · Neufs · « tucson » » + « Effacer les filtres ».
     opts = { n, unite: ['vente', 'ventes'], contexte: 'Octobre 2026', filtres: ['Au livre', …], effacer: fn }. */
  AMX.porteeChiffres = function (conteneur, opts) {
    AMX.vider(conteneur);
    conteneur.className = 'portee-chiffres';
    var u = opts.unite || ['élément', 'éléments'], filtres = (opts.filtres || []).filter(Boolean);
    conteneur.appendChild(h('span.l', { text: 'Chiffres et liste :' }));
    conteneur.appendChild(h('b.n', { text: AMX.fmtNombre(opts.n || 0) + ' ' + (opts.n > 1 ? u[1] : u[0]) }));
    [].concat(opts.contexte || []).filter(Boolean).forEach(function (c) { conteneur.appendChild(h('span.ctx', { text: c })); });
    filtres.forEach(function (f) { conteneur.appendChild(h('span.filtre', { text: f })); });
    if (!filtres.length) conteneur.appendChild(h('span.ctx.doux', { text: 'aucun filtre' }));
    else if (opts.effacer) conteneur.appendChild(h('button.lien.effacer', { type: 'button', onclick: opts.effacer }, [h('span', { html: '&times;' }), ' Effacer les filtres']));
    return conteneur;
  };
  AMX.STATUTS_OFFRE = {
    nouvelle: { libelle: 'À traiter', couleur: 'ambre' }, contre: { libelle: 'Contre-offre', couleur: 'violet' },
    acceptee: { libelle: 'Acceptée', couleur: 'bleu' }, contrat: { libelle: 'Contrat signé', couleur: 'vert' },
    refusee: { libelle: 'Refusée', couleur: 'rouge' }, annulee: { libelle: 'Annulée', couleur: 'gris' }
  };

  /* ----------------------- Recherche globale ---------------------------- */
  // Aussi branchée sur la grande boîte de l'Accueil (accueil.js).
  AMX.brancherRecherche = brancherRechercheGlobale;
  function brancherRechercheGlobale(input) {
    if (!input) return;
    var boite = null;
    var fermer = function () { if (boite) { boite.remove(); boite = null; } };
    var chercher = AMX.debounce(function () {
      var q = input.value.trim().toUpperCase();
      fermer();
      if (q.length < 2) return;
      Promise.all([AMX.inventaire.tout(), AMX.carfax.charger().catch(function () { return {}; })]).then(function (res2) {
        var tout = res2[0], carfax = res2[1] || {};
        var res = tout.filter(function (v) {
          return String(v.vin).toUpperCase().indexOf(q) >= 0 || String(v.stock || '').toUpperCase().indexOf(q) >= 0 || String(v.modele || '').toUpperCase().indexOf(q) >= 0;
        }).slice(0, 12);
        // Rapports CARFAX de véhicules qui ne sont pas (ou plus) à l'inventaire : par NIV (demande de Maxime, 2 oct.).
        var dansInventaire = {}; tout.forEach(function (v) { dansInventaire[String(v.vin || '').toUpperCase()] = true; });
        var horsInv = q.length >= 4 ? Object.keys(carfax).filter(function (vin) { return !dansInventaire[vin] && vin.indexOf(q) >= 0; }).slice(0, 8) : [];
        if (input.value.trim().toUpperCase() !== q) return;
        boite = h('div.carte', { style: { position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50, maxHeight: '420px', overflow: 'auto', color: 'var(--encre)' } });
        if (!res.length && !horsInv.length) boite.appendChild(h('div', { style: { padding: '12px 14px', color: 'var(--encre-3)' }, text: 'Aucun véhicule ni rapport CARFAX pour « ' + q + ' »' }));
        horsInv.forEach(function (vin) {
          var row = h('a.recherche-carfax', { href: carfax[vin], target: '_blank', rel: 'noopener', style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '9px 12px', borderBottom: '1px solid var(--ligne)', textDecoration: 'none', color: 'inherit' } }, [
            h('div', { style: { flex: 1, minWidth: 0 } }, [h('div', { style: { fontWeight: 600 }, text: 'Rapport CARFAX' }), h('div.mono.petit.doux', { text: vin })]),
            h('span.puce', { text: 'Hors inventaire' }),
            h('span.badge.gris', { text: 'Ouvrir le rapport' })
          ]);
          row.addEventListener('click', function () { fermer(); input.value = ''; });
          boite.appendChild(row);
        });
        res.forEach(function (v) {
          var s = AMX.statut(v.statut, v._feuille);
          var row = h('a', { href: AMX.lien('inventaire', v._feuille.toLowerCase(), { vin: v.vin }), style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '9px 12px', borderBottom: '1px solid var(--ligne)', textDecoration: 'none', color: 'inherit' } }, [
            h('div', { style: { flex: 1, minWidth: 0 } }, [h('div', { style: { fontWeight: 600 }, text: v.modele || '—' }), h('div.mono.petit.doux', { text: v.vin + (v.stock ? '  ·  ' + v.stock : '') })]),
            h('span.puce', { text: AMX.inventaire.nomFeuille(v._feuille) }),
            h('span.badge.' + s.couleur, { text: s.libelle })
          ]);
          row.addEventListener('click', function () { fermer(); input.value = ''; });
          boite.appendChild(row);
        });
        input.parentNode.appendChild(boite);
      });
    }, 180);
    input.addEventListener('input', chercher);
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { input.value = ''; fermer(); input.blur(); } if (e.key === 'Enter' && boite) { var a = boite.querySelector('a'); if (a) a.click(); } });
    document.addEventListener('click', function (e) { if (!input.parentNode.contains(e.target)) fermer(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !/input|textarea|select/i.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); input.focus(); }
    });
  }

  /* ------------------------------ Démarrage ----------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    var jeton = lire(CLE.jeton), mail = lire(CLE.mail);
    var echeance = AMX.sessionExpire();
    if (jeton && mail && echeance && echeance.getTime() < Date.now()) { AMX.deconnecter('Votre session de 30 jours est terminée. Reconnectez-vous.'); return; }
    if (jeton && mail) {
      AMX.session.courriel = mail; AMX.session.nom = lire(CLE.nom); AMX.session.role = lire(CLE.role);
      try { AMX.session.perms = JSON.parse(lire(CLE.perms) || 'null'); } catch (e) { AMX.session.perms = null; }
      AMX.session.telephone = lire(CLE.tel) || '';
      try { AMX.session.textos = JSON.parse(lire(CLE.textos) || 'null'); } catch (e) { AMX.session.textos = null; }
      AMX.appliquerPortee();
      ouvrir();
      chargerProfil();
      // v=39 : les grosses listes partent tout de suite, en parallèle du profil, pour que
      // la première page (et la suivante) s'affichent sans attendre Google.
      setTimeout(function () { try { AMX.inventaire.precharger(); if (AMX.service && AMX.service.precharger) AMX.service.precharger(); } catch (e) {} }, 50);
    } else {
      porte('');
    }
  });
})();
