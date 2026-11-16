/* =========================================================================
   Outils › Opportunités d'achat › Offres d'acheteurs (16 nov. 2026) — AMX.offresGmf

   Maxime : « je veux que les acheteurs puissent avoir accès aux véhicules à vendre de GMF, mais sans les prix, avec toutes les
   photos et les dommages ». Les concessionnaires acheteurs approuvés voient les véhicules de GM Financial (DealerSource) dans
   leur portail (vitrine/portail.html › Véhicules GM) et font une offre en $ CA. Cette page les montre à l'équipe : l'offre de
   l'acheteur à côté du prix de DealerSource et du coût rendu chez nous (transport compris) ; on achète sur DealerSource, puis
   « Passer au contrat » : le véhicule est publié dans la vitrine pour le pays de l'acheteur au prix convenu et une offre
   normale entre dans Vente › Offre au marché › Offres reçues (contrat, signature, transport comme d'habitude).
   « Refuser » : l'acheteur voit « non retenue » ; la raison reste interne. Rien n'est envoyé tout seul.

   Serveur : PortailGmf.gs — GET ?offresGmf=1, POST offreGmfAction { id, op: refuser | rouvrir | contrat, raison?, prix? }.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones || {};

  var STATUTS = [['traiter', 'À traiter'], ['nouvelle', 'Nouvelles'], ['contrat', 'Passées au contrat'], ['refusee', 'Non retenues'], ['toutes', 'Toutes']];
  var NOM_STATUT = { nouvelle: 'Nouvelle', refusee: 'Non retenue', contrat: 'Passée au contrat', expiree: 'Vente terminée', annulee: 'Annulée' };
  var PAYS = { CA: 'Canada', US: 'États-Unis', FR: 'France' };
  var PAYS_POUR = { CA: 'le Canada', US: 'les États-Unis', FR: 'la France' };

  function nb(v) { return typeof v === 'number' && isFinite(v); }
  function argent(v) { return nb(v) ? AMX.fmtArgent(v) : '—'; }
  function signe(v) { return nb(v) ? (v > 0 ? '+' : (v < 0 ? '−' : '')) + AMX.fmtArgent(Math.abs(v)) : '—'; }
  function aTraiter(o) { return o.statut === 'nouvelle' && (o.aVendre || o.achete); }
  function finProche(iso) { var t = new Date(iso).getTime(); return isFinite(t) && t - Date.now() < 24 * 3600000 && t > Date.now(); }

  /* ------------------------------ Données ------------------------------ */
  var cache = { rep: null, quand: 0, promesse: null, qui: '' };
  function charger(force) {
    var qui = (AMX.session && AMX.session.courriel) || '';
    if (cache.qui !== qui) { cache.rep = null; cache.quand = 0; cache.qui = qui; }
    if (!force && cache.rep && Date.now() - cache.quand < AMX.dureeCopie(60000)) return Promise.resolve(cache.rep);
    if (cache.promesse) return cache.promesse;
    cache.promesse = AMX.get({ offresGmf: 1 }, { secours: false, delai: 60000, discret: !force }).then(function (d) {
      cache.promesse = null;
      if (d && d.refuse) return d;
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Réponse inattendue du serveur');
      if (!Array.isArray(d.offres)) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (PortailGmf.gs).');
      cache.rep = d; cache.quand = Date.now();
      try { document.dispatchEvent(new CustomEvent('amx:offresGmf')); } catch (e) {}
      return d;
    }, function (e) { cache.promesse = null; throw e; });
    return cache.promesse;
  }
  /* Les offres à traiter de la concession choisie (la concession la plus avantageuse pour le véhicule ; sans concession = toutes). */
  function aTraiterPour(cie) {
    var d = cache.rep; if (!d || !Array.isArray(d.offres)) return [];
    return d.offres.filter(function (o) { return aTraiter(o) && (!cie || !o.dest || o.dest === cie); });
  }
  function action(corps) {
    return AMX.post(Object.assign({ action: 'offreGmfAction' }, corps), { delai: 120000 }).then(function (r) {
      if (r && r.vehicules && !r.offre && !r.deja) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (PortailGmf.gs).');
      if (!r || r.ok === false || r.refuse) throw new Error((r && r.erreur) || 'Le serveur a refusé.');
      return charger(true).then(function () { return r; });
    });
  }

  /* 16 nov. (Maxime : « je veux voir ce que l'acheteur voit sur GMF ») : le portail des acheteurs en aperçu de l'équipe —
     la même page, sans prix, offres désactivées (vitrine/portail.html?apercu=gm, script ?gmfApercu=1). */
  function apercuUrl(vin) { return 'vitrine/portail.html?apercu=gm' + (vin ? '&vin=' + encodeURIComponent(vin) : ''); }
  function voirCommeAcheteur(vin) { window.open(apercuUrl(vin), '_blank', 'noopener'); }

  /* ------------------------------ La vue ------------------------------ */
  function Vue(parent) {
    injecterCss();
    this.parent = parent || null;
    this.f = { statut: 'traiter', q: '' };
    var self = this;
    this.elQ = h('input.saisie', { type: 'search', placeholder: 'Chercher : acheteur, modèle, NIV…', autocomplete: 'off', oninput: AMX.debounce(function (e) { self.f.q = e.target.value; self.rendre(); }, 150) });
    this.elStatuts = h('div.inv2-statuts.ogm-statuts', { role: 'group', 'aria-label': 'Statut' });
    this.elPortee = h('div.portee-chiffres');
    this.elKpis = h('div.kpis.ogm-kpis');
    this.elListe = h('div.ogm-liste');
    this.elEtat = h('p.ogm-etat');
    this.el = h('div.ogm', [
      h('div.carte.ogm-intro', [h('div.carte-corps', [
        h('p', { html: 'Les concessionnaires acheteurs approuvés voient les véhicules de <b>GM Financial (DealerSource)</b> dans leur portail, <b>sans aucun prix</b>, avec les photos et les dommages, et font une offre. Achetez le véhicule sur DealerSource si la marge y est, puis <b>Passer au contrat</b> : l\'offre entre dans Offres reçues et la suite est la même.' }),
        h('div', { style: { marginTop: '10px' } }, [h('a.btn.primaire', { href: apercuUrl(''), target: '_blank', rel: 'noopener', html: (I.vitrine || I.voir || '') + '<span>Voir ce que voit l\'acheteur</span>' })]),
        this.elEtat
      ])]),
      h('div.carte.ogm-filtres', [h('div.carte-corps', [h('div.occ-ligne', [h('div.recherche', [h('span', { html: I.recherche || '' }), this.elQ])]), h('div.occ-ligne', [this.elStatuts])])]),
      this.elPortee, this.elKpis, this.elListe
    ]);
    this.elListe.appendChild(AMX.chargeur ? AMX.chargeur('Offres des acheteurs', { compact: true }) : h('p', 'Chargement…'));
    this.charger(false);
  }
  Vue.prototype.charger = function (force) {
    var self = this;
    return charger(force).then(function (d) { self.d = d; self.erreur = ''; self.rendre(); if (self.parent && self.parent.rendreOnglets) self.parent.rendreOnglets(); },
      function (e) { self.erreur = AMX.erreurTexte ? AMX.erreurTexte(e) : String(e && e.message || e); self.rendre(); });
  };
  Vue.prototype.filtrer = function (sauf) {
    var f = this.f, d = this.d, q = String(f.q || '').trim(), cie = AMX.compagnieChoisie('inventaire') || '';
    if (!d || !Array.isArray(d.offres)) return [];
    return d.offres.filter(function (o) {
      if (cie && o.dest && o.dest !== cie) return false;
      if (sauf !== 'statut') {
        if (f.statut === 'traiter' && !aTraiter(o)) return false;
        if (f.statut === 'nouvelle' && o.statut !== 'nouvelle') return false;
        if (f.statut === 'contrat' && o.statut !== 'contrat') return false;
        if (f.statut === 'refusee' && o.statut !== 'refusee') return false;
      }
      if (q && !AMX.correspond([o.titre, o.vin, o.nomLegal, o.signataire, o.courriel, o.note, o.id, PAYS[o.pays]], q)) return false;
      return true;
    });
  };
  Vue.prototype.rendre = function () {
    var self = this, d = this.d;
    AMX.vider(this.elStatuts); AMX.vider(this.elKpis); AMX.vider(this.elListe); AMX.vider(this.elPortee);
    if (this.erreur && !d) { this.elListe.appendChild(h('div.vide', [h('h3', 'Offres indisponibles'), h('div', { text: this.erreur })])); return; }
    if (!d) { this.elListe.appendChild(AMX.chargeur ? AMX.chargeur('Offres des acheteurs', { compact: true }) : h('p', 'Chargement…')); return; }
    if (d.refuse) { this.elListe.appendChild(h('div.vide', [h('h3', 'Accès non autorisé'), h('div', { text: d.erreur || '' })])); return; }
    this.elEtat.textContent = this.erreur ? 'Mise à jour impossible : ' + this.erreur : '';
    var base = this.filtrer('statut');
    STATUTS.forEach(function (s) {
      var n = base.filter(function (o) { return s[0] === 'toutes' || (s[0] === 'traiter' ? aTraiter(o) : o.statut === s[0]); }).length;
      self.elStatuts.appendChild(h('button.inv2-pastille' + (self.f.statut === s[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': self.f.statut === s[0] ? 'true' : 'false',
        onclick: function () { self.f.statut = s[0]; self.rendre(); } }, [s[0] === 'traiter' && n ? h('i', { style: { background: 'var(--ambre)' } }) : null, h('span', { text: s[1] }), h('b', { text: String(n) })]));
    });
    var liste = this.filtrer();
    if (AMX.porteeChiffres) {
      var cie = AMX.compagnieChoisie('inventaire');
      AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['offre', 'offres'], contexte: cie ? (AMX.COMPAGNIES_TOUTES[cie] || cie) : 'Tout le groupe',
        filtres: [STATUTS.filter(function (s) { return s[0] === self.f.statut; })[0][1], this.f.q ? '« ' + this.f.q + ' »' : ''].filter(Boolean),
        effacer: (this.f.q || this.f.statut !== 'toutes') ? function () { self.f.q = ''; self.elQ.value = ''; self.f.statut = 'toutes'; self.rendre(); } : null });
    }
    var vivantes = liste.filter(function (o) { return o.statut === 'nouvelle'; });
    var marge = vivantes.filter(function (o) { return nb(o.ecart) && o.ecart > 0; });
    var kpi = function (titre, val, sous) { return h('div.kpi.neutre', [h('div.libelle', { text: titre }), h('div.valeur', { text: val }), sous ? h('div.sous', { text: sous }) : null]); };
    this.elKpis.appendChild(kpi('Offres', AMX.fmtNombre(liste.length), vivantes.length + ' nouvelle' + (vivantes.length > 1 ? 's' : '')));
    this.elKpis.appendChild(kpi('Au-dessus du coût rendu', AMX.fmtNombre(marge.length), 'parmi les nouvelles, avec le prix DealerSource connu'));
    this.elKpis.appendChild(kpi('Acheteurs', AMX.fmtNombre(Object.keys(liste.reduce(function (m, o) { m[o.courriel || o.acheteurId] = 1; return m; }, {})).length), ''));
    this.elKpis.appendChild(kpi('Passées au contrat', AMX.fmtNombre(liste.filter(function (o) { return o.statut === 'contrat'; }).length), ''));
    if (!liste.length) {
      this.elListe.appendChild(h('div.vide', [h('h3', d.offres.length ? 'Aucune offre avec ces filtres' : 'Aucune offre pour l\'instant'),
        h('div', { text: d.offres.length ? 'Choisissez « Toutes » pour voir les autres.' : 'Les offres des acheteurs sur les véhicules GM Financial arrivent ici dès qu\'un acheteur en fait une dans son portail.' })]));
      return;
    }
    liste.forEach(function (o) { self.elListe.appendChild(self.carte(o)); });
  };
  Vue.prototype.carte = function (o) {
    var self = this, g = o.gmf || {}, d = this.d || {};
    var etat = o.statut === 'nouvelle'
      ? (o.achete ? h('span.puce.vert', { text: 'Acheté — prêt pour le contrat' }) : (o.aVendre ? (g.finVente ? h('span.puce' + (finProche(g.finVente) ? '.ambre' : ''), { text: 'Vente se termine ' + AMX.fmtDate(g.finVente, true) }) : null) : h('span.puce.gris', { text: 'Vente terminée' })))
      : h('span.puce' + (o.statut === 'contrat' ? '.vert' : '.gris'), { text: NOM_STATUT[o.statut] || o.statut });
    var photo = g.photo ? h('img', { src: g.photo, alt: '', loading: 'lazy' }) : h('div.ogm-sans-photo', { html: I.voiture || '' });
    var gauche = h('div.ogm-veh', [h('div.ogm-photo', [photo]), h('div', [
      h('div.ogm-titre', { text: o.titre || o.vin }),
      h('div.mini', { text: [o.vin, g.km ? AMX.fmtNombre(g.km) + ' km' : '', g.cote ? 'CR ' + g.cote : '', [g.ville, g.province].filter(Boolean).join(', ')].filter(Boolean).join(' · ') }),
      h('div.ogm-puces', [etat, o.dest ? h('span.puce', { text: 'Pour ' + (AMX.COMPAGNIES_TOUTES[o.dest] || o.dest) }) : null])
    ])]);
    var acheteur = h('div.ogm-ach', [
      h('div.libelle', { text: 'Acheteur' }),
      h('div.ogm-nom', { text: o.nomLegal || o.courriel }),
      h('div.mini', { text: [o.signataire, PAYS[o.pays] || o.pays, AMX.fmtDate(o.maj || o.creeLe, true)].filter(Boolean).join(' · ') }),
      o.note ? h('div.ogm-note', { text: '« ' + o.note + ' »' }) : null
    ]);
    var chiffres = h('div.ogm-chiffres', [
      h('div.ogm-offre', [h('div.libelle', { text: 'Offre de l\'acheteur' }), h('div.ogm-gros', { text: argent(o.prix) })]),
      h('div', [h('div.libelle', { text: 'DealerSource' }), h('div', { text: nb(g.prixAchat) ? argent(g.prixAchat) + ' (achat immédiat)' : (nb(g.mise) ? argent(g.mise) + ' (mise)' : '—') }),
        nb(g.dommages) && g.dommages > 0 ? h('div.mini', { text: 'dommages estimés ' + argent(g.dommages) }) : null]),
      h('div', [h('div.libelle', { text: 'Coût rendu chez nous' }), h('div', { text: argent(o.cout) }), nb(o.transport) ? h('div.mini', { text: 'dont transport ' + argent(o.transport) }) : null]),
      h('div', [h('div.libelle', { text: 'Écart' }), h('div.ogm-ecart' + (nb(o.ecart) ? (o.ecart >= 0 ? '.pos' : '.neg') : ''), { text: signe(o.ecart) })])
    ]);
    var boutons = h('div.ogm-actions');
    if (g.lien) boutons.appendChild(h('a.btn.petit', { href: g.lien, target: '_blank', rel: 'noopener', text: 'Ouvrir sur DealerSource' }));
    if (o.aVendre) boutons.appendChild(h('a.btn.petit', { href: apercuUrl(o.vin), target: '_blank', rel: 'noopener', text: 'Comme l\'acheteur le voit' }));
    if (o.statut === 'nouvelle') {
      if (d.peutContrat) boutons.appendChild(h('button.btn.petit.primaire', { type: 'button', text: 'Passer au contrat', disabled: !o.achete,
        title: o.achete ? '' : 'Achetez d\'abord le véhicule sur DealerSource : il doit être entré dans nos registres.', onclick: function () { self.contrat(o); } }));
      boutons.appendChild(h('button.btn.petit', { type: 'button', text: 'Refuser', onclick: function () { self.refuser(o); } }));
    } else if (o.statut === 'refusee') {
      boutons.appendChild(h('button.btn.petit', { type: 'button', text: 'Rouvrir', onclick: function () { self.geste(o, 'rouvrir'); } }));
      if (o.raison) boutons.appendChild(h('span.mini', { text: 'Raison (interne) : ' + o.raison }));
    } else if (o.statut === 'contrat' && o.offreId) {
      boutons.appendChild(h('a.btn.petit.primaire', { href: AMX.lien('offres', 'recues', { o: o.offreId }), text: 'Voir l\'offre ' + o.offreId }));
    }
    var histo = (o.histo || []).length > 1 ? h('details.ogm-histo', [h('summary', { text: 'Historique (' + o.histo.length + ')' }),
      h('ul', o.histo.slice().reverse().map(function (x) { return h('li', { text: AMX.fmtDate(x.le, true) + ' — ' + argent(x.prix) + (x.note ? ' · « ' + x.note + ' »' : '') }); }))]) : null;
    return h('div.carte.ogm-carte' + (aTraiter(o) ? '.a-traiter' : ''), [h('div.carte-corps', [h('div.ogm-haut', [gauche, acheteur]), chiffres, boutons, histo])]);
  };
  Vue.prototype.geste = function (o, op, extra) {
    var self = this;
    return action(Object.assign({ id: o.id, op: op }, extra || {})).then(function (r) {
      self.d = cache.rep; self.rendre();
      if (self.parent && self.parent.rendreOnglets) self.parent.rendreOnglets();
      AMX.toast(op === 'contrat' ? 'Offre passée au contrat' + (r.offre && r.offre.offreId ? ' : ' + r.offre.offreId + ' dans Offres reçues.' : '.') : (op === 'refuser' ? 'Offre refusée. L\'acheteur voit « non retenue ».' : 'Offre rouverte.'), 'ok');
      return r;
    }, function (e) { AMX.toast(AMX.erreurTexte ? AMX.erreurTexte(e) : String(e.message || e), 'erreur', 8000); throw e; });
  };
  Vue.prototype.refuser = function (o) {
    var self = this, champ = h('input.saisie', { type: 'text', placeholder: 'Raison (facultatif — jamais montrée à l\'acheteur)', maxlength: 300 });
    AMX.modale({ titre: 'Refuser l\'offre ' + o.id, corps: h('div', [
      h('p', { text: (o.nomLegal || o.courriel) + ' offre ' + argent(o.prix) + ' pour ' + (o.titre || o.vin) + '. L\'acheteur verra « non retenue ». Aucun courriel ne part.' }), champ]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Refuser l\'offre', classe: 'danger', action: function () { return self.geste(o, 'refuser', { raison: champ.value }).then(function () { return true; }, function () { return false; }); } }] });
  };
  Vue.prototype.contrat = function (o) {
    var self = this;
    var champ = h('input.saisie', { type: 'text', inputmode: 'numeric', value: nb(o.prix) ? String(Math.round(o.prix)) : '' });
    AMX.modale({ titre: 'Passer au contrat — ' + (o.titre || o.vin), corps: h('div', [
      h('p', { text: 'Le véhicule est publié dans la vitrine pour ' + (PAYS_POUR[o.pays] || 'le pays de l\'acheteur') + ' au prix ci-dessous, puis une offre entre dans Vente › Offre au marché › Offres reçues au nom de ' + (o.nomLegal || o.courriel) + '. Le reste (accepter, contrat, signature, transport) est comme d\'habitude.' }),
      h('label.champ', [h('span', { text: 'Prix du contrat ($ CA, avant taxes)' }), champ]),
      h('p.mini', { text: 'Offre de l\'acheteur : ' + argent(o.prix) + (nb(o.cout) ? ' · coût rendu : ' + argent(o.cout) : '') })
    ]), boutons: [{ texte: 'Annuler' }, { texte: 'Passer au contrat', classe: 'primaire', action: function () {
      var p = Math.round(parseFloat(String(champ.value).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0);
      if (p < 500) { AMX.toast('Prix du contrat manquant.', 'attention'); return false; }
      return self.geste(o, 'contrat', { prix: p }).then(function () { return true; }, function () { return false; });
    } }] });
  };
  Vue.prototype.compte = function () { return this.d && Array.isArray(this.d.offres) ? aTraiterPour(AMX.compagnieChoisie('inventaire') || '').length : null; };

  function injecterCss() {
    if (document.getElementById('css-ogm')) return;
    var s = document.createElement('style'); s.id = 'css-ogm';
    s.textContent = [
      '.ogm .carte { margin-bottom: 12px; }',
      '.ogm-intro p { margin: 0; color: var(--encre-2); line-height: 1.5; }',
      '.ogm-etat:empty { display: none; } .ogm-etat { margin: 8px 0 0; color: var(--ambre); }',
      '.ogm-carte.a-traiter { border-left: 4px solid var(--ambre); }',
      '.ogm-haut { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; }',
      '.ogm-veh { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 12px; align-items: start; }',
      '.ogm-photo { width: 120px; height: 90px; border-radius: 10px; overflow: hidden; background: var(--fond); }',
      '.ogm-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }',
      '.ogm-sans-photo { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--encre-4); }',
      '.ogm-titre { font-weight: 700; font-size: 16px; }',
      '.ogm-puces { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }',
      '.ogm .libelle { font-size: 12px; color: var(--encre-3); text-transform: uppercase; letter-spacing: .03em; }',
      '.ogm-nom { font-weight: 650; }',
      '.ogm-note { margin-top: 6px; color: var(--encre-2); font-style: italic; }',
      '.ogm-chiffres { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--trait); }',
      '.ogm-gros { font-size: 22px; font-weight: 750; }',
      '.ogm-ecart.pos { color: var(--vert-fonce); font-weight: 700; } .ogm-ecart.neg { color: var(--rouge); font-weight: 700; }',
      '.ogm-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 12px; }',
      '.ogm-histo { margin-top: 10px; font-size: 13px; color: var(--encre-3); } .ogm-histo ul { margin: 6px 0 0; padding-left: 18px; }',
      '@media (max-width: 760px) { .ogm-haut { grid-template-columns: 1fr; } .ogm-chiffres { grid-template-columns: 1fr 1fr; } .ogm-veh { grid-template-columns: 90px minmax(0, 1fr); } .ogm-photo { width: 90px; height: 68px; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  AMX.offresGmf = { charger: charger, enCache: function () { return cache.rep; }, aTraiterPour: aTraiterPour, Vue: Vue, apercuUrl: apercuUrl, voirCommeAcheteur: voirCommeAcheteur,
    vider: function () { cache.rep = null; cache.quand = 0; cache.qui = ''; } };
})();
