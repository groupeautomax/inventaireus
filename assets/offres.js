/* =========================================================================
   Section « Offres & clients » : offres reçues (négociation, contrat),
   véhicules en vente (vitrine), acheteurs externes, leads.
   Routes serveur : offresRecues, offreAction (accepter | contre | refuser |
   annuler | lien | km | signer), contratPdf, vitrineListe, publierVehicule,
   regenererCleVitrine, acheteursExternes, acheteurExterneInviter, leadListe.
   Signature électronique (7 oct.) : l'acheteur signe sur sa page ; le
   directeur contresigne ici (« Signer le contrat », tablette AMX.tablette).
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, esc = AMX.esc, I = AMX.icones;

  var cache = { offres: null, vente: null, cle: '', acheteurs: null, concessions: null };

  AMX.section('offres', {
    titre: 'Offres & clients', icone: 'offres', ordre: 20,
    visible: function () { return AMX.perm('changerStatut') || AMX.perm('voirResultats'); },
    onglets: [
      { id: 'recues', titre: 'Offres reçues', compteur: function () { return cache.offres ? cache.offres.filter(function (o) { return o.statut === 'nouvelle'; }).length : ''; } },
      { id: 'vente', titre: 'En vente', compteur: function () { return cache.vente ? cache.vente.length : ''; } },
      { id: 'acheteurs', titre: 'Acheteurs', compteur: function () { return cache.acheteurs ? cache.acheteurs.length : ''; } },
      { id: 'leads', titre: 'Leads', compteur: function () { return (AMX.leads && AMX.leads.compteur) ? AMX.leads.compteur() : ''; } }
    ],
    monter: function (conteneur, ctx) { return new Offres(conteneur, ctx); }
  });

  function Offres(conteneur, ctx) {
    this.conteneur = conteneur; this.onglet = ''; this.sous = null;
    this.naviguer(ctx);
  }
  Offres.prototype.naviguer = function (ctx) {
    if (ctx.onglet !== this.onglet) {
      if (this.sous && this.sous.demonter) { try { this.sous.demonter(); } catch (e) {} }
      AMX.vider(this.conteneur);
      this.onglet = ctx.onglet;
      if (ctx.onglet === 'leads') this.sous = (AMX.leads && AMX.leads.monter) ? AMX.leads.monter(this.conteneur, ctx) : (this.conteneur.appendChild(h('div.page', [h('div.vide', 'Module des leads introuvable.')])), {});
      else if (ctx.onglet === 'vente') this.sous = new EnVente(this.conteneur, ctx);
      else if (ctx.onglet === 'acheteurs') this.sous = new Acheteurs(this.conteneur, ctx);
      else this.sous = new Recues(this.conteneur, ctx);
    } else if (this.sous && this.sous.naviguer) this.sous.naviguer(ctx);
  };
  Offres.prototype.demonter = function () { if (this.sous && this.sous.demonter) this.sous.demonter(); };

  /* ------------------------------ Partagé ------------------------------ */
  function vignetteVin(vin, aPhotos, marqueVehicule) {
    // Logo du constructeur en attendant (ou à défaut de) la photo.
    var el = h('div.vignette', [AMX.logoMarque(marqueVehicule)]);
    if (aPhotos !== false && AMX.photosDe) AMX.photosDe(vin).then(function (p) {
      if (!(p && p.length)) return;
      var img = h('img', { src: AMX.vignetteDrive(p[0].url, 200), alt: '', loading: 'lazy' });
      img.addEventListener('error', function () { AMX.vider(el).appendChild(AMX.logoMarque(marqueVehicule)); });
      AMX.vider(el).appendChild(img);
    });
    return el;
  }
  function vehiculeDe(vin) { return AMX.inventaire.parVin(vin) || {}; }
  function marque(modele) { return String(modele || '').trim().split(' ')[0].toUpperCase(); }
  function lienPublic(cle, vin) { return AMX.SITE + 'vitrine/vehicle.html?k=' + encodeURIComponent(cle) + '&vin=' + encodeURIComponent(vin); }
  function nomConcession(id) { return AMX.CONCESSIONS[String(id || '').toLowerCase()] || id || '—'; }
  function compagnieVersConcession(c) { return AMX.COMPAGNIE_CONCESSION[String(c || '').toUpperCase()] || ''; }

  /* Tablette de signature (7 oct.) — source : site/mock/tablette-signature.js
     (même code dans vitrine/offre.html et vitrine/reponse.html). */
  function creerTablette(conteneur, opts) {
    opts = opts || {};
    var canvas = document.createElement('canvas');
    canvas.className = 'tablette-canvas';
    canvas.setAttribute('aria-label', 'Zone de signature');
    conteneur.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var traits = (opts.traits || []).map(function (t) { return t.slice(); });
    var courant = null, largeur = 0, hauteur = 0, ratio = 1;

    function mesurer() {
      ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      largeur = Math.max(100, conteneur.clientWidth || 300);
      hauteur = Math.max(100, conteneur.clientHeight || 180);
      canvas.width = Math.round(largeur * ratio); canvas.height = Math.round(hauteur * ratio);
      canvas.style.width = largeur + 'px'; canvas.style.height = hauteur + 'px';
      redessiner();
    }
    function tracer(c, t, echelle, dx, dy) {
      if (t.length < 2) {
        c.beginPath(); c.arc((t[0][0] - dx) * echelle, (t[0][1] - dy) * echelle, 1.3 * echelle, 0, Math.PI * 2); c.fill();
        return;
      }
      c.beginPath();
      c.moveTo((t[0][0] - dx) * echelle, (t[0][1] - dy) * echelle);
      for (var i = 1; i < t.length - 1; i++) {
        var mx = (t[i][0] + t[i + 1][0]) / 2, my = (t[i][1] + t[i + 1][1]) / 2;
        c.quadraticCurveTo((t[i][0] - dx) * echelle, (t[i][1] - dy) * echelle, (mx - dx) * echelle, (my - dy) * echelle);
      }
      var d = t[t.length - 1];
      c.lineTo((d[0] - dx) * echelle, (d[1] - dy) * echelle);
      c.stroke();
    }
    function preparer(c, echelle) {
      c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#111'; c.fillStyle = '#111'; c.lineWidth = 2.4 * echelle;
    }
    function redessiner() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      preparer(ctx, ratio);
      traits.forEach(function (t) { tracer(ctx, t, ratio, 0, 0); });
    }
    function point(e) {
      var r = canvas.getBoundingClientRect();
      return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10];
    }
    function debut(e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      courant = [point(e)];
      traits.push(courant);
    }
    function mouvement(e) {
      if (!courant) return;
      e.preventDefault();
      var p = point(e), d = courant[courant.length - 1];
      if (Math.abs(p[0] - d[0]) < 0.6 && Math.abs(p[1] - d[1]) < 0.6) return;
      courant.push(p);
      preparer(ctx, ratio);
      ctx.beginPath();
      ctx.moveTo(d[0] * ratio, d[1] * ratio); ctx.lineTo(p[0] * ratio, p[1] * ratio); ctx.stroke();
    }
    function fin(e) {
      if (!courant) return;
      courant = null;
      redessiner();
      if (opts.onChange) opts.onChange();
    }
    canvas.addEventListener('pointerdown', debut);
    canvas.addEventListener('pointermove', mouvement);
    canvas.addEventListener('pointerup', fin);
    canvas.addEventListener('pointercancel', fin);
    canvas.addEventListener('pointerleave', fin);
    window.addEventListener('resize', mesurer);
    mesurer();

    function longueur() {
      var l = 0;
      traits.forEach(function (t) { for (var i = 1; i < t.length; i++) l += Math.sqrt(Math.pow(t[i][0] - t[i - 1][0], 2) + Math.pow(t[i][1] - t[i - 1][1], 2)); });
      return l;
    }
    return {
      vide: function () { return longueur() < 40; },
      traits: function () { return traits.map(function (t) { return t.slice(); }); },
      effacer: function () { traits = []; courant = null; redessiner(); if (opts.onChange) opts.onChange(); },
      detruire: function () { window.removeEventListener('resize', mesurer); },
      image: function () {
        if (longueur() < 40) return '';
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        traits.forEach(function (t) { t.forEach(function (p) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }); });
        var marge = 12, w = Math.max(40, x1 - x0 + marge * 2), hh = Math.max(40, y1 - y0 + marge * 2);
        var echelle = Math.min(1, 600 / w, 220 / hh) * 2;
        var sortie = document.createElement('canvas');
        sortie.width = Math.ceil(w * echelle); sortie.height = Math.ceil(hh * echelle);
        var c = sortie.getContext('2d');
        preparer(c, echelle);
        traits.forEach(function (t) { tracer(c, t, echelle, x0 - marge, y0 - marge); });
        return sortie.toDataURL('image/png');
      }
    };
  }
  AMX.tablette = creerTablette;

  /* =================================================================== */
  /*                           OFFRES REÇUES                             */
  /* =================================================================== */
  function Recues(conteneur, ctx) {
    var self = this;
    this.conteneur = conteneur;
    this.offres = cache.offres || [];
    this.selection = ctx.params.o || '';
    this.filtres = { recherche: '', statuts: ['nouvelle', 'contre', 'acceptee', 'contrat'], compagnie: '' };
    this.construire();
    this.charger();
    this.minuterie = setInterval(function () { if (!document.hidden && !self.ecriture) self.charger(true); }, 90000);
  }
  Recues.prototype.demonter = function () { clearInterval(this.minuterie); };
  Recues.prototype.naviguer = function (ctx) { if (ctx.params.o !== this.selection) { this.selection = ctx.params.o || ''; this.rendre(); } };

  Recues.prototype.construire = function () {
    var self = this;
    this.elKpis = h('div.kpis'); this.elRail = h('aside.rail'); this.elListe = h('div'); this.elOutils = h('div.outils-liste'); this.elPanneau = h('aside.panneau');
    this.elAgencement = h('div.agencement', [this.elRail, h('div.colonne-liste', [this.elOutils, this.elListe]), this.elPanneau]);
    this.conteneur.appendChild(h('div.page', [
      h('div.entete-page', [
        h('div', [h('h1', 'Offres reçues'), h('p#off-etat', 'Les offres faites par les acheteurs sur les véhicules en vente.')]),
        h('div.actions', [
          h('button.btn.fantome.icone', { title: 'Filtres', html: I.filtre, onclick: function () { self.elRail.classList.toggle('ouvert'); } }),
          h('button.btn', { html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } })
        ])
      ]),
      this.elKpis, this.elAgencement
    ]));
    this.construireRail();
  };
  Recues.prototype.construireRail = function () {
    var self = this, f = this.filtres;
    AMX.vider(this.elRail);
    var rech = h('div.recherche', [h('span', { html: I.recherche }), h('input.saisie', { type: 'search', placeholder: 'Véhicule, VIN, acheteur', value: f.recherche, oninput: AMX.debounce(function (e) { f.recherche = e.target.value; self.rendre(); }, 120) })]);
    var grp = h('div.groupe', [h('h3', ['Statut', h('button', { type: 'button', text: 'Tout', onclick: function () { f.statuts = Object.keys(AMX.STATUTS_OFFRE); self.construireRail(); self.rendre(); } })])]);
    Object.keys(AMX.STATUTS_OFFRE).forEach(function (s) {
      var st = AMX.STATUTS_OFFRE[s];
      var n = self.offres.filter(function (o) { return o.statut === s; }).length;
      var cb = h('input', { type: 'checkbox', checked: f.statuts.indexOf(s) >= 0 });
      cb.addEventListener('change', function () { if (cb.checked) f.statuts.push(s); else f.statuts = f.statuts.filter(function (x) { return x !== s; }); self.rendre(); });
      grp.appendChild(h('label.case', [cb, h('span.pastille', { style: { background: 'var(--' + st.couleur + ')' } }), h('span', { text: st.libelle }), h('span.compte', { text: n })]));
    });
    var seg = h('div.segment.bloc');
    [['', 'Toutes']].concat(Object.keys(AMX.COMPAGNIES).map(function (c) { return [c, c]; })).forEach(function (c) { seg.appendChild(h('button' + (f.compagnie === c[0] ? '.actif' : ''), { type: 'button', text: c[1], onclick: function () { f.compagnie = c[0]; self.construireRail(); self.rendre(); } })); });
    this.elRail.appendChild(h('div.groupe', [h('h3', 'Recherche'), rech, h('div', { style: { height: '10px' } }), h('div.etiquette', { style: { marginBottom: '6px' }, text: 'Compagnie du véhicule' }), seg]));
    this.elRail.appendChild(grp);
  };
  Recues.prototype.charger = function (force) {
    var self = this;
    var etat = document.getElementById('off-etat');
    if (!cache.offres) { AMX.vider(this.elListe); this.elListe.appendChild(AMX.chargeur('Offres reçues')); }
    return Promise.all([AMX.post({ action: 'offresRecues' }), AMX.inventaire.tout().catch(function () { return []; })]).then(function (r) {
      var d = AMX.verifier(r[0], 'Impossible de lire les offres');
      cache.offres = d.offres || [];
      self.offres = cache.offres;
      if (etat) etat.textContent = self.offres.length + ' offre' + (self.offres.length > 1 ? 's' : '') + ' · synchronisé à ' + new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
      self.construireRail(); self.rendre(); AMX.rafraichirSousBarre();
    }).catch(function (e) {
      AMX.vider(self.elListe); self.elListe.appendChild(h('div.vide', [h('div', { html: I.alerte }), h('h3', 'Offres indisponibles'), h('div', { text: AMX.erreurTexte(e) })]));
      if (etat) etat.textContent = AMX.erreurTexte(e);
    });
  };
  Recues.prototype.filtrer = function () {
    var f = this.filtres;
    var l = this.offres.filter(function (o) { return f.statuts.indexOf(o.statut || 'nouvelle') >= 0; });
    if (f.compagnie) l = l.filter(function (o) { return (vehiculeDe(o.vin).compagnie || '') === f.compagnie; });
    if (f.recherche) { var t = f.recherche.toLowerCase(); l = l.filter(function (o) { return [o.modele, o.vin, o.nom, o.entreprise, o.courriel, vehiculeDe(o.vin).stock].join(' ').toLowerCase().indexOf(t) >= 0; }); }
    return l.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  };
  Recues.prototype.rendre = function () {
    var self = this, f = this.filtres;
    AMX.vider(this.elKpis);
    var aContresigner = self.offres.filter(function (o) { return o.statut === 'contrat' && !o.contresigne; }).length;
    [['nouvelle', 'À traiter'], ['contre', 'Contre-offres en attente'], ['acceptee', 'Acceptées à finaliser'], ['contrat', 'Contrats signés']].forEach(function (k) {
      var n = self.offres.filter(function (o) { return o.statut === k[0]; }).length;
      var actif = f.statuts.length === 1 && f.statuts[0] === k[0];
      var attention = (k[0] === 'nouvelle' && n) || (k[0] === 'contrat' && aContresigner);
      var libelle = k[1] + (k[0] === 'contrat' && aContresigner ? ' · ' + aContresigner + ' à contresigner' : '');
      self.elKpis.appendChild(h('button.kpi' + (actif ? '.actif' : '') + (attention ? '.attention' : ''), { type: 'button', onclick: function () { f.statuts = actif ? ['nouvelle', 'contre', 'acceptee', 'contrat'] : [k[0]]; self.construireRail(); self.rendre(); } }, [h('div.valeur', { text: n }), h('div.libelle', { text: libelle }), h('span.pastille', { style: { background: 'var(--' + AMX.STATUTS_OFFRE[k[0]].couleur + ')' } })]));
    });
    var liste = this.filtrer();
    AMX.vider(this.elOutils);
    this.elOutils.appendChild(h('span.compte', [h('b', { text: liste.length }), ' offre' + (liste.length > 1 ? 's' : '')]));
    AMX.vider(this.elListe);
    if (!liste.length) this.elListe.appendChild(h('div.vide', [h('div', { html: I.offres }), h('h3', 'Aucune offre'), h('div', 'Aucune offre ne correspond aux filtres.')]));
    else { var ul = h('div.liste'); liste.forEach(function (o) { ul.appendChild(self.ligne(o)); }); this.elListe.appendChild(ul); }
    this.rendrePanneau();
  };
  Recues.prototype.ligne = function (o) {
    var self = this, v = vehiculeDe(o.vin), st = AMX.STATUTS_OFFRE[o.statut] || { libelle: o.statut, couleur: 'gris' };
    var montant = o.statut === 'contrat' || o.statut === 'acceptee' ? o.prixFinal : (o.statut === 'contre' ? o.contre : o.prix);
    var el = h('div.ligne' + (this.selection === o.id ? '.actif' : ''), { dataset: { id: o.id } }, [
      vignetteVin(o.vin, v.hasPhotos, marque(o.modele || v.modele)),
      h('div', { style: { minWidth: 0 } }, [h('div.titre', { text: o.modele || v.modele || o.vin }), h('div.sous', [h('span.vin', { text: o.vin }), v.stock ? h('span.puce.mono', { text: v.stock }) : null, v.compagnie ? h('span.puce', { text: v.compagnie }) : null])]),
      h('div.cell', [h('span.l', 'Acheteur'), h('span.v', { text: o.nom || o.courriel || '—' }), h('span.v.doux', { text: o.entreprise || o.courriel || '' })]),
      h('div.cell.statut', [h('span.l', 'Statut'), h('span', [h('span.badge.' + st.couleur, { text: st.libelle })]), h('span.jours', { text: AMX.fmtDate(o.date, true) })]),
      h('div.cell.indic', [h('span.l', 'Négociation'), h('div.indicateurs', [h('span.puce', { text: 'Offert ' + AMX.fmtArgent(o.prix) }), o.contre ? h('span.puce.info', { text: 'Contre ' + AMX.fmtArgent(o.contre) }) : null, o.noContrat ? h('span.puce.ok', { text: o.noContrat }) : null, o.statut === 'contrat' ? h('span.puce' + (o.contresigne ? '.ok' : '.attention'), { text: o.contresigne ? 'Signé ×2' : 'À contresigner' }) : null])]),
      h('div.montant', [h('span.l', o.statut === 'contrat' || o.statut === 'acceptee' ? 'Prix convenu' : (o.statut === 'contre' ? 'Contre-offre' : 'Offert')), h('span', { text: AMX.fmtArgent(montant) })]),
      h('button.plus', { type: 'button', html: I.chevron })
    ]);
    el.addEventListener('click', function () { self.selectionner(o.id); });
    return el;
  };
  Recues.prototype.selectionner = function (id) {
    this.selection = id;
    history.replaceState(null, '', AMX.lien('offres', 'recues', id ? { o: id } : {}));
    this.elListe.querySelectorAll('.ligne').forEach(function (l) { l.classList.toggle('actif', l.dataset.id === id); });
    this.rendrePanneau();
  };
  Recues.prototype.rendrePanneau = function () {
    var self = this;
    var o = this.selection ? this.offres.filter(function (x) { return x.id === self.selection; })[0] : null;
    this.elAgencement.classList.toggle('avec-panneau', !!o);
    AMX.vider(this.elPanneau);
    if (!o) { this.elPanneau.style.display = 'none'; return; }
    this.elPanneau.style.display = '';
    var v = vehiculeDe(o.vin), st = AMX.STATUTS_OFFRE[o.statut] || { libelle: o.statut, couleur: 'gris' };
    var peut = AMX.perm('changerStatut');
    var agir = function (op, extra, message) {
      self.ecriture = true;
      return AMX.post(Object.assign({ action: 'offreAction', op: op, id: o.id, vin: o.vin }, extra || {})).then(function (d) {
        AMX.verifier(d, 'Action refusée');
        if (d.courrielEnvoye === false && op !== 'km' && op !== '') AMX.toast('Enregistré, mais le courriel à l\'acheteur n\'est pas parti : ' + (d.courrielErreur || 'raison inconnue'), 'attention', 9000);
        else if (message) AMX.toast(message, 'ok');
        return self.charger(true).then(function () { return d; });
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); throw e; }).finally(function () { self.ecriture = false; });
    };

    // Négociation
    var blocNego = h('div.bloc', [h('h3', 'Négociation')]);
    var dl = h('dl.kv.serre', [
      h('dt', 'Prix offert'), h('dd', [h('b', { text: AMX.fmtArgent(o.prix) }), o.conditions ? h('div.doux.petit', { text: 'Conditions : ' + o.conditions }) : null]),
      o.contre ? h('dt', 'Contre-offre') : null, o.contre ? h('dd', { text: AMX.fmtArgent(o.contre) + (o.contrePar ? ' · ' + o.contrePar : '') + (o.contreLe ? ' · ' + AMX.fmtDate(o.contreLe) : '') }) : null,
      o.prixFinal ? h('dt', 'Prix convenu') : null, o.prixFinal ? h('dd', [h('b', { text: AMX.fmtArgent(o.prixFinal) }), h('span.doux', { text: (o.acceptePar ? ' · ' + o.acceptePar : '') + (o.accepteLe ? ' · ' + AMX.fmtDate(o.accepteLe) : '') })]) : null,
      h('dt', 'Reçue le'), h('dd', { text: AMX.fmtDate(o.date, true) }),
      o.traitePar ? h('dt', 'Traitée par') : null, o.traitePar ? h('dd', { text: o.traitePar }) : null
    ]);
    blocNego.appendChild(dl);
    var actions = h('div.actions-ligne', { style: { marginTop: '12px' } });
    if (peut && o.statut === 'nouvelle') {
      actions.appendChild(h('button.btn.primaire', { html: I.ok + '<span>Accepter ' + esc(AMX.fmtArgent(o.prix)) + '</span>', onclick: function () { AMX.confirmer('Accepter l\'offre', 'Accepter ' + AMX.fmtArgent(o.prix) + ' pour ' + (o.modele || o.vin) + ' ? L\'acheteur reçoit le lien pour finaliser et signer.').then(function (ok) { if (ok) agir('accepter', {}, 'Offre acceptée — lien envoyé à l\'acheteur'); }); } }));
      actions.appendChild(h('button.btn', { text: 'Contre-offre', onclick: function () { self.modaleContre(o, agir); } }));
      actions.appendChild(h('button.btn.danger', { text: 'Refuser', onclick: function () { self.modaleRefus(o, agir); } }));
    } else if (peut && (o.statut === 'contre' || o.statut === 'acceptee')) {
      blocNego.appendChild(h('div.alerte-bloc.info', { style: { marginTop: '10px' } }, [h('span', { html: I.info }), h('div', o.statut === 'contre' ? 'En attente de la réponse de l\'acheteur à votre contre-offre.' : 'Prix convenu : l\'acheteur doit finaliser (coordonnées, livraison, signature) depuis son lien.')]));
      actions.appendChild(h('button.btn', { html: I.courriel + '<span>Renvoyer le lien</span>', onclick: function () { agir('lien', {}, 'Lien renvoyé à l\'acheteur'); } }));
      actions.appendChild(h('button.btn.danger', { text: 'Annuler l\'offre', onclick: function () { AMX.confirmer('Annuler l\'offre', 'Annuler la négociation avec ' + (o.nom || o.courriel) + ' ?', { danger: true, ok: 'Annuler l\'offre' }).then(function (ok) { if (ok) agir('annuler', {}, 'Offre annulée'); }); } }));
    } else if (o.statut === 'contrat') {
      var sg = o.signatures || {}, sA = sg.acheteur, sV = sg.vendeur;
      var ligneA = 'Signé par l\'acheteur' + (sA && sA.nom ? ' (' + sA.nom + ')' : '') + ' le ' + AMX.fmtDate((sA && sA.quand) || o.contratLe, true) + (sA && sA.tracee === false ? ' — nom tapé' : '');
      if (o.contresigne) {
        blocNego.appendChild(h('div.alerte-bloc.ok', { style: { marginTop: '10px' } }, [h('span', { html: I.ok }), h('div', [h('div', ['Contrat ', h('b', { text: o.noContrat || '' }), ' signé par les deux parties' + (o.livraison ? ' · livraison ' + o.livraison : '')]), h('div.petit', { text: ligneA }), h('div.petit', { text: 'Contresigné pour le vendeur' + (sV && sV.nom ? ' par ' + sV.nom : '') + ' le ' + AMX.fmtDate(sV && sV.quand, true) + ' — version finale envoyée aux deux parties' })])]));
      } else {
        blocNego.appendChild(h('div.alerte-bloc.attention', { style: { marginTop: '10px' } }, [h('span', { html: I.alerte }), h('div', [h('div', ['Contrat ', h('b', { text: o.noContrat || '' }), ' — à contresigner' + (o.livraison ? ' · livraison ' + o.livraison : '')]), h('div.petit', { text: ligneA + '. Il reste la signature du vendeur : les deux PDF seront refaits et renvoyés à l\'acheteur.' })])]));
        if (peut) actions.appendChild(h('button.btn.primaire', { html: I.ok + '<span>Signer le contrat</span>', onclick: function () { self.modaleSigner(o, agir); } }));
      }
      ['vendeur', 'acheteur'].forEach(function (copie) {
        actions.appendChild(h('button.btn', { html: I.telecharger + '<span>Contrat PDF (' + copie + ')</span>', onclick: function (e) {
          var b = e.currentTarget; b.classList.add('occupe');
          AMX.post({ action: 'contratPdf', id: o.id, copie: copie }, { delai: 90000 }).then(function (d) { AMX.verifier(d, 'Contrat introuvable'); AMX.telechargerBase64(d.base64, d.nom || ('contrat-' + copie + '.pdf'), 'application/pdf'); }).catch(function (err) { AMX.toast(AMX.erreurTexte(err), 'erreur'); }).finally(function () { b.classList.remove('occupe'); });
        } }));
      });
    }
    if (actions.childNodes.length) blocNego.appendChild(actions);

    // Km + note interne
    var km = h('input.saisie', { type: 'number', value: o.km || '', placeholder: 'km' });
    var note = h('textarea.saisie', { rows: '2', placeholder: 'Note interne (jamais vue par l\'acheteur)', text: o.noteInterne || '' });
    var btnSauver = h('button.btn.petit', { text: 'Enregistrer', style: { visibility: 'hidden' } });
    var surChangement = function () { btnSauver.style.visibility = (km.value !== String(o.km || '') || note.value !== String(o.noteInterne || '')) ? 'visible' : 'hidden'; };
    km.addEventListener('input', surChangement); note.addEventListener('input', surChangement);
    btnSauver.addEventListener('click', function () { btnSauver.classList.add('occupe'); agir('km', { km: km.value, note: note.value }, 'Enregistré').catch(function () {}).finally(function () { btnSauver.classList.remove('occupe'); }); });
    var blocNote = h('div.bloc', [h('h3', ['Kilométrage et note interne', btnSauver]), h('div.grille.c2', [h('div.champ', [h('label', 'Kilométrage' + (o.kmSource === 'fiche' ? ' (fiche d\'achat)' : '')), km]), h('div.plein', [h('div.champ', [h('label', 'Note interne'), note])])])]);
    if (o.statut === 'contrat') { km.disabled = true; }

    // Acheteur
    var a = o.acheteur || {};
    var blocAcheteur = h('div.bloc', [h('h3', 'Acheteur'), h('dl.kv.serre', [
      h('dt', 'Nom'), h('dd', { text: o.nom || '—' }),
      h('dt', 'Entreprise'), h('dd', { text: a.nomLegal || o.entreprise || '—' }),
      h('dt', 'Courriel'), h('dd', [o.courriel ? h('a', { href: 'mailto:' + o.courriel, text: o.courriel }) : '—']),
      h('dt', 'Téléphone'), h('dd', [o.telephone ? h('a', { href: 'tel:' + o.telephone, text: o.telephone }) : '—']),
      h('dt', 'Langue'), h('dd', { text: o.langue === 'en' ? 'Anglais' : 'Français' }),
      a.adresse ? h('dt', 'Adresse') : null, a.adresse ? h('dd', { text: [a.adresse, [a.ville, a.province, a.codePostal].filter(Boolean).join(' '), a.pays].filter(Boolean).join(', ') }) : null,
      a.noConcessionnaire ? h('dt', 'No concessionnaire') : null, a.noConcessionnaire ? h('dd', { text: a.noConcessionnaire }) : null,
      a.tps ? h('dt', 'TPS / TVQ') : null, a.tps ? h('dd', { text: a.tps + (a.tvq ? ' · ' + a.tvq : '') }) : null
    ])]);

    // Historique
    var hist = (o.historique || []).slice().reverse();
    var LIB = { offre: 'Offre de l\'acheteur', contre: 'Contre-offre', acceptee: 'Acceptée', refusee: 'Refusée', annulee: 'Annulée', lien: 'Lien renvoyé', signature: 'Signature de l\'acheteur', signatureVendeur: 'Signature du vendeur', signe: 'Contrat signé par les deux parties', contrat: 'Contrat généré', courrielEchec: 'Courriel à l\'acheteur non parti', km: 'Kilométrage', note: 'Note' };
    var blocHist = h('div.bloc', [h('h3', 'Historique'), hist.length ? h('ul.chrono', hist.map(function (e) {
      return h('li' + (e.par === 'systeme' ? '.systeme' : '') + (e.type === 'courrielEchec' ? '.alerte' : ''), [
        h('div', [h('b', { text: LIB[e.type] || e.type }), e.montant ? ' · ' + AMX.fmtArgent(e.montant) : '', e.qui ? h('span.doux', { text: ' · ' + e.qui }) : null]),
        e.note ? h('div.doux.petit', { text: e.note }) : null,
        h('div.quand', { text: AMX.fmtDate(e.quand, true) })
      ]);
    })) : h('div.doux.petit', 'Aucun événement.')]);

    // Liens
    var blocLiens = h('div.bloc', [h('h3', 'Liens'), h('div.actions-ligne', [
      o.url ? h('a.btn', { href: o.url, target: '_blank', rel: 'noopener', html: I.externe + '<span>Page de l\'offre (acheteur)</span>' }) : null,
      o.url ? h('button.btn', { html: I.copier + '<span>Copier le lien</span>', onclick: function () { AMX.copier(o.url, 'Lien de l\'offre copié'); } }) : null,
      v._feuille ? h('a.btn', { href: AMX.lien('inventaire', v._feuille.toLowerCase(), { vin: o.vin }), html: I.inventaire + '<span>Voir à l\'inventaire</span>' }) : null,
      cache.cle ? h('a.btn', { href: lienPublic(cache.cle, o.vin), target: '_blank', rel: 'noopener', html: I.externe + '<span>Page du véhicule</span>' }) : null
    ])]);

    this.elPanneau.appendChild(h('div.carte', [
      h('div.panneau-entete', [
        h('div', { style: { minWidth: 0 } }, [h('h2', { text: o.modele || v.modele || o.vin }), h('div.sous', [h('span.mono', { text: o.vin }), v.stock ? h('span.puce.mono', { text: v.stock }) : null, h('span.badge.' + st.couleur, { text: st.libelle })])]),
        h('button.fermer', { html: I.fermer, onclick: function () { self.selectionner(''); } })
      ]),
      blocNego, blocNote, blocAcheteur, blocHist, blocLiens
    ]));
  };
  /* Contresignature du directeur (7 oct.) : tablette, nom, autorisation. */
  Recues.prototype.modaleSigner = function (o, agir) {
    var cadre = h('div.tablette.vide', [h('div.indice', 'Signez ici')]);
    var nom = h('input.saisie', { type: 'text', autocomplete: 'name', placeholder: 'Nom du signataire', value: AMX.session.nom || '' });
    var accepte = h('input', { type: 'checkbox' });
    var vendeur = compagnieVersConcession(vehiculeDe(o.vin).compagnie);
    var nomVendeur = vendeur ? nomConcession(vendeur) : 'le vendeur';
    var erreur = h('div.alerte-bloc.erreur', { style: { display: 'none' } });
    var tablette = null;
    var modale = AMX.modale({ titre: 'Signer le contrat ' + (o.noContrat || ''), corps: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
      h('p', { style: { margin: 0, color: 'var(--encre-2)' }, text: 'Tracez votre signature (souris, doigt ou stylet). Elle sera imprimée sur les deux copies du contrat avec la date, l\'heure et votre courriel ; les PDF refaits partent aussitôt à l\'acheteur et à l\'équipe.' }),
      h('div', [cadre, h('div.tablette-outils', [h('span', 'Votre signature apparaîtra sur le contrat.'), h('button', { type: 'button', text: 'Effacer et recommencer', onclick: function () { if (tablette) tablette.effacer(); } })])]),
      h('div.champ', [h('label', 'Nom du signataire (imprimé au contrat)'), nom]),
      h('label.case', [accepte, h('span', { text: 'Je suis autorisé(e) à signer ce contrat pour ' + nomVendeur + ' et j\'en accepte les conditions.' })]),
      erreur
    ]), boutons: [{ texte: 'Annuler' }, { texte: 'Signer le contrat', classe: 'primaire', action: function () {
      var montrer = function (t) { erreur.textContent = t; erreur.style.display = ''; return false; };
      if (nom.value.trim().length < 3) return montrer('Inscrivez le nom du signataire.');
      var image = tablette ? tablette.image() : '';
      if (!image) return montrer('Tracez votre signature dans le cadre.');
      if (!accepte.checked) return montrer('Cochez la case d\'autorisation.');
      erreur.style.display = 'none';
      return agir('signer', { nom: nom.value.trim(), signatureImage: image, accepte: true, agent: navigator.userAgent }, 'Contrat contresigné — version finale envoyée à l\'acheteur et à l\'équipe').then(function () { return true; }, function () { return false; });
    } }], onFermer: function () { if (tablette) tablette.detruire(); } });
    tablette = AMX.tablette(cadre, { onChange: function () { cadre.classList.toggle('vide', tablette.vide()); } });
    return modale;
  };
  Recues.prototype.modaleContre = function (o, agir) {
    var montant = h('input.saisie', { type: 'number', step: '100', placeholder: 'Montant de la contre-offre', value: o.contre || '' });
    var message = h('textarea.saisie', { rows: '3', placeholder: 'Message à l\'acheteur (facultatif)' });
    AMX.modale({ titre: 'Contre-offre — ' + (o.modele || o.vin), corps: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
      h('p', { style: { margin: 0, color: 'var(--encre-2)' }, text: 'Offert : ' + AMX.fmtArgent(o.prix) + ' par ' + (o.nom || o.courriel) + '. L\'acheteur reçoit votre contre-offre par courriel et peut l\'accepter, la refuser ou refaire une offre.' }),
      h('div.champ', [h('label', 'Contre-offre ($)'), montant]), h('div.champ', [h('label', 'Message'), message])]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Envoyer la contre-offre', classe: 'primaire', action: function () {
        var m = AMX.montant(montant.value); if (!(m > 0)) { montant.style.borderColor = 'var(--rouge)'; montant.focus(); return false; }
        return agir('contre', { montant: String(m), message: message.value.trim() }, 'Contre-offre envoyée à l\'acheteur');
      } }] });
  };
  Recues.prototype.modaleRefus = function (o, agir) {
    var message = h('textarea.saisie', { rows: '3', placeholder: 'Message à l\'acheteur (facultatif)' });
    AMX.modale({ titre: 'Refuser l\'offre', corps: h('div', [h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)' }, text: 'Refuser ' + AMX.fmtArgent(o.prix) + ' de ' + (o.nom || o.courriel) + ' pour ' + (o.modele || o.vin) + ' ? L\'acheteur en est informé par courriel.' }), h('div.champ', [h('label', 'Message'), message])]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Refuser l\'offre', classe: 'danger', action: function () { return agir('refuser', { message: message.value.trim() }, 'Offre refusée'); } }] });
  };

  /* =================================================================== */
  /*                             EN VENTE                                */
  /* =================================================================== */
  function EnVente(conteneur, ctx) {
    this.conteneur = conteneur; this.liste = cache.vente || []; this.recherche = '';
    this.construire(); this.charger();
    if (ctx.params.vin) this.vinInitial = ctx.params.vin;
  }
  EnVente.prototype.demonter = function () {};
  EnVente.prototype.naviguer = function (ctx) { if (ctx.params.vin) this.modalePublier(ctx.params.vin); };
  EnVente.prototype.construire = function () {
    var self = this;
    this.elKpis = h('div.kpis'); this.elListe = h('div'); this.elOutils = h('div.outils-liste');
    this.conteneur.appendChild(h('div.page', [
      h('div.entete-page', [
        h('div', [h('h1', 'Véhicules en vente'), h('p#vente-etat', 'La vitrine envoyée aux acheteurs : chaque véhicule publié a sa page publique.')]),
        h('div.actions', [
          h('button.btn', { html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } }),
          h('button.btn', { html: I.copier + '<span>Lien de la vitrine</span>', title: 'Copier le lien de la liste complète', onclick: function () { if (!cache.cle) return AMX.toast('Clé non chargée', 'attention'); AMX.copier(AMX.SITE + 'vitrine/index.html?k=' + encodeURIComponent(cache.cle), 'Lien de la vitrine copié'); } }),
          AMX.estAdmin() ? h('button.btn.fantome', { text: 'Régénérer la clé', onclick: function () { self.regenerer(); } }) : null,
          AMX.perm('changerStatut') ? h('button.btn.primaire', { html: I.plus + '<span>Mettre en vente</span>', onclick: function () { self.modalePublier(''); } }) : null
        ])
      ]),
      this.elKpis, h('div.colonne-liste', [this.elOutils, this.elListe])
    ]));
  };
  EnVente.prototype.charger = function (force) {
    var self = this, etat = document.getElementById('vente-etat');
    if (!cache.vente) { AMX.vider(this.elListe); this.elListe.appendChild(AMX.chargeur('Véhicules en vente')); }
    return Promise.all([AMX.post({ action: 'vitrineListe' }), AMX.inventaire.tout().catch(function () { return []; })]).then(function (r) {
      var d = AMX.verifier(r[0], 'Impossible de lire la vitrine');
      cache.vente = d.vehicules || []; cache.cle = d.cle || cache.cle;
      self.liste = cache.vente;
      if (etat) etat.textContent = self.liste.length + ' véhicule' + (self.liste.length > 1 ? 's' : '') + ' en vente · synchronisé à ' + new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
      self.rendre(); AMX.rafraichirSousBarre();
      if (self.vinInitial) { var vin = self.vinInitial; self.vinInitial = ''; self.modalePublier(vin); }
    }).catch(function (e) { AMX.vider(self.elListe); self.elListe.appendChild(h('div.vide', [h('div', { html: I.alerte }), h('h3', 'Vitrine indisponible'), h('div', { text: AMX.erreurTexte(e) })])); });
  };
  EnVente.prototype.rendre = function () {
    var self = this;
    AMX.vider(this.elKpis);
    var avecPrix = this.liste.filter(function (p) { return AMX.montant(p.prix) > 0; }).length;
    var sansDesc = this.liste.filter(function (p) { return !String(p.description || '').trim(); }).length;
    var vendus = this.liste.filter(function (p) { var v = vehiculeDe(p.vin); return v.statut === 'arrive' || v.statut === 'comptabilise'; }).length;
    this.elKpis.appendChild(h('div.kpi.neutre', [h('div.valeur', { text: this.liste.length }), h('div.libelle', 'En vente')]));
    this.elKpis.appendChild(h('div.kpi.neutre', [h('div.valeur', { text: avecPrix }), h('div.libelle', 'Avec prix affiché')]));
    this.elKpis.appendChild(h('div.kpi.neutre' + (sansDesc ? '.attention' : ''), [h('div.valeur', { text: sansDesc }), h('div.libelle', 'Sans description')]));
    if (vendus) this.elKpis.appendChild(h('div.kpi.neutre.alerte', [h('div.valeur', { text: vendus }), h('div.libelle', 'Déjà vendus (à retirer)')]));
    AMX.vider(this.elOutils);
    var rech = h('div.recherche', { style: { width: '280px' } }, [h('span', { html: I.recherche }), h('input.saisie', { type: 'search', placeholder: 'Modèle, VIN, # stock', value: this.recherche, oninput: AMX.debounce(function (e) { self.recherche = e.target.value; self.rendreListe(); }, 120) })]);
    this.elOutils.appendChild(rech);
    this.rendreListe();
  };
  EnVente.prototype.rendreListe = function () {
    var self = this, t = this.recherche.toLowerCase();
    var l = this.liste.filter(function (p) { var v = vehiculeDe(p.vin); return !t || [p.vin, v.modele, v.stock, p.description].join(' ').toLowerCase().indexOf(t) >= 0; });
    AMX.vider(this.elListe);
    if (!l.length) { this.elListe.appendChild(h('div.vide', [h('div', { html: I.voiture }), h('h3', 'Aucun véhicule en vente'), h('div', 'Mettez un véhicule de l\'inventaire en vente pour générer sa page publique.')])); return; }
    var ul = h('div.liste');
    l.forEach(function (p) {
      var v = vehiculeDe(p.vin); var st = v.statut ? AMX.statut(v.statut, v._feuille) : null;
      var lien = cache.cle ? lienPublic(cache.cle, p.vin) : '';
      var el = h('div.ligne', { style: { cursor: 'default' } }, [
        vignetteVin(p.vin, v.hasPhotos, marque(v.modele)),
        h('div', { style: { minWidth: 0 } }, [h('div.titre', { text: v.modele || p.vin }), h('div.sous', [h('span.vin', { text: p.vin }), v.stock ? h('span.puce.mono', { text: v.stock }) : null, v.compagnie ? h('span.puce', { text: v.compagnie }) : null, st ? h('span.badge.' + st.couleur, { text: st.libelle }) : null])]),
        h('div.cell', [h('span.l', 'Description'), h('span.v', { text: p.description || '— aucune —', title: p.description || '' })]),
        h('div.cell.maj', [h('span.l', 'Publié'), h('span.v', { text: AMX.fmtDate(p.publieLe) }), h('span.v.doux', { text: p.publiePar || '' })]),
        h('div.cell.indic', [h('span.l', 'Lien'), h('div.indicateurs', [lien ? h('button.puce.info', { type: 'button', html: 'Copier le lien', onclick: function () { AMX.copier(lien, 'Lien de la page copié'); } }) : null, lien ? h('a.puce', { href: lien, target: '_blank', rel: 'noopener', text: 'Ouvrir' }) : null, p.video ? h('span.puce.ok', { text: 'Vidéo' }) : null])]),
        h('div.montant', [h('span.l', 'Prix'), h('span', { text: AMX.montant(p.prix) > 0 ? AMX.fmtArgent(p.prix) : 'Sur demande' })]),
        h('button.plus', { type: 'button', title: 'Modifier', html: I.points, onclick: function () { self.modalePublier(p.vin, p); } })
      ]);
      ul.appendChild(el);
    });
    this.elListe.appendChild(ul);
  };
  EnVente.prototype.modalePublier = function (vin, existant) {
    var self = this;
    existant = existant || this.liste.filter(function (p) { return p.vin === String(vin).toUpperCase(); })[0] || null;
    var choisi = vin ? vehiculeDe(vin) : null;
    var champVin = h('input.saisie.mono', { type: 'text', placeholder: 'VIN, modèle ou # stock de l\'inventaire', value: vin || '', disabled: !!existant });
    var suggestions = h('div');
    var contexte = h('div.doux.petit', { style: { marginTop: '6px' } });
    var majContexte = function () {
      var v = vehiculeDe(champVin.value);
      if (v && v.vin) { contexte.textContent = ''; contexte.appendChild(h('span', [h('b', { text: v.modele || '' }), ' · ' + AMX.inventaire.nomFeuille(v._feuille) + (v.stock ? ' · stock ' + v.stock : '') + ' · ', AMX.badgeStatut(v.statut, v._feuille)])); }
      else contexte.textContent = champVin.value ? 'Ce VIN n\'est pas à l\'inventaire : la page publique n\'aura ni modèle ni photos.' : '';
    };
    champVin.addEventListener('input', AMX.debounce(function () {
      var q = champVin.value.trim().toUpperCase(); AMX.vider(suggestions); majContexte();
      if (q.length < 2) return;
      AMX.inventaire.tout().then(function (tout) {
        tout.filter(function (v) { return [v.vin, v.modele, v.stock].join(' ').toUpperCase().indexOf(q) >= 0 && v.statut !== 'comptabilise'; }).slice(0, 6).forEach(function (v) {
          var b = h('button.btn.petit', { type: 'button', style: { marginRight: '6px', marginBottom: '6px' }, text: (v.modele || v.vin) + (v.stock ? ' · ' + v.stock : '') });
          b.addEventListener('click', function () { champVin.value = v.vin; AMX.vider(suggestions); majContexte(); });
          suggestions.appendChild(b);
        });
      });
    }, 150));
    majContexte();
    var prix = h('input.saisie', { type: 'number', step: '100', placeholder: 'Vide = prix sur demande', value: existant ? existant.prix : '' });
    var desc = h('textarea.saisie', { rows: '4', placeholder: 'Ce que l\'acheteur verra : état, équipement, particularités…', text: existant ? existant.description : '' });
    var sticker = h('input.saisie', { type: 'url', placeholder: 'Lien du window sticker (PDF), facultatif' });
    var verif = h('input', { type: 'checkbox' });
    var corps = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
      h('div.champ', [h('label', 'Véhicule'), champVin, contexte, suggestions]),
      h('div.grille.c2', [h('div.champ', [h('label', 'Prix demandé ($)'), prix]), h('div.champ', [h('label', 'Window sticker'), sticker])]),
      h('div.champ', [h('label', 'Description'), desc]),
      h('label.case', [verif, h('span', 'Window sticker vérifié (correspond au véhicule)')]),
      existant ? h('div.alerte-bloc.info', [h('span', { html: I.info }), h('div', 'Publié le ' + AMX.fmtDate(existant.publieLe, true) + (existant.publiePar ? ' par ' + existant.publiePar : '') + '. Le lien public reste le même après modification.')]) : null
    ]);
    var boutons = [{ texte: 'Annuler' }];
    if (existant) boutons.push({ texte: 'Retirer de la vente', classe: 'danger', action: function (fermer) {
      return AMX.confirmer('Retirer de la vente', 'Le véhicule ' + (choisi && choisi.modele ? choisi.modele : existant.vin) + ' ne sera plus visible sur la vitrine ; les liens déjà envoyés afficheront « véhicule retiré ».', { danger: true, ok: 'Retirer' }).then(function (ok) {
        if (!ok) return false;
        return self.publier({ vin: existant.vin, publie: false, prix: existant.prix, description: existant.description }, 'Retiré de la vente');
      });
    } });
    boutons.push({ texte: existant ? 'Enregistrer' : 'Publier', classe: 'primaire', action: function () {
      var v = champVin.value.trim().toUpperCase();
      if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(v)) { champVin.style.borderColor = 'var(--rouge)'; champVin.focus(); AMX.toast('Choisissez un véhicule (VIN).', 'attention'); return false; }
      var corpsReq = { vin: v, publie: true, prix: prix.value.trim(), description: desc.value.trim() };
      if (sticker.value.trim()) corpsReq.sticker = sticker.value.trim();
      if (verif.checked) corpsReq.stickerVerifie = true;
      return self.publier(corpsReq, existant ? 'Modifications enregistrées' : 'Véhicule mis en vente');
    } });
    AMX.modale({ titre: existant ? 'Modifier la mise en vente' : 'Mettre un véhicule en vente', corps: corps, boutons: boutons });
  };
  EnVente.prototype.publier = function (corps, message) {
    var self = this;
    return AMX.post(Object.assign({ action: 'publierVehicule' }, corps), { delai: 60000 }).then(function (d) {
      AMX.verifier(d, 'Publication impossible');
      if (d.cle) cache.cle = d.cle;
      AMX.toast(message, 'ok');
      if (corps.publie && cache.cle) { var lien = lienPublic(cache.cle, corps.vin); AMX.modale({ titre: 'Page publique prête', corps: h('div', [h('p', { style: { margin: '0 0 10px', color: 'var(--encre-2)' }, text: 'Envoyez ce lien à l\'acheteur : il voit les photos, la description et peut faire une offre.' }), h('input.saisie.mono', { value: lien, readonly: true })]), boutons: [{ texte: 'Fermer' }, { texte: 'Copier le lien', classe: 'primaire', action: function () { AMX.copier(lien, 'Lien copié'); return false; } }] }); }
      return self.charger(true);
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
  };
  EnVente.prototype.regenerer = function () {
    var self = this;
    AMX.confirmer('Régénérer la clé de la vitrine', 'Tous les liens déjà envoyés aux acheteurs cesseront de fonctionner. Les nouveaux liens utiliseront la nouvelle clé. Continuer ?', { danger: true, ok: 'Régénérer' }).then(function (ok) {
      if (!ok) return;
      AMX.post({ action: 'regenererCleVitrine' }).then(function (d) { AMX.verifier(d, 'Régénération impossible'); cache.cle = d.cle; AMX.toast('Nouvelle clé générée', 'ok'); self.rendre(); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
    });
  };

  /* =================================================================== */
  /*                             ACHETEURS                               */
  /* =================================================================== */
  function Acheteurs(conteneur, ctx) {
    this.conteneur = conteneur; this.liste = cache.acheteurs || []; this.selection = ctx.params.a || '';
    this.filtres = { recherche: '', statut: '' };
    this.construire(); this.charger();
  }
  Acheteurs.prototype.demonter = function () {};
  Acheteurs.prototype.naviguer = function (ctx) { if ((ctx.params.a || '') !== this.selection) { this.selection = ctx.params.a || ''; this.rendre(); } };
  Acheteurs.prototype.construire = function () {
    var self = this;
    this.elKpis = h('div.kpis'); this.elRail = h('aside.rail'); this.elListe = h('div'); this.elOutils = h('div.outils-liste'); this.elPanneau = h('aside.panneau');
    this.elAgencement = h('div.agencement', [this.elRail, h('div.colonne-liste', [this.elOutils, this.elListe]), this.elPanneau]);
    this.conteneur.appendChild(h('div.page', [
      h('div.entete-page', [
        h('div', [h('h1', 'Acheteurs'), h('p#ach-etat', 'Les concessionnaires qui achètent nos véhicules : invités par courriel, ils remplissent leur fiche eux-mêmes ; les contrats sont ensuite pré-remplis.')]),
        h('div.actions', [
          h('button.btn.fantome.icone', { title: 'Filtres', html: I.filtre, onclick: function () { self.elRail.classList.toggle('ouvert'); } }),
          h('button.btn', { html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } }),
          AMX.perm('changerStatut') ? h('button.btn.primaire', { html: I.courriel + '<span>Inviter un acheteur</span>', onclick: function () { self.modaleInviter(null); } }) : null
        ])
      ]),
      this.elKpis, this.elAgencement
    ]));
    this.construireRail();
  };
  Acheteurs.prototype.construireRail = function () {
    var self = this, f = this.filtres;
    AMX.vider(this.elRail);
    var rech = h('div.recherche', [h('span', { html: I.recherche }), h('input.saisie', { type: 'search', placeholder: 'Nom, entreprise, courriel, ville', value: f.recherche, oninput: AMX.debounce(function (e) { f.recherche = e.target.value; self.rendre(); }, 120) })]);
    var seg = h('div.segment.bloc');
    [['', 'Tous'], ['inscrit', 'Inscrits'], ['invite', 'Invités']].forEach(function (c) { seg.appendChild(h('button' + (f.statut === c[0] ? '.actif' : ''), { type: 'button', text: c[1], onclick: function () { f.statut = c[0]; self.construireRail(); self.rendre(); } })); });
    this.elRail.appendChild(h('div.groupe', [h('h3', 'Recherche'), rech, h('div', { style: { height: '10px' } }), h('div.etiquette', { style: { marginBottom: '6px' }, text: 'Statut' }), seg]));
  };
  Acheteurs.prototype.charger = function (force) {
    var self = this, etat = document.getElementById('ach-etat');
    if (!cache.acheteurs) { AMX.vider(this.elListe); this.elListe.appendChild(AMX.chargeur('Acheteurs')); }
    var pConc = cache.concessions ? Promise.resolve(cache.concessions) : AMX.post({ action: 'leadListe' }).then(function (d) { cache.concessions = (d && d.concessions) || Object.keys(AMX.CONCESSIONS).map(function (k) { return { id: k, nom: AMX.CONCESSIONS[k] }; }); return cache.concessions; }).catch(function () { return Object.keys(AMX.CONCESSIONS).map(function (k) { return { id: k, nom: AMX.CONCESSIONS[k] }; }); });
    return Promise.all([AMX.post({ action: 'acheteursExternes' }), pConc]).then(function (r) {
      var d = AMX.verifier(r[0], 'Impossible de lire les acheteurs');
      cache.acheteurs = d.acheteurs || []; self.liste = cache.acheteurs;
      if (etat) etat.textContent = self.liste.length + ' acheteur' + (self.liste.length > 1 ? 's' : '') + ' · synchronisé à ' + new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
      self.rendre(); AMX.rafraichirSousBarre();
    }).catch(function (e) { AMX.vider(self.elListe); self.elListe.appendChild(h('div.vide', [h('div', { html: I.alerte }), h('h3', 'Acheteurs indisponibles'), h('div', { text: AMX.erreurTexte(e) })])); });
  };
  Acheteurs.prototype.rendre = function () {
    var self = this, f = this.filtres;
    AMX.vider(this.elKpis);
    var inscrits = this.liste.filter(function (a) { return a.statut === 'inscrit'; }).length;
    this.elKpis.appendChild(h('button.kpi' + (f.statut === 'inscrit' ? '.actif' : ''), { type: 'button', onclick: function () { f.statut = f.statut === 'inscrit' ? '' : 'inscrit'; self.construireRail(); self.rendre(); } }, [h('div.valeur', { text: inscrits }), h('div.libelle', 'Inscrits'), h('span.pastille', { style: { background: 'var(--vert)' } })]));
    this.elKpis.appendChild(h('button.kpi' + (f.statut === 'invite' ? '.actif' : ''), { type: 'button', onclick: function () { f.statut = f.statut === 'invite' ? '' : 'invite'; self.construireRail(); self.rendre(); } }, [h('div.valeur', { text: this.liste.length - inscrits }), h('div.libelle', 'Invités, en attente'), h('span.pastille', { style: { background: 'var(--ambre)' } })]));
    var l = this.liste.filter(function (a) { return !f.statut || a.statut === f.statut; });
    if (f.recherche) { var t = f.recherche.toLowerCase(); l = l.filter(function (a) { return [a.nomLegal, a.nomCommercial, a.signataire, a.courriel, a.ville, a.telephone].join(' ').toLowerCase().indexOf(t) >= 0; }); }
    AMX.vider(this.elOutils); this.elOutils.appendChild(h('span.compte', [h('b', { text: l.length }), ' acheteur' + (l.length > 1 ? 's' : '')]));
    AMX.vider(this.elListe);
    if (!l.length) this.elListe.appendChild(h('div.vide', [h('div', { html: I.admin }), h('h3', 'Aucun acheteur'), h('div', 'Invitez un concessionnaire : il recevra un courriel au nom de la concession choisie et remplira sa fiche.')]));
    else { var ul = h('div.liste'); l.forEach(function (a) { ul.appendChild(self.ligne(a)); }); this.elListe.appendChild(ul); }
    this.rendrePanneau();
  };
  Acheteurs.prototype.ligne = function (a) {
    var self = this;
    var inscrit = a.statut === 'inscrit';
    var el = h('div.ligne' + (this.selection === a.id ? '.actif' : ''), { dataset: { id: a.id } }, [
      h('div.vignette', { text: AMX.initiales(a.nomLegal || a.signataire || a.courriel) }),
      h('div', { style: { minWidth: 0 } }, [h('div.titre', { text: a.nomLegal || a.signataire || a.courriel }), h('div.sous', [h('span.doux', { text: a.courriel }), a.langue === 'en' ? h('span.puce', { text: 'EN' }) : null])]),
      h('div.cell', [h('span.l', 'Contact'), h('span.v', { text: a.signataire || '—' }), h('span.v.doux', { text: a.telephone || '' })]),
      h('div.cell.statut', [h('span.l', 'Statut'), h('span', [h('span.badge.' + (inscrit ? 'vert' : 'ambre'), { text: inscrit ? 'Inscrit' : 'Invité' })]), h('span.jours', { text: inscrit ? 'le ' + AMX.fmtDate(a.inscritLe) : 'le ' + AMX.fmtDate(a.inviteLe) })]),
      h('div.cell.indic', [h('span.l', 'Lieu'), h('span.v', { text: [a.ville, a.province].filter(Boolean).join(', ') || '—' })]),
      h('div.montant', [h('span.l', 'Concession'), h('span', { style: { fontWeight: 500, fontSize: '12px' }, text: a.concession ? nomConcession(a.concession).split(' ')[0] : '—' })]),
      h('button.plus', { type: 'button', html: I.chevron })
    ]);
    el.addEventListener('click', function () { self.selectionner(a.id); });
    return el;
  };
  Acheteurs.prototype.selectionner = function (id) {
    this.selection = id;
    history.replaceState(null, '', AMX.lien('offres', 'acheteurs', id ? { a: id } : {}));
    this.elListe.querySelectorAll('.ligne').forEach(function (l) { l.classList.toggle('actif', l.dataset.id === id); });
    this.rendrePanneau();
  };
  Acheteurs.prototype.rendrePanneau = function () {
    var self = this;
    var a = this.selection ? this.liste.filter(function (x) { return x.id === self.selection; })[0] : null;
    this.elAgencement.classList.toggle('avec-panneau', !!a);
    AMX.vider(this.elPanneau);
    if (!a) { this.elPanneau.style.display = 'none'; return; }
    this.elPanneau.style.display = '';
    var inscrit = a.statut === 'inscrit';
    var offresDe = (cache.offres || []).filter(function (o) { return String(o.courriel || '').toLowerCase() === String(a.courriel || '').toLowerCase(); });
    this.elPanneau.appendChild(h('div.carte', [
      h('div.panneau-entete', [
        h('div', { style: { minWidth: 0 } }, [h('h2', { text: a.nomLegal || a.signataire || a.courriel }), h('div.sous', [h('span.badge.' + (inscrit ? 'vert' : 'ambre'), { text: inscrit ? 'Inscrit' : 'Invité' }), a.nomCommercial ? h('span', { text: a.nomCommercial }) : null])]),
        h('button.fermer', { html: I.fermer, onclick: function () { self.selectionner(''); } })
      ]),
      h('div.bloc', [h('h3', 'Fiche'), h('dl.kv.serre', [
        h('dt', 'Signataire'), h('dd', { text: a.signataire || '—' }),
        h('dt', 'Courriel'), h('dd', [h('a', { href: 'mailto:' + a.courriel, text: a.courriel })]),
        h('dt', 'Téléphone'), h('dd', [a.telephone ? h('a', { href: 'tel:' + a.telephone, text: a.telephone }) : '—']),
        h('dt', 'Adresse'), h('dd', { text: [a.adresse, [a.ville, a.province, a.codePostal].filter(Boolean).join(' '), a.pays].filter(Boolean).join(', ') || '—' }),
        h('dt', 'No concessionnaire'), h('dd', { text: a.noConcessionnaire || '—' }),
        h('dt', 'TPS / TVQ'), h('dd', { text: (a.tps || '—') + ' / ' + (a.tvq || '—') }),
        h('dt', 'Langue'), h('dd', { text: a.langue === 'en' ? 'Anglais' : 'Français' }),
        h('dt', 'Invité par'), h('dd', { text: (a.invitePar || '—') + (a.concession ? ' · ' + nomConcession(a.concession) : '') + (a.inviteLe ? ' · ' + AMX.fmtDate(a.inviteLe) : '') }),
        inscrit ? h('dt', 'Inscrit le') : null, inscrit ? h('dd', { text: AMX.fmtDate(a.inscritLe, true) }) : null,
        a.source ? h('dt', 'Source') : null, a.source ? h('dd', { text: a.source === 'contrat' ? 'Créé à la signature d\'un contrat' : 'Invitation' }) : null,
        a.note ? h('dt', 'Note') : null, a.note ? h('dd', { text: a.note }) : null
      ])]),
      h('div.bloc', [h('h3', 'Actions'), h('div.actions-ligne', [
        AMX.perm('changerStatut') ? h('button.btn' + (inscrit ? '' : '.primaire'), { html: I.courriel + '<span>' + (inscrit ? 'Renvoyer le lien de la fiche' : 'Renvoyer l\'invitation') + '</span>', onclick: function () { self.modaleInviter(a); } }) : null,
        h('a.btn', { href: 'mailto:' + a.courriel, html: I.externe + '<span>Écrire</span>' })
      ])]),
      h('div.bloc', [h('h3', 'Offres de cet acheteur'), offresDe.length ? h('ul.chrono', offresDe.map(function (o) { var st = AMX.STATUTS_OFFRE[o.statut] || { libelle: o.statut }; return h('li', [h('a', { href: AMX.lien('offres', 'recues', { o: o.id }), text: (o.modele || o.vin) + ' — ' + AMX.fmtArgent(o.prixFinal || o.contre || o.prix) }), h('div.quand', { text: st.libelle + ' · ' + AMX.fmtDate(o.date) })]); })) : h('div.doux.petit', (cache.offres ? 'Aucune offre.' : 'Ouvrez « Offres reçues » pour charger les offres.'))])
    ]));
  };
  Acheteurs.prototype.modaleInviter = function (existant) {
    var self = this;
    var courriel = h('input.saisie', { type: 'email', placeholder: 'acheteur@concession.com', value: existant ? existant.courriel : '', disabled: !!existant });
    var nom = h('input.saisie', { type: 'text', placeholder: 'Prénom et nom', value: existant ? existant.signataire : '' });
    var entreprise = h('input.saisie', { type: 'text', placeholder: 'Nom de la concession acheteuse', value: existant ? existant.nomLegal : '' });
    var concession = h('select.saisie');
    (cache.concessions || Object.keys(AMX.CONCESSIONS).map(function (k) { return { id: k, nom: AMX.CONCESSIONS[k] }; })).forEach(function (c) { concession.appendChild(h('option', { value: c.id, text: c.nom })); });
    concession.value = (existant && existant.concession) || AMX.memo.lire('ach_concession', '') || concession.value;
    var langue = 'fr'; if (existant && existant.langue === 'en') langue = 'en';
    var segLangue = h('div.segment');
    var majLangue = function () { AMX.vider(segLangue); [['fr', 'Français'], ['en', 'English']].forEach(function (l) { segLangue.appendChild(h('button' + (langue === l[0] ? '.actif' : ''), { type: 'button', text: l[1], onclick: function () { langue = l[0]; majLangue(); } })); }); };
    majLangue();
    var corps = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
      h('p', { style: { margin: 0, color: 'var(--encre-2)' }, text: existant ? 'Un nouveau courriel part au nom de la concession choisie, avec le lien de sa fiche.' : 'L\'acheteur reçoit un courriel au nom de la concession choisie avec un lien pour inscrire sa concession (coordonnées, numéros de taxes). Ses offres et contrats seront ensuite pré-remplis.' }),
      h('div.champ', [h('label', 'Courriel'), courriel]),
      h('div.grille.c2', [h('div.champ', [h('label', 'Nom du contact'), nom]), h('div.champ', [h('label', 'Entreprise'), entreprise])]),
      h('div.grille.c2', [h('div.champ', [h('label', 'Invitation au nom de'), concession]), h('div.champ', [h('label', 'Langue du courriel'), segLangue])])
    ]);
    AMX.modale({ titre: existant ? 'Renvoyer l\'invitation' : 'Inviter un acheteur', corps: corps, boutons: [{ texte: 'Annuler' }, { texte: existant ? 'Renvoyer' : 'Envoyer l\'invitation', classe: 'primaire', action: function (fermer) {
      var c = courriel.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) { courriel.style.borderColor = 'var(--rouge)'; courriel.focus(); return false; }
      AMX.memo.ecrire('ach_concession', concession.value);
      return AMX.post({ action: 'acheteurExterneInviter', courriel: c, nom: nom.value.trim(), entreprise: entreprise.value.trim(), concession: concession.value, langue: langue, renvoyer: !!existant }).then(function (d) {
        AMX.verifier(d, 'Invitation impossible');
        if (d.deja && !existant) AMX.toast('Cet acheteur est déjà inscrit.', 'attention');
        else if (d.courrielEnvoye === false) AMX.toast('Fiche créée, mais le courriel n\'est pas parti : ' + (d.courrielErreur || 'raison inconnue'), 'attention', 9000);
        else AMX.toast('Invitation envoyée à ' + c, 'ok');
        if (d.url) { fermer(); AMX.modale({ titre: 'Lien d\'inscription', corps: h('div', [h('p', { style: { margin: '0 0 10px', color: 'var(--encre-2)' }, text: 'Le même lien que dans le courriel, à envoyer par texto ou autrement si besoin.' }), h('input.saisie.mono', { value: d.url, readonly: true })]), boutons: [{ texte: 'Fermer' }, { texte: 'Copier', classe: 'primaire', action: function () { AMX.copier(d.url, 'Lien copié'); return false; } }] }); }
        return self.charger(true).then(function () { return true; });
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
    } }] });
  };
})();
