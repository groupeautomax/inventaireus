/* =====================================================================================================
   sst.js — Santé et sécurité (7 nov. 2026) — remplace le « Tableau numérique de santé et sécurité » de HR4

   Maxime : « dossier employé et santé sécurité, pour toutes les concessions » ; choix : bibliothèque et accidents.
   - Bibliothèque : les documents par thème (Santé et sécurité, Ergonomie, Technicien, Premiers soins, Accident de travail,
     Formulaires), visibles par tout compte connecté (ceux du groupe et ceux de sa concession). Aide › Santé et sécurité.
   - Registre des accidents, premiers soins, presque-accidents et situations dangereuses : la RH, les propriétaires et
     les DG (leur concession). Le détail de santé reste dans un fichier Drive privé (Loi 25), jamais dans une feuille.
     Aussi : Outils › Ressources humaines › Santé et sécurité.
   - Données : GET ?sst=1, ?sstDoc=SD-…, ?sstRegistre=1, ?sstFichier=1 (Sst.gs) ; POST sstDocument, sstDocumentModifier,
     sstImporter (favori HR4), sstEvenement, sstEvenementFichier. Aucune copie dans le navigateur.
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez la version qui contient Sst.gs.';
  var MAX_OCTETS = 10 * 1024 * 1024;
  var THEMES = [['sst', 'Santé et sécurité'], ['ergonomie', 'Ergonomie'], ['technicien', 'Technicien'], ['premiers', 'Premiers soins'], ['accident', 'Accident de travail'], ['formulaires', 'Formulaires']];
  var TYPES = { accident: 'Accident avec blessure', premiersSoins: 'Premiers soins seulement', presqueAccident: 'Presque-accident', dangereux: 'Situation dangereuse' };
  var STATUTS = { ouvert: 'Ouvert', enquete: 'Enquête en cours', ferme: 'Fermé' };

  var CSS = [
    '.sst-onglets { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }',
    '.sst-onglets button { border: 1px solid var(--ligne); background: var(--carte); border-radius: 999px; padding: 6px 13px; font-size: 13px; font-weight: 600; color: var(--encre-2); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }',
    '.sst-onglets button.actif { background: var(--vert-fonce); border-color: var(--vert-fonce); color: #fff; }',
    '.sst-onglets button .n { font-weight: 700; opacity: .8; } .sst-onglets button.rouge:not(.actif) .n { color: var(--rouge); opacity: 1; }',
    '.sst-filtres { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 8px; } .sst-filtres .saisie.recherche { flex: 1 1 260px; max-width: 480px; }',
    '.sst-themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }',
    '.sst-theme h3 { margin: 0 0 8px; font-size: 15px; display: flex; gap: 8px; align-items: center; } .sst-theme h3 .n { font-size: 12px; color: var(--encre-3); font-weight: 600; }',
    '.sst-docs { list-style: none; margin: 0; padding: 0; } .sst-docs li { display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 7px 0; border-bottom: 1px dashed var(--ligne); font-size: 13px; }',
    '.sst-docs li .t { cursor: pointer; flex: 1; } .sst-docs li .t:hover b { text-decoration: underline; } .sst-docs li .q { display: block; color: var(--encre-3); font-size: 12px; }',
    '.sst-docs li.retire { opacity: .55; }',
    '.sst-puce { display: inline-block; border-radius: 999px; padding: 2px 9px; font-size: 12px; font-weight: 700; white-space: nowrap; }',
    '.sst-puce.ouvert { background: var(--rouge-bg); color: var(--rouge); } .sst-puce.enquete { background: var(--ambre-bg); color: var(--ambre); } .sst-puce.ferme { background: var(--vert-clair); color: var(--vert-fonce); }',
    '.sst-puce.type { background: var(--bleu-bg); color: var(--bleu); font-weight: 600; }',
    '.sst-cadre { overflow-x: auto; } .sst-table tbody tr { cursor: pointer; } .sst-table tbody tr:hover { background: var(--carte-2); }',
    '.sst-table td { vertical-align: top; } .sst-table td .s { display: block; color: var(--encre-3); font-size: 12px; }',
    '.sst-vide { padding: 28px; text-align: center; color: var(--encre-3); }',
    '.sst-avis { border-left: 4px solid var(--ambre); background: var(--ambre-bg); padding: 10px 12px; border-radius: 8px; margin: 0 0 10px; font-size: 13px; }',
    '.sst-prive { border-left: 4px solid var(--bleu); background: var(--bleu-bg); padding: 10px 12px; border-radius: 8px; margin: 0 0 10px; font-size: 13px; }',
    '.sst-h { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--encre-2); margin: 16px 0 6px; }',
    '.sst-detail { display: grid; grid-template-columns: minmax(150px, 32%) 1fr; margin: 0 0 8px; }',
    '.sst-detail dt, .sst-detail dd { padding: 6px 8px; border-bottom: 1px solid var(--ligne); margin: 0; font-size: 13px; } .sst-detail dt { color: var(--encre-3); font-weight: 600; } .sst-detail dd { white-space: pre-wrap; word-break: break-word; }',
    '.sst-form .grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }',
    '.sst-form textarea { width: 100%; }',
    '.sst-journal { font-size: 12px; color: var(--encre-3); list-style: none; margin: 0; padding: 0; } .sst-journal li { padding: 2px 0; }',
    '.sst-prog { font-size: 12.5px; color: var(--encre-3); margin: 6px 0 0; }',
    '.sst-cnesst { font-size: 12.5px; color: var(--encre-2); margin: 4px 0 10px; } .sst-cnesst a { font-weight: 600; }',
    '@media (max-width: 640px) { .sst-detail { grid-template-columns: 1fr; } .sst-detail dt { border-bottom: none; padding-bottom: 0; } }'
  ].join('\n');
  function css() { if (!document.getElementById('css-sst')) { var s = document.createElement('style'); s.id = 'css-sst'; s.textContent = CSS; document.head.appendChild(s); } }

  /* ------------------------------------------------------------------------------- accès */
  function perms() { return (AMX.session && AMX.session.perms) || {}; }
  function role() { var p = perms(); return p.role || (AMX.session && AMX.session.role) || ''; }
  function peutGerer() { return perms().rh === true || role() === 'proprietaire' || role() === 'admin'; }

  /* ------------------------------------------------------------------------------- données */
  var cache = { rep: null, le: 0, enCours: null, reg: null, regLe: 0 };
  function charger(force) {
    if (cache.enCours && !force) return cache.enCours;
    if (!force && cache.rep && Date.now() - cache.le < AMX.dureeCopie(120000)) return Promise.resolve(cache.rep);
    cache.enCours = AMX.get({ sst: '1' }, { delai: 60000, secours: false }).then(function (d) {
      cache.enCours = null;
      if (d && d.refuse) throw new Error(d.erreur || 'Connectez-vous.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!Array.isArray(d.documents)) throw new Error(SCRIPT_PAS_A_JOUR);
      cache.rep = d; cache.le = Date.now();
      return d;
    }, function (e) { cache.enCours = null; throw e; });
    return cache.enCours;
  }
  function chargerRegistre(force) {
    if (!force && cache.reg && Date.now() - cache.regLe < AMX.dureeCopie(60000)) return Promise.resolve(cache.reg);
    return AMX.get({ sstRegistre: '1' }, { delai: 60000, secours: false }).then(function (d) {
      if (d && d.refuse) throw new Error(d.erreur || 'Le registre : la RH, les propriétaires et les DG.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!Array.isArray(d.evenements)) throw new Error(SCRIPT_PAS_A_JOUR);
      cache.reg = d; cache.regLe = Date.now();
      return d;
    });
  }
  function ecrire(corps, opts) {
    return AMX.post(corps, Object.assign({ delai: 120000, secours: false }, opts || {})).then(function (d) {
      if (d && d.vehicules && !d.evenement && !d.document) throw new Error(SCRIPT_PAS_A_JOUR);
      return AMX.verifier(d);
    });
  }
  function poserEvenement(ev) {
    if (!cache.reg || !ev) return;
    var i = cache.reg.evenements.findIndex(function (x) { return x.id === ev.id; });
    if (i >= 0) cache.reg.evenements[i] = ev; else cache.reg.evenements.unshift(ev);
    try { document.dispatchEvent(new CustomEvent('amx:sst')); } catch (e) {}
  }
  function poserDocument(d) {
    if (!cache.rep || !d) return;
    var i = cache.rep.documents.findIndex(function (x) { return x.id === d.id; });
    if (i >= 0) cache.rep.documents[i] = d; else cache.rep.documents.push(d);
    try { document.dispatchEvent(new CustomEvent('amx:sst')); } catch (e) {}
  }
  function compteur() {
    if (!peutGerer() || !cache.rep || !cache.rep.registre) return '';
    return cache.rep.registre.ouverts || '';
  }

  AMX.section('sst', {
    titre: 'Santé et sécurité', icone: 'alerte', ordre: 58,
    visible: function () { return !!(AMX.session && AMX.session.courriel); },
    monter: function (conteneur, ctx) { return new VueSst(conteneur, ctx); }
  });

  /* ------------------------------------------------------------------------------- outils */
  function nomCie(c) { return c ? ((AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c) : 'Tout le groupe'; }
  /* Toujours avec l'année : une date de naissance ou d'embauche sans année ne veut rien dire. */
  function dateCourte(iso) { if (!iso) return ''; var d = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? String(iso) : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function dateHeure(iso) { return iso ? AMX.fmtDate(iso, true) : ''; }
  function taille(o) { return o > 1048576 ? (o / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(o / 1024)) + ' Ko'; }
  function champ(libelle, el, aide) { return h('div.champ', [h('label', { text: libelle }), el, aide ? h('span.aide', { text: aide }) : null]); }
  function saisie(v, attrs) { return h('input.saisie', Object.assign({ type: 'text', value: v || '', autocomplete: 'off' }, attrs || {})); }
  function zone(v, rows, ph) { var t = h('textarea.saisie', { rows: rows || 3, placeholder: ph || '' }); t.value = v || ''; return t; }
  function choix(valeur, options) {
    var s = h('select.saisie');
    options.forEach(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (o[0] === (valeur || '')) op.selected = true; s.appendChild(op); });
    return s;
  }
  function ouiNon(v) { return choix(v || '', [['', '—'], ['oui', 'Oui'], ['non', 'Non']]); }
  function base64De(buf) { var oct = new Uint8Array(buf), s = '', pas = 0x8000; for (var i = 0; i < oct.length; i += pas) s += String.fromCharCode.apply(null, oct.subarray(i, i + pas)); return btoa(s); }
  function lireFichier(f) {
    return new Promise(function (res, rej) {
      if (f.size > MAX_OCTETS) { rej(new Error(f.name + ' : plus de 10 Mo.')); return; }
      var r = new FileReader(); r.onload = function () { res('data:' + (f.type || 'application/octet-stream') + ';base64,' + base64De(r.result)); }; r.onerror = function () { rej(new Error('Lecture du fichier impossible.')); }; r.readAsArrayBuffer(f);
    });
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

  /* ------------------------------------------------------------------------------- page */
  function VueSst(conteneur, ctx) {
    css();
    var self = this, p = (ctx && ctx.params) || {};
    this.conteneur = conteneur; this.detruit = false;
    this.compagnie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
    this.voir = p.voir === 'registre' && peutGerer() ? 'registre' : 'bibliotheque';
    this.q = p.q || ''; this.statut = ''; this.ouvrirId = p.id || '';
    AMX.vider(conteneur);
    this.btnDoc = h('button.btn', { type: 'button', text: 'Ajouter un document', onclick: function () { self.ajouterDocument(); } });
    this.btnDeclarer = h('button.btn.primaire', { type: 'button', text: 'Déclarer un événement', onclick: function () { declarer({ compagnie: self.compagnie }); } });
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    this.btnDoc.hidden = !peutGerer(); this.btnDeclarer.hidden = !peutGerer();
    conteneur.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Santé et sécurité'), h('p', { text: 'Les politiques, les fiches et les formulaires de santé et sécurité ; pour la direction, le registre des accidents et des premiers soins.' })]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnDoc, this.btnDeclarer], [this.btnDeclarer]))
    ]));
    this.elCies = h('div.barre-cies'); conteneur.appendChild(this.elCies);
    this.elOnglets = h('div.sst-onglets'); conteneur.appendChild(this.elOnglets);
    this.inRecherche = h('input.saisie.recherche', { type: 'search', value: this.q, placeholder: 'Chercher un document ou un événement…', autocomplete: 'off', 'aria-label': 'Chercher' });
    this.elFiltres = h('div.sst-filtres', [this.inRecherche]); conteneur.appendChild(this.elFiltres);
    this.elPortee = h('div'); conteneur.appendChild(this.elPortee);
    this.elKpis = h('div.kpis'); conteneur.appendChild(this.elKpis);
    this.elCorps = h('div'); conteneur.appendChild(this.elCorps);
    var relancer = AMX.debounce(function () { self.q = self.inRecherche.value; self.rafraichir(); }, 160);
    this.inRecherche.addEventListener('input', relancer);
    this.surCie = function (e) { self.compagnie = (e.detail && e.detail.compagnie) || ''; self.rendre(); };
    this.surSst = function () { if (!self.detruit) { self.rep = cache.rep; self.reg = cache.reg; self.rendre(); } };
    document.addEventListener('amx:compagnie', this.surCie);
    document.addEventListener('amx:sst', this.surSst);
    this.elCorps.appendChild(AMX.chargeur('Santé et sécurité'));
    this.charger(false);
  }
  VueSst.prototype.demonter = function () { this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); document.removeEventListener('amx:sst', this.surSst); };
  VueSst.prototype.naviguer = function (ctx) {
    var p = (ctx && ctx.params) || {};
    if (p.voir && p.voir !== this.voir && (p.voir !== 'registre' || peutGerer())) { this.voir = p.voir; this.charger(false); }
    if (p.id && this.reg) this.ouvrirEvenement(p.id);
  };
  VueSst.prototype.charger = function (force) {
    var self = this;
    var pr = [charger(force)];
    if (this.voir === 'registre' && peutGerer()) pr.push(chargerRegistre(force));
    Promise.all(pr).then(function (r) {
      if (self.detruit) return;
      self.rep = r[0]; self.reg = r[1] || cache.reg;
      self.rendre(); AMX.rafraichirSousBarre && AMX.rafraichirSousBarre();
      if (self.ouvrirId && self.reg) { var id = self.ouvrirId; self.ouvrirId = ''; self.ouvrirEvenement(id); }
      if (force) AMX.toast('Santé et sécurité à jour', 'ok');
    }, function (e) {
      if (self.detruit) return;
      AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.carte', [h('div.sst-vide', { text: AMX.erreurTexte(e) })]));
    });
  };
  VueSst.prototype.rendre = function () {
    if (!this.rep || this.detruit) return;
    var self = this, gere = !!this.rep.peutGerer;
    this.btnDoc.hidden = !gere; this.btnDeclarer.hidden = !gere;
    var docs = this.rep.documents;
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.compagnie,
      compte: function (c) { return self.voir === 'registre' && self.reg ? self.reg.evenements.filter(function (e) { return (!c || e.compagnie === c) && e.statut !== 'ferme'; }).length : docs.filter(function (d) { return !d.retire && (!c || !d.compagnie || d.compagnie === c); }).length; },
      onchange: function (c) { self.compagnie = c; self.rendre(); } });
    AMX.vider(this.elOnglets);
    var onglet = function (id, titre, n, rouge) {
      return h('button' + (self.voir === id ? '.actif' : '') + (rouge ? '.rouge' : ''), { type: 'button', onclick: function () { if (self.voir === id) return; self.voir = id; if (id === 'registre') self.charger(false); else self.rendre(); } }, [titre, n !== null ? h('span.n', { text: String(n) }) : null]);
    };
    this.elOnglets.appendChild(onglet('bibliotheque', 'Bibliothèque', docs.filter(function (d) { return !d.retire; }).length));
    if (gere) {
      var ouverts = this.reg ? this.reg.evenements.filter(function (e) { return e.statut !== 'ferme' && (!self.compagnie || e.compagnie === self.compagnie); }).length : (this.rep.registre ? this.rep.registre.ouverts : null);
      this.elOnglets.appendChild(onglet('registre', 'Registre des accidents', ouverts, !!ouverts));
    }
    AMX.vider(this.elFiltres); this.elFiltres.appendChild(this.inRecherche);
    if (this.voir === 'registre') {
      this.selStatut = choix(this.statut, [['', 'Tous les statuts'], ['ouvert', 'Ouverts'], ['enquete', 'Enquête en cours'], ['ferme', 'Fermés']]);
      this.selStatut.addEventListener('change', function () { self.statut = self.selStatut.value; self.rafraichir(); });
      this.elFiltres.appendChild(this.selStatut);
    }
    this.rafraichir();
  };
  VueSst.prototype.rafraichir = function () {
    if (this.voir === 'registre') this.rendreRegistre(); else this.rendreBibliotheque();
  };

  /* ------------------------------------------------------------------------------- bibliothèque */
  VueSst.prototype.rendreBibliotheque = function () {
    var self = this, gere = !!this.rep.peutGerer, cie = this.compagnie, q = this.q;
    var liste = this.rep.documents.filter(function (d) {
      if (d.retire && !gere) return false;
      if (cie && d.compagnie && d.compagnie !== cie) return false;
      if (q && !AMX.correspond([d.titre, d.description, d.themeNom, d.fichierNom, nomCie(d.compagnie)], q)) return false;
      return true;
    });
    AMX.porteeChiffres(this.elPortee, { n: liste.filter(function (d) { return !d.retire; }).length, unite: ['document', 'documents'], contexte: [cie ? nomCie(cie) + ' et tout le groupe' : 'tout le groupe', 'bibliothèque'],
      filtres: q ? ['« ' + q + ' »'] : [], effacer: function () { self.q = ''; self.inRecherche.value = ''; self.rafraichir(); } });
    AMX.vider(this.elKpis);
    AMX.vider(this.elCorps);
    if (!liste.length) {
      this.elCorps.appendChild(h('div.carte', [h('div.sst-vide', [h('p', { text: this.rep.documents.length ? 'Aucun document avec ces filtres.' : 'La bibliothèque est vide. La RH l\'importe de HR4 (Dossiers des employés › Importer) ou ajoute des documents.' })])]));
      return;
    }
    var grille = h('div.sst-themes');
    THEMES.forEach(function (t) {
      var docs = liste.filter(function (d) { return d.theme === t[0]; });
      if (!docs.length) return;
      grille.appendChild(h('div.carte.sst-theme', [
        h('h3', [t[1], h('span.n', { text: docs.filter(function (d) { return !d.retire; }).length + ' document(s)' })]),
        h('ul.sst-docs', docs.map(function (d) {
          return h('li' + (d.retire ? '.retire' : ''), [
            h('div.t', { onclick: function () { ouvrirFichier({ sstDoc: d.id }, d.titre); } }, [h('b', { text: d.titre }), h('span.q', { text: [d.description, d.compagnie ? nomCie(d.compagnie) : '', d.mime === 'application/pdf' ? 'PDF' : 'Image', taille(d.octets), d.retire ? 'retiré' : ''].filter(Boolean).join(' · ') })]),
            gere ? h('button.btn.petit', { type: 'button', text: 'Modifier', onclick: function () { self.modifierDocument(d); } }) : null
          ]);
        }))
      ]));
    });
    this.elCorps.appendChild(grille);
  };
  VueSst.prototype.ajouterDocument = function () {
    var self = this, rep = this.rep || {};
    var inTitre = saisie(''), inDesc = zone('', 2), selTheme = choix('sst', THEMES), inFichier = h('input', { type: 'file', accept: '.pdf,.jpg,.jpeg,.png' });
    var codes = Object.keys(AMX.COMPAGNIES_TOUTES || {}).filter(function (c) { return !AMX.codesPour || AMX.codesPour('inventaire') === '*' || (AMX.codesPour('inventaire') || []).indexOf(c) >= 0; });
    var opts = codes.map(function (c) { return [c, nomCie(c)]; });
    if (perms().rh === true || role() === 'proprietaire') opts.unshift(['', 'Tout le groupe']);
    var selCie = choix(this.compagnie || (opts[0] || [''])[0], opts);
    inFichier.addEventListener('change', function () { var f = inFichier.files[0]; if (f && !inTitre.value) inTitre.value = f.name.replace(/\.[a-z0-9]{2,5}$/i, ''); });
    AMX.modale({ titre: 'Ajouter un document', corps: h('div.sst-form', [h('div.grille', [champ('Fichier (PDF ou image, 10 Mo au plus)', inFichier), champ('Titre', inTitre), champ('Thème', selTheme), champ('Pour', selCie)]), champ('Description (facultatif)', inDesc)]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Ajouter', classe: 'primaire', action: function () {
        var f = inFichier.files && inFichier.files[0];
        if (!f) { AMX.toast('Choisissez un fichier.', 'attention'); return false; }
        return lireFichier(f).then(function (b64) {
          return ecrire({ action: 'sstDocument', titre: inTitre.value, theme: selTheme.value, description: inDesc.value, compagnie: selCie.value, base64: b64 }, { delai: 180000 });
        }).then(function (r) { poserDocument(r.document); AMX.toast('Document ajouté', 'ok'); }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); throw er; });
      } }] });
  };
  VueSst.prototype.modifierDocument = function (d) {
    var inTitre = saisie(d.titre), inDesc = zone(d.description, 2), selTheme = choix(d.theme, THEMES);
    AMX.modale({ titre: 'Modifier — ' + d.titre, corps: h('div.sst-form', [h('div.grille', [champ('Titre', inTitre), champ('Thème', selTheme)]), champ('Description', inDesc)]),
      boutons: [{ texte: 'Annuler' },
        { texte: d.retire ? 'Remettre' : 'Retirer', classe: d.retire ? '' : 'danger', action: function () {
          return ecrire({ action: 'sstDocumentModifier', id: d.id, retirer: !d.retire }).then(function (r) { poserDocument(r.document); AMX.toast(d.retire ? 'Document remis' : 'Document retiré (gardé dans Drive)', 'ok'); }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); throw er; });
        } },
        { texte: 'Enregistrer', classe: 'primaire', action: function () {
          return ecrire({ action: 'sstDocumentModifier', id: d.id, titre: inTitre.value, theme: selTheme.value, description: inDesc.value }).then(function (r) { poserDocument(r.document); AMX.toast('Document enregistré', 'ok'); }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); throw er; });
        } }] });
  };

  /* ------------------------------------------------------------------------------- registre */
  VueSst.prototype.evenements = function (sauf) {
    var self = this;
    return ((this.reg && this.reg.evenements) || []).filter(function (e) {
      if (self.compagnie && e.compagnie !== self.compagnie) return false;
      if (sauf !== 'statut' && self.statut && e.statut !== self.statut) return false;
      if (self.q && !AMX.correspond([e.id, e.employeNom, e.poste, e.lieu, e.description, TYPES[e.type], nomCie(e.compagnie), e.blessure && e.blessure.nature, e.blessure && e.blessure.siege], self.q)) return false;
      return true;
    });
  };
  VueSst.prototype.rendreRegistre = function () {
    var self = this;
    AMX.vider(this.elKpis); AMX.vider(this.elCorps);
    if (!this.reg) { this.elCorps.appendChild(AMX.chargeur('Registre des accidents')); return; }
    var liste = this.evenements();
    var filtres = []; if (this.q) filtres.push('« ' + this.q + ' »'); if (this.statut) filtres.push(STATUTS[this.statut]);
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['événement', 'événements'], contexte: [this.compagnie ? nomCie(this.compagnie) : 'toutes les concessions', 'registre'],
      filtres: filtres, effacer: function () { self.q = ''; self.inRecherche.value = ''; self.statut = ''; self.rendre(); } });
    var annee = String(new Date().getFullYear());
    var tuile = function (valeur, libelle, sous, cls) { var el = h('div.kpi', [h('div.valeur', { text: String(valeur) }), h('div.libelle', { text: libelle }), sous ? h('div.sous', { text: sous }) : null]); if (cls) el.classList.add(cls); return el; };
    var ouverts = liste.filter(function (e) { return e.statut !== 'ferme'; }).length;
    var anneeL = liste.filter(function (e) { return String(e.date || '').slice(0, 4) === annee; });
    var arrets = anneeL.filter(function (e) { return e.arretTravail === 'oui'; }).length;
    var aDeclarer = liste.filter(function (e) { return e.arretTravail === 'oui' && e.cnesst && e.cnesst.declare !== 'oui'; }).length;
    var sansEnquete = liste.filter(function (e) { return e.statut !== 'ferme' && !(e.enquete && e.enquete.mesures); }).length;
    this.elKpis.appendChild(tuile(ouverts, 'Ouverts', 'pas encore fermés', ouverts ? 'attention' : 'neutre'));
    this.elKpis.appendChild(tuile(anneeL.length, 'Événements en ' + annee, anneeL.filter(function (e) { return e.type === 'accident'; }).length + ' accident(s) avec blessure', 'neutre'));
    this.elKpis.appendChild(tuile(arrets, 'Avec arrêt de travail', 'en ' + annee, arrets ? 'attention' : 'neutre'));
    this.elKpis.appendChild(tuile(aDeclarer, 'Arrêts pas déclarés', 'à la CNESST / WSIB', aDeclarer ? 'alerte' : 'neutre'));
    this.elKpis.appendChild(tuile(sansEnquete, 'Sans mesures correctives', 'événements ouverts', sansEnquete ? 'attention' : 'neutre'));
    if (!liste.length) { this.elCorps.appendChild(h('div.carte', [h('div.sst-vide', [h('p', { text: 'Aucun événement au registre' + (this.compagnie ? ' pour ' + nomCie(this.compagnie) : '') + '.' }), h('button.btn.primaire', { type: 'button', text: 'Déclarer un événement', onclick: function () { declarer({ compagnie: self.compagnie }); } })])])); return; }
    var corps = h('tbody');
    liste.forEach(function (e) {
      corps.appendChild(h('tr', { onclick: function () { self.ouvrirEvenement(e.id); } }, [
        h('td', [h('b', { text: dateCourte(e.date) }), h('span.s', { text: [e.heure, e.id].filter(Boolean).join(' · ') })]),
        h('td', [h('span.sst-puce.type', { text: TYPES[e.type] || e.type })]),
        h('td', [h('span', { text: e.employeNom || '—' }), h('span.s', { text: [e.poste, nomCie(e.compagnie)].filter(Boolean).join(' · ') })]),
        h('td', [h('span', { text: String(e.description || '').slice(0, 110) + (String(e.description || '').length > 110 ? '…' : '') }), h('span.s', { text: [e.lieu, e.blessure && e.blessure.nature].filter(Boolean).join(' · ') })]),
        h('td', [h('span.sst-puce.' + (e.statut || 'ouvert'), { text: STATUTS[e.statut] || 'Ouvert' }), e.arretTravail === 'oui' ? h('span.s', { text: 'Arrêt de travail' + (e.cnesst && e.cnesst.declare === 'oui' ? ' · déclaré' : ' · pas déclaré') }) : null])
      ]));
    });
    this.elCorps.appendChild(h('div.carte', [h('div.sst-cadre', [h('table.tableau.sst-table', [h('thead', [h('tr', [h('th', 'Date'), h('th', 'Type'), h('th', 'Employé'), h('th', 'Ce qui s\'est passé'), h('th', 'Statut')])]), corps])])]));
  };
  VueSst.prototype.ouvrirEvenement = function (id) {
    var self = this, e = ((this.reg && this.reg.evenements) || []).filter(function (x) { return x.id === id; })[0];
    if (!e) { AMX.toast('Événement ' + id + ' introuvable', 'attention'); return; }
    var dl = function (paires) { var out = h('dl.sst-detail'); paires.forEach(function (p) { if (!p[1]) return; out.appendChild(h('dt', { text: p[0] })); out.appendChild(h('dd', typeof p[1] === 'string' ? { text: p[1] } : [p[1]])); }); return out; };
    var on = function (v) { return v === 'oui' ? 'Oui' : v === 'non' ? 'Non' : ''; };
    var inFichier = h('input', { type: 'file', accept: '.pdf,.jpg,.jpeg,.png,.heic', style: { display: 'none' } });
    var corps = h('div', [
      h('div.sst-prive', { text: 'Renseignements de santé : fichier privé (Loi 25), visible seulement par la RH, les propriétaires et le DG de la concession.' }),
      dl([['Type', TYPES[e.type]], ['Statut', STATUTS[e.statut]], ['Concession', nomCie(e.compagnie)], ['Date', dateCourte(e.date) + (e.heure ? ' à ' + e.heure : '')], ['Lieu', e.lieu],
        ['Employé', [e.employeNom, e.poste].filter(Boolean).join(' — ')], ['Ce qui s\'est passé', e.description]]),
      h('div.sst-h', { text: 'Blessure et soins' }),
      dl([['Nature de la blessure', e.blessure && e.blessure.nature], ['Siège (partie du corps)', e.blessure && e.blessure.siege], ['Premiers soins donnés', e.premiersSoins], ['Secouriste', e.secouriste], ['Témoins', e.temoins],
        ['Consultation médicale', on(e.consultation)], ['Arrêt de travail', on(e.arretTravail) + (e.dateArret ? ' — depuis le ' + dateCourte(e.dateArret) : '') + (e.dateRetour ? ', retour le ' + dateCourte(e.dateRetour) : '')], ['Assignation temporaire', on(e.assignation)]]),
      h('div.sst-h', { text: 'Déclaration' }),
      dl([['Déclaré (CNESST / WSIB)', on(e.cnesst && e.cnesst.declare)], ['No de dossier', e.cnesst && e.cnesst.dossier], ['Déclaré le', e.cnesst && e.cnesst.date ? dateCourte(e.cnesst.date) : '']]),
      h('div.sst-h', { text: 'Enquête et mesures correctives' }),
      dl([['Causes', e.enquete && e.enquete.causes], ['Mesures', e.enquete && e.enquete.mesures], ['Responsable', e.enquete && e.enquete.responsable], ['Échéance', e.enquete && e.enquete.echeance ? dateCourte(e.enquete.echeance) : ''], ['Faite le', e.enquete && e.enquete.faiteLe ? dateCourte(e.enquete.faiteLe) : '']]),
      h('div.sst-h', { text: 'Pièces (' + (e.fichiers || []).length + ')' }),
      (e.fichiers || []).length ? h('ul.sst-docs', e.fichiers.map(function (f) { return h('li', [h('div.t', { onclick: function () { ouvrirFichier({ sstFichier: 1, id: e.id, f: f.id }, f.nom); } }, [h('b', { text: f.nom }), h('span.q', { text: dateHeure(f.le) })])]); })) : h('p.sst-prog', { text: 'Aucune pièce (photos, formulaire de déclaration, rapport médical…).' }),
      inFichier,
      h('div.sst-h', { text: 'Journal' }),
      h('ul.sst-journal', (e.journal || []).slice().reverse().slice(0, 15).map(function (j) { return h('li', { text: dateHeure(j.le) + ' — ' + (j.qui ? j.qui + ' : ' : '') + j.quoi }); }))
    ]);
    var m = AMX.modale({ titre: (TYPES[e.type] || 'Événement') + ' — ' + e.id, corps: corps, large: true, proteger: false, boutons: [
      { texte: 'Fermer' },
      { texte: 'Ajouter une pièce', action: function () { inFichier.click(); return false; } },
      { texte: 'Modifier', classe: 'primaire', action: function (fermer) { fermer(); declarer(e); return false; } }
    ] });
    inFichier.addEventListener('change', function () {
      var f = inFichier.files && inFichier.files[0]; if (!f) return;
      lireFichier(f).then(function (b64) { return ecrire({ action: 'sstEvenementFichier', id: e.id, nom: f.name.replace(/\.[a-z0-9]{2,5}$/i, ''), base64: b64 }, { delai: 180000 }); })
        .then(function (r) { poserEvenement(r.evenement); AMX.toast('Pièce ajoutée', 'ok'); m.fermer(); self.ouvrirEvenement(e.id); })
        .catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); });
    });
  };

  /* ------------------------------------------------------------------------------- déclarer / modifier un événement */
  function declarer(e0) {
    e0 = e0 || {};
    var nouveau = !e0.id, ajd = new Date().toISOString().slice(0, 10);
    var codes = AMX.codesPour ? AMX.codesPour('inventaire') : '*';
    codes = codes === '*' || !Array.isArray(codes) ? Object.keys(AMX.COMPAGNIES_TOUTES || {}) : codes;
    var selCie = choix(e0.compagnie || (codes.length === 1 ? codes[0] : ''), [['', '— choisir —']].concat(codes.map(function (c) { return [c, nomCie(c)]; })));
    var selType = choix(e0.type || 'accident', Object.keys(TYPES).map(function (k) { return [k, TYPES[k]]; }));
    var inDate = saisie(e0.date || ajd, { type: 'date' }), inHeure = saisie(e0.heure || '', { type: 'time' }), inLieu = saisie(e0.lieu, { placeholder: 'Atelier, carrosserie, salle d\'exposition…' });
    var inEmp = saisie(e0.employeNom, { placeholder: 'Nom de l\'employé', list: 'sst-employes' }), inPoste = saisie(e0.poste), empId = e0.employeId || '';
    var dl = h('datalist#sst-employes');
    var remplirEmployes = function () {
      AMX.vider(dl);
      var l = AMX.employes ? AMX.employes.liste(selCie.value) : [];
      l.forEach(function (x) { dl.appendChild(h('option', { value: [x.prenom, x.nom].filter(Boolean).join(' ') })); });
      return l;
    };
    if (AMX.employes && AMX.employes.peutVoir()) AMX.employes.charger(false).then(remplirEmployes, function () {});
    selCie.addEventListener('change', remplirEmployes);
    inEmp.addEventListener('change', function () {
      var l = AMX.employes ? AMX.employes.liste(selCie.value) : [], v = inEmp.value.trim().toLowerCase();
      var x = l.filter(function (y) { return [y.prenom, y.nom].filter(Boolean).join(' ').toLowerCase() === v; })[0];
      empId = x ? x.id : ''; if (x && !inPoste.value) inPoste.value = x.poste || '';
    });
    var b = e0.blessure || {}, c = e0.cnesst || {}, q = e0.enquete || {};
    var inDesc = zone(e0.description, 4, 'Ce qui s\'est passé, dans l\'ordre (au moins une phrase).');
    var inNature = saisie(b.nature, { placeholder: 'Coupure, entorse, brûlure…' }), inSiege = saisie(b.siege, { placeholder: 'Main gauche, dos…' });
    var inSoins = zone(e0.premiersSoins, 2), inSecouriste = saisie(e0.secouriste), inTemoins = zone(e0.temoins, 2);
    var selConsult = ouiNon(e0.consultation), selArret = ouiNon(e0.arretTravail), inArret = saisie(e0.dateArret, { type: 'date' }), inRetour = saisie(e0.dateRetour, { type: 'date' }), selAssign = ouiNon(e0.assignation);
    var selDeclare = ouiNon(c.declare), inDossier = saisie(c.dossier), inDateDecl = saisie(c.date, { type: 'date' });
    var inCauses = zone(q.causes, 2), inMesures = zone(q.mesures, 2), inResp = saisie(q.responsable), inEch = saisie(q.echeance, { type: 'date' }), inFaite = saisie(q.faiteLe, { type: 'date' });
    var selStatut = choix(e0.statut || 'ouvert', Object.keys(STATUTS).map(function (k) { return [k, STATUTS[k]]; }));
    var corps = h('div.sst-form', [
      h('div.sst-prive', { text: 'Le détail (blessure, soins, témoins) va dans un fichier privé : la RH, les propriétaires et le DG de la concession seulement.' }),
      h('div.grille', [champ('Concession', selCie), champ('Type', selType), champ('Date', inDate), champ('Heure', inHeure), champ('Lieu', inLieu), champ('Employé', inEmp), champ('Poste', inPoste)]), dl,
      champ('Ce qui s\'est passé', inDesc),
      h('div.sst-h', { text: 'Blessure et soins' }),
      h('div.grille', [champ('Nature de la blessure', inNature), champ('Siège (partie du corps)', inSiege), champ('Secouriste', inSecouriste), champ('Consultation médicale', selConsult), champ('Arrêt de travail', selArret),
        champ('Arrêt depuis', inArret), champ('Retour au travail', inRetour), champ('Assignation temporaire', selAssign)]),
      champ('Premiers soins donnés', inSoins), champ('Témoins', inTemoins),
      h('div.sst-h', { text: 'Déclaration à la CNESST (Québec) ou à la WSIB (Ontario)' }),
      h('p.sst-cnesst', { text: 'Au Québec, un accident qui empêche de travailler au-delà du jour de l\'accident se déclare à la CNESST ; en Ontario (Hawkesbury), à la WSIB dans les 3 jours.' }),
      h('div.grille', [champ('Déclaré', selDeclare), champ('No de dossier', inDossier), champ('Déclaré le', inDateDecl)]),
      h('div.sst-h', { text: 'Enquête et mesures correctives' }),
      champ('Causes', inCauses), champ('Mesures', inMesures),
      h('div.grille', [champ('Responsable', inResp), champ('Échéance', inEch), champ('Faite le', inFaite), champ('Statut', selStatut)])
    ]);
    AMX.modale({ titre: nouveau ? 'Déclarer un événement' : 'Modifier — ' + e0.id, corps: corps, large: true, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      var ev = { id: e0.id || '', compagnie: selCie.value, type: selType.value, date: inDate.value, heure: inHeure.value, lieu: inLieu.value, employeId: empId, employeNom: inEmp.value, poste: inPoste.value,
        description: inDesc.value, blessure: { nature: inNature.value, siege: inSiege.value }, premiersSoins: inSoins.value, secouriste: inSecouriste.value, temoins: inTemoins.value,
        consultation: selConsult.value, arretTravail: selArret.value, dateArret: inArret.value, dateRetour: inRetour.value, assignation: selAssign.value,
        cnesst: { declare: selDeclare.value, dossier: inDossier.value, date: inDateDecl.value },
        enquete: { causes: inCauses.value, mesures: inMesures.value, responsable: inResp.value, echeance: inEch.value, faiteLe: inFaite.value }, statut: selStatut.value };
      return ecrire({ action: 'sstEvenement', evenement: ev }).then(function (r) {
        if (!cache.reg) cache.reg = { evenements: [], types: TYPES, statuts: STATUTS };
        poserEvenement(r.evenement);
        AMX.toast(nouveau ? 'Événement déclaré : ' + r.evenement.id : 'Événement enregistré', 'ok');
      }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); throw er; });
    } }] });
  }

  AMX.sst = {
    charger: charger, compteur: compteur, peutGerer: peutGerer, declarer: declarer,
    vider: function () { cache = { rep: null, le: 0, enCours: null, reg: null, regLe: 0 }; }
  };
})();
