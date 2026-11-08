/* =====================================================================================================
   rh.js — Outils › Ressources humaines : documents à signer des nouveaux employés (7 nov. 2026)

   Suggestion S0F03522DC3 (Frédéric Beauvais, VW Brossard) : un portail RH pour Sylvianne — envoyer les politiques et
   les formulaires aux nouveaux employés, signature électronique, réception des documents signés, copie à
   paie@groupeautomax.com (pour ne plus payer EZsign).
   - Accès EXCLUSIF (Maxime, 7 nov.) : le droit « Ressources humaines » (Admin › Droits) ou le propriétaire. Un DG ne
     le voit pas. Clé de l'onglet « rh/rh » : aucun rôle ne le cache, le droit décide seul.
   - Données : GET ?rh=1 (PortailRH.gs). Envoi : POST rhEnvoyer (le lien part par courriel au clic, texto si coché).
   - Un document à signer est un PDF : la page le dessine en images de pages (pdf.js, comme listes.js) au dépôt ; c'est
     ce que l'employé lit et ce que reproduit la copie signée. L'original reste intact (empreinte SHA-256).
   - Règle v138 : filtres → « Chiffres et liste » → chiffres de la liste filtrée → liste.
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez la version qui contient PortailRH.gs.';
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_TRAVAILLEUR = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var MAX_OCTETS = 10 * 1024 * 1024, MAX_PAGES = 40, LARGEUR_PAGE = 1240;

  var CSS = [
    '.rhx-vues { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }',
    '.rhx-vues button { border: 1px solid var(--ligne); background: var(--carte); border-radius: 999px; padding: 6px 13px; font-size: 13px; font-weight: 600; color: var(--encre-2); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }',
    '.rhx-vues button.actif { background: var(--vert-fonce); border-color: var(--vert-fonce); color: #fff; }',
    '.rhx-vues button .n { font-weight: 700; opacity: .8; font-variant-numeric: tabular-nums; }',
    '.rhx-vues button.rouge:not(.actif) .n { color: var(--rouge); opacity: 1; }',
    '.rhx-filtres { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 8px; }',
    '.rhx-filtres .saisie.recherche { flex: 1 1 280px; max-width: 520px; }',
    '.rhx-cadre { overflow-x: auto; }',
    '.rhx-table tbody tr { cursor: pointer; } .rhx-table tbody tr:hover { background: var(--carte-2); }',
    '.rhx-table td { vertical-align: top; } .rhx-table td .s { display: block; color: var(--encre-3); font-size: 12px; }',
    '.rhx-etat { display: inline-block; border-radius: 999px; padding: 2px 9px; font-size: 12px; font-weight: 700; white-space: nowrap; }',
    '.rhx-etat.envoye { background: var(--gris-bg); color: var(--encre-2); } .rhx-etat.ouvert { background: var(--bleu-bg); color: var(--bleu); }',
    '.rhx-etat.signe { background: var(--ambre-bg); color: var(--ambre); } .rhx-etat.transmis { background: var(--vert-clair); color: var(--vert-fonce); }',
    '.rhx-etat.expire { background: var(--rouge-bg); color: var(--rouge); } .rhx-etat.retire { background: var(--gris-bg); color: var(--encre-3); }',
    '.rhx-etapes { display: flex; gap: 4px; margin: 4px 0 0; } .rhx-etapes i { width: 22px; height: 5px; border-radius: 3px; background: var(--gris-bg); }',
    '.rhx-etapes i.fait { background: var(--vert); }',
    '.rhx-vide { padding: 28px; text-align: center; color: var(--encre-3); }',
    '.rhx-erreur { border-left: 4px solid var(--rouge); background: var(--rouge-bg); padding: 10px 12px; border-radius: 8px; margin: 0 0 10px; font-size: 13px; }',
    '.rhx-avis { border-left: 4px solid var(--ambre); background: var(--ambre-bg); padding: 10px 12px; border-radius: 8px; margin: 0 0 10px; font-size: 13px; }',
    '.rhx-ok { border-left: 4px solid var(--vert); background: var(--vert-clair); padding: 10px 12px; border-radius: 8px; margin: 0 0 10px; font-size: 13px; }',
    '.rhx-detail { display: grid; grid-template-columns: minmax(140px, 32%) 1fr; margin: 0 0 12px; }',
    '.rhx-detail dt, .rhx-detail dd { padding: 6px 8px; border-bottom: 1px solid var(--ligne); margin: 0; font-size: 13px; }',
    '.rhx-detail dt { color: var(--encre-3); font-weight: 600; } .rhx-detail dd { word-break: break-word; }',
    '.rhx-h { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--encre-2); margin: 16px 0 6px; }',
    '.rhx-docs { list-style: none; margin: 0; padding: 0; } .rhx-docs li { display: flex; gap: 10px; align-items: flex-start; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed var(--ligne); font-size: 13px; }',
    '.rhx-docs li .q { color: var(--encre-3); font-size: 12px; display: block; } .rhx-docs li .a { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }',
    '.rhx-sha { display: block; font-family: var(--mono); font-size: 11px; color: var(--encre-3); word-break: break-all; }',
    '.rhx-suivi { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 0 0 12px; }',
    '@media (max-width: 640px) { .rhx-suivi { grid-template-columns: repeat(2, minmax(0, 1fr)); } .rhx-detail { grid-template-columns: 1fr; } .rhx-detail dt { border-bottom: none; padding-bottom: 0; } }',
    '.rhx-suivi div { border: 1px solid var(--ligne); border-radius: 10px; padding: 8px 10px; font-size: 12px; color: var(--encre-3); }',
    '.rhx-suivi div b { display: block; font-size: 13px; color: var(--encre); } .rhx-suivi div.fait { border-color: #B6E0C6; background: var(--vert-clair); }',
    '.rhx-form .grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }',
    '.rhx-choix { list-style: none; margin: 0; padding: 0; } .rhx-choix li { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; border-bottom: 1px dashed var(--ligne); font-size: 13px; }',
    '.rhx-choix li input { margin-top: 3px; } .rhx-choix li .q { display: block; color: var(--encre-3); font-size: 12px; }',
    '.rhx-piece { display: grid; grid-template-columns: 1.3fr 1.6fr 1.2fr auto auto; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--ligne); }',
    '@media (max-width: 760px) { .rhx-piece { grid-template-columns: 1fr 1fr; } }',
    '.rhx-piece label.case { display: flex; gap: 6px; align-items: center; font-size: 12.5px; white-space: nowrap; }',
    '.rhx-prereglages { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 8px; }',
    '.rhx-prereglages button { border: 1px dashed var(--ligne); background: var(--carte); border-radius: 999px; padding: 4px 10px; font-size: 12.5px; cursor: pointer; color: var(--encre-2); }',
    '.rhx-cases { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; } .rhx-cases label { display: flex; gap: 6px; align-items: center; }',
    '.rhx-prog { font-size: 12.5px; color: var(--encre-3); margin: 6px 0 0; }',
    '.rhx-apercu { max-height: 60vh; overflow: auto; background: var(--carte-2); padding: 8px; border-radius: 8px; } .rhx-apercu img { display: block; max-width: 100%; margin: 0 auto 8px; box-shadow: 0 1px 4px rgba(0,0,0,.15); background: #fff; }',
    '.rhx-journal { font-size: 12px; color: var(--encre-3); } .rhx-journal li { padding: 2px 0; }',
    '.rhx-texte { background: #fff; color: #111; border: 1px solid var(--ligne); border-radius: 8px; padding: 14px 18px; line-height: 1.5; font-size: 14px; max-height: 60vh; overflow: auto; }',
    '.rhx-texte h2, .rhx-texte h3 { font-size: 15px; margin: 14px 0 6px; } .rhx-texte p { margin: 0 0 8px; } .rhx-texte table { border-collapse: collapse; } .rhx-texte td, .rhx-texte th { border: 1px solid #ccc; padding: 3px 6px; }',
    '.rhx-texte mark, .rhx-editeur mark { background: #FFE58F; color: #111; padding: 0 2px; border-radius: 3px; }',
    '.rhx-outils { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 0 0 6px; }',
    '.rhx-outils button { border: 1px solid var(--ligne); background: var(--carte); border-radius: 6px; padding: 4px 9px; font-size: 12.5px; cursor: pointer; color: var(--encre-2); }',
    '.rhx-outils select { font-size: 12.5px; }',
    '.rhx-outils button.rhx-ia { border-color: var(--vert); color: var(--vert-fonce); font-weight: 600; display: inline-flex; align-items: center; gap: 5px; }',
    '.rhx-ia-note { margin: 6px 0 0; padding: 8px 10px; border-radius: 8px; background: var(--vert-clair); color: var(--vert-fonce); font-size: 13px; }',
    '.rhx-ia-form textarea { width: 100%; min-height: 110px; box-sizing: border-box; font: inherit; padding: 8px; border: 1px solid var(--ligne); border-radius: 8px; }',
    '.rhx-ia-form .segment { margin: 0 0 10px; }',
    '.rhx-editeur { background: #fff; color: #111; border: 1px solid var(--ligne); border-radius: 8px; padding: 12px 16px; min-height: 260px; max-height: 58vh; overflow: auto; line-height: 1.5; font-size: 14px; }',
    '.rhx-editeur:focus { outline: 2px solid var(--vert); outline-offset: 1px; } .rhx-editeur h2 { font-size: 15px; } .rhx-editeur p { margin: 0 0 8px; }',
    '.rhx-cat { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 11.5px; font-weight: 700; background: var(--bleu-bg); color: var(--bleu); margin-right: 6px; }',
    '.rhx-cat.lettre { background: var(--ambre-bg); color: var(--ambre); } .rhx-cat.pdf { background: var(--gris-bg); color: var(--encre-2); }',
    '.rhx-trousse { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; border: 1px dashed var(--ligne); border-radius: 10px; padding: 8px 10px; margin: 0 0 10px; }',
    '.rhx-trousse select { flex: 1 1 240px; max-width: 420px; }',
    '.rhx-revu { color: var(--vert-fonce); font-size: 12px; font-weight: 700; }'
  ].join('\n');
  function css() { if (!document.getElementById('css-rh')) { var s = document.createElement('style'); s.id = 'css-rh'; s.textContent = CSS; document.head.appendChild(s); } }

  /* ------------------------------------------------------------------------------- accès */
  function peutVoir() {
    var p = (AMX.session && AMX.session.perms) || {}, role = p.role || (AMX.session && AMX.session.role) || '';
    return p.rh === true || role === 'proprietaire';
  }
  function estProprio() { var p = (AMX.session && AMX.session.perms) || {}; return (p.role || (AMX.session && AMX.session.role)) === 'proprietaire'; }

  /* ------------------------------------------------------------------------------- données */
  var cache = { rep: null, le: 0, enCours: null };
  function charger(force) {
    if (cache.enCours && !force) return cache.enCours;
    if (!force && cache.rep && Date.now() - cache.le < AMX.dureeCopie(60000)) return Promise.resolve(cache.rep);
    cache.enCours = AMX.get({ rh: '1' }, { delai: 60000, secours: false }).then(function (d) {
      cache.enCours = null;
      if (d && d.refuse) throw new Error(d.erreur || 'Réservé aux ressources humaines.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!Array.isArray(d.envois)) throw new Error(SCRIPT_PAS_A_JOUR);
      cache.rep = d; cache.le = Date.now();
      try { document.dispatchEvent(new CustomEvent('amx:rh')); } catch (e) {}
      return d;
    }, function (e) { cache.enCours = null; throw e; });
    return cache.enCours;
  }
  function poserEnvoi(e) {
    if (!cache.rep || !e) return;
    var i = cache.rep.envois.findIndex(function (x) { return x.id === e.id; });
    if (i >= 0) cache.rep.envois[i] = e; else cache.rep.envois.unshift(e);
    try { document.dispatchEvent(new CustomEvent('amx:rh')); } catch (er) {}
  }
  function poserDocument(d) {
    if (!cache.rep || !d) return;
    var i = cache.rep.documents.findIndex(function (x) { return x.id === d.id; });
    if (i >= 0) cache.rep.documents[i] = d; else cache.rep.documents.push(d);
    delete textesModeles[d.id];
  }
  function poserTrousse(t) {
    if (!cache.rep || !t) return;
    cache.rep.trousses = cache.rep.trousses || [];
    var i = cache.rep.trousses.findIndex(function (x) { return x.id === t.id; });
    if (i >= 0) cache.rep.trousses[i] = t; else cache.rep.trousses.push(t);
  }
  function ecrire(corps, opts) {
    return AMX.post(corps, Object.assign({ delai: 120000, secours: false }, opts || {})).then(function (d) {
      if (d && d.vehicules && !d.envoi && !d.document && !d.reglages && !d.trousse) throw new Error(SCRIPT_PAS_A_JOUR);
      return AMX.verifier(d);
    });
  }
  function compteur() {
    var rep = cache.rep; if (!rep) return '';
    var cie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
    var n = rep.envois.filter(function (e) { return (!cie || e.compagnie === cie) && ((e.etat === 'signe' && e.transmission && e.transmission.erreur) || e.etat === 'expire'); }).length;
    return n || '';
  }

  AMX.section('rh', {
    titre: 'Ressources humaines', icone: 'achat', ordre: 56,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new VueRh(conteneur, ctx); }
  });
  AMX.rh = { charger: charger, enCache: function () { return cache.rep; }, compteur: compteur, peutVoir: peutVoir, vider: function () { cache = { rep: null, le: 0, enCours: null }; } };

  /* ------------------------------------------------------------------------------- outils */
  var ETATS = { envoye: 'Envoyé, pas ouvert', ouvert: 'Ouvert, pas signé', signe: 'Signé — envoi à la paie', transmis: 'Signé et transmis', expire: 'Lien expiré', retire: 'Retiré' };
  var VUES = [['encours', 'En cours'], ['transmis', 'Signés et transmis'], ['expire', 'Expirés'], ['retire', 'Retirés'], ['tous', 'Tous']];
  var PREREGLAGES = [
    ['Spécimen de chèque', 'Pour le dépôt direct de la paie (photo ou PDF).'],
    ['TD1 fédéral rempli', 'Déclaration des crédits d\'impôt personnels (Canada).'],
    ['TP-1015.3 rempli', 'Déclaration pour la retenue d\'impôt (Québec).'],
    ['Permis de conduire', 'Recto, lisible.']
  ];
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c || 'Tout le groupe'; }
  function dateHeure(iso) { return iso ? AMX.fmtDate(iso, true) : ''; }
  function dateCourte(iso) { return iso ? AMX.fmtDateCourte(String(iso).length === 10 ? iso + 'T12:00:00' : iso) : ''; }
  function pluriel(n, s, p) { return AMX.fmtNombre(n) + ' ' + (n > 1 ? (p || s + 's') : s); }
  function etatPuce(e) { return h('span.rhx-etat.' + e.etat, { text: ETATS[e.etat] || e.etat }); }
  function dansVue(e, vue) {
    if (vue === 'encours') return e.etat === 'envoye' || e.etat === 'ouvert' || e.etat === 'signe';
    if (vue === 'transmis') return e.etat === 'transmis';
    if (vue === 'expire') return e.etat === 'expire';
    if (vue === 'retire') return e.etat === 'retire';
    return true;
  }
  function champsRecherche(e) { return [e.id, e.nom, e.courriel, e.telephone, e.poste, nomCie(e.compagnie), e.creeParNom].concat((e.docs || []).map(function (d) { return d.nom; })).concat((e.pieces || []).map(function (p) { return p.libelle; })); }
  function base64De(buf) {
    var oct = new Uint8Array(buf), s = '', pas = 0x8000;
    for (var i = 0; i < oct.length; i += pas) s += String.fromCharCode.apply(null, oct.subarray(i, i + pas));
    return btoa(s);
  }
  function ouvrirFichier(params, titre) {
    var w = window.open('', '_blank');
    if (w) { try { w.document.title = titre || 'Document'; w.document.body.style.font = '14px system-ui'; w.document.body.textContent = 'Téléchargement…'; } catch (e0) {} }
    return AMX.get(params, { secours: false, delai: 90000 }).then(function (r) {
      if (!r || r.ok === false || !r.base64) throw new Error((r && r.erreur) || 'Fichier indisponible.');
      var bin = atob(r.base64), oct = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) oct[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([oct], { type: r.mime || 'application/pdf' }));
      if (w) w.location = url; else { var a = h('a', { href: url, download: r.nom || 'document.pdf' }); document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
    }).catch(function (e) { if (w) w.close(); AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  }

  /* ------------------------------------------------------------------------------- PDF → images de pages (pdf.js) */
  function chargerPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (chargerPdfJs.p) return chargerPdfJs.p;
    chargerPdfJs.p = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = PDFJS; s.async = true;
      s.onload = function () { if (!window.pdfjsLib) { chargerPdfJs.p = null; rej(new Error('Le lecteur de PDF ne s\'est pas chargé.')); return; } window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_TRAVAILLEUR; res(window.pdfjsLib); };
      s.onerror = function () { chargerPdfJs.p = null; rej(new Error('Impossible de charger le lecteur de PDF (réseau).')); };
      document.head.appendChild(s);
    });
    return chargerPdfJs.p;
  }
  function lireFichier(f) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(new Error('Lecture du fichier impossible.')); }; r.readAsArrayBuffer(f); }); }
  function jpegDe(canvas) {
    var q = 0.82, url = canvas.toDataURL('image/jpeg', q);
    while (url.length > 1180000 && q > 0.45) { q -= 0.12; url = canvas.toDataURL('image/jpeg', q); }
    return url;
  }
  function imageVersCanvas(url, largeurMax) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var e = Math.min(1, largeurMax / img.naturalWidth), c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * e); c.height = Math.round(img.naturalHeight * e);
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        res(c);
      };
      img.onerror = function () { rej(new Error('Image illisible.')); };
      img.src = url;
    });
  }
  /**
   * Un fichier déposé → { base64 (data URL de l'original), pages: [data:image/jpeg…], nbPages }.
   * `avecPages` = faux pour un formulaire à remplir (seul l'original sert). opts.progres(texte).
   */
  function preparerFichier(f, avecPages, progres) {
    progres = progres || function () {};
    if (!f) return Promise.reject(new Error('Choisissez un fichier.'));
    if (f.size > MAX_OCTETS) return Promise.reject(new Error('Fichier trop gros (10 Mo au plus).'));
    return lireFichier(f).then(function (buf) {
      var oct = new Uint8Array(buf), debut = -1;
      for (var i = 0; i < Math.min(oct.length - 4, 1024); i++) { if (oct[i] === 37 && oct[i + 1] === 80 && oct[i + 2] === 68 && oct[i + 3] === 70) { debut = i; break; } }
      var estImage = /^image\/(jpeg|png)$/.test(f.type);
      if (debut < 0 && !estImage) throw new Error('Déposez un PDF (ou une photo JPEG / PNG). Un document Word s\'enregistre d\'abord en PDF.');
      if (debut > 0) { buf = buf.slice(debut); oct = new Uint8Array(buf); }
      var original = 'data:' + (debut >= 0 ? 'application/pdf' : f.type) + ';base64,' + base64De(buf);
      if (!avecPages) return { base64: original, pages: [], nbPages: 0 };
      if (estImage && debut < 0) {
        return imageVersCanvas(original, 1600).then(function (c) { return { base64: original, pages: [jpegDe(c)], nbPages: 1 }; });
      }
      return chargerPdfJs().then(function (pdfjs) { return pdfjs.getDocument({ data: oct }).promise; }).then(function (doc) {
        if (doc.numPages > MAX_PAGES) throw new Error('Un document à signer compte ' + MAX_PAGES + ' pages au plus (celui-ci en a ' + doc.numPages + ').');
        var pages = [], n = 0;
        var suivante = function () {
          n++;
          if (n > doc.numPages) return Promise.resolve();
          progres('Préparation de la page ' + n + ' sur ' + doc.numPages + '…');
          return doc.getPage(n).then(function (page) {
            var v1 = page.getViewport({ scale: 1 }), e = Math.min(2.2, LARGEUR_PAGE / v1.width), vp = page.getViewport({ scale: e });
            var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
            var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
            return page.render({ canvasContext: x, viewport: vp }).promise.then(function () { pages.push(jpegDe(c)); return suivante(); });
          });
        };
        return suivante().then(function () { return { base64: original, pages: pages, nbPages: pages.length }; });
      }, function (e) {
        if (e && /password/i.test(String(e.name || e.message))) throw new Error('Ce PDF est protégé par un mot de passe : enregistrez-en une copie sans mot de passe.');
        throw e;
      });
    });
  }
  /** Dépose un document (bibliothèque ou envoi) → le document enregistré. */
  function deposer(f, infos, progres) {
    var avecPages = infos.type !== 'formulaire';
    return preparerFichier(f, avecPages, progres).then(function (x) {
      progres && progres('Envoi au serveur…');
      return ecrire({ action: 'rhDocumentAjouter', nom: infos.nom, description: infos.description || '', type: avecPages ? 'signer' : 'formulaire', compagnie: infos.compagnie || '',
        bibliotheque: infos.bibliotheque !== false, base64: x.base64, pages: x.pages }, { delai: 180000 });
    }).then(function (d) { poserDocument(d.document); return d.document; });
  }

  /* ------------------------------------------------------------------------------- documents en texte (7 nov.) */
  /* Champs remplis tout seuls à l'envoi ; les autres ({{remuneration}}, {{superieur}}…) se tapent dans l'envoi. */
  var CHAMPS_AUTO = { nom: 1, prenom: 1, poste: 1, debut: 1, concession: 1, date: 1, rh: 1 };
  var ALIAS = { candidat: 'nom', name: 'nom', employe: 'nom', position: 'poste', titre: 'poste', location: 'concession', dealer: 'concession', salaire: 'remuneration' };
  var LIB_CHAMPS = { nom: 'Nom complet', prenom: 'Prénom', poste: 'Poste', debut: 'Date d\'entrée en poste', concession: 'Concession', date: 'Date du jour', rh: 'Personne des RH',
    remuneration: 'Rémunération', superieur: 'Supérieur immédiat', horaire: 'Horaire de travail',
    /* 8 nov. : les montants du « Plan de rémunération — Directeur / Directrice » (modèle de HR4 copié sans ses montants). */
    remunerationtotale: 'Rémunération annuelle totale', salairebase: 'Salaire annuel de base', salairehebdo: 'Salaire hebdomadaire de base',
    bonismensuels: 'Bonis mensuels', bonistrimestriels: 'Bonis trimestriels', avantages: 'Bénéfices marginaux (total)',
    reer: 'Contribution de l\'employeur au REER', vacances: 'Vacances annuelles', allocationauto: 'Démonstrateur ou allocation automobile',
    valeurtotale: 'Valeur totale du plan' };
  var CATEGORIES = { politique: 'Politique', lettre: 'Lettre', autre: 'Document' };
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var textesModeles = {};
  function nomChamp(v) {
    var n = String(v || '').toLowerCase();
    if (n.normalize) n = n.normalize('NFD').replace(/[̀-ͯ]/g, '');
    n = n.replace(/[^a-z0-9]/g, '');
    return ALIAS[n] || n;
  }
  function libChamp(n) { var v = (cache.rep && cache.rep.variables) || {}; return v[n] || LIB_CHAMPS[n] || n; }
  function champsDe(html) {
    var vus = {}, out = [];
    String(html || '').replace(/\{\{\s*([^{}]{1,40}?)\s*\}\}/g, function (m, v) { var n = nomChamp(v); if (n && !vus[n]) { vus[n] = 1; out.push(n); } return m; });
    return out;
  }
  function echapper(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function dateLongue(iso, en) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); if (!m) return '';
    var j = Number(m[3]), mo = Number(m[2]) - 1;
    return en ? MONTHS[mo] + ' ' + j + ', ' + m[1] : (j === 1 ? '1er' : String(j)) + ' ' + MOIS[mo] + ' ' + m[1];
  }
  function remplirTexte(html, valeurs) {
    return String(html || '').replace(/\{\{\s*([^{}]{1,40}?)\s*\}\}/g, function (m, v) { var x = valeurs[nomChamp(v)]; return x ? echapper(x) : m; });
  }
  /* Les passages à compléter d'une lettre de HR4 (« (date) », « XX$ ») et les champs restés vides, surlignés pour la revue. */
  function surligner(html) {
    return String(html || '').replace(/(\{\{[^{}]{1,40}\}\}|\((?:[^()<>]{2,60})\)|\bX{1,3}\s?\$|\$\s?X{1,3}\b)/g, '<mark>$1</mark>');
  }
  var PASSAGES_A_COMPLETER = /\bX{1,3}\s?\$|\$\s?X{1,3}\b|\(\s*(?:date|mettre|titre|temps plein|nom|montant|salaire|inscrire|indiquer|programme)[^)]{0,60}\)/i;
  function resteACompleter(html) { var t = String(html || '').replace(/<[^>]+>/g, ' '); return /\{\{[^{}]{1,40}\}\}|\bX{1,3}\s?\$/.test(t); }
  function chargerTexte(id) {
    if (textesModeles[id]) return Promise.resolve(textesModeles[id]);
    return AMX.get({ rhDocument: 1, id: id, quoi: 'texte' }, { secours: false, delai: 60000 }).then(function (r) {
      if (!r || r.ok === false) throw new Error((r && r.erreur) || 'Texte indisponible.');
      if (typeof r.html !== 'string') throw new Error(SCRIPT_PAS_A_JOUR);
      textesModeles[id] = r.html; return r.html;
    });
  }
  /** 8 nov. (Maxime : « mets Einstein dans Ressources humaines lorsqu'il faut écrire un document ») : Einstein AI écrit un
      brouillon ou améliore le texte de l'éditeur (POST rhRediger, PortailRH.gs). Le texte arrive dans l'éditeur ; rien n'est
      enregistré tant que la personne ne clique pas « Enregistrer ». opts.contexte() → { nom, categorie }. */
  function demanderEinstein(zone, note, opts) {
    var ctx = (opts && opts.contexte && opts.contexte()) || {};
    var texteActuel = String(zone.textContent || '').replace(/\s+/g, ' ').trim();
    var mode = texteActuel.length >= 40 ? 'ameliorer' : 'ecrire';
    var boutonsMode = {}, seg = h('div.segment');
    [['ecrire', 'Écrire un nouveau texte'], ['ameliorer', 'Améliorer le texte actuel']].forEach(function (m) {
      var b = h('button', { type: 'button', text: m[1], 'aria-pressed': String(mode === m[0]), onclick: function () { mode = m[0]; Object.keys(boutonsMode).forEach(function (k) { boutonsMode[k].setAttribute('aria-pressed', String(k === mode)); boutonsMode[k].classList.toggle('actif', k === mode); }); } });
      if (mode === m[0]) b.classList.add('actif');
      boutonsMode[m[0]] = b; seg.appendChild(b);
    });
    var demande = h('textarea', { placeholder: ctx.categorie === 'lettre'
      ? 'Ex. Lettre d\'offre pour un poste de technicien, temps plein, avec période de probation de 3 mois et uniforme fourni.'
      : 'Ex. Politique sur le cellulaire au travail : interdit dans l\'atelier, permis aux pauses, sanctions graduées.' });
    var etat = h('p.rhx-prog');
    var mo = AMX.modale({ titre: 'Écrire avec Einstein AI', corps: h('div.rhx-form.rhx-ia-form', [
      seg,
      h('div.champ', [h('label', { text: ctx.nom ? 'Ce que « ' + ctx.nom + ' » doit contenir' : 'Ce que le document doit contenir' }), demande]),
      h('p.rhx-prog', { text: 'Einstein AI reçoit votre demande, le nom du document et, pour « améliorer », le texte de l\'éditeur. N\'y écrivez aucun renseignement personnel (NAS, santé, salaire d\'une personne) : les champs {{nom}}, {{remuneration}}… se remplissent à l\'envoi.' }),
      etat
    ]), boutons: [{ texte: 'Annuler' }, { texte: 'Rédiger', classe: 'primaire', action: function () {
      if (mode === 'ecrire' && texteActuel.length >= 40 && !window.confirm('Le texte de l\'éditeur sera remplacé par celui d\'Einstein AI. Continuer ?')) return false;
      etat.textContent = 'Einstein AI écrit… (30 secondes à une minute)';
      return ecrire({ action: 'rhRediger', mode: mode, demande: demande.value, nom: ctx.nom || '', categorie: ctx.categorie || '', html: mode === 'ameliorer' ? zone.innerHTML : '' }).then(function (r) {
        if (typeof r.html !== 'string') throw new Error(SCRIPT_PAS_A_JOUR);
        zone.innerHTML = r.html;
        note.textContent = 'Brouillon d\'Einstein AI : relisez-le et complétez-le avant d\'enregistrer.' + (r.remarques ? ' ' + r.remarques : '');
        note.hidden = false;
        AMX.toast('Texte d\'Einstein AI dans l\'éditeur', 'ok');
      }, function (er) { etat.textContent = ''; AMX.toast(AMX.erreurTexte(er), 'erreur', 8000); return false; });
    } }] });
    setTimeout(function () { try { demande.focus(); } catch (e) {} }, 50);
    return mo;
  }
  /** Un petit éditeur : gras, italique, titre, liste, l'insertion d'un champ {{…}} et Einstein AI. → { el, valeur(), zone } */
  function editeurTexte(html, opts) {
    var zone = h('div.rhx-editeur', { contenteditable: 'true', spellcheck: 'true' });
    zone.innerHTML = html || '<p></p>';
    var cmd = function (c, v) { zone.focus(); try { document.execCommand(c, false, v || null); } catch (e) {} };
    var selChamp = h('select', { onchange: function () { if (selChamp.value) { cmd('insertText', '{{' + selChamp.value + '}}'); selChamp.value = ''; } } },
      [h('option', { value: '', text: 'Insérer un champ…' })].concat(Object.keys(LIB_CHAMPS).map(function (k) { return h('option', { value: k, text: LIB_CHAMPS[k] + ' — {{' + k + '}}' }); })));
    var outils = h('div.rhx-outils', [
      h('button', { type: 'button', title: 'Gras', onmousedown: function (e) { e.preventDefault(); cmd('bold'); } }, [h('b', 'G')]),
      h('button', { type: 'button', title: 'Italique', onmousedown: function (e) { e.preventDefault(); cmd('italic'); } }, [h('i', 'I')]),
      h('button', { type: 'button', text: 'Titre', onmousedown: function (e) { e.preventDefault(); cmd('formatBlock', 'h2'); } }),
      h('button', { type: 'button', text: 'Paragraphe', onmousedown: function (e) { e.preventDefault(); cmd('formatBlock', 'p'); } }),
      h('button', { type: 'button', text: '• Liste', onmousedown: function (e) { e.preventDefault(); cmd('insertUnorderedList'); } }),
      selChamp,
      h('button.rhx-ia', { type: 'button', title: 'Écrire ou améliorer le texte avec Einstein AI', onmousedown: function (e) { e.preventDefault(); }, onclick: function () { demanderEinstein(zone, noteIa, opts); } },
        [AMX.maxai && AMX.maxai.avatar ? AMX.maxai.avatar(16, { bouton: false }) : null, 'Einstein AI'].filter(Boolean))
    ]);
    var noteIa = h('p.rhx-ia-note', { hidden: true });
    return { el: h('div', [outils, zone, noteIa]), zone: zone, valeur: function () { return zone.innerHTML.replace(/<\/?mark>/g, ''); } };
  }
  /* Import des modèles de HR4 : le fichier JSON lu dans HR4 (politiques du Manuel de l'employé, lettres d'offre). */
  /* 8 nov. (Maxime) : « Groupe Park Avenue » (ancien nom du groupe dans les modèles de HR4) devient « Groupe Automax ».
     Même règle que RH_marque_ (PortailRH.gs) ; une adresse courriel ou web n'est jamais touchée. */
  function marque(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/Groupe(?:\s|&nbsp;|&#160;)+Park(?:\s|&nbsp;|&#160;)+Avenue/gi, 'Groupe Automax')
      .replace(/Groupe(?:\s|&nbsp;|&#160;)+AutoMax\b/g, 'Groupe Automax')
      .replace(/Groupe Automax[ \u00a0]+([.,])/g, 'Groupe Automax$1');
  }
  function modelesHr4(json) {
    var out = [], vus = {};
    var ajouter = function (nom, categorie, html) {
      nom = marque(String(nom || '').replace(/\{\{[^{}]*\}\}/g, '(poste)').replace(/\s+/g, ' ').trim()).slice(0, 120);
      html = marque(html);
      if (nom.length < 3 || !html) return;
      var cle = nom.toLowerCase();
      if (vus[cle]) { if (vus[cle] === html) return; var n = 2; while (vus[cle + ' (' + n + ')']) n++; nom += ' (' + n + ')'; cle = nom.toLowerCase(); }
      vus[cle] = html; out.push({ nom: nom, categorie: categorie, html: html });
    };
    (json.politiques || []).forEach(function (p) {
      ajouter(p.titre, 'politique', (p.sections || []).map(function (x) { return (x.titre ? '<h2>' + echapper(x.titre) + '</h2>' : '') + (x.html || ''); }).join(''));
    });
    (json.lettres || []).forEach(function (l) {
      var html = String(l.html || '').replace(/\{\{\s*([^{}]{1,40}?)\s*\}\}/g, function (m, v) { return '{{' + nomChamp(v) + '}}'; });
      ajouter(l.titre, 'lettre', html);
    });
    return out;
  }

  /* ------------------------------------------------------------------------------- page */
  function VueRh(conteneur, ctx) {
    css();
    var self = this, p = (ctx && ctx.params) || {};
    this.conteneur = conteneur; this.detruit = false;
    this.compagnie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
    this.vue = p.voir || 'encours'; this.q = p.q || '';   /* « vue » est réservé par la tuile : la vue de la liste se lit dans « voir » */
    this.ouvrirId = p.id || '';
    AMX.vider(conteneur);
    this.btnNouvel = h('button.btn.primaire', { type: 'button', text: 'Nouvel envoi', onclick: function () { self.nouvelEnvoi(); } });
    this.btnDocs = h('button.btn', { type: 'button', text: 'Bibliothèque', onclick: function () { self.documentsTypes(); } });
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    this.btnReglages = h('button.btn', { type: 'button', text: 'Réglages', onclick: function () { self.reglages(); } });
    this.btnReglages.hidden = !estProprio();
    this.elSous = h('p', { text: 'Documents à lire et à signer des nouveaux employés. Le dossier signé part tout seul à la paie.' });
    conteneur.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Ressources humaines'), this.elSous]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnReglages, this.btnDocs, this.btnNouvel], [this.btnDocs, this.btnNouvel]))
    ]));
    this.elCies = h('div.barre-cies'); conteneur.appendChild(this.elCies);
    this.elVues = h('div.rhx-vues'); conteneur.appendChild(this.elVues);
    this.inRecherche = h('input.saisie.recherche', { type: 'search', value: this.q, placeholder: 'Chercher : employé, courriel, poste, document, RH-101…', autocomplete: 'off', 'aria-label': 'Chercher un envoi' });
    conteneur.appendChild(h('div.rhx-filtres', [this.inRecherche]));
    this.elPortee = h('div'); conteneur.appendChild(this.elPortee);
    this.elKpis = h('div.kpis'); conteneur.appendChild(this.elKpis);
    this.elCorps = h('div'); conteneur.appendChild(this.elCorps);
    var relancer = AMX.debounce(function () { self.q = self.inRecherche.value; self.rafraichir(); }, 160);
    this.inRecherche.addEventListener('input', relancer);
    this.inRecherche.addEventListener('keydown', function (e) { if (e.key === 'Escape') { self.inRecherche.value = ''; self.q = ''; self.rafraichir(); } });
    this.surCie = function (e) { self.compagnie = (e.detail && e.detail.compagnie) || ''; self.rendre(); };
    this.surRh = function () { if (cache.rep && !self.detruit) { self.rep = cache.rep; self.rendre(); } };
    document.addEventListener('amx:compagnie', this.surCie);
    document.addEventListener('amx:rh', this.surRh);
    if (cache.rep) { this.rep = cache.rep; this.rendre(); } else this.elCorps.appendChild(AMX.chargeur('Ressources humaines'));
    vueCourante = this;
    this.charger(false);
  }
  VueRh.prototype.demonter = function () { if (vueCourante === this) vueCourante = null; this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); document.removeEventListener('amx:rh', this.surRh); };
  VueRh.prototype.naviguer = function (ctx) {
    var p = (ctx && ctx.params) || {};
    if (p.voir && p.voir !== this.vue) { this.vue = p.voir; this.rendre(); }
    if (p.id && this.rep) this.ouvrirFiche(p.id);
  };
  VueRh.prototype.charger = function (force) {
    var self = this;
    charger(force).then(function (d) {
      if (self.detruit) return;
      self.rep = d; self.erreur = ''; self.rendre(); AMX.rafraichirSousBarre && AMX.rafraichirSousBarre();
      if (self.ouvrirId) { var id = self.ouvrirId; self.ouvrirId = ''; self.ouvrirFiche(id); }
      if (envoiEnAttente) { var ea = envoiEnAttente; envoiEnAttente = null; self.nouvelEnvoi({ embauche: ea }); }
      if (force) AMX.toast('Ressources humaines à jour', 'ok');
    }, function (e) {
      if (self.detruit) return;
      self.erreur = AMX.erreurTexte(e);
      AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.carte', [h('div.rhx-vide', { text: self.erreur })]));
    });
  };
  VueRh.prototype.base = function () { var cie = this.compagnie; return (this.rep ? this.rep.envois : []).filter(function (e) { return !cie || e.compagnie === cie; }); };
  VueRh.prototype.filtrer = function (sauf) {
    var self = this;
    return this.base().filter(function (e) {
      if (sauf !== 'vue' && !dansVue(e, self.vue)) return false;
      if (self.q && !AMX.correspond(champsRecherche(e), self.q)) return false;
      return true;
    });
  };
  VueRh.prototype.rendre = function () {
    if (!this.rep || this.detruit) return;
    var self = this, base = this.rep.envois, reg = this.rep.reglages || {};
    this.elSous.textContent = 'Documents à lire et à signer des nouveaux employés. Le dossier signé part tout seul à ' + (reg.paie || ['paie@groupeautomax.com']).join(', ') + (reg.copieRh !== false ? ', copie à la personne qui l\'a envoyé.' : '.');
    this.btnReglages.hidden = !this.rep.peutRegler;
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.compagnie,
      compte: function (c) { return base.filter(function (e) { return (!c || e.compagnie === c) && dansVue(e, 'encours'); }).length; },
      onchange: function (c) { self.compagnie = c; self.rendre(); } });
    var pourVue = this.filtrer('vue');
    AMX.vider(this.elVues);
    VUES.forEach(function (v) {
      var n = pourVue.filter(function (e) { return dansVue(e, v[0]); }).length;
      self.elVues.appendChild(h('button' + (self.vue === v[0] ? '.actif' : '') + (v[0] === 'expire' && n ? '.rouge' : ''), { type: 'button', onclick: function () { self.vue = v[0]; self.rendre(); } }, [v[1], h('span.n', { text: String(n) })]));
    });
    this.rafraichir();
  };
  VueRh.prototype.rafraichir = function () {
    if (!this.rep) return;
    var self = this, liste = this.filtrer();
    var vueNom = { encours: 'en cours', transmis: 'signés et transmis', expire: 'expirés', retire: 'retirés', tous: 'tous' }[this.vue];
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['envoi', 'envois'], contexte: [this.compagnie ? nomCie(this.compagnie) : 'toutes les concessions', vueNom],
      filtres: this.q ? ['« ' + this.q + ' »'] : [], effacer: function () { self.q = ''; self.inRecherche.value = ''; self.rafraichir(); } });
    this.rendreKpis(liste);
    this.rendreListe(liste);
  };
  VueRh.prototype.rendreKpis = function (liste) {
    var self = this;
    AMX.vider(this.elKpis);
    var tuile = function (valeur, libelle, sous, cls, clic) {
      var el = h(clic ? 'button.kpi' : 'div.kpi', clic ? { type: 'button', onclick: clic } : {}, [h('div.valeur', { text: String(valeur) }), h('div.libelle', { text: libelle }), sous ? h('div.sous', { text: sous }) : null]);
      if (cls) el.classList.add(cls); return el;
    };
    var pasOuverts = liste.filter(function (e) { return e.etat === 'envoye'; }).length;
    var ouverts = liste.filter(function (e) { return e.etat === 'ouvert'; }).length;
    var signes = liste.filter(function (e) { return e.etat === 'signe' || e.etat === 'transmis'; });
    var erreurs = liste.filter(function (e) { return e.etat === 'signe' && e.transmission && e.transmission.erreur; }).length;
    var delais = signes.map(function (e) { return (Date.parse(e.signeLe) - Date.parse(e.creeLe)) / 36e5; }).filter(function (x) { return x >= 0; }).sort(function (a, b) { return a - b; });
    var med = delais.length ? delais[Math.floor(delais.length / 2)] : null;
    this.elKpis.appendChild(tuile(liste.length, 'Envois', liste.filter(function (e) { return e.etat !== 'retire'; }).length + ' actifs', 'neutre'));
    this.elKpis.appendChild(tuile(pasOuverts, 'Pas encore ouverts', 'lien envoyé, jamais ouvert', pasOuverts ? 'attention' : 'neutre'));
    this.elKpis.appendChild(tuile(ouverts, 'Ouverts, pas signés', 'l\'employé a ouvert son lien', 'neutre'));
    this.elKpis.appendChild(tuile(signes.length, 'Signés', erreurs ? erreurs + ' envoi(s) à la paie en échec' : 'transmis ou en route vers la paie', erreurs ? 'alerte' : 'neutre'));
    this.elKpis.appendChild(tuile(med === null ? '—' : (med < 48 ? Math.round(med) + ' h' : Math.round(med / 24) + ' j'), 'Délai de signature', med === null ? 'aucun dossier signé' : 'médiane, de l\'envoi à la signature', 'neutre'));
  };
  VueRh.prototype.rendreListe = function (liste) {
    var self = this;
    AMX.vider(this.elCorps);
    if (!liste.length) {
      this.elCorps.appendChild(h('div.carte', [h('div.rhx-vide', [
        h('p', { text: this.rep.envois.length ? 'Aucun envoi avec ces filtres.' : 'Aucun envoi pour l\'instant.' }),
        this.rep.envois.length ? null : h('button.btn.primaire', { type: 'button', text: 'Préparer le premier envoi', onclick: function () { self.nouvelEnvoi(); } })
      ])]));
      return;
    }
    var corps = h('tbody');
    liste.forEach(function (e) {
      var nDocs = (e.docs || []).length, nSig = (e.docs || []).filter(function (d) { return d.signeLe; }).length, nOuv = (e.docs || []).filter(function (d) { return d.ouvertLe; }).length;
      var pieces = e.pieces || [], nPieces = pieces.filter(function (p) { return (p.fichiers || []).length; }).length;
      var etapes = h('div.rhx-etapes', [h('i' + ((e.envois || []).length ? '.fait' : '')), h('i' + (e.vues ? '.fait' : '')), h('i' + (e.signeLe ? '.fait' : '')), h('i' + (e.transmisLe ? '.fait' : ''))]);
      corps.appendChild(h('tr', { onclick: function () { self.ouvrirFiche(e.id); } }, [
        h('td', [h('b', { text: e.nom }), h('span.s', { text: [e.poste, e.courriel].filter(Boolean).join(' · ') }), h('span.s', { text: e.id })]),
        h('td', { text: nomCie(e.compagnie) }),
        h('td', [h('span', { text: nDocs ? nSig + ' / ' + nDocs + ' signés' : '—' }), nDocs ? h('span.s', { text: nOuv + ' / ' + nDocs + ' ouverts' }) : null]),
        h('td', { text: pieces.length ? nPieces + ' / ' + pieces.length : '—' }),
        h('td', [etatPuce(e), etapes, e.transmission && e.transmission.erreur && e.etat === 'signe' ? h('span.s', { style: { color: 'var(--rouge)' }, text: 'Envoi à la paie en échec : nouvel essai bientôt' }) : null]),
        h('td', [h('span', { text: 'Envoyé le ' + dateCourte(e.creeLe) }), h('span.s', { text: e.signeLe ? 'Signé le ' + dateCourte(e.signeLe) : (e.etat === 'retire' ? '' : 'Expire le ' + dateCourte(e.expireLe)) })])
      ]));
    });
    this.elCorps.appendChild(h('div.carte', [h('div.rhx-cadre', [h('table.tableau.rhx-table', [
      h('thead', [h('tr', [h('th', 'Employé'), h('th', 'Concession'), h('th', 'Documents'), h('th', 'Pièces'), h('th', 'État'), h('th', 'Dates')])]), corps
    ])])]));
  };

  /* ------------------------------------------------------------------------------- fiche d'un envoi */
  VueRh.prototype.envoi = function (id) { return ((this.rep && this.rep.envois) || []).filter(function (e) { return e.id === id; })[0] || null; };
  VueRh.prototype.ouvrirFiche = function (id) {
    var self = this, e = this.envoi(id);
    if (!e) { AMX.toast('Envoi ' + id + ' introuvable', 'attention'); return; }
    var corps = h('div'), m;
    var dessiner = function () {
      e = self.envoi(id) || e;
      AMX.vider(corps);
      if (e.etat === 'signe' && e.transmission && e.transmission.erreur) corps.appendChild(h('div.rhx-erreur', { text: 'L\'envoi à la paie a échoué (' + e.transmission.essais + ' essai(s)) : ' + e.transmission.erreur + '. ScanAutomax réessaie tout seul ; « Renvoyer à la paie » le fait tout de suite.' }));
      else if (e.etat === 'signe') corps.appendChild(h('div.rhx-avis', { text: 'Signé le ' + dateHeure(e.signeLe) + '. Les copies signées se préparent ; le dossier part à la paie dans la minute.' }));
      else if (e.etat === 'transmis') corps.appendChild(h('div.rhx-ok', { text: 'Transmis le ' + dateHeure(e.transmisLe) + ' à ' + e.transmisA + (e.transmission && e.transmission.nonJoints && e.transmission.nonJoints.length ? ' — trop lourds pour le courriel : ' + e.transmission.nonJoints.join(', ') : '') + '.' }));
      else if (e.etat === 'expire') corps.appendChild(h('div.rhx-erreur', { text: 'Le lien a expiré le ' + dateCourte(e.expireLe) + '. « Renvoyer le lien » le prolonge de 14 jours.' }));
      else if (e.etat === 'retire') corps.appendChild(h('div.rhx-avis', { text: 'Retiré le ' + dateHeure(e.retireLe) + (e.retireRaison ? ' : ' + e.retireRaison : '') + '. Le lien ne s\'ouvre plus.' }));
      var etape = function (fait, titre, texte) { return h('div' + (fait ? '.fait' : ''), [h('b', { text: titre }), texte || '—']); };
      var dernier = (e.envois || []).slice(-1)[0];
      corps.appendChild(h('div.rhx-suivi', [
        etape(!!dernier, 'Envoyé', dernier ? dateHeure(dernier.le) + ([dernier.courriel ? ' · courriel' : '', dernier.texto ? ' · texto' : ''].join('')) : ''),
        etape(!!e.vues, 'Ouvert', e.premiereVue ? dateHeure(e.premiereVue) + (e.vues > 1 ? ' (' + e.vues + ' fois)' : '') : ''),
        etape(!!e.signeLe, 'Signé', e.signeLe ? dateHeure(e.signeLe) : ''),
        etape(!!e.transmisLe, 'Transmis à la paie', e.transmisLe ? dateHeure(e.transmisLe) : '')
      ]));
      corps.appendChild(h('dl.rhx-detail', [
        h('dt', 'Employé'), h('dd', { text: e.nom + (e.poste ? ' — ' + e.poste : '') }),
        h('dt', 'Courriel'), h('dd', { text: e.courriel }),
        h('dt', 'Cellulaire'), h('dd', { text: e.telephone ? e.telephone.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2-$3') : '—' }),
        h('dt', 'Concession'), h('dd', { text: nomCie(e.compagnie) + (e.langue === 'en' ? ' · en anglais' : '') }),
        h('dt', 'Entrée en poste'), h('dd', { text: e.debut ? dateCourte(e.debut) : '—' }),
        h('dt', 'Préparé par'), h('dd', { text: (e.creeParNom || e.creePar) + ' le ' + dateHeure(e.creeLe) + (e.trousse ? ' · trousse ' + (((self.rep.trousses || []).filter(function (t) { return t.id === e.trousse; })[0] || {}).nom || e.trousse) : '') }),
        h('dt', 'Lien'), h('dd', [e.etat === 'retire' ? 'retiré' : 'valide jusqu\'au ' + dateCourte(e.expireLe) + ' ',
          h('button.btn.petit', { type: 'button', text: 'Copier le lien', onclick: function () { AMX.copier(e.lien, 'Lien copié'); } }), ' ',
          h('button.btn.petit', { type: 'button', text: 'Aperçu de la page', onclick: function () { window.open(e.lien + '&apercu=1', '_blank', 'noopener'); } })]),
        e.message ? h('dt', 'Message') : null, e.message ? h('dd', { text: e.message, style: { whiteSpace: 'pre-wrap' } }) : null
      ]));
      corps.appendChild(h('div.rhx-h', { text: 'Documents à signer (' + (e.docs || []).length + ')' }));
      if (!(e.docs || []).length) corps.appendChild(h('p.rhx-prog', { text: 'Aucun document à signer : seulement des pièces à fournir.' }));
      corps.appendChild(h('ul.rhx-docs', (e.docs || []).map(function (d) {
        return h('li', [
          h('div', [h('b', { text: d.nom }), h('span.q', { text: (d.type === 'texte' ? (CATEGORIES[d.categorie] || 'Texte') + ' · ' : '') + (d.nbPages ? d.nbPages + ' page(s) · ' : '') + (d.signeLe ? 'signé le ' + dateHeure(d.signeLe) : d.ouvertLe ? 'ouvert le ' + dateHeure(d.ouvertLe) + ', pas encore signé' : 'pas encore ouvert') + (d.certificatSeul ? ' · copie : certificat seul (original joint)' : '') }),
            h('span.rhx-sha', { text: 'SHA-256 de l\'original : ' + (d.sha || '—') }), d.signeSha ? h('span.rhx-sha', { text: 'SHA-256 de la copie signée : ' + d.signeSha }) : null]),
          h('div.a', [
            d.copie ? h('button.btn.petit.primaire', { type: 'button', text: 'Copie signée', onclick: function () { ouvrirFichier({ rhFichier: 1, id: e.id, f: 'S:' + d.id }, d.nom + ' — signé'); } }) : null,
            h('button.btn.petit', { type: 'button', text: d.type === 'texte' ? 'Texte envoyé' : 'Original', onclick: function () { ouvrirFichier({ rhFichier: 1, id: e.id, f: 'O:' + d.id }, d.nom); } })
          ])
        ]);
      })));
      if ((e.pieces || []).length) {
        corps.appendChild(h('div.rhx-h', { text: 'Pièces à fournir (' + e.pieces.length + ')' }));
        corps.appendChild(h('ul.rhx-docs', e.pieces.map(function (p) {
          return h('li', [
            h('div', [h('b', { text: p.libelle + (p.obligatoire ? '' : ' (facultative)') }), h('span.q', { text: (p.note ? p.note + ' · ' : '') + (p.formulaireNom ? 'formulaire vierge : ' + p.formulaireNom + ' · ' : '') + ((p.fichiers || []).length ? (p.fichiers || []).length + ' fichier(s) reçu(s)' : 'rien reçu') })]),
            h('div.a', (p.fichiers || []).map(function (f) { return h('button.btn.petit', { type: 'button', text: f.nom, onclick: function () { ouvrirFichier({ rhFichier: 1, id: e.id, f: 'P:' + p.id + ':' + f.id }, f.nom); } }); }))
          ]);
        })));
      }
      if (e.signature) corps.appendChild(h('p.rhx-prog', { text: 'Signature tracée par « ' + e.signature.nom + ' » le ' + dateHeure(e.signature.le) + ' · appareil : ' + String(e.signature.agent || '').slice(0, 120) }));
      corps.appendChild(h('details', [h('summary', { text: 'Journal (' + (e.journal || []).length + ')' }), h('ul.rhx-journal', (e.journal || []).slice().reverse().map(function (j) { return h('li', { text: dateHeure(j.le) + ' — ' + (j.qui ? j.qui + ' : ' : '') + j.quoi }); }))]));
      var boutons = [{ texte: 'Fermer' }];
      if (e.etat === 'envoye' || e.etat === 'ouvert' || e.etat === 'expire') {
        boutons.unshift({ texte: 'Retirer', classe: 'danger', action: function () { self.retirer(e, m); return false; } });
        boutons.unshift({ texte: 'Prolonger 14 jours', action: function () { return ecrire({ action: 'rhProlonger', id: e.id, jours: 14 }).then(function (d) { poserEnvoi(d.envoi); dessiner(); AMX.toast('Lien prolongé jusqu\'au ' + dateCourte(d.envoi.expireLe), 'ok'); return false; }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); return false; }); } });
        boutons.unshift({ texte: 'Renvoyer le lien', classe: 'primaire', action: function () { self.rappeler(e, dessiner); return false; } });
      }
      if (e.etat === 'signe' || e.etat === 'transmis') boutons.unshift({ texte: 'Renvoyer à la paie', action: function () {
        return AMX.confirmer('Renvoyer à la paie', 'Le dossier de ' + e.nom + ' (copies signées et pièces) repart à ' + ((self.rep.reglages || {}).paie || []).join(', ') + '.', { ok: 'Renvoyer' }).then(function (oui) {
          if (!oui) return false;
          return ecrire({ action: 'rhTransmettre', id: e.id }, { delai: 300000 }).then(function (d) { if (d.envoi) poserEnvoi(d.envoi); dessiner(); AMX.toast(d.partiel ? 'Copies en préparation : le dossier partira dans la minute' : 'Dossier renvoyé à la paie', 'ok'); return false; }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); return false; });
        });
      } });
      if (m) m.boutons(boutons);
      return boutons;
    };
    m = AMX.modale({ titre: e.nom + ' — ' + e.id, corps: corps, large: true, boutons: [{ texte: 'Fermer' }], proteger: false, sansFocus: true });
    dessiner();
  };
  VueRh.prototype.rappeler = function (e, apres) {
    var self = this, caseTexto = h('input', { type: 'checkbox', checked: !!e.telephone, disabled: !e.telephone });
    var corps = h('div', [
      h('p', { text: 'Le lien repart par courriel à ' + e.courriel + '.' + (e.etat === 'expire' || (e.expireLe && e.expireLe <= new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)) ? ' Il sera prolongé de 14 jours.' : '') }),
      h('label.rhx-cases', [caseTexto, e.telephone ? 'Aussi par texto au ' + e.telephone.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2-$3') : 'Pas de cellulaire : courriel seulement'])
    ]);
    AMX.modale({ titre: 'Renvoyer le lien à ' + e.nom, corps: corps, proteger: false, boutons: [{ texte: 'Annuler' }, { texte: 'Renvoyer', classe: 'primaire', action: function () {
      return ecrire({ action: 'rhRappeler', id: e.id, texto: !!caseTexto.checked }).then(function (d) {
        poserEnvoi(d.envoi); if (apres) apres();
        AMX.toast('Lien renvoyé' + (d.textoEnvoye ? ' (courriel et texto)' : '') + (d.prolonge ? ', prolongé de 14 jours' : ''), d.avertissement ? 'attention' : 'ok');
        if (d.avertissement) AMX.toast(d.avertissement, 'attention', 8000);
      }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); return false; });
    } }] });
  };
  VueRh.prototype.retirer = function (e, fiche) {
    var raison = h('input.saisie', { type: 'text', placeholder: 'Raison (facultatif) : embauche annulée, mauvais courriel…' });
    AMX.modale({ titre: 'Retirer l\'envoi de ' + e.nom, corps: h('div', [h('p', { text: 'Le lien ne s\'ouvrira plus. Rien n\'est effacé : l\'envoi reste dans l\'onglet « Retirés ».' }), raison]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Retirer', classe: 'danger', action: function () {
        return ecrire({ action: 'rhRetirer', id: e.id, raison: raison.value }).then(function (d) { poserEnvoi(d.envoi); if (fiche) fiche.fermer(); AMX.toast('Envoi retiré', 'ok'); }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); return false; });
      } }] });
  };

  /* ------------------------------------------------------------------------------- nouvel envoi */
  VueRh.prototype.codesCies = function () { var c = AMX.codesPour ? AMX.codesPour('inventaire') : Object.keys(AMX.COMPAGNIES_TOUTES || {}); return c.length ? c : Object.keys(AMX.COMPAGNIES_TOUTES || {}); };
  VueRh.prototype.nouvelEnvoi = function (opts) {
    var self = this; opts = opts || {};
    if (!this.rep) { AMX.toast('Patientez : la liste se charge.', 'attention'); return; }
    var codes = this.codesCies();
    var cie = this.compagnie && codes.indexOf(this.compagnie) >= 0 ? this.compagnie : (codes.length === 1 ? codes[0] : '');
    var champ = function (libelle, el, aide) { return h('div.champ', [h('label', { text: libelle }), el, aide ? h('span.aide', { text: aide }) : null]); };
    var inNom = h('input', { type: 'text', autocomplete: 'off', placeholder: 'Prénom Nom' });
    var inCourriel = h('input', { type: 'email', autocomplete: 'off', placeholder: 'nom@exemple.com' });
    var inTel = h('input', { type: 'tel', autocomplete: 'off', placeholder: '514 555-0101' });
    var inPoste = h('input', { type: 'text', autocomplete: 'off', placeholder: 'Conseiller aux ventes' });
    var inDebut = h('input', { type: 'date' });
    var selCie = h('select', [h('option', { value: '', text: 'Choisir…' })].concat(codes.map(function (c) { return h('option', { value: c, text: nomCie(c), selected: c === cie }); })));
    var selLangue = h('select', [h('option', { value: 'fr', text: 'Français' }), h('option', { value: 'en', text: 'English' })]);
    var choisis = {}, pieces = [], champsVals = {}, textesRevus = {};
    var listeDocs = h('ul.rhx-choix'), listePieces = h('div'), listeChamps = h('div'), prog = h('p.rhx-prog');
    var docsPour = function (type) { var c = selCie.value; return self.rep.documents.filter(function (d) { return !d.retire && d.type === type && (!d.compagnie || d.compagnie === c) && (d.bibliotheque || choisis[d.id]); }); };
    /* Les documents à lire et à signer : les politiques et lettres en texte d'abord, puis les PDF. */
    var docsSigner = function () { return docsPour('texte').sort(function (a, b) { return String(b.categorie === 'lettre').localeCompare(String(a.categorie === 'lettre')) || a.nom.localeCompare(b.nom, 'fr'); }).concat(docsPour('signer')); };
    var textesChoisis = function () { return docsPour('texte').filter(function (d) { return choisis[d.id]; }); };
    /* Les valeurs que l'envoi donnera aux champs {{…}} (comme le serveur). */
    var valeursEnvoi = function () {
      var en = selLangue.value === 'en', nom = inNom.value.trim();
      var v = { nom: nom, prenom: nom.split(/\s+/)[0] || '', poste: inPoste.value.trim(), debut: dateLongue(inDebut.value, en), concession: selCie.value ? nomCie(selCie.value) : '',
        date: dateLongue(new Date().toISOString().slice(0, 10), en), rh: (AMX.session && (AMX.session.nom || (AMX.session.perms || {}).nom)) || '' };
      Object.keys(champsVals).forEach(function (k) { if (String(champsVals[k] || '').trim()) v[k] = champsVals[k].trim(); });
      return v;
    };
    var dessinerChamps = function () {
      AMX.vider(listeChamps);
      var noms = [];
      textesChoisis().forEach(function (d) { (d.variables || []).forEach(function (n) { if (!CHAMPS_AUTO[n] && noms.indexOf(n) < 0) noms.push(n); }); });
      if (!noms.length) return;
      listeChamps.appendChild(h('div.rhx-h', { text: 'À remplir dans les lettres' }));
      listeChamps.appendChild(h('div.grille', noms.map(function (n) {
        var inp = h('input', { type: 'text', value: champsVals[n] || '', placeholder: n === 'remuneration' ? 'Ex. 22,50 $ de l\'heure, 40 heures par semaine' : '', oninput: function () { champsVals[n] = inp.value; } });
        return champ(libChamp(n), inp);
      })));
      listeChamps.appendChild(h('p.rhx-prog', { text: 'Le nom, le poste, la date d\'entrée et la concession se remplissent tout seuls. « Revoir le texte » montre la lettre telle que l\'employé la lira et permet de compléter les passages surlignés.' }));
    };
    var revoir = function (d) {
      chargerTexte(d.id).then(function (html) {
        var ed = editeurTexte(textesRevus[d.id] || surligner(remplirTexte(html, valeursEnvoi())));
        AMX.modale({ titre: 'Revoir « ' + d.nom + ' »', large: true, corps: h('div.rhx-form', [
          h('p.rhx-prog', { text: 'Complétez les passages surlignés (« (date) », « XX$ »…). Ce texte part tel quel à l\'employé, puis dans la copie signée.' }), ed.el
        ]), boutons: [
          textesRevus[d.id] ? { texte: 'Revenir au modèle', action: function () { delete textesRevus[d.id]; dessinerDocs(); } } : null,
          { texte: 'Annuler' },
          { texte: 'Garder ce texte', classe: 'primaire', action: function () { textesRevus[d.id] = ed.valeur(); dessinerDocs(); } }
        ].filter(Boolean) });
      }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
    };
    var dessinerDocs = function () {
      AMX.vider(listeDocs);
      var l = docsSigner();
      if (!l.length) listeDocs.appendChild(h('li', [h('span', { text: 'Aucun document' + (selCie.value ? ' pour ' + nomCie(selCie.value) : '') + ' : écrivez-en un dans la « Bibliothèque » ou déposez un PDF ci-dessous.' })]));
      l.forEach(function (d) {
        var c = h('input', { type: 'checkbox', checked: !!choisis[d.id], onchange: function () { if (c.checked) choisis[d.id] = true; else { delete choisis[d.id]; delete textesRevus[d.id]; } dessinerDocs(); dessinerChamps(); } });
        var cat = d.type === 'texte' ? h('span.rhx-cat' + (d.categorie === 'lettre' ? '.lettre' : ''), { text: CATEGORIES[d.categorie] || 'Texte' }) : h('span.rhx-cat.pdf', { text: 'PDF' });
        listeDocs.appendChild(h('li', [c, h('div', { style: { flex: '1 1 auto' } }, [cat, h('b', { text: d.nom }), h('span.q', { text: [d.nbPages ? d.nbPages + ' page(s)' : '', d.compagnie ? nomCie(d.compagnie) : 'tout le groupe', d.bibliotheque ? '' : 'pour cet envoi seulement', d.description].filter(Boolean).join(' · ') })]),
          d.type === 'texte' && choisis[d.id] ? h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [textesRevus[d.id] ? h('span.rhx-revu', { text: 'Revu ✓' }) : null,
            h('button.btn.petit', { type: 'button', text: 'Revoir le texte', onclick: function () { revoir(d); } })]) : null]));
      });
    };
    var dessinerPieces = function () {
      AMX.vider(listePieces);
      var formulaires = docsPour('formulaire');
      pieces.forEach(function (p, i) {
        var lib = h('input.saisie', { type: 'text', value: p.libelle, placeholder: 'Pièce demandée', oninput: function () { p.libelle = lib.value; } });
        var note = h('input.saisie', { type: 'text', value: p.note, placeholder: 'Précision (facultatif)', oninput: function () { p.note = note.value; } });
        var sel = h('select.saisie', { onchange: function () { p.formulaire = sel.value; } }, [h('option', { value: '', text: 'Sans formulaire vierge' })].concat(formulaires.map(function (d) { return h('option', { value: d.id, text: 'Formulaire : ' + d.nom, selected: d.id === p.formulaire }); })));
        var ob = h('input', { type: 'checkbox', checked: p.obligatoire, onchange: function () { p.obligatoire = ob.checked; } });
        listePieces.appendChild(h('div.rhx-piece', [lib, note, sel, h('label.case', [ob, 'Obligatoire']), h('button.btn.petit', { type: 'button', text: 'Retirer', onclick: function () { pieces.splice(i, 1); dessinerPieces(); } })]));
      });
      if (!pieces.length) listePieces.appendChild(h('p.rhx-prog', { text: 'Aucune pièce demandée.' }));
    };
    var ajouterPiece = function (lib, note) { pieces.push({ libelle: lib || '', note: note || '', obligatoire: true, formulaire: '' }); dessinerPieces(); };
    /* Trousses par poste : un clic remplit les documents, les pièces, le message, le poste et la langue. */
    var selTrousse = h('select', { onchange: function () { appliquerTrousse(selTrousse.value); } });
    var zoneTrousse = h('div.rhx-trousse');
    var trousses = function () { var c = selCie.value; return (self.rep.trousses || []).filter(function (t) { return !t.retire && (!t.compagnie || !c || t.compagnie === c); }); };
    var dessinerTrousses = function () {
      var l = trousses(), garde = selTrousse.value;
      AMX.vider(selTrousse);
      selTrousse.appendChild(h('option', { value: '', text: l.length ? 'Choisir une trousse…' : 'Aucune trousse' + (selCie.value ? ' pour ' + nomCie(selCie.value) : '') }));
      l.forEach(function (t) { selTrousse.appendChild(h('option', { value: t.id, text: t.nom + (t.compagnie ? '' : ' (tout le groupe)'), selected: t.id === garde })); });
      selTrousse.disabled = !l.length;
    };
    var appliquerTrousse = function (id) {
      var t = (self.rep.trousses || []).filter(function (x) { return x.id === id; })[0]; if (!t) return;
      if (t.compagnie && !selCie.value) { selCie.value = t.compagnie; }
      choisis = {}; textesRevus = {};
      (t.documents || []).forEach(function (d) { choisis[d] = true; });
      pieces = (t.pieces || []).map(function (p) { return { libelle: p.libelle, note: p.note || '', obligatoire: p.obligatoire !== false, formulaire: p.formulaire || '' }; });
      if (t.poste && !inPoste.value.trim()) inPoste.value = t.poste;
      if (t.message && !inMessage.value.trim()) inMessage.value = t.message;
      selLangue.value = t.langue === 'en' ? 'en' : 'fr';
      dessinerTrousses(); selTrousse.value = t.id; dessinerDocs(); dessinerPieces(); dessinerChamps();
    };
    var enregistrerTrousse = function () {
      var docs = Object.keys(choisis).filter(function (id) { return docsSigner().some(function (d) { return d.id === id; }); });
      var ps = pieces.filter(function (p) { return String(p.libelle || '').trim(); });
      if (!docs.length && !ps.length) { AMX.toast('Cochez des documents ou demandez des pièces d\'abord.', 'attention'); return; }
      var base = (self.rep.trousses || []).filter(function (x) { return x.id === selTrousse.value; })[0];
      var inT = h('input.saisie', { type: 'text', value: base ? base.nom : (inPoste.value.trim() ? inPoste.value.trim() + (selCie.value ? ' — ' + nomCie(selCie.value) : '') : ''), placeholder: 'Ex. Conseiller aux ventes — VW Brossard' });
      var remplacer = h('input', { type: 'checkbox', checked: !!base });
      AMX.modale({ titre: 'Enregistrer comme trousse', corps: h('div.rhx-form', [
        h('div.champ', [h('label', { text: 'Nom de la trousse' }), inT]),
        base ? h('label.rhx-cases', { style: { marginTop: '8px' } }, [remplacer, 'Remplacer la trousse « ' + base.nom + ' »']) : null,
        h('p.rhx-prog', { text: docs.length + ' document(s), ' + ps.length + ' pièce(s), le message et le poste. ' + (selCie.value ? 'Pour ' + nomCie(selCie.value) + '.' : 'Pour tout le groupe.') })
      ]), boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
        return ecrire({ action: 'rhTrousseEnregistrer', id: base && remplacer.checked ? base.id : '', nom: inT.value, compagnie: selCie.value, poste: inPoste.value, documents: docs, pieces: ps, message: inMessage.value, langue: selLangue.value })
          .then(function (r) { poserTrousse(r.trousse); dessinerTrousses(); selTrousse.value = r.trousse.id; AMX.toast('Trousse « ' + r.trousse.nom + ' » enregistrée', 'ok'); }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); return false; });
      } }] });
    };
    zoneTrousse.appendChild(h('b', { text: 'Trousse' }));
    zoneTrousse.appendChild(selTrousse);
    zoneTrousse.appendChild(h('button.btn.petit', { type: 'button', text: 'Enregistrer comme trousse', onclick: enregistrerTrousse }));
    selCie.addEventListener('change', function () { dessinerTrousses(); dessinerDocs(); dessinerPieces(); dessinerChamps(); });
    /* dépôt d'un document pour cet employé */
    var inFichier = h('input', { type: 'file', accept: 'application/pdf,image/jpeg,image/png', style: { display: 'none' } });
    var garder = h('input', { type: 'checkbox' });
    inFichier.addEventListener('change', function () {
      var f = inFichier.files && inFichier.files[0]; inFichier.value = '';
      if (!f) return;
      if (!selCie.value) { AMX.toast('Choisissez d\'abord la concession.', 'attention'); return; }
      var nom = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
      prog.textContent = 'Lecture de « ' + f.name + ' »…';
      deposer(f, { nom: nom, type: 'signer', compagnie: selCie.value, bibliotheque: !!garder.checked }, function (t) { prog.textContent = t; }).then(function (d) {
        choisis[d.id] = true; prog.textContent = '« ' + d.nom + ' » ajouté (' + d.nbPages + ' page(s)).'; dessinerDocs();
      }, function (e) { prog.textContent = ''; AMX.toast(AMX.erreurTexte(e), 'erreur', 8000); });
    });
    var inMessage = h('textarea', { rows: 3, placeholder: 'Bienvenue dans l\'équipe ! Voici vos documents d\'embauche…' });
    var caseTexto = h('input', { type: 'checkbox' });
    var majTexto = function () { var ok = /\d{3}\D*\d{3}\D*\d{4}/.test(inTel.value); caseTexto.disabled = !ok; if (!ok) caseTexto.checked = false; };
    inTel.addEventListener('input', majTexto); majTexto();
    var corps = h('div.rhx-form', [
      zoneTrousse,
      h('div.rhx-h', { text: 'L\'employé' }),
      h('div.grille', [champ('Nom complet', inNom), champ('Courriel', inCourriel, 'Le lien part à cette adresse.'), champ('Cellulaire (facultatif)', inTel), champ('Poste', inPoste), champ('Entrée en poste', inDebut), champ('Concession', selCie), champ('Langue de la page', selLangue)]),
      h('div.rhx-h', { text: 'Documents à lire et à signer' }), listeDocs, listeChamps,
      h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', margin: '8px 0 0' } }, [
        h('button.btn.petit', { type: 'button', text: '+ Déposer un document (PDF)', onclick: function () { inFichier.click(); } }), inFichier,
        h('label.rhx-cases', [garder, 'Le garder dans les documents types'])]),
      prog,
      h('div.rhx-h', { text: 'Pièces à fournir par l\'employé' }),
      h('div.rhx-prereglages', PREREGLAGES.map(function (x) { return h('button', { type: 'button', text: '+ ' + x[0], onclick: function () { ajouterPiece(x[0], x[1]); } }); }).concat([h('button', { type: 'button', text: '+ Autre pièce', onclick: function () { ajouterPiece('', ''); } })])),
      listePieces,
      h('p.rhx-prog', { text: 'Un formulaire rempli (TD1, TP-1015.3) contient le NAS : il reste seulement dans le dossier Drive privé et dans le courriel à la paie, jamais dans une feuille (Loi 25).' }),
      h('div.rhx-h', { text: 'Message à l\'employé (facultatif)' }), h('div.champ', [inMessage]),
      h('div.rhx-h', { text: 'Envoyer le lien' }),
      h('div.rhx-cases', [h('label', [h('input', { type: 'checkbox', checked: true, disabled: true }), 'Par courriel']), h('label', [caseTexto, 'Aussi par texto'])]),
      h('p.rhx-prog', { text: 'Le lien est bon 14 jours. Quand tout est signé, le dossier part tout seul à ' + ((self.rep.reglages || {}).paie || ['paie@groupeautomax.com']).join(', ') + '.' })
    ]);
    /* 7 nov. : une fiche « Conditions d'embauche » remplie par le DG remplit l'envoi (employé, lettre revue, champs). */
    var eb = opts.embauche || null;
    if (eb) {
      inNom.value = eb.nom || ''; inCourriel.value = eb.courriel || ''; inTel.value = eb.telephone || ''; inPoste.value = eb.poste || ''; inDebut.value = eb.debut || '';
      if (eb.compagnie && codes.indexOf(eb.compagnie) >= 0) selCie.value = eb.compagnie;
      selLangue.value = eb.langue === 'en' ? 'en' : 'fr';
      Object.keys(eb.champs || {}).forEach(function (k) { champsVals[k] = eb.champs[k]; });
      majTexto();
    }
    dessinerTrousses(); dessinerDocs(); dessinerPieces(); dessinerChamps();
    if (opts.trousse || (eb && eb.trousse)) appliquerTrousse(opts.trousse || eb.trousse);
    if (eb && eb.modeleId) { choisis[eb.modeleId] = true; if (eb.texte) textesRevus[eb.modeleId] = remplirTexte(eb.texte, valeursEnvoi()); dessinerDocs(); dessinerChamps(); }
    AMX.modale({ titre: eb ? 'Nouvel envoi — conditions d\'embauche ' + eb.id : 'Nouvel envoi à un employé', corps: corps, large: true, boutons: [{ texte: 'Annuler' }, { texte: 'Envoyer le lien', classe: 'primaire', action: function () {
      var docs = Object.keys(choisis).filter(function (id) { return docsSigner().some(function (d) { return d.id === id; }); });
      var revus = {}; docs.forEach(function (id) { if (textesRevus[id]) revus[id] = textesRevus[id]; });
      var aCompleter = Object.keys(revus).filter(function (id) { return resteACompleter(revus[id]); });
      if (aCompleter.length) { AMX.toast('Il reste un champ {{…}} ou « XX$ » à compléter dans un texte revu.', 'attention', 6000); return false; }
      var ps = pieces.filter(function (p) { return String(p.libelle || '').trim(); });
      if (!selCie.value) { AMX.toast('Choisissez la concession.', 'attention'); return false; }
      if (!docs.length && !ps.length) { AMX.toast('Cochez au moins un document ou demandez une pièce.', 'attention'); return false; }
      /* Une lettre de HR4 garde des passages à compléter (« (date) », « XX$ ») : elle se revoit avant l'envoi. */
      var aRevoir = docs.map(function (id) { return docsSigner().filter(function (d) { return d.id === id; })[0]; }).filter(function (d) { return d && d.type === 'texte' && !revus[d.id]; });
      return Promise.all(aRevoir.map(function (d) { return chargerTexte(d.id).then(function (html) { return { d: d, reste: PASSAGES_A_COMPLETER.test(String(html).replace(/<[^>]+>/g, ' ')) }; }); })).then(function (l) {
        var reste = l.filter(function (x) { return x.reste; });
        if (reste.length) { AMX.toast('« Revoir le texte » de « ' + reste[0].d.nom + ' » : des passages sont à compléter (surlignés).', 'attention', 8000); return false; }
        return ecrire({ action: 'rhEnvoyer', compagnie: selCie.value, langue: selLangue.value, employe: { nom: inNom.value, courriel: inCourriel.value, telephone: inTel.value, poste: inPoste.value, debut: inDebut.value },
          documents: docs, pieces: ps, message: inMessage.value, texto: !!caseTexto.checked, champs: champsVals, textes: revus, trousse: selTrousse.value }).then(function (d) {
          poserEnvoi(d.envoi); self.vue = 'encours'; self.rendre();
          if (eb && eb.id) ecrire({ action: 'rhEmbaucheAction', id: eb.id, op: 'traitee', envoiId: d.envoi.id }).then(function () { try { document.dispatchEvent(new CustomEvent('amx:embauches')); } catch (e2) {} }, function (e3) { AMX.toast('Envoi fait, mais la fiche ' + eb.id + ' n\'a pas été marquée traitée : ' + AMX.erreurTexte(e3), 'attention', 8000); });
          AMX.toast('Lien envoyé à ' + d.envoi.nom + (d.textoEnvoye ? ' (courriel et texto)' : ''), d.avertissement ? 'attention' : 'ok');
          if (d.avertissement) AMX.toast(d.avertissement, 'attention', 8000);
          setTimeout(function () { self.ouvrirFiche(d.envoi.id); }, 50);
        });
      }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur', 8000); return false; });
    } }] });
  };

  /* ------------------------------------------------------------------------------- bibliothèque : trousses, textes, PDF, formulaires */
  VueRh.prototype.documentsTypes = function () {
    var self = this;
    if (!this.rep) return;
    var corps = h('div'), voirRetires = false, m;
    var codes = this.codesCies();
    var ligneDoc = function (d) {
      var cat = d.type === 'texte' ? h('span.rhx-cat' + (d.categorie === 'lettre' ? '.lettre' : ''), { text: CATEGORIES[d.categorie] || 'Texte' }) : h('span.rhx-cat.pdf', { text: d.type === 'formulaire' ? 'Formulaire' : 'PDF' });
      var champs = (d.variables || []).filter(function (n) { return !CHAMPS_AUTO[n]; });
      return h('li', [
        h('div', [cat, h('b', { text: d.nom + (d.retire ? ' (retiré)' : '') }), h('span.q', { text: [d.nbPages ? d.nbPages + ' page(s)' : '', d.compagnie ? nomCie(d.compagnie) : 'tout le groupe',
          champs.length ? 'à remplir à l\'envoi : ' + champs.map(libChamp).join(', ') : '', 'ajouté le ' + dateCourte(d.creeLe) + (d.creeParNom ? ' par ' + d.creeParNom : ''), d.description].filter(Boolean).join(' · ') })]),
        h('div.a', [
          h('button.btn.petit', { type: 'button', text: d.type === 'formulaire' ? 'Ouvrir' : 'Voir', onclick: function () { if (d.type === 'formulaire') ouvrirFichier({ rhDocument: 1, id: d.id, quoi: 'original' }, d.nom); else self.apercu(d, dessiner); } }),
          h('button.btn.petit' + (d.retire ? '' : '.danger'), { type: 'button', text: d.retire ? 'Remettre' : 'Retirer', onclick: function () {
            ecrire({ action: 'rhDocumentModifier', id: d.id, retirer: !d.retire }).then(function (r) { poserDocument(r.document); dessiner(); }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); });
          } })
        ])
      ]);
    };
    var dessiner = function () {
      AMX.vider(corps);
      /* trousses */
      var tr = (self.rep.trousses || []).filter(function (t) { return voirRetires || !t.retire; });
      corps.appendChild(h('div.rhx-h', { text: 'Trousses par poste (' + tr.length + ')' }));
      corps.appendChild(h('p.rhx-prog', { text: 'Une trousse = les documents, les pièces et le message d\'un poste, envoyés en un clic. Elle s\'enregistre depuis « Nouvel envoi » (« Enregistrer comme trousse »).' }));
      if (tr.length) corps.appendChild(h('ul.rhx-docs', tr.map(function (t) {
        var noms = (t.documents || []).map(function (id) { var d = self.rep.documents.filter(function (x) { return x.id === id; })[0]; return d ? d.nom : id; });
        return h('li', [
          h('div', [h('b', { text: t.nom + (t.retire ? ' (retirée)' : '') }), h('span.q', { text: [t.compagnie ? nomCie(t.compagnie) : 'tout le groupe', t.poste, noms.join(', '), (t.pieces || []).length ? (t.pieces || []).map(function (p) { return p.libelle; }).join(', ') : ''].filter(Boolean).join(' · ') })]),
          h('div.a', [
            t.retire ? null : h('button.btn.petit.primaire', { type: 'button', text: 'Envoyer', onclick: function () { if (m) m.fermer(); self.nouvelEnvoi({ trousse: t.id }); } }),
            h('button.btn.petit' + (t.retire ? '' : '.danger'), { type: 'button', text: t.retire ? 'Remettre' : 'Retirer', onclick: function () {
              ecrire({ action: 'rhTrousseRetirer', id: t.id, retirer: !t.retire }).then(function (r) { poserTrousse(r.trousse); dessiner(); }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); });
            } })
          ])
        ]);
      })));
      var l = self.rep.documents.filter(function (d) { return d.bibliotheque && (voirRetires || !d.retire); });
      [['texte', 'Politiques et lettres (texte)'], ['signer', 'PDF à lire et à signer'], ['formulaire', 'Formulaires vierges (l\'employé les remplit et les renvoie)']].forEach(function (t) {
        var x = l.filter(function (d) { return d.type === t[0]; }).sort(function (a, b) { return String(a.categorie || '').localeCompare(String(b.categorie || '')) || a.nom.localeCompare(b.nom, 'fr'); });
        corps.appendChild(h('div.rhx-h', { text: t[1] + ' (' + x.length + ')' }));
        if (!x.length) { corps.appendChild(h('p.rhx-prog', { text: t[0] === 'texte' ? 'Aucun : écrivez-en un ou importez les modèles de HR4 ci-dessous.' : 'Aucun.' })); return; }
        corps.appendChild(h('ul.rhx-docs', x.map(ligneDoc)));
      });
      corps.appendChild(h('label.rhx-cases', { style: { marginTop: '8px' } }, [h('input', { type: 'checkbox', checked: voirRetires, onchange: function (ev) { voirRetires = ev.target.checked; dessiner(); } }), 'Voir les documents et trousses retirés']));
      /* écrire un texte */
      corps.appendChild(h('div.rhx-h', { text: 'Écrire une politique ou une lettre' }));
      corps.appendChild(h('div', [h('button.btn', { type: 'button', text: 'Écrire un document', onclick: function () { self.editerTexte(null, dessiner); } }),
        h('span.rhx-prog', { text: '  Les champs {{nom}}, {{poste}}, {{debut}}… se remplissent à l\'envoi ; {{remuneration}} et les autres se tapent dans l\'envoi.' })]));
      /* importer de HR4 */
      var inJson = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
      var progH = h('p.rhx-prog');
      inJson.addEventListener('change', function () {
        var f = inJson.files && inJson.files[0]; inJson.value = '';
        if (!f) return;
        f.text().then(function (t) {
          var liste = modelesHr4(JSON.parse(t));
          if (!liste.length) throw new Error('Aucun modèle dans ce fichier.');
          return AMX.confirmer('Importer de HR4', liste.length + ' document(s) : ' + liste.filter(function (x) { return x.categorie === 'politique'; }).length + ' politique(s), '
            + liste.filter(function (x) { return x.categorie === 'lettre'; }).length + ' lettre(s). Ils iront dans la bibliothèque pour tout le groupe ; un document déjà importé n\'est pas doublé.', { ok: 'Importer' }).then(function (oui) {
            if (!oui) return;
            var faits = 0, deja = 0, i = 0;
            var suivant = function () {
              if (i >= liste.length) { progH.textContent = faits + ' importé(s), ' + deja + ' déjà là.'; AMX.toast('Modèles de HR4 importés', 'ok'); dessiner(); return; }
              var x = liste[i++]; progH.textContent = 'Import ' + i + ' / ' + liste.length + ' : ' + x.nom + '…';
              return ecrire({ action: 'rhDocumentAjouter', type: 'texte', importe: 'hr4', nom: x.nom, categorie: x.categorie, html: x.html, compagnie: '', bibliotheque: true }).then(function (r) {
                poserDocument(r.document); if (r.deja) deja++; else faits++; return suivant();
              });
            };
            return suivant();
          });
        }).catch(function (e) { progH.textContent = ''; AMX.toast(AMX.erreurTexte(e), 'erreur', 8000); dessiner(); });
      });
      corps.appendChild(h('div.rhx-h', { text: 'Importer de HR4' }));
      corps.appendChild(h('div', [h('button.btn', { type: 'button', text: 'Importer les modèles (fichier JSON)', onclick: function () { inJson.click(); } }), inJson,
        h('span.rhx-prog', { text: '  Les politiques du Manuel de l\'employé et les lettres d\'offre lues dans HR4 (fichier hr4-modeles.json).' })]));
      corps.appendChild(progH);
      /* ajout d'un PDF */
      var inNom = h('input', { type: 'text', placeholder: 'Ex. Contrat d\'embauche' });
      var inDesc = h('input', { type: 'text', placeholder: 'Facultatif' });
      var selType = h('select', [h('option', { value: 'signer', text: 'À lire et à signer' }), h('option', { value: 'formulaire', text: 'Formulaire vierge à remplir (TD1…)' })]);
      var selCie = h('select', [h('option', { value: '', text: 'Tout le groupe' })].concat(codes.map(function (c) { return h('option', { value: c, text: nomCie(c) }); })));
      var inF = h('input', { type: 'file', accept: 'application/pdf,image/jpeg,image/png' });
      var prog = h('p.rhx-prog');
      var btn = h('button.btn.primaire', { type: 'button', text: 'Ajouter le document', onclick: function () {
        var f = inF.files && inF.files[0];
        if (!f) { AMX.toast('Choisissez un fichier PDF.', 'attention'); return; }
        var nom = inNom.value.trim() || f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
        btn.disabled = true;
        deposer(f, { nom: nom, description: inDesc.value, type: selType.value, compagnie: selCie.value, bibliotheque: true }, function (t) { prog.textContent = t; }).then(function (d) {
          btn.disabled = false; AMX.toast('« ' + d.nom + ' » ajouté', 'ok'); dessiner();
        }, function (e) { btn.disabled = false; prog.textContent = ''; AMX.toast(AMX.erreurTexte(e), 'erreur', 8000); });
      } });
      corps.appendChild(h('div.rhx-h', { text: 'Ajouter un PDF' }));
      corps.appendChild(h('div.rhx-form', [h('div.grille', [
        h('div.champ', [h('label', { text: 'Nom' }), inNom]), h('div.champ', [h('label', { text: 'Description' }), inDesc]),
        h('div.champ', [h('label', { text: 'Type' }), selType]), h('div.champ', [h('label', { text: 'Pour' }), selCie]),
        h('div.champ', [h('label', { text: 'Fichier (PDF, 10 Mo au plus)' }), inF])
      ]), h('div', { style: { marginTop: '10px' } }, [btn]), prog]));
    };
    dessiner();
    m = AMX.modale({ titre: 'Bibliothèque des ressources humaines', corps: corps, large: true, proteger: false, sansFocus: true, boutons: [{ texte: 'Fermer' }] });
  };
  /** Écrire ou modifier un document en texte. d = null pour un nouveau. */
  VueRh.prototype.editerTexte = function (d, apres) {
    var self = this, codes = this.codesCies();
    var inNom = h('input', { type: 'text', value: d ? d.nom : '', placeholder: 'Ex. Code vestimentaire, Lettre d\'offre — poste horaire' });
    var selCat = h('select', Object.keys(CATEGORIES).map(function (k) { return h('option', { value: k, text: CATEGORIES[k], selected: d ? d.categorie === k : k === 'politique' }); }));
    var selCie = h('select', { disabled: !!d }, [h('option', { value: '', text: 'Tout le groupe' })].concat(codes.map(function (c) { return h('option', { value: c, text: nomCie(c), selected: d && d.compagnie === c }); })));
    var zoneEd = h('div', [AMX.chargeur('Texte', { compact: true })]), ed = null;
    var monter = function (html) { AMX.vider(zoneEd); ed = editeurTexte(html, { contexte: function () { return { nom: inNom.value, categorie: selCat.value }; } }); zoneEd.appendChild(ed.el); };
    if (d) chargerTexte(d.id).then(monter, function (e) { AMX.vider(zoneEd); zoneEd.appendChild(h('div.rhx-erreur', { text: AMX.erreurTexte(e) })); });
    else monter('<h2>Objet</h2><p></p>');
    AMX.modale({ titre: d ? 'Modifier « ' + d.nom + ' »' : 'Écrire un document', large: true, corps: h('div.rhx-form', [
      h('div.grille', [h('div.champ', [h('label', { text: 'Nom' }), inNom]), h('div.champ', [h('label', { text: 'Sorte' }), selCat]), h('div.champ', [h('label', { text: 'Pour' }), selCie])]),
      h('div.rhx-h', { text: 'Texte' }), zoneEd,
      h('p.rhx-prog', { text: d ? 'Les envois déjà partis gardent leur propre copie : la modification vaut pour les prochains envois.' : 'Le texte est montré à l\'employé tel quel, puis reproduit dans la copie signée.' })
    ]), boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      if (!ed) return false;
      var corps = d ? { action: 'rhDocumentModifier', id: d.id, nom: inNom.value, categorie: selCat.value, html: ed.valeur() }
        : { action: 'rhDocumentAjouter', type: 'texte', nom: inNom.value, categorie: selCat.value, compagnie: selCie.value, html: ed.valeur(), bibliotheque: true };
      return ecrire(corps).then(function (r) { poserDocument(r.document); AMX.toast('« ' + r.document.nom + ' » enregistré', 'ok'); if (apres) apres(); }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur', 8000); return false; });
    } }] });
  };
  VueRh.prototype.apercu = function (d, apres) {
    var self = this;
    if (d.type === 'texte') {
      var zone = h('div.rhx-texte', [AMX.chargeur('Texte', { compact: true })]);
      var mt = AMX.modale({ titre: d.nom, corps: zone, large: true, proteger: false, boutons: [{ texte: 'Modifier', action: function () { mt.fermer(); self.editerTexte(d, apres); return false; } }, { texte: 'Fermer' }] });
      chargerTexte(d.id).then(function (html) { zone.innerHTML = surligner(html); }, function (e) { AMX.vider(zone); zone.appendChild(h('div.rhx-erreur', { text: AMX.erreurTexte(e) })); });
      return;
    }
    var corps = h('div.rhx-apercu', [AMX.chargeur('Pages', { compact: true })]);
    AMX.modale({ titre: d.nom, corps: corps, large: true, proteger: false, boutons: [{ texte: 'Original (PDF)', action: function () { ouvrirFichier({ rhDocument: 1, id: d.id, quoi: 'original' }, d.nom); return false; } }, { texte: 'Fermer' }] });
    AMX.get({ rhDocument: 1, id: d.id, quoi: 'pages' }, { secours: false, delai: 90000 }).then(function (r) {
      AMX.vider(corps);
      if (!r || r.ok === false) throw new Error((r && r.erreur) || 'Pages indisponibles.');
      r.pages.forEach(function (src) { corps.appendChild(h('img', { src: src, alt: '' })); });
    }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('div.rhx-erreur', { text: AMX.erreurTexte(e) })); });
  };

  /* ------------------------------------------------------------------------------- réglages (propriétaire) */
  VueRh.prototype.reglages = function () {
    var self = this, r = (this.rep && this.rep.reglages) || {};
    var inPaie = h('input.saisie', { type: 'text', value: (r.paie || ['paie@groupeautomax.com']).join(', ') });
    var copie = h('input', { type: 'checkbox', checked: r.copieRh !== false });
    var rj = r.rappelJours === undefined ? 3 : r.rappelJours;
    var selRappel = h('select.saisie', [[0, 'Aucun rappel automatique'], [2, 'Après 2 jours'], [3, 'Après 3 jours'], [5, 'Après 5 jours'], [7, 'Après 7 jours']].map(function (x) { return h('option', { value: String(x[0]), text: x[1], selected: Number(rj) === x[0] }); }));
    AMX.modale({ titre: 'Réglages — ressources humaines', corps: h('div.rhx-form', [
      h('div.champ', [h('label', { text: 'Le dossier signé part à' }), inPaie, h('span.aide', { text: 'Jusqu\'à trois adresses, séparées par des virgules. Envoi automatique dès que l\'employé a tout signé (autorisé par Maxime le 7 nov.).' })]),
      h('label.rhx-cases', { style: { marginTop: '10px' } }, [copie, 'Copie à la personne qui a fait l\'envoi']),
      h('div.champ', { style: { marginTop: '12px' } }, [h('label', { text: 'Rappel automatique à l\'employé' }), selRappel, h('span.aide', { text: 'Un seul courriel de rappel quand l\'employé n\'a pas signé après ce délai (de 9 h à 19 h). Jamais de texto. Autorisé par Maxime le 7 nov.' })])
    ]), boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      return ecrire({ action: 'rhReglages', paie: inPaie.value, copieRh: !!copie.checked, rappelJours: Number(selRappel.value) }).then(function (d) { self.rep.reglages = d.reglages; self.rendre(); AMX.toast('Réglages enregistrés', 'ok'); }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); return false; });
    } }] });
  };

  /* 7 nov. : pour les conditions d'embauche (embauches.js) — les mêmes outils de lettre, et « Préparer l'envoi ». */
  var vueCourante = null, envoiEnAttente = null;
  AMX.rh.outils = { remplirTexte: remplirTexte, surligner: surligner, editeurTexte: editeurTexte, resteACompleter: resteACompleter, passages: PASSAGES_A_COMPLETER,
    dateLongue: dateLongue, champsAuto: CHAMPS_AUTO, libChamp: libChamp, champsDe: champsDe };
  AMX.rh.preparerEnvoi = function (embauche) {
    if (vueCourante && !vueCourante.detruit && vueCourante.rep) { vueCourante.nouvelEnvoi({ embauche: embauche }); return; }
    envoiEnAttente = embauche;
    AMX.aller('rh', '', {});
  };
})();
