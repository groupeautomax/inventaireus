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
  var CLE = { mail: 'pg_utilisateur_v1', nom: 'pg_nom_v1', role: 'pg_role_v1', jeton: 'pg_jeton_v1', perms: 'amx_perms_v1', expire: 'amx_session_expire_v1', tel: 'amx_tel_v1', textos: 'amx_textos_v1' };

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
    inventaire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l1.5-5A2 2 0 0 1 6.4 4.5h11.2a2 2 0 0 1 1.9 1.5L21 11"/><rect x="3" y="11" width="18" height="7" rx="1.5"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="16.5" cy="18" r="1.8"/></svg>',
    offres: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 13.5l-7 7-10-10V3.5h7l10 10z"/><circle cx="8" cy="8" r="1.5"/></svg>',
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

  AMX.fmtDate = function (iso, avecHeure) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var date = d.toLocaleDateString('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    if (!avecHeure) return date;
    return date + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
  };
  AMX.fmtDateCourte = function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
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
    var voile = h('div.voile');
    var corps = h('div.modale-corps');
    if (typeof o.corps === 'string') corps.innerHTML = o.corps; else if (o.corps) corps.appendChild(o.corps);
    var pied = h('div.modale-pied');
    var fermer = function () { voile.remove(); document.removeEventListener('keydown', surTouche); if (o.onFermer) o.onFermer(); };
    (o.boutons || [{ texte: 'Fermer' }]).forEach(function (b) {
      var btn = h('button.btn' + (b.classe ? '.' + b.classe.split(' ').join('.') : ''), { text: b.texte, type: 'button' });
      btn.addEventListener('click', function () {
        if (!b.action) { fermer(); return; }
        var r = b.action(fermer, btn);
        if (r && typeof r.then === 'function') { btn.classList.add('occupe'); r.then(function (res) { btn.classList.remove('occupe'); if (res !== false) fermer(); }, function () { btn.classList.remove('occupe'); }); }
        else if (r !== false) fermer();
      });
      pied.appendChild(btn);
    });
    var modale = h('div.modale' + (o.large ? '.large' : ''), [
      h('div.modale-entete', [h('h2', { text: o.titre || '' }), h('button.fermer', { type: 'button', 'aria-label': 'Fermer', html: ICONES.fermer, onclick: fermer })]),
      corps,
      o.sansPied ? null : pied
    ]);
    voile.appendChild(modale);
    voile.addEventListener('mousedown', function (e) { if (e.target === voile && !o.bloquante) fermer(); });
    function surTouche(e) { if (e.key === 'Escape' && !o.bloquante) fermer(); }
    document.addEventListener('keydown', surTouche);
    document.body.appendChild(voile);
    var premier = corps.querySelector('input, select, textarea, button');
    if (premier && !o.sansFocus) { try { premier.focus(); } catch (e) {} }
    return { fermer: fermer, el: modale, corps: corps };
  };
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
    e.className = 'etat-sync' + (err ? ' erreur' : (enCours > 0 ? ' occupe' : ''));
    e.title = err ? 'Dernière requête en erreur' : (enCours > 0 ? 'Synchronisation…' : 'Connecté au serveur');
  }
  function surRefus(d) {
    if (d && d.refuse && d.code === 'jeton') { AMX.deconnecter('Votre session a expiré. Reconnectez-vous.'); return true; }
    return false;
  }
  function attendre(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // GET avec reprise et requête de secours. Apps Script (/exec) a deux
  // humeurs : un 404 HTML passager, et une requête qui reste « en attente »
  // 20 à 60 s alors que la même, relancée, répond en 3 s (mesuré le 6 oct. :
  // 2 à 4 s côté script, 12 à 30 s vus du navigateur). Donc : chaque tentative
  // a une durée maximale (GET_DELAI_MS), un 404 est repris tout de suite, et si
  // rien n'est arrivé après GET_SECOURS_MS une deuxième tentative part en
  // parallèle — la première réponse valable gagne, l'autre est annulée. Un GET
  // ne modifie rien : le doublon est sans danger.
  var GET_DELAI_MS = 25000, GET_SECOURS_MS = 6000;
  AMX.get = function (params, opts) {
    opts = opts || {};
    var q = typeof params === 'string' ? params : Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    var base = URL_BACKEND + '?' + q + '&utilisateur=' + encodeURIComponent(AMX.session.courriel) + '&jeton=' + encodeURIComponent(lire(CLE.jeton));
    enCours++; majEtat(false);
    var essais = opts.essais === undefined ? 4 : opts.essais;
    var delai = opts.delai || GET_DELAI_MS;
    var aborts = [];
    var unAppel = function () {
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      if (ctrl) aborts.push(ctrl);
      var minuterie = ctrl ? setTimeout(function () { ctrl.abort(); }, delai) : null;
      var fin = function () { if (minuterie) clearTimeout(minuterie); };
      return _fetch(base + '&_=' + Date.now() + Math.floor(Math.random() * 1000), { method: 'GET', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }).then(function (t) {
        fin();
        var d; try { d = JSON.parse(t); } catch (e) { throw new Error('Réponse illisible du serveur'); }
        return d;
      }, function (err) { fin(); throw (err && err.name === 'AbortError') ? new Error('Pas de réponse en ' + Math.round(delai / 1000) + ' s') : err; });
    };
    var course = new Promise(function (resolve, reject) {
      var restants = essais, enVol = 0, fini = false, derniere = null, secours = null;
      var lancer = function () {
        if (fini || restants <= 0) return;
        restants--; enVol++;
        unAppel().then(function (d) {
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
      secours = setTimeout(function () { if (!fini) lancer(); }, opts.secours || GET_SECOURS_MS);
    });
    return course.then(function (d) {
      enCours--; majEtat(false);
      if (surRefus(d)) throw new Error('Session expirée');
      return d;
    }, function (err) { enCours--; majEtat(true); throw err; });
  };
  // POST : jamais rejoué par défaut (une écriture dédoublée coûte plus cher
  // qu'un échec). `opts.rejouer` : pour une action idempotente (modifier ou
  // supprimer un compte), un 404 HTML passager de Google ou un délai dépassé
  // est renvoyé une fois (6 oct. : « on ne peut pas supprimer un utilisateur »
  // — le serveur avait supprimé, mais la réponse n'était jamais arrivée).
  AMX.post = function (corps, opts) {
    opts = opts || {};
    var envoyer = function () {
      var b = Object.assign({}, corps, { utilisateur: AMX.session.courriel, jeton: lire(CLE.jeton) });
      enCours++; majEtat(false);
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var minuterie = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.delai || 60000) : null;
      return _fetch(URL_BACKEND, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(b), signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { return r.text(); })
        .then(function (t) {
          if (minuterie) clearTimeout(minuterie);
          enCours--; majEtat(false);
          var d; try { d = JSON.parse(t); } catch (e) { throw new Error('Réponse illisible du serveur (' + t.slice(0, 60).replace(/<[^>]+>/g, '') + '…)'); }
          if (surRefus(d)) throw new Error('Session expirée');
          return d;
        }, function (err) { if (minuterie) clearTimeout(minuterie); enCours--; majEtat(true); throw (err && err.name === 'AbortError') ? new Error('Le serveur met trop de temps à répondre.') : err; });
    };
    if (!opts.rejouer) return envoyer();
    return envoyer().catch(function (e) {
      var msg = AMX.erreurTexte(e);
      if (!/illisible|trop de temps|Failed to fetch|NetworkError|Load failed|network/i.test(msg)) throw e;
      return new Promise(function (res) { setTimeout(res, 500); }).then(envoyer);
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

  function chargerProfil() {
    return _fetch(URL_BACKEND + '?permissions=1&jeton=' + encodeURIComponent(lire(CLE.jeton)) + '&utilisateur=' + encodeURIComponent(lire(CLE.mail)) + '&_=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.refuse && d.code === 'jeton') { AMX.deconnecter('Votre session a expiré. Reconnectez-vous.'); return null; }
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
    AMX.session = { courriel: '', nom: '', role: '', perms: null, telephone: '', textos: null };
    document.getElementById('appli').classList.remove('pret');
    porte(message || '');
  };

  function porte(message) {
    var p = document.getElementById('porte');
    p.style.display = 'flex';
    var etape = 'courriel', courrielEnCours = lire(CLE.mail);
    var dessiner = function (msg) {
      var enCourriel = etape === 'courriel';
      AMX.vider(p);
      var champ = enCourriel
        ? h('input', { type: 'email', id: 'porte-mail', autocomplete: 'username', placeholder: 'prenom@groupeautomax.com', value: courrielEnCours })
        : h('input.code', { type: 'text', id: 'porte-code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '000000' });
      var bouton = h('button.btn.primaire.large.bloc', { type: 'button', text: enCourriel ? 'Recevoir mon code' : 'Se connecter' });
      var erreur = h('div.erreur', { text: msg || '' });
      var carte = h('div.porte-carte', [
        h('div.porte-logo', [h('img', { src: 'assets/logo.png', alt: 'Groupe Automax' })]),
        h('h1', { text: enCourriel ? 'Inventaire et ventes' : 'Code de vérification' }),
        h('p', enCourriel ? 'Entrez votre adresse courriel. Un code à six chiffres vous sera envoyé.' : ['Un code vient d\'être envoyé à ', h('strong', { text: courrielEnCours }), '.']),
        champ, bouton, erreur,
        enCourriel ? null : h('button.lien', { type: 'button', text: 'Changer d\'adresse', onclick: function () { etape = 'courriel'; dessiner(''); } }),
        h('p.porte-note', enCourriel ? 'Une connexion vaut 30 jours sur cet appareil, comme dans l\'app ScanAutomax. Sur iPhone, ajoutez le site à l\'écran d\'accueil (Partager → « Sur l\'écran d\'accueil ») pour que Safari garde la session.' : 'Le code est valide 10 minutes.')
      ]);
      p.appendChild(carte);
      var envoyer = function () {
        erreur.textContent = '';
        if (etape === 'courriel') {
          var mail = champ.value.trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { erreur.textContent = 'Entrez une adresse courriel valide.'; return; }
          bouton.disabled = true; bouton.textContent = 'Envoi du code…';
          _fetch(URL_BACKEND + '?demanderCode=' + encodeURIComponent(mail) + '&_=' + Date.now()).then(function (r) { return r.json(); }).then(function (d) {
            bouton.disabled = false; bouton.textContent = 'Recevoir mon code';
            if (!d || !d.ok) { erreur.textContent = (d && d.erreur) || 'Envoi impossible. Réessayez.'; return; }
            courrielEnCours = mail; etape = 'code'; dessiner('');
          }).catch(function () { bouton.disabled = false; bouton.textContent = 'Recevoir mon code'; erreur.textContent = 'Serveur injoignable. Vérifiez votre connexion.'; });
          return;
        }
        var code = champ.value.replace(/\D/g, '');
        if (code.length !== 6) { erreur.textContent = 'Le code a six chiffres.'; return; }
        bouton.disabled = true; bouton.textContent = 'Vérification…';
        _fetch(URL_BACKEND + '?courriel=' + encodeURIComponent(courrielEnCours) + '&verifierCode=' + encodeURIComponent(code) + '&_=' + Date.now()).then(function (r) { return r.json(); }).then(function (d) {
          if (!d || !d.ok || !d.jeton) { bouton.disabled = false; bouton.textContent = 'Se connecter'; erreur.textContent = (d && d.erreur) || 'Code refusé.'; return; }
          ecrire(CLE.jeton, d.jeton); ecrire(CLE.mail, courrielEnCours);
          ecrire(CLE.expire, d.expire ? String(d.expire) : String(Date.now() + 30 * 86400000));
          AMX.session.courriel = courrielEnCours;
          try { AMX.inventaire.vider(); if (AMX.service && AMX.service.vider) AMX.service.vider(); AMX.cacheLocal.oublier('eblock'); } catch (e2) {}   // jamais les listes d'une autre personne
          return chargerProfil().then(function () { ouvrir(); AMX.toast('Connecté pour ' + (d.dureeJours || 30) + ' jours sur cet appareil.', 'ok', 5000); try { AMX.inventaire.precharger(); if (AMX.service && AMX.service.precharger) AMX.service.precharger(); } catch (e3) {} });
        }).catch(function () { bouton.disabled = false; bouton.textContent = 'Se connecter'; erreur.textContent = 'Serveur injoignable. Réessayez.'; });
      };
      champ.addEventListener('keydown', function (e) { if (e.key === 'Enter') envoyer(); });
      bouton.addEventListener('click', envoyer);
      setTimeout(function () { champ.focus(); }, 40);
    };
    dessiner(message);
  }

  function ouvrir() {
    document.getElementById('porte').style.display = 'none';
    document.getElementById('appli').classList.add('pret');
    dessinerBarre();
    document.dispatchEvent(new CustomEvent('automax:connecte'));
    router();
  }

  /* ---------------------------- Sections -------------------------------- */
  // AMX.section('inventaire', { titre, icone, ordre, visible(), onglets: [{id, titre, compteur()}], monter(conteneur, ctx) })
  AMX.section = function (id, def) { def.id = id; AMX.sections[id] = def; };
  AMX.listeSections = function () {
    return Object.keys(AMX.sections).map(function (k) { return AMX.sections[k]; })
      .filter(function (s) { return !s.visible || s.visible(); })
      .sort(function (a, b) { return (a.ordre || 50) - (b.ordre || 50); });
  };

  var courante = { section: null, onglet: null, params: null, instance: null };
  AMX.courante = courante;

  function lireHash() {
    var hsh = location.hash.replace(/^#\/?/, '');
    var q = {}; var i = hsh.indexOf('?');
    if (i >= 0) { hsh.slice(i + 1).split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')); }); hsh = hsh.slice(0, i); }
    var parts = hsh.split('/').filter(Boolean);
    return { section: parts[0] || '', onglet: parts[1] || '', params: q };
  }
  AMX.aller = function (section, onglet, params) {
    var hsh = '#/' + section + (onglet ? '/' + onglet : '');
    if (params && Object.keys(params).length) hsh += '?' + Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    if (location.hash === hsh) router(); else location.hash = hsh;
  };
  AMX.lien = function (section, onglet, params) {
    var hsh = '#/' + section + (onglet ? '/' + onglet : '');
    if (params && Object.keys(params).length) hsh += '?' + Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return hsh;
  };

  function router() {
    if (!AMX.session.courriel) return;
    var r = lireHash();
    var secs = AMX.listeSections();
    var sec = AMX.sections[r.section];
    if (!sec || (sec.visible && !sec.visible())) {
      // Ancien lien (ex. index.html?vin=…) : fiche d'achat ; sinon la première section.
      var vinUrl = new URLSearchParams(location.search).get('vin');
      if (vinUrl && AMX.sections.achat) { history.replaceState(null, '', location.pathname); AMX.aller('achat', '', { vin: vinUrl }); return; }
      AMX.aller(secs[0].id, (secs[0].onglets && secs[0].onglets[0]) ? secs[0].onglets[0].id : '');
      return;
    }
    var onglets = (sec.onglets || []).filter(function (o) { return !o.visible || o.visible(); });
    var ong = onglets.length ? (onglets.filter(function (o) { return o.id === r.onglet; })[0] || onglets[0]) : null;
    if (onglets.length && ong.id !== r.onglet) { AMX.aller(sec.id, ong.id, r.params); return; }

    // Démonter la section précédente si on change.
    var memeSection = courante.section && courante.section.id === sec.id;
    if (!memeSection && courante.instance && courante.instance.demonter) { try { courante.instance.demonter(); } catch (e) {} }
    courante.section = sec; courante.onglet = ong; courante.params = r.params;

    majNav(sec.id);
    dessinerSousBarre(sec, ong);
    document.title = (ong ? ong.titre + ' · ' : '') + sec.titre + ' — Groupe Automax';

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

  /* ------------------------------ Barre -------------------------------- */
  function dessinerBarre() {
    var barre = document.getElementById('barre');
    AMX.vider(barre);
    var nav = h('nav');
    AMX.listeSections().forEach(function (s) {
      var a = h('a', { href: AMX.lien(s.id, (s.onglets && s.onglets[0]) ? s.onglets[0].id : ''), dataset: { section: s.id } }, [
        h('span', { html: ICONES[s.icone] || ICONES.inventaire }), h('span.texte', { text: s.titre })
      ]);
      nav.appendChild(a);
    });
    var rech = h('div.recherche-globale', [h('span', { html: ICONES.recherche }), h('input', { type: 'search', id: 'recherche-globale', placeholder: 'VIN, # stock, modèle — ou un NIV avec rapport CARFAX', autocomplete: 'off' }), h('kbd', '/')]);
    var usager = h('div.usager', { tabindex: '0' }, [
      h('div.avatar', { text: AMX.initiales(AMX.session.nom || AMX.session.courriel) }),
      h('div', [h('div.nom', { text: AMX.session.nom || AMX.session.courriel }), h('div.role', { text: AMX.session.role || '' })]),
      h('div.menu', [
        h('div.info', [h('div', { text: AMX.session.nom || '' }), h('div', { text: AMX.session.courriel }), AMX.sessionTexte() ? h('div.doux', { text: AMX.sessionTexte() }) : null]),
        h('div.sep'),
        AMX.ligneTextos(),
        h('div.sep'),
        h('button', { type: 'button', text: 'Déconnexion', onclick: function () { AMX.deconnecter(''); } })
      ])
    ]);
    usager.addEventListener('click', function (e) { if (e.target.closest('.menu')) return; usager.classList.toggle('ouvert'); });
    document.addEventListener('click', function (e) { if (!usager.contains(e.target)) usager.classList.remove('ouvert'); });
    barre.appendChild(h('a.marque', { href: '#/', title: 'Groupe Automax' }, [h('img', { src: 'assets/logo.png', alt: 'Groupe Automax' })]));
    barre.appendChild(nav);
    barre.appendChild(h('div.espace'));
    barre.appendChild(rech);
    barre.appendChild(h('span#etat-sync.etat-sync', { title: 'Connecté au serveur' }));
    barre.appendChild(usager);
    brancherRechercheGlobale(rech.querySelector('input'));
    if (!dessinerBarre.branche) { dessinerBarre.branche = true; document.addEventListener('amx:profil', function () { dessinerBarre(); majNav(courante.section ? courante.section.id : ''); }); }
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
    if (textos && textos.actif === false) ligne.title = 'Les textos ne sont pas encore activés par l\'administrateur (Admin › Alertes aux directeurs).';
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
  function majNav(id) {
    document.querySelectorAll('#barre nav a').forEach(function (a) { a.classList.toggle('actif', a.dataset.section === id); });
  }
  function dessinerSousBarre(sec, ong) {
    var sb = document.getElementById('sous-barre');
    AMX.vider(sb);
    var onglets = (sec.onglets || []).filter(function (o) { return !o.visible || o.visible(); });
    if (!onglets.length) { sb.style.display = 'none'; document.documentElement.style.setProperty('--sous-h', '0px'); return; }
    sb.style.display = 'flex'; document.documentElement.style.setProperty('--sous-h', '44px');
    onglets.forEach(function (o) {
      var c = o.compteur ? o.compteur() : null;
      sb.appendChild(h('a' + (ong && ong.id === o.id ? '.actif' : ''), { href: AMX.lien(sec.id, o.id) }, [o.titre, (c !== null && c !== undefined && c !== '') ? h('span.compteur', { text: String(c) }) : null]));
    });
    sb.appendChild(h('div.espace'));
    if (sec.outils) { var out = h('div.outils'); sec.outils(out); sb.appendChild(out); }
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
    oublier: function (cle) { try { localStorage.removeItem('amx_cache_' + cle); } catch (e) {} }
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
    vider: function () { FEUILLES.forEach(function (f) { cache[f] = null; }); cache.quand = {}; AMX.cacheLocal.oublier('registres'); }
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
  AMX.choixCompagnie = function (opts) {
    var codes = AMX.codesPour(opts.domaine), valeur = opts.valeur || '';
    if (codes.length < 2) return null;
    var liste = h('div.choix-cie', { role: 'radiogroup', 'aria-label': 'Concession' });
    [['', 'Toutes les concessions']].concat(codes.map(function (c) { return [c, AMX.COMPAGNIES_TOUTES[c] || c]; })).forEach(function (l) {
      var actif = valeur === l[0], n = opts.compte ? opts.compte(l[0]) : null;
      liste.appendChild(h('button.choix' + (actif ? '.actif' : '') + (l[0] ? '.' + (AMX.COULEUR_COMPAGNIE[l[0]] || 'gris') : '.toutes'), {
        type: 'button', role: 'radio', 'aria-checked': actif ? 'true' : 'false', 'data-compagnie': l[0], title: l[1],
        onclick: function () { if (!actif) { AMX.choisirCompagnie(l[0]); opts.onchange(l[0]); } }
      }, [h('i.pastille'), h('span.nom', { text: l[1] }), (n === null || n === undefined) ? null : h('span.n', { text: n })]));
    });
    return liste;
  };
  AMX.STATUTS_OFFRE = {
    nouvelle: { libelle: 'À traiter', couleur: 'ambre' }, contre: { libelle: 'Contre-offre', couleur: 'violet' },
    acceptee: { libelle: 'Acceptée', couleur: 'bleu' }, contrat: { libelle: 'Contrat signé', couleur: 'vert' },
    refusee: { libelle: 'Refusée', couleur: 'rouge' }, annulee: { libelle: 'Annulée', couleur: 'gris' }
  };

  /* ----------------------- Recherche globale ---------------------------- */
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
