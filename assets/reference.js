/* =====================================================================================================
   reference.js — Ressources humaines › Documents de référence (8 nov. 2026)

   Maxime : « l'embauche, la terminaison et les documents de référence, ultra simple ; les documents de référence dans un
   autre onglet, séparés en sujets, avec de grosses pastilles ». Une grosse tuile par sujet, puis la liste des documents
   du sujet ; un clic ouvre le document (texte à l'écran, ou PDF dans un nouvel onglet). Lecture seulement.
   - Ressources humaines : le Manuel de l'employé, les lettres d'offre et la rémunération (modèles sans montants), les
     formulaires — GET ?rhReference=1, ?rhReferenceDoc=DM-… (RhReference.gs).
   - Santé et sécurité : la bibliothèque par thème — GET ?sst=1, ?sstDoc=SD-… (Sst.gs).
   Qui la voit : la RH, les propriétaires, les DG et les directeurs (mêmes personnes que l'embauche). Ajouter ou modifier un
   document : Documents à signer › Bibliothèque (RH) et Santé et sécurité (RH, DG).
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez la version qui contient RhReference.gs.';
  var CSS = [
    '.ref-page .ref-groupe { margin: 6px 0 18px; } .ref-page .ref-groupe > h2 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--encre-2); margin: 0 0 8px; }',
    '.ref-page .hub-tuiles { margin: 0; }',
    '.ref-retour { display: inline-flex; gap: 6px; align-items: center; font-weight: 700; color: var(--vert-fonce); text-decoration: none; margin: 0 0 10px; font-size: 14px; }',
    '.ref-retour svg { transform: rotate(180deg); width: 16px; height: 16px; }',
    '.ref-docs { display: flex; flex-direction: column; gap: 8px; }',
    '.ref-doc { display: flex; gap: 14px; align-items: center; width: 100%; text-align: left; border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 13px 16px; cursor: pointer; font: inherit; color: var(--encre); min-height: 56px; }',
    '.ref-doc:hover { border-color: var(--encre-4); background: var(--carte-2); } .ref-doc:focus-visible { outline: 3px solid var(--vert); outline-offset: 2px; }',
    '.ref-doc .t { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; } .ref-doc b { font-size: 15px; } .ref-doc .q { font-size: 13px; color: var(--encre-3); }',
    '.ref-doc .genre { flex: none; font-size: 12px; font-weight: 700; border-radius: 999px; padding: 3px 10px; background: var(--bleu-bg); color: var(--bleu); }',
    '.ref-doc .genre.pdf { background: var(--gris-bg); color: var(--encre-2); }',
    '.ref-texte { background: #fff; color: #111; border: 1px solid var(--ligne); border-radius: 8px; padding: 16px 20px; line-height: 1.55; font-size: 14.5px; max-height: 65vh; overflow: auto; }',
    '.ref-texte p { margin: 0 0 9px; } .ref-texte h2, .ref-texte h3 { margin: 14px 0 6px; } .ref-texte table { border-collapse: collapse; } .ref-texte td, .ref-texte th { border: 1px solid #ccc; padding: 4px 8px; }',
    '.ref-vide { padding: 26px; text-align: center; color: var(--encre-3); }',
    '.ref-filtres { margin: 0 0 12px; } .ref-filtres .saisie.recherche { width: 100%; max-width: 520px; }'
  ].join('\n');
  function css() { if (AMX.embauches && AMX.embauches.css) AMX.embauches.css(); if (!document.getElementById('css-reference')) { var s = document.createElement('style'); s.id = 'css-reference'; s.textContent = CSS; document.head.appendChild(s); } }

  function perms() { return (AMX.session && AMX.session.perms) || {}; }
  function peutVoir() {
    var r = perms().role || '';
    if (r === 'inactif') return false;
    return !!((AMX.embauches && AMX.embauches.peutVoir()) || (AMX.rh && AMX.rh.peutVoir && AMX.rh.peutVoir()) || r === 'admin' || r === 'proprietaire');
  }

  var SUJETS_SST = { sst: 'Santé et sécurité', ergonomie: 'Ergonomie', technicien: 'Techniciens', premiers: 'Premiers soins', accident: 'Accident de travail', formulaires: 'Formulaires SST' };
  var COULEURS = { manuel: 'bleu', lettres: 'violet', formulaires: 'vert', sst: 'ambre', ergonomie: 'sarcelle', technicien: 'gris', premiers: 'rouge', accident: 'rouge', 'sst-formulaires': 'vert' };
  var DESC_SST = { sst: 'La politique, le programme de prévention, les règles de l\'atelier.', ergonomie: 'Les bonnes postures et l\'aménagement du poste.',
    technicien: 'Les consignes propres aux techniciens et à l\'atelier.', premiers: 'Les trousses, les secouristes et quoi faire.', accident: 'Que faire après un accident : déclaration, CNESST, retour au travail.',
    formulaires: 'Les formulaires de santé et sécurité à remplir.' };

  var cache = { rep: null, le: 0, enCours: null };
  function charger(force) {
    if (cache.enCours && !force) return cache.enCours;
    if (!force && cache.rep && Date.now() - cache.le < AMX.dureeCopie(300000)) return Promise.resolve(cache.rep);
    var rh = AMX.get({ rhReference: '1' }, { delai: 60000, secours: false }).then(function (d) {
      if (d && d.refuse) return { erreur: d.erreur || 'Accès refusé.' };
      if (!d || d.ok === false) return { erreur: (d && d.erreur) || 'Lecture impossible.' };
      if (!Array.isArray(d.documents)) return { erreur: SCRIPT_PAS_A_JOUR };
      return d;
    }, function (e) { return { erreur: AMX.erreurTexte(e) }; });
    var sst = AMX.get({ sst: '1' }, { delai: 60000, secours: false }).then(function (d) {
      if (!d || d.ok === false || !Array.isArray(d.documents)) return { erreur: (d && d.erreur) || 'Lecture impossible.' };
      return d;
    }, function (e) { return { erreur: AMX.erreurTexte(e) }; });
    cache.enCours = Promise.all([rh, sst]).then(function (x) {
      cache.enCours = null;
      var rep = { rh: x[0], sst: x[1], sujets: [] };
      var rhDocs = (x[0].documents || []), sujetsRh = x[0].sujets || [];
      sujetsRh.forEach(function (s) {
        var docs = rhDocs.filter(function (d) { return d.sujet === s.id; }).map(function (d) { return { id: d.id, nom: d.nom, description: d.description, source: 'rh', type: d.type, compagnieNom: d.compagnieNom }; });
        if (docs.length) rep.sujets.push({ cle: 'rh:' + s.id, groupe: 'rh', titre: s.titre, desc: s.desc, couleur: COULEURS[s.id] || 'bleu', icone: 'achat', docs: docs });
      });
      var sstDocs = (x[1].documents || []).filter(function (d) { return !d.retire; });
      Object.keys(SUJETS_SST).forEach(function (t) {
        var docs = sstDocs.filter(function (d) { return d.theme === t; }).map(function (d) { return { id: d.id, nom: d.titre, description: d.description, source: 'sst', type: 'pdf', mime: d.mime, compagnieNom: d.compagnie ? nomCie(d.compagnie) : '' }; });
        if (docs.length) rep.sujets.push({ cle: 'sst:' + t, groupe: 'sst', titre: SUJETS_SST[t], desc: DESC_SST[t] || '', couleur: COULEURS[t === 'formulaires' ? 'sst-formulaires' : t] || 'ambre', icone: 'alerte', docs: docs });
      });
      cache.rep = rep; cache.le = Date.now();
      return rep;
    }, function (e) { cache.enCours = null; throw e; });
    return cache.enCours;
  }
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c || ''; }

  /* Ouvrir un PDF : l'onglet s'ouvre tout de suite (le geste de la personne), puis reçoit le fichier. */
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
  function imprimer(titre, html) {
    var w = window.open('', '_blank'); if (!w) { AMX.toast('La fenêtre d\'impression a été bloquée par le navigateur.', 'attention'); return; }
    w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title></title><style>body{font:14px/1.55 system-ui,sans-serif;max-width:760px;margin:30px auto;padding:0 20px;color:#111}td,th{border:1px solid #ccc;padding:4px 8px}table{border-collapse:collapse}</style></head><body></body></html>');
    w.document.title = titre; w.document.body.innerHTML = html; w.document.close(); setTimeout(function () { try { w.print(); } catch (e) {} }, 300);
  }
  function ouvrirDoc(d) {
    if (d.source === 'sst') return ouvrirFichier({ sstDoc: d.id }, d.nom);
    if (d.type !== 'texte') return ouvrirFichier({ rhReferenceDoc: d.id }, d.nom);
    var corps = h('div', [AMX.chargeur(d.nom, { compact: true })]), html = '';
    var m = AMX.modale({ titre: d.nom, corps: corps, large: true, proteger: false, boutons: [{ texte: 'Fermer' }] });
    AMX.get({ rhReferenceDoc: d.id }, { secours: false, delai: 60000 }).then(function (r) {
      if (!r || r.ok === false || typeof r.html !== 'string') throw new Error((r && r.erreur) || (r && r.vehicules ? SCRIPT_PAS_A_JOUR : 'Document indisponible.'));
      html = r.html;   /* nettoyé par le serveur (RH_htmlPropre_ : liste blanche de balises, aucun attribut) */
      AMX.vider(corps);
      var boite = h('div.ref-texte'); boite.innerHTML = html; corps.appendChild(boite);
      m.boutons([{ texte: 'Fermer' }, { texte: 'Imprimer', action: function () { imprimer(d.nom, html); return false; } }]);
    }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('div.ref-vide', { text: AMX.erreurTexte(e) })); });
  }

  /* ------------------------------------------------------------------------------- page */
  function VueRef(conteneur, ctx) {
    css();
    var self = this, p = (ctx && ctx.params) || {};
    this.conteneur = conteneur; this.detruit = false; this.sujet = p.sujet || ''; this.q = p.q || '';
    AMX.vider(conteneur);
    this.el = h('div.page.ref-page'); conteneur.appendChild(this.el);
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    this.el.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Documents de référence'), h('p', { text: 'Tout ce qu\'il faut savoir, rangé par sujet. Touchez un sujet, puis un document.' })]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir], []))
    ]));
    this.inRecherche = h('input.saisie.recherche', { type: 'search', value: this.q, placeholder: 'Chercher un document : vacances, cellulaire, accident, offre…', autocomplete: 'off', 'aria-label': 'Chercher un document' });
    this.el.appendChild(h('div.ref-filtres', [this.inRecherche]));
    this.elCorps = h('div'); this.el.appendChild(this.elCorps);
    this.inRecherche.addEventListener('input', AMX.debounce(function () { self.q = self.inRecherche.value; self.rendre(); }, 160));
    this.inRecherche.addEventListener('keydown', function (e) { if (e.key === 'Escape') { self.inRecherche.value = ''; self.q = ''; self.rendre(); } });
    this.elCorps.appendChild(AMX.chargeur('Documents de référence'));
    this.charger(false);
  }
  VueRef.prototype.demonter = function () { this.detruit = true; };
  VueRef.prototype.naviguer = function (ctx) { var p = (ctx && ctx.params) || {}; this.sujet = p.sujet || ''; this.rendre(); };
  VueRef.prototype.charger = function (force) {
    var self = this;
    charger(force).then(function (rep) { if (self.detruit) return; self.rep = rep; self.rendre(); if (force) AMX.toast('Documents à jour', 'ok'); },
      function (e) { if (self.detruit) return; AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.carte', [h('div.ref-vide', { text: AMX.erreurTexte(e) })])); });
  };
  VueRef.prototype.ligneDoc = function (d, sujet) {
    var pdf = d.type !== 'texte';
    return h('button.ref-doc', { type: 'button', onclick: function () { ouvrirDoc(d); } }, [
      h('span.t', [h('b', { text: d.nom }), (d.description || sujet || d.compagnieNom) ? h('span.q', { text: [sujet, d.description, d.compagnieNom].filter(Boolean).join(' · ') }) : null]),
      h('span.genre' + (pdf ? '.pdf' : ''), { text: pdf ? 'PDF' : 'À lire' })
    ]);
  };
  VueRef.prototype.rendre = function () {
    if (!this.rep || this.detruit) return;
    var self = this, rep = this.rep;
    AMX.vider(this.elCorps);
    var erreurs = [rep.rh.erreur ? 'Ressources humaines : ' + rep.rh.erreur : '', rep.sst.erreur ? 'Santé et sécurité : ' + rep.sst.erreur : ''].filter(Boolean);
    if (erreurs.length) this.elCorps.appendChild(h('div.cex-avis', { text: erreurs.join(' — ') }));
    /* Une recherche : tous les documents qui répondent, avec leur sujet. */
    if (this.q) {
      var trouve = [];
      rep.sujets.forEach(function (s) { s.docs.forEach(function (d) { if (AMX.correspond([d.nom, d.description, s.titre, d.compagnieNom], self.q)) trouve.push(self.ligneDoc(d, s.titre)); }); });
      this.elCorps.appendChild(trouve.length ? h('div.ref-docs', trouve) : h('div.carte', [h('div.ref-vide', { text: 'Aucun document pour « ' + this.q + ' ».' })]));
      return;
    }
    var s = this.sujet ? rep.sujets.filter(function (x) { return x.cle === self.sujet; })[0] : null;
    if (s) {
      this.elCorps.appendChild(h('a.ref-retour', { href: AMX.lien('rh', 'reference') }, [h('span', { html: (AMX.icones && AMX.icones.chevron) || '‹' }), h('span', 'Tous les sujets')]));
      this.elCorps.appendChild(h('h2', { text: s.titre, style: { margin: '0 0 4px' } }));
      if (s.desc) this.elCorps.appendChild(h('p', { text: s.desc, style: { margin: '0 0 12px', color: 'var(--encre-3)' } }));
      this.elCorps.appendChild(h('div.ref-docs', s.docs.map(function (d) { return self.ligneDoc(d); })));
      return;
    }
    if (!rep.sujets.length) { this.elCorps.appendChild(h('div.carte', [h('div.ref-vide', { text: 'Aucun document de référence pour l\'instant.' })])); return; }
    var groupe = function (id, titre) {
      var liste = rep.sujets.filter(function (x) { return x.groupe === id; });
      if (!liste.length) return null;
      return h('section.ref-groupe', [h('h2', { text: titre }), h('div.hub-tuiles' + (liste.length === 4 ? '.quatre' : '') + (liste.length <= 2 ? '.deux' : ''), liste.map(function (x) {
        return h('a.hub-tuile.' + x.couleur, { href: AMX.lien('rh', 'reference', { sujet: x.cle }) }, [
          h('div.haut', [h('span.ic', { html: (AMX.icones && (AMX.icones[x.icone] || AMX.icones.achat)) || '' }), h('h2', { text: x.titre }), h('span.n', { text: String(x.docs.length), title: x.docs.length + ' document' + (x.docs.length > 1 ? 's' : '') })]),
          h('p', { text: x.desc }),
          h('span.ouvrir', [h('span', 'Ouvrir'), h('span', { html: (AMX.icones && AMX.icones.chevron) || '' })])
        ]);
      }))]);
    };
    this.elCorps.appendChild(groupe('rh', 'Ressources humaines'));
    this.elCorps.appendChild(groupe('sst', 'Santé et sécurité'));
  };

  AMX.reference = { charger: charger, peutVoir: peutVoir, vider: function () { cache = { rep: null, le: 0, enCours: null }; } };
  AMX.section('reference', {
    titre: 'Documents de référence', icone: 'achat', ordre: 58,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new VueRef(conteneur, ctx); }
  });
})();
