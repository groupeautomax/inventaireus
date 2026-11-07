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
    '.rhx-journal { font-size: 12px; color: var(--encre-3); } .rhx-journal li { padding: 2px 0; }'
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
  }
  function ecrire(corps, opts) {
    return AMX.post(corps, Object.assign({ delai: 120000, secours: false }, opts || {})).then(function (d) {
      if (d && d.vehicules && !d.envoi && !d.document && !d.reglages) throw new Error(SCRIPT_PAS_A_JOUR);
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
    this.btnDocs = h('button.btn', { type: 'button', text: 'Documents types', onclick: function () { self.documentsTypes(); } });
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
    this.charger(false);
  }
  VueRh.prototype.demonter = function () { this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); document.removeEventListener('amx:rh', this.surRh); };
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
        h('dt', 'Préparé par'), h('dd', { text: (e.creeParNom || e.creePar) + ' le ' + dateHeure(e.creeLe) }),
        h('dt', 'Lien'), h('dd', [e.etat === 'retire' ? 'retiré' : 'valide jusqu\'au ' + dateCourte(e.expireLe) + ' ',
          h('button.btn.petit', { type: 'button', text: 'Copier le lien', onclick: function () { AMX.copier(e.lien, 'Lien copié'); } }), ' ',
          h('button.btn.petit', { type: 'button', text: 'Aperçu de la page', onclick: function () { window.open(e.lien + '&apercu=1', '_blank', 'noopener'); } })]),
        e.message ? h('dt', 'Message') : null, e.message ? h('dd', { text: e.message, style: { whiteSpace: 'pre-wrap' } }) : null
      ]));
      corps.appendChild(h('div.rhx-h', { text: 'Documents à signer (' + (e.docs || []).length + ')' }));
      if (!(e.docs || []).length) corps.appendChild(h('p.rhx-prog', { text: 'Aucun document à signer : seulement des pièces à fournir.' }));
      corps.appendChild(h('ul.rhx-docs', (e.docs || []).map(function (d) {
        return h('li', [
          h('div', [h('b', { text: d.nom }), h('span.q', { text: (d.nbPages ? d.nbPages + ' page(s) · ' : '') + (d.signeLe ? 'signé le ' + dateHeure(d.signeLe) : d.ouvertLe ? 'ouvert le ' + dateHeure(d.ouvertLe) + ', pas encore signé' : 'pas encore ouvert') + (d.certificatSeul ? ' · copie : certificat seul (original joint)' : '') }),
            h('span.rhx-sha', { text: 'SHA-256 de l\'original : ' + (d.sha || '—') }), d.signeSha ? h('span.rhx-sha', { text: 'SHA-256 de la copie signée : ' + d.signeSha }) : null]),
          h('div.a', [
            d.copie ? h('button.btn.petit.primaire', { type: 'button', text: 'Copie signée', onclick: function () { ouvrirFichier({ rhFichier: 1, id: e.id, f: 'S:' + d.id }, d.nom + ' — signé'); } }) : null,
            h('button.btn.petit', { type: 'button', text: 'Original', onclick: function () { ouvrirFichier({ rhFichier: 1, id: e.id, f: 'O:' + d.id }, d.nom); } })
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
  VueRh.prototype.nouvelEnvoi = function () {
    var self = this;
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
    var choisis = {}, pieces = [];
    var listeDocs = h('ul.rhx-choix'), listePieces = h('div'), prog = h('p.rhx-prog');
    var docsPour = function (type) { var c = selCie.value; return self.rep.documents.filter(function (d) { return !d.retire && d.type === type && (!d.compagnie || d.compagnie === c) && (d.bibliotheque || choisis[d.id]); }); };
    var dessinerDocs = function () {
      AMX.vider(listeDocs);
      var l = docsPour('signer');
      if (!l.length) listeDocs.appendChild(h('li', [h('span', { text: 'Aucun document type' + (selCie.value ? ' pour ' + nomCie(selCie.value) : '') + ' : déposez-en un ci-dessous ou dans « Documents types ».' })]));
      l.forEach(function (d) {
        var c = h('input', { type: 'checkbox', checked: !!choisis[d.id], onchange: function () { if (c.checked) choisis[d.id] = true; else delete choisis[d.id]; } });
        listeDocs.appendChild(h('li', [c, h('div', [h('b', { text: d.nom }), h('span.q', { text: [d.nbPages + ' page(s)', d.compagnie ? nomCie(d.compagnie) : 'tout le groupe', d.bibliotheque ? '' : 'pour cet envoi seulement', d.description].filter(Boolean).join(' · ') })])]));
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
    selCie.addEventListener('change', function () { dessinerDocs(); dessinerPieces(); });
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
      h('div.rhx-h', { text: 'L\'employé' }),
      h('div.grille', [champ('Nom complet', inNom), champ('Courriel', inCourriel, 'Le lien part à cette adresse.'), champ('Cellulaire (facultatif)', inTel), champ('Poste', inPoste), champ('Entrée en poste', inDebut), champ('Concession', selCie), champ('Langue de la page', selLangue)]),
      h('div.rhx-h', { text: 'Documents à lire et à signer' }), listeDocs,
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
    dessinerDocs(); dessinerPieces();
    AMX.modale({ titre: 'Nouvel envoi à un employé', corps: corps, large: true, boutons: [{ texte: 'Annuler' }, { texte: 'Envoyer le lien', classe: 'primaire', action: function () {
      var docs = Object.keys(choisis).filter(function (id) { return docsPour('signer').some(function (d) { return d.id === id; }); });
      var ps = pieces.filter(function (p) { return String(p.libelle || '').trim(); });
      if (!selCie.value) { AMX.toast('Choisissez la concession.', 'attention'); return false; }
      if (!docs.length && !ps.length) { AMX.toast('Cochez au moins un document ou demandez une pièce.', 'attention'); return false; }
      return ecrire({ action: 'rhEnvoyer', compagnie: selCie.value, langue: selLangue.value, employe: { nom: inNom.value, courriel: inCourriel.value, telephone: inTel.value, poste: inPoste.value, debut: inDebut.value },
        documents: docs, pieces: ps, message: inMessage.value, texto: !!caseTexto.checked }).then(function (d) {
        poserEnvoi(d.envoi); self.vue = 'encours'; self.rendre();
        AMX.toast('Lien envoyé à ' + d.envoi.nom + (d.textoEnvoye ? ' (courriel et texto)' : ''), d.avertissement ? 'attention' : 'ok');
        if (d.avertissement) AMX.toast(d.avertissement, 'attention', 8000);
        setTimeout(function () { self.ouvrirFiche(d.envoi.id); }, 50);
      }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur', 8000); return false; });
    } }] });
  };

  /* ------------------------------------------------------------------------------- documents types */
  VueRh.prototype.documentsTypes = function () {
    var self = this;
    if (!this.rep) return;
    var corps = h('div'), voirRetires = false, m;
    var codes = this.codesCies();
    var dessiner = function () {
      AMX.vider(corps);
      var l = self.rep.documents.filter(function (d) { return d.bibliotheque && (voirRetires || !d.retire); });
      [['signer', 'À lire et à signer'], ['formulaire', 'Formulaires vierges (l\'employé les remplit et les renvoie)']].forEach(function (t) {
        var x = l.filter(function (d) { return d.type === t[0]; });
        corps.appendChild(h('div.rhx-h', { text: t[1] + ' (' + x.length + ')' }));
        if (!x.length) { corps.appendChild(h('p.rhx-prog', { text: 'Aucun.' })); return; }
        corps.appendChild(h('ul.rhx-docs', x.map(function (d) {
          return h('li', [
            h('div', [h('b', { text: d.nom + (d.retire ? ' (retiré)' : '') }), h('span.q', { text: [d.nbPages ? d.nbPages + ' page(s)' : '', d.compagnie ? nomCie(d.compagnie) : 'tout le groupe', 'ajouté le ' + dateCourte(d.creeLe) + (d.creeParNom ? ' par ' + d.creeParNom : ''), d.description].filter(Boolean).join(' · ') })]),
            h('div.a', [
              h('button.btn.petit', { type: 'button', text: d.type === 'signer' ? 'Voir' : 'Ouvrir', onclick: function () { if (d.type === 'signer') self.apercu(d); else ouvrirFichier({ rhDocument: 1, id: d.id, quoi: 'original' }, d.nom); } }),
              h('button.btn.petit' + (d.retire ? '' : '.danger'), { type: 'button', text: d.retire ? 'Remettre' : 'Retirer', onclick: function () {
                ecrire({ action: 'rhDocumentModifier', id: d.id, retirer: !d.retire }).then(function (r) { poserDocument(r.document); dessiner(); }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); });
              } })
            ])
          ]);
        })));
      });
      corps.appendChild(h('label.rhx-cases', { style: { marginTop: '8px' } }, [h('input', { type: 'checkbox', checked: voirRetires, onchange: function (ev) { voirRetires = ev.target.checked; dessiner(); } }), 'Voir les documents retirés']));
      /* ajout */
      var inNom = h('input', { type: 'text', placeholder: 'Ex. Politique sur le harcèlement' });
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
      corps.appendChild(h('div.rhx-h', { text: 'Ajouter un document type' }));
      corps.appendChild(h('div.rhx-form', [h('div.grille', [
        h('div.champ', [h('label', { text: 'Nom' }), inNom]), h('div.champ', [h('label', { text: 'Description' }), inDesc]),
        h('div.champ', [h('label', { text: 'Type' }), selType]), h('div.champ', [h('label', { text: 'Pour' }), selCie]),
        h('div.champ', [h('label', { text: 'Fichier (PDF, 10 Mo au plus)' }), inF])
      ]), h('div', { style: { marginTop: '10px' } }, [btn]), prog]));
    };
    dessiner();
    m = AMX.modale({ titre: 'Documents types', corps: corps, large: true, proteger: false, sansFocus: true, boutons: [{ texte: 'Fermer' }] });
  };
  VueRh.prototype.apercu = function (d) {
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
    AMX.modale({ titre: 'Réglages — ressources humaines', corps: h('div.rhx-form', [
      h('div.champ', [h('label', { text: 'Le dossier signé part à' }), inPaie, h('span.aide', { text: 'Jusqu\'à trois adresses, séparées par des virgules. Envoi automatique dès que l\'employé a tout signé (autorisé par Maxime le 7 nov.).' })]),
      h('label.rhx-cases', { style: { marginTop: '10px' } }, [copie, 'Copie à la personne qui a fait l\'envoi'])
    ]), boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      return ecrire({ action: 'rhReglages', paie: inPaie.value, copieRh: !!copie.checked }).then(function (d) { self.rep.reglages = d.reglages; self.rendre(); AMX.toast('Réglages enregistrés', 'ok'); }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); return false; });
    } }] });
  };
})();
