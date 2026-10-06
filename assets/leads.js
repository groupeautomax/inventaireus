/* =========================================================================
   Sous-onglet « Leads » de la section Offres : liens d'évaluation envoyés
   aux clients et demandes reçues (NIV, kilométrage, cinq photos, vidéo),
   avec réponse par une offre. Remplace leads.html.

   Ce module n'enregistre PAS de section. La section « offres » appelle
   AMX.leads.monter(conteneur, ctx) quand son onglet « leads » est actif
   (ctx = { onglet: 'leads', params: { id: '…' } }) et naviguer(ctx) quand
   les paramètres changent. AMX.leads.compteur() alimente la sous-barre.

   Routes serveur utilisées (inchangées, Lead.gs) :
     POST leadListe                              → { ok, leads, concessions }
     POST leadCreer  { concession, clientNom, clientTel } → { ok, url }
     POST leadOffre  { id, montant, note, courriel }      → { ok, message, courrielEnvoye }
   ========================================================================= */
(function () {
  'use strict';
  // Toute donnée serveur passe par `text:` (textContent) ; `html:` ne reçoit que des icônes.
  var h = AMX.h, I = AMX.icones;

  var ANGLES = [
    { id: 'dash',    libelle: 'Tableau de bord' },
    { id: 'avant',   libelle: 'Avant' },
    { id: 'arriere', libelle: 'Arrière' },
    { id: 'gauche',  libelle: 'Gauche' },
    { id: 'droite',  libelle: 'Droite' }
  ];
  var INTERVALLE = 120000; // rafraîchissement automatique : 2 min

  // Cache de module : dernière liste chargée, partagée entre les montages et
  // lue par AMX.leads.compteur (sous-barre) avant même que la vue existe.
  var cacheLeads = null, cacheConcessions = [], cacheQuand = 0, promesseListe = null;
  var messagesOffre = {};    // id → texte d'offre renvoyé par le serveur dans cette session
  var courrielsEnvoyes = {}; // id → true si le serveur a envoyé le courriel au client

  /* ------------------------------ Helpers ------------------------------ */
  function moi() { return String(AMX.session.courriel || '').toLowerCase(); }
  function monNom() { return AMX.session.nom || AMX.session.courriel || ''; }
  function estMoi(l) { return !!moi() && String(l.creePar || '').toLowerCase() === moi(); }
  function estRecu(l) { return l.statut === 'recu'; }
  function aUneOffre(l) { return !!l.offre && String(l.offre) !== '0'; }
  function titreClient(l) { return l.nom || l.clientNomPrevu || 'Client à venir'; }
  function prenomDe(nom) { return String(nom || '').trim().split(/\s+/)[0] || ''; }
  function telDe(l) { return l.telephone || l.clientTelPrevu || ''; }
  function vehiculeDe(l) { return [l.annee, l.marque, l.modele].filter(Boolean).join(' '); }
  function vendeurDe(l) { return l.vendeur || l.creePar || ''; }
  function dateDe(l) { return estRecu(l) && l.recuLe ? l.recuLe : l.creeLe; }
  function tempsDe(l) { var t = new Date(dateDe(l) || 0).getTime(); return isNaN(t) ? 0 : t; }
  // Nom officiel de la concession : jamais « Groupe Automax » en repli.
  function nomConcession(id, nom) { return nom || AMX.CONCESSIONS[id] || id || ''; }
  function concessionDe(l) { return nomConcession(l.concession, l.concessionNom); }
  function kmLisible(km) { var n = parseInt(String(km || '').replace(/\D/g, ''), 10); return isNaN(n) ? String(km || '—') : AMX.fmtNombre(n) + ' km'; }
  function montantLisible(m) { var n = parseInt(String(m || '').replace(/\D/g, ''), 10); return isNaN(n) ? String(m || '') : AMX.fmtArgent(n); }
  function heure(ts) { return new Date(ts).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }); }
  function photosDe(l) { var p = l.photos || {}; return ANGLES.map(function (a) { return { id: a.id, libelle: a.libelle, url: p[a.id] || '' }; }); }
  function photosRecues(l) { return photosDe(l).filter(function (p) { return p.url; }); }
  function etatCrm(l) {
    if (!estRecu(l)) return null;
    var a = String(l.adf || '');
    if (/^envoye/.test(a)) return { libelle: 'CRM envoyé', classe: 'ok', detail: a };
    if (/aucune/.test(a)) return { libelle: 'Sans adresse', classe: 'attention', detail: a };
    return { libelle: 'CRM en attente', classe: '', detail: a };
  }
  function puceCrm(l) { var e = etatCrm(l); return e ? h('span.puce' + (e.classe ? '.' + e.classe : ''), { text: e.libelle, title: e.detail || e.libelle }) : null; }
  function badgeStatut(l) { return estRecu(l) ? h('span.badge.vert', { text: 'Reçu' }) : h('span.badge.gris', { text: 'Envoyé' }); }
  function kv(paires) {
    var dl = h('dl.kv');
    paires.forEach(function (p) {
      if (!p) return;
      dl.appendChild(h('dt', { text: p[0] }));
      dl.appendChild((p[1] instanceof Node || Array.isArray(p[1])) ? h('dd', p[1]) : h('dd', { text: (p[1] === undefined || p[1] === null || p[1] === '') ? '—' : String(p[1]) }));
    });
    return dl;
  }
  function trier(liste, cle) {
    var cmp = {
      recent:     function (a, b) { return tempsDe(b) - tempsDe(a); },
      ancien:     function (a, b) { return tempsDe(a) - tempsDe(b); },
      client:     function (a, b) { return titreClient(a).localeCompare(titreClient(b), 'fr') || (tempsDe(b) - tempsDe(a)); },
      concession: function (a, b) { return concessionDe(a).localeCompare(concessionDe(b), 'fr') || (tempsDe(b) - tempsDe(a)); },
      offre:      function (a, b) { return (parseInt(String(b.offre || '').replace(/\D/g, ''), 10) || 0) - (parseInt(String(a.offre || '').replace(/\D/g, ''), 10) || 0) || (tempsDe(b) - tempsDe(a)); }
    }[cle] || function () { return 0; };
    return liste.slice().sort(cmp);
  }

  // Texte envoyé au client avec le lien — signé du nom officiel de la concession.
  function messageClient(url, prenom, concession, vendeur) {
    return 'Bonjour' + (prenom ? ' ' + prenom : '') + ', voici le lien pour l\'évaluation de votre véhicule : ' + url +
      '\nScannez le NIV, inscrivez le kilométrage et prenez 5 photos — deux minutes.' +
      '\n' + [vendeur || monNom(), concession].filter(Boolean).join(', ');
  }
  // Texte d'une offre : celui du serveur si on l'a reçu dans la session, sinon un repli local.
  function messageOffre(l) {
    if (messagesOffre[l.id]) return messagesOffre[l.id];
    var veh = vehiculeDe(l), prenom = prenomDe(l.nom || l.clientNomPrevu);
    return 'Bonjour' + (prenom ? ' ' + prenom : '') + ',' +
      '\n\nMerci d\'avoir pris le temps d\'évaluer votre ' + (veh || 'véhicule') + (estRecu(l) && l.km ? ' (' + kmLisible(l.km) + ')' : '') + '.' +
      '\nNous vous offrons ' + montantLisible(l.offre) + ' pour votre véhicule.' + (l.offreNote ? '\n' + l.offreNote : '') +
      '\n\nPour en discuter ou fixer un rendez-vous, répondez simplement à ce message.' +
      '\n\n' + [l.offrePar || vendeurDe(l) || monNom(), concessionDe(l)].filter(Boolean).join(', ');
  }
  function mailtoLien(texte, concession) {
    return 'mailto:?subject=' + encodeURIComponent('Évaluation de votre véhicule' + (concession ? ' — ' + concession : '')) + '&body=' + encodeURIComponent(texte);
  }
  function mailtoOffre(l, texte) {
    var c = concessionDe(l);
    return 'mailto:' + encodeURIComponent(l.courriel || '') + '?subject=' + encodeURIComponent('Votre véhicule — ' + (c ? 'offre de ' + c : 'notre offre')) + '&body=' + encodeURIComponent(texte);
  }

  /* ------------------------------ Données ------------------------------ */
  function chargerListe() {
    if (promesseListe) return promesseListe;
    promesseListe = AMX.post({ action: 'leadListe' }).then(function (d) {
      promesseListe = null;
      if (d && d.refuse) { var r = new Error(d.erreur || d.message || 'Consultation des leads non autorisée pour ce compte.'); r.refuse = true; throw r; }
      AMX.verifier(d, 'Le serveur n\'a pas reconnu la demande : le script déployé ne contient pas encore Lead.gs.');
      cacheLeads = Array.isArray(d.leads) ? d.leads : [];
      if (Array.isArray(d.concessions) && d.concessions.length) cacheConcessions = d.concessions;
      cacheQuand = Date.now();
      AMX.rafraichirSousBarre();
      return cacheLeads;
    }, function (e) { promesseListe = null; throw e; });
    return promesseListe;
  }

  /* ------------------------------- CSS --------------------------------- */
  function injecterCss() {
    if (document.getElementById('css-leads')) return;
    var s = document.createElement('style');
    s.id = 'css-leads';
    s.textContent = [
      // Liste : vignette · client/véhicule · concession/vendeur · cellulaire · statut/date · CRM · offre · chevron
      '.ligne.leads-ligne { grid-template-columns: 56px minmax(0, 1.8fr) minmax(0, 1.1fr) minmax(0, .8fr) minmax(0, 1.25fr) minmax(0, .8fr) 88px 36px; }',
      '.ligne.leads-ligne .cell .leads-vendeur.moi { color: var(--vert); font-weight: 600; }',
      '.ligne.leads-ligne .leads-m { display: none; }',
      '.ligne.leads-ligne .vignette.leads-attente { color: var(--encre-4); }',
      '.ligne.leads-ligne .vignette.leads-attente svg { width: 20px; height: 20px; }',
      // Panneau ouvert : la liste se resserre (le détail est dans le panneau).
      '@media (max-width: 1600px) {',
      '  .agencement.avec-panneau .ligne.leads-ligne { grid-template-columns: 56px minmax(0, 1.6fr) minmax(0, 1fr) 88px 36px; }',
      '  .agencement.avec-panneau .ligne.leads-ligne .cell.leads-sec { display: none; }',
      '}',
      '@media (max-width: 1280px) {',
      '  .ligne.leads-ligne { grid-template-columns: 56px minmax(0, 1.8fr) minmax(0, 1.1fr) minmax(0, .8fr) minmax(0, 1.25fr) 88px 36px; }',
      '}',
      '@media (max-width: 860px) {',
      '  .ligne.leads-ligne, .agencement.avec-panneau .ligne.leads-ligne { grid-template-columns: 48px minmax(0, 1fr) 36px; }',
      '  .ligne.leads-ligne .leads-m { display: inline-flex; }',
      '}',
      // Panneau : photos étiquetées par angle, vidéo Drive, offre
      '.vignettes.leads-vignettes { grid-template-columns: repeat(3, 1fr); gap: 8px; }',
      '.leads-vig { min-width: 0; }',
      '.leads-vig img, .leads-vig .ph { display: block; }',
      '.leads-vig .ph { display: grid; place-items: center; color: var(--encre-4); font-size: 11px; cursor: default; border-style: dashed; }',
      '.leads-vig .ph svg { width: 18px; height: 18px; }',
      '.leads-vig .l { font-size: 10.5px; color: var(--encre-3); margin-top: 3px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.leads-vig.manque .l { color: var(--encre-4); }',
      '.leads-video { position: relative; aspect-ratio: 16 / 9; border-radius: 8px; overflow: hidden; background: var(--noir); border: 1px solid var(--ligne); margin-bottom: 8px; }',
      '.leads-video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }',
      '.leads-lien { display: flex; gap: 6px; }',
      '.leads-lien input { flex: 1; }',
      '.leads-lien .btn { height: 34px; width: 34px; flex: none; }',
      '.leads-offre-actuelle { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }',
      '.leads-offre-actuelle b { font-size: 20px; font-weight: 700; color: var(--vert); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }',
      '.leads-offre-note { margin: 0 0 10px; font-size: 12.5px; color: var(--encre-2); background: var(--carte-2); border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 8px 10px; white-space: pre-wrap; }',
      '.leads-pile { display: flex; flex-direction: column; gap: 10px; }',
      '.leads-pile-l { display: flex; flex-direction: column; gap: 12px; }',
      '.leads-droite { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }',
      '.leads-page .entete-page p { max-width: 720px; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ Module ------------------------------- */
  AMX.leads = {
    monter: function (conteneur, ctx) {
      var vue = new VueLeads(conteneur, ctx || { onglet: 'leads', params: {} });
      return { demonter: function () { vue.demonter(); }, naviguer: function (c) { vue.naviguer(c); } };
    },
    // Évaluations reçues sans offre (à répondre) ; '' avant le premier chargement.
    compteur: function () {
      if (!cacheLeads) return '';
      return cacheLeads.filter(function (l) { return estRecu(l) && !aUneOffre(l); }).length;
    }
  };

  function VueLeads(conteneur, ctx) {
    var self = this;
    injecterCss();
    this.conteneur = conteneur;
    this.onglet = (ctx && ctx.onglet) || 'leads';
    this.selection = (ctx && ctx.params && ctx.params.id) ? String(ctx.params.id) : '';
    this.leads = cacheLeads || [];
    this.filtres = this.filtresDefaut();
    this.tri = AMX.memo.lire('leads_tri', 'recent');
    this.ecritures = 0;
    this.enChargement = false;
    this.erreur = ''; this.refus = '';
    this.brouillon = null;   // offre en cours de saisie, conservée entre deux rendus
    this.detruit = false;
    this.construire();
    this.charger();
    this.minuterie = setInterval(function () { self.rafraichir(); }, INTERVALLE);
    this.surVisible = function () { if (!document.hidden && Date.now() - cacheQuand > 30000) self.rafraichir(); };
    document.addEventListener('visibilitychange', this.surVisible);
  }

  VueLeads.prototype.filtresDefaut = function () { return { recherche: '', statut: '', concession: '', miens: false, offre: '' }; };

  VueLeads.prototype.demonter = function () {
    this.detruit = true;
    clearInterval(this.minuterie);
    document.removeEventListener('visibilitychange', this.surVisible);
  };

  VueLeads.prototype.naviguer = function (ctx) {
    var id = ctx && ctx.params && ctx.params.id;
    if (id && String(id) !== this.selection) { this.selection = String(id); this.brouillon = null; this.rendre(); }
  };

  /* --------------------------- Construction ---------------------------- */
  VueLeads.prototype.construire = function () {
    var self = this;
    AMX.vider(this.conteneur);
    this.elKpis = h('div.kpis');
    this.elRail = h('aside.rail');
    this.elOutils = h('div.outils-liste');
    this.elListe = h('div');
    this.elPanneau = h('aside.panneau');
    this.elAgencement = h('div.agencement', [this.elRail, h('div', [this.elOutils, this.elListe]), this.elPanneau]);
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.conteneur.appendChild(h('div.page.leads-page', [
      h('div.entete-page', [
        h('div', [
          h('h1', { text: 'Leads — évaluations clients' }),
          h('p', { text: 'Le client reçoit un lien unique, scanne son NIV, inscrit le kilométrage et prend cinq photos. Sa demande entre dans le CRM de la concession ; vous pouvez ensuite lui répondre avec une offre.' })
        ]),
        h('div.actions', [
          h('button.btn.fantome.icone', { type: 'button', title: 'Filtres', html: I.filtre, onclick: function () { self.elRail.classList.toggle('ouvert'); } }),
          this.btnRafraichir,
          h('button.btn.primaire', { type: 'button', html: I.plus + '<span>Nouveau lien d\'évaluation</span>', onclick: function () { self.modaleCreer(); } })
        ])
      ]),
      this.elKpis, this.elAgencement
    ]));
    this.construireRail();
    this.rendre();
  };

  VueLeads.prototype.concessions = function () {
    if (cacheConcessions.length) return cacheConcessions;
    var vus = {}, l = [];
    this.leads.forEach(function (x) { if (x.concession && !vus[x.concession]) { vus[x.concession] = true; l.push({ id: x.concession, nom: concessionDe(x) }); } });
    return l.sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom), 'fr'); });
  };
  VueLeads.prototype.nomConcessionId = function (id) {
    var c = this.concessions().filter(function (x) { return x.id === id; })[0];
    return nomConcession(id, c ? c.nom : '');
  };

  VueLeads.prototype.construireRail = function () {
    var self = this, f = this.filtres;
    AMX.vider(this.elRail);
    var rech = h('div.recherche', [
      h('span', { html: I.recherche }),
      h('input.saisie', { type: 'search', placeholder: 'Client, NIV, véhicule, vendeur…', value: f.recherche, autocomplete: 'off', oninput: AMX.debounce(function (e) { f.recherche = e.target.value; self.rendre(); }, 120) })
    ]);
    var seg = h('div.segment.bloc');
    [['', 'Tous'], ['envoye', 'Envoyés'], ['recu', 'Reçus']].forEach(function (s) {
      seg.appendChild(h('button' + (f.statut === s[0] ? '.actif' : ''), { type: 'button', text: s[1], onclick: function () { f.statut = s[0]; if (s[0]) f.offre = ''; self.construireRail(); self.rendre(); } }));
    });
    var selConc = h('select.saisie', { onchange: function (e) { f.concession = e.target.value; self.rendre(); } }, [h('option', { value: '', text: 'Toutes les concessions' })]);
    this.concessions().forEach(function (c) { selConc.appendChild(h('option', { value: c.id, text: c.nom, selected: f.concession === c.id })); });
    var cbMiens = h('input', { type: 'checkbox', checked: f.miens, onchange: function (e) { f.miens = e.target.checked; self.rendre(); } });
    var nMiens = this.leads.filter(estMoi).length;
    this.elRail.appendChild(h('div.groupe', [
      h('h3', ['Recherche', h('button', { type: 'button', text: 'Réinitialiser', onclick: function () { self.filtres = self.filtresDefaut(); self.construireRail(); self.rendre(); } })]),
      rech
    ]));
    this.elRail.appendChild(h('div.groupe', [h('h3', 'Statut'), seg]));
    this.elRail.appendChild(h('div.groupe', [h('h3', 'Concession'), selConc]));
    this.elRail.appendChild(h('div.groupe', [h('h3', 'Affichage'), h('label.case', [cbMiens, h('span', 'Seulement les miens'), h('span.compte', { text: nMiens })])]));
  };

  /* ------------------------------ Données ------------------------------ */
  VueLeads.prototype.charger = function (manuel) {
    var self = this;
    this.enChargement = true;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    if (!cacheLeads) this.rendreListe([]);
    return chargerListe().then(function (liste) {
      if (self.detruit) return;
      self.enChargement = false; self.erreur = ''; self.refus = '';
      self.btnRafraichir.classList.remove('occupe');
      self.leads = liste;
      self.construireRail(); self.rendre();
      if (self.selection && !self.premierAvis && !liste.some(function (l) { return String(l.id) === self.selection; })) { AMX.toast('Ce lead n\'est pas (ou plus) dans la liste.', 'attention'); }
      self.premierAvis = true;
    }, function (e) {
      if (self.detruit) return;
      self.enChargement = false;
      self.btnRafraichir.classList.remove('occupe');
      if (e && e.refuse) { self.refus = AMX.erreurTexte(e); self.rendre(); return; }
      self.erreur = AMX.erreurTexte(e);
      self.rendre();
      AMX.toast('Impossible de charger les leads : ' + AMX.erreurTexte(e), 'erreur');
    });
  };
  VueLeads.prototype.rafraichir = function () {
    if (this.detruit || document.hidden || this.ecritures > 0 || this.enChargement) return;
    var a = document.activeElement;
    if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && this.conteneur.contains(a)) return;
    this.charger();
  };

  /* ------------------------------ Filtrage ----------------------------- */
  VueLeads.prototype.filtrer = function () {
    var f = this.filtres;
    var l = this.leads.filter(function (x) {
      if (f.statut && (estRecu(x) ? 'recu' : 'envoye') !== f.statut) return false;
      if (f.concession && x.concession !== f.concession) return false;
      if (f.miens && !estMoi(x)) return false;
      if (f.offre === 'avec' && !aUneOffre(x)) return false;
      if (f.offre === 'sans' && (!estRecu(x) || aUneOffre(x))) return false;
      return true;
    });
    var t = f.recherche.trim().toLowerCase();
    if (t) l = l.filter(function (x) { return [titreClient(x), telDe(x), x.vin, vehiculeDe(x), concessionDe(x), vendeurDe(x), x.courriel].join(' ').toLowerCase().indexOf(t) >= 0; });
    return trier(l, this.tri);
  };

  /* -------------------------------- Rendu ------------------------------ */
  VueLeads.prototype.rendre = function () {
    this.rendreKpis();
    var liste = this.filtrer();
    this.rendreOutils(liste);
    this.rendreListe(liste);
    this.rendrePanneau();
  };

  VueLeads.prototype.rendreKpis = function () {
    var self = this, f = this.filtres, L = this.leads, pret = !!cacheLeads;
    AMX.vider(this.elKpis);
    var kpi = function (valeur, libelle, opts) {
      opts = opts || {};
      var k = h('button.kpi' + (opts.classe ? '.' + opts.classe : '') + (opts.actif ? '.actif' : ''), { type: 'button' }, [
        h('div.valeur', { text: pret ? valeur : '—' }), h('div.libelle', { text: libelle }), opts.sous ? h('div.sous', { text: opts.sous }) : null,
        opts.couleur ? h('span.pastille', { style: { background: 'var(--' + opts.couleur + ')' } }) : null
      ]);
      if (opts.onclick) k.addEventListener('click', function () { opts.onclick(); self.construireRail(); self.rendre(); });
      return k;
    };
    var envoyes = L.filter(function (l) { return !estRecu(l); }).length;
    var recus = L.filter(estRecu).length;
    var aRepondre = L.filter(function (l) { return estRecu(l) && !aUneOffre(l); }).length;
    var offres = L.filter(aUneOffre).length;
    var miens = L.filter(estMoi).length;
    var actifEnvoyes = f.statut === 'envoye' && !f.offre, actifRecus = f.statut === 'recu' && !f.offre, actifOffres = f.offre === 'avec';
    this.elKpis.appendChild(kpi(envoyes, 'Liens envoyés en attente', { couleur: 'gris', sous: 'en attente du client', actif: actifEnvoyes, onclick: function () { f.statut = actifEnvoyes ? '' : 'envoye'; f.offre = ''; } }));
    this.elKpis.appendChild(kpi(recus, 'Évaluations reçues', { couleur: 'vert', classe: aRepondre ? 'attention' : '', sous: aRepondre ? aRepondre + ' sans offre' : (recus ? 'toutes avec une offre' : 'aucune pour le moment'), actif: actifRecus, onclick: function () { f.statut = actifRecus ? '' : 'recu'; f.offre = ''; } }));
    this.elKpis.appendChild(kpi(offres, 'Offres faites', { couleur: 'bleu', sous: recus ? 'sur ' + recus + ' reçue' + (recus > 1 ? 's' : '') : '', actif: actifOffres, onclick: function () { f.offre = actifOffres ? '' : 'avec'; f.statut = ''; } }));
    this.elKpis.appendChild(kpi(miens, 'Mes leads', { couleur: 'violet', sous: 'créés par vous', actif: f.miens, onclick: function () { f.miens = !f.miens; } }));
  };

  VueLeads.prototype.rendreOutils = function (liste) {
    var self = this, f = this.filtres;
    AMX.vider(this.elOutils);
    var n = liste.length, total = this.leads.length;
    this.elOutils.appendChild(h('span.compte', [h('b', { text: n }), ' lead' + (n > 1 ? 's' : '') + (n !== total ? ' sur ' + total : '')]));
    var puces = [];
    if (f.statut) puces.push([f.statut === 'recu' ? 'Reçus' : 'Envoyés', function () { f.statut = ''; }]);
    if (f.offre === 'avec') puces.push(['Avec une offre', function () { f.offre = ''; }]);
    if (f.offre === 'sans') puces.push(['À répondre', function () { f.offre = ''; }]);
    if (f.concession) puces.push([this.nomConcessionId(f.concession), function () { f.concession = ''; }]);
    if (f.miens) puces.push(['Mes leads', function () { f.miens = false; }]);
    if (f.recherche.trim()) puces.push(['« ' + f.recherche.trim() + ' »', function () { f.recherche = ''; }]);
    puces.forEach(function (p) {
      var b = h('button.puce.info', { type: 'button', title: 'Retirer ce filtre', text: p[0] + ' ✕' });
      b.addEventListener('click', function () { p[1](); self.construireRail(); self.rendre(); });
      self.elOutils.appendChild(b);
    });
    this.elOutils.appendChild(h('span.espace'));
    if (cacheQuand) this.elOutils.appendChild(h('span.doux.petit', { text: 'Synchronisé à ' + heure(cacheQuand) }));
    var sel = h('select.saisie', { onchange: function (e) { self.tri = e.target.value; AMX.memo.ecrire('leads_tri', self.tri); self.rendre(); } });
    [['recent', 'Plus récents'], ['ancien', 'Plus anciens'], ['client', 'Client'], ['concession', 'Concession'], ['offre', 'Offre']].forEach(function (o) { sel.appendChild(h('option', { value: o[0], selected: self.tri === o[0], text: 'Tri : ' + o[1] })); });
    this.elOutils.appendChild(sel);
  };

  VueLeads.prototype.rendreListe = function (liste) {
    var self = this;
    AMX.vider(this.elListe);
    if (this.refus) {
      this.elListe.appendChild(h('div.vide', [h('div', { html: I.cadenas }), h('h3', 'Accès non autorisé'), h('div', { text: this.refus })]));
      return;
    }
    if (!cacheLeads) {
      if (this.erreur) {
        this.elListe.appendChild(h('div.vide', [h('div', { html: I.alerte }), h('h3', 'Serveur injoignable'), h('div', { text: this.erreur }), h('div', { style: { marginTop: '12px' } }, [h('button.btn', { type: 'button', html: I.rafraichir + '<span>Réessayer</span>', onclick: function () { self.charger(true); } })])]));
      } else {
        this.elListe.appendChild(AMX.chargeur('Leads'));
      }
      return;
    }
    if (!liste.length) {
      if (!this.leads.length) {
        this.elListe.appendChild(h('div.vide', [h('div', { html: I.lien }), h('h3', 'Aucun lead pour le moment'), h('div', 'Créez un premier lien d\'évaluation et envoyez-le à un client par texto ou par courriel.'),
          h('div', { style: { marginTop: '12px' } }, [h('button.btn.primaire', { type: 'button', html: I.plus + '<span>Nouveau lien d\'évaluation</span>', onclick: function () { self.modaleCreer(); } })])]));
      } else {
        this.elListe.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucun lead'), h('div', 'Aucun lead ne correspond aux filtres choisis.')]));
      }
      return;
    }
    var frag = document.createDocumentFragment();
    liste.forEach(function (l) { frag.appendChild(self.ligne(l)); });
    this.elListe.appendChild(h('div.liste', [frag]));
  };

  VueLeads.prototype.ligne = function (l) {
    var self = this, recu = estRecu(l), veh = vehiculeDe(l);
    var photos = photosRecues(l);
    var vignette;
    if (photos.length) {
      var p = photos.filter(function (x) { return x.id === 'avant'; })[0] || photos[0];
      vignette = h('div.vignette', [h('img', { src: AMX.vignetteDrive(p.url, 200), alt: '', loading: 'lazy' })]);
    } else if (l.nom || l.clientNomPrevu) {
      vignette = h('div.vignette', { text: AMX.initiales(l.nom || l.clientNomPrevu), title: recu ? 'Aucune photo' : 'En attente du client' });
    } else {
      vignette = h('div.vignette.leads-attente', { html: I.lien, title: 'En attente du client' });
    }
    var el = h('div.ligne.leads-ligne' + (this.selection && String(l.id) === this.selection ? '.actif' : ''), { dataset: { id: String(l.id) } }, [
      vignette,
      h('div', { style: { minWidth: 0 } }, [
        h('div.titre', { text: titreClient(l) }),
        h('div.sous', [
          h('span.leads-m', [badgeStatut(l)]),
          veh ? h('span', { text: veh }) : h('span.doux', { text: recu ? 'Véhicule non précisé' : 'En attente du client' }),
          l.vin ? h('span.vin', { text: l.vin }) : null,
          recu && l.km ? h('span.puce', { text: kmLisible(l.km) }) : null,
          l.video ? h('span.puce.info', { text: '▶ Vidéo', title: 'Vidéo reçue' }) : null
        ])
      ]),
      h('div.cell.leads-sec', [h('span.l', 'Concession'), h('span.v', { text: concessionDe(l) || '—', title: concessionDe(l) }), h('span.v.leads-vendeur' + (estMoi(l) ? '.moi' : ''), { text: vendeurDe(l) || '—', title: estMoi(l) ? 'Créé par vous' : vendeurDe(l) })]),
      h('div.cell.leads-sec', [h('span.l', 'Cellulaire'), h('span.v', { text: telDe(l) || '—' })]),
      h('div.cell', [h('span.l', 'Statut'), h('span', [badgeStatut(l)]), h('span.jours', { text: (recu ? 'Reçu le ' : 'Envoyé le ') + AMX.fmtDate(dateDe(l), true) })]),
      h('div.cell.indic.leads-sec', [h('span.l', 'CRM'), h('div.indicateurs', [puceCrm(l) || h('span.doux.petit', '—')])]),
      h('div.montant', [h('span.l', 'Offre'), h('span', { text: aUneOffre(l) ? montantLisible(l.offre) : '—' })]),
      h('button.plus', { type: 'button', title: 'Ouvrir', html: I.chevron })
    ]);
    el.addEventListener('click', function () { self.selectionner(l.id); });
    return el;
  };

  VueLeads.prototype.selectionner = function (id) {
    this.selection = id ? String(id) : '';
    this.brouillon = null;
    history.replaceState(null, '', AMX.lien('offres', this.onglet, this.selection ? { id: this.selection } : {}));
    var sel = this.selection;
    this.elListe.querySelectorAll('.ligne').forEach(function (el) { el.classList.toggle('actif', !!sel && el.dataset.id === sel); });
    this.rendrePanneau();
  };

  /* ------------------------------ Panneau ------------------------------ */
  VueLeads.prototype.rendrePanneau = function () {
    var self = this;
    var l = this.selection ? this.leads.filter(function (x) { return String(x.id) === self.selection; })[0] : null;
    this.elAgencement.classList.toggle('avec-panneau', !!l);
    AMX.vider(this.elPanneau);
    if (!l) { this.elPanneau.style.display = 'none'; return; }
    this.elPanneau.style.display = '';
    var recu = estRecu(l), veh = vehiculeDe(l), tel = telDe(l), conc = concessionDe(l);
    var fermer = function () { self.selectionner(''); };

    var entete = h('div.panneau-entete', [
      h('div', { style: { minWidth: 0 } }, [
        h('h2', { text: titreClient(l) + (veh ? ' — ' + veh : '') }),
        h('div.sous', [badgeStatut(l), h('span.puce', { text: conc || '—' }), puceCrm(l), aUneOffre(l) ? h('span.puce.ok', { text: 'Offre ' + montantLisible(l.offre) }) : null])
      ]),
      h('button.fermer', { type: 'button', title: 'Fermer', html: I.fermer, onclick: fermer })
    ]);

    // Véhicule
    var blocVehicule = h('div.bloc', [h('h3', 'Véhicule'), kv([
      ['Véhicule', veh || (recu ? '—' : 'En attente du client')],
      ['NIV', l.vin ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } }, [h('span.mono', { text: l.vin }), h('button.btn.fantome.petit.icone', { type: 'button', title: 'Copier le NIV', html: I.copier, onclick: function () { AMX.copier(l.vin, 'NIV copié'); } })]) : '—'],
      ['Kilométrage', recu ? kmLisible(l.km) : '—']
    ])]);

    // Client
    var blocClient = h('div.bloc', [h('h3', 'Client'), kv([
      ['Client', titreClient(l)],
      ['Cellulaire', tel ? h('a', { href: 'tel:' + tel.replace(/[^\d+]/g, ''), text: tel }) : '—'],
      ['Courriel', l.courriel ? h('a', { href: 'mailto:' + encodeURIComponent(l.courriel), text: l.courriel }) : '—'],
      ['Note', l.note || '—']
    ])]);

    // Suivi
    var crm = etatCrm(l);
    var blocSuivi = h('div.bloc', [h('h3', 'Suivi'), kv([
      ['Concession', conc || '—'],
      ['Vendeur', (vendeurDe(l) || '—') + (estMoi(l) ? ' (vous)' : '')],
      ['Lien créé le', AMX.fmtDate(l.creeLe, true)],
      ['Reçu le', recu ? AMX.fmtDate(l.recuLe, true) : 'En attente du client'],
      ['CRM', crm ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } }, [puceCrm(l), crm.detail && crm.detail !== crm.libelle ? h('span.doux.petit', { text: crm.detail }) : null]) : '—']
    ])]);

    // Lien d'évaluation : à renvoyer tant que le client n'a pas répondu.
    var blocLien = null;
    if (!recu && l.url) {
      var texteLien = messageClient(l.url, prenomDe(l.clientNomPrevu), conc, vendeurDe(l));
      var champUrl = h('input.saisie.mono', { type: 'text', value: l.url, readonly: true, onclick: function () { this.select(); } });
      blocLien = h('div.bloc', [h('h3', 'Lien d\'évaluation'),
        h('div.leads-pile', [
          h('div.leads-lien', [champUrl, h('button.btn.icone', { type: 'button', title: 'Copier le lien', html: I.copier, onclick: function () { AMX.copier(l.url, 'Lien copié'); } })]),
          h('div.actions-ligne', [
            h('button.btn.primaire', { type: 'button', html: I.copier + '<span>Copier le lien</span>', onclick: function () { AMX.copier(l.url, 'Lien copié'); } }),
            h('button.btn', { type: 'button', html: I.copier + '<span>Copier le texte</span>', onclick: function () { AMX.copier(texteLien, 'Message copié'); } }),
            h('a.btn', { href: l.url, target: '_blank', rel: 'noopener', html: I.externe + '<span>Ouvrir</span>' }),
            h('a.btn', { href: mailtoLien(texteLien, conc), html: I.courriel + '<span>Envoyer par courriel</span>' })
          ]),
          h('div.doux.petit', 'Le lien est à usage unique : le client scanne son NIV, inscrit le kilométrage et prend cinq photos.')
        ])
      ]);
    }

    // Photos (cinq angles)
    var photos = photosDe(l), recues = photos.filter(function (p) { return p.url; });
    var blocPhotos = h('div.bloc', [h('h3', ['Photos', h('span.doux', { style: { textTransform: 'none', letterSpacing: 0, fontWeight: 500 }, text: recues.length + ' / ' + ANGLES.length })])]);
    if (!recues.length) {
      blocPhotos.appendChild(h('div.doux.petit', recu ? 'Aucune photo reçue.' : 'En attente du client — aucune photo encore.'));
    } else {
      var pleines = recues.map(function (p) { return { url: AMX.vignetteDrive(p.url, 1600), angle: p.libelle }; });
      var grille = h('div.vignettes.leads-vignettes');
      photos.forEach(function (p) {
        if (p.url) {
          var idx = recues.indexOf(p);
          var img = h('img', { src: AMX.vignetteDrive(p.url, 400), alt: p.libelle, title: p.libelle, loading: 'lazy' });
          img.addEventListener('click', function () { AMX.galerie(pleines, idx); });
          grille.appendChild(h('div.leads-vig', [img, h('div.l', { text: p.libelle })]));
        } else {
          grille.appendChild(h('div.leads-vig.manque', [h('div.ph', { title: 'Photo non reçue', html: I.photo }), h('div.l', { text: p.libelle + ' · manquante' })]));
        }
      });
      blocPhotos.appendChild(grille);
    }

    // Vidéo (lecteur intégré de Drive)
    var blocVideo = null;
    if (l.video) {
      var idVideo = AMX.idDrive(l.video);
      blocVideo = h('div.bloc', [h('h3', 'Vidéo'),
        idVideo ? h('div.leads-video', [h('iframe', { src: 'https://drive.google.com/file/d/' + encodeURIComponent(idVideo) + '/preview', allow: 'autoplay; fullscreen', allowfullscreen: true, loading: 'lazy', title: 'Vidéo du client' })]) : null,
        h('div.actions-ligne', [h('a.btn.petit', { href: l.video, target: '_blank', rel: 'noopener', html: I.externe + '<span>Ouvrir dans Drive</span>' })])
      ]);
    }

    var blocs = recu
      ? [blocVehicule, blocPhotos, blocVideo, this.blocOffre(l), blocClient, blocSuivi]
      : [blocClient, blocLien, (veh || l.vin) ? blocVehicule : null, recues.length ? blocPhotos : null, blocVideo, blocSuivi];
    this.elPanneau.appendChild(h('div.carte', [entete].concat(blocs)));
  };

  // Bloc « Offre » : seulement quand l'évaluation est reçue.
  VueLeads.prototype.blocOffre = function (l) {
    var self = this, existe = aUneOffre(l);
    var bloc = h('div.bloc', [h('h3', ['Offre au client', existe ? h('span.badge.vert', { text: 'Offre faite' }) : h('span.badge.ambre', { text: 'À répondre' })])]);
    if (existe) {
      var texte = messageOffre(l);
      bloc.appendChild(h('div.leads-offre-actuelle', [
        h('b', { text: montantLisible(l.offre) }),
        h('span.doux', { text: [l.offrePar ? 'par ' + l.offrePar : '', l.offreLe ? 'le ' + AMX.fmtDate(l.offreLe, true) : ''].filter(Boolean).join(' ') })
      ]));
      if (l.offreNote) bloc.appendChild(h('p.leads-offre-note', { text: l.offreNote }));
      if (courrielsEnvoyes[l.id]) bloc.appendChild(h('div.alerte-bloc.ok', { style: { marginBottom: '10px' } }, [h('span', { html: I.ok }), h('div', { text: 'Courriel envoyé au client (' + l.courriel + ').' })]));
      bloc.appendChild(h('div.actions-ligne', { style: { marginBottom: '14px' } }, [
        h('button.btn', { type: 'button', html: I.copier + '<span>Copier le texte</span>', onclick: function () { AMX.copier(texte, 'Message copié'); } }),
        l.courriel && !courrielsEnvoyes[l.id] ? h('a.btn', { href: mailtoOffre(l, texte), html: I.courriel + '<span>Envoyer par courriel</span>' }) : null
      ]));
    }
    var b = this.brouillon && String(this.brouillon.id) === String(l.id) ? this.brouillon : null;
    var montant = h('input.saisie.num', { type: 'text', inputmode: 'numeric', placeholder: '12 500', autocomplete: 'off', value: b ? b.montant : (existe ? String(l.offre).replace(/\D/g, '') : '') });
    var note = h('input.saisie', { type: 'text', placeholder: 'Pneus d\'hiver inclus', autocomplete: 'off', value: b ? b.note : (l.offreNote || '') });
    var cb = h('input', { type: 'checkbox', checked: b ? b.courriel : true });
    var memo = function () { self.brouillon = { id: l.id, montant: montant.value, note: note.value, courriel: cb.checked }; };
    montant.addEventListener('input', memo); note.addEventListener('input', memo); cb.addEventListener('change', memo);
    var btn = h('button.btn.primaire', { type: 'button', html: I.offres + '<span>' + (existe ? 'Mettre à jour l\'offre' : 'Envoyer l\'offre') + '</span>' });
    btn.addEventListener('click', function () { self.envoyerOffre(l, montant, note, cb, btn); });
    [montant, note].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); btn.click(); } }); });
    bloc.appendChild(h('div.leads-pile', [
      existe ? h('div.section-titre', { style: { margin: 0 } }, 'Modifier l\'offre') : h('div.doux.petit', 'Le montant est inscrit au dossier ; le texte est prêt à copier et, si le client a laissé un courriel, il peut partir directement.'),
      h('div.grille.c2', [h('div.champ', [h('label', 'Montant ($)'), montant]), h('div.champ', [h('label', 'Note (facultatif)'), note])]),
      l.courriel ? h('label.case', [cb, h('span', { text: 'Envoyer par courriel au client (' + l.courriel + ')' })]) : h('div.doux.petit', 'Le client n\'a pas laissé de courriel : copiez le texte de l\'offre pour le lui envoyer par texto.'),
      h('div', [btn])
    ]));
    return bloc;
  };

  VueLeads.prototype.envoyerOffre = function (l, montantEl, noteEl, cbEl, btn) {
    var self = this;
    var montant = montantEl.value.replace(/\D/g, '');
    if (!montant) { AMX.toast('Indiquez un montant.', 'attention'); montantEl.focus(); return; }
    var noteTexte = noteEl.value.trim();
    var parCourriel = !!(l.courriel && cbEl.checked);
    btn.classList.add('occupe'); this.ecritures++;
    var fini = function () { self.ecritures--; btn.classList.remove('occupe'); };
    AMX.post({ action: 'leadOffre', id: l.id, montant: montant, note: noteTexte, courriel: parCourriel })
      .then(function (d) { AMX.verifier(d, 'Offre non enregistrée.'); return d; })
      .then(function (d) {
        fini();
        l.offre = montant; l.offreNote = noteTexte; l.offrePar = monNom(); l.offreLe = new Date().toISOString();
        if (d.message) messagesOffre[l.id] = d.message;
        if (d.courrielEnvoye) courrielsEnvoyes[l.id] = true;
        self.brouillon = null;
        AMX.toast(d.courrielEnvoye ? 'Offre enregistrée et envoyée par courriel au client.' : 'Offre enregistrée — copiez le texte pour l\'envoyer au client.', 'ok');
        AMX.rafraichirSousBarre();
        if (!self.detruit) self.rendre();
        chargerListe().then(function (liste) { if (!self.detruit) { self.leads = liste; self.rendre(); } }).catch(function () {});
      }, function (e) {
        fini();
        AMX.toast('Offre non enregistrée : ' + AMX.erreurTexte(e), 'erreur');
      });
  };

  /* ------------------------- Nouveau lien (modale) --------------------- */
  VueLeads.prototype.modaleCreer = function () {
    var self = this;
    var concs = this.concessions();
    var memoConc = AMX.memo.lire('leads_concession', '');
    var sel = h('select.saisie', [h('option', { value: '', text: 'Choisir une concession…' })]);
    concs.forEach(function (c) { sel.appendChild(h('option', { value: c.id, text: c.nom, selected: c.id === memoConc })); });
    if (!sel.value && concs.length === 1) sel.value = concs[0].id;
    sel.addEventListener('change', function () { if (sel.value) AMX.memo.ecrire('leads_concession', sel.value); });
    var nom = h('input.saisie', { type: 'text', placeholder: 'Jean Tremblay', autocomplete: 'off' });
    var tel = h('input.saisie', { type: 'tel', placeholder: '514 555-1234', autocomplete: 'off' });
    var btn = h('button.btn.primaire', { type: 'button', html: I.lien + '<span>Créer le lien</span>' });
    var corps = h('div');
    var m;
    corps.appendChild(h('div.leads-pile-l', [
      h('p', { style: { margin: 0, color: 'var(--encre-2)', lineHeight: '1.5' }, text: 'Le lien est à usage unique et rattaché à votre compte : le lead arrivera au CRM de la concession avec votre nom.' }),
      concs.length ? null : h('div.alerte-bloc.attention', [h('span', { html: I.alerte }), h('div', 'Aucune concession reçue du serveur. Rafraîchissez la liste, puis réessayez.')]),
      h('div.champ', [h('label', 'Concession'), sel]),
      h('div.grille.c2', [h('div.champ', [h('label', 'Nom du client (facultatif)'), nom]), h('div.champ', [h('label', 'Cellulaire (facultatif)'), tel])]),
      h('div.leads-droite', [h('button.btn', { type: 'button', text: 'Annuler', onclick: function () { m.fermer(); } }), btn])
    ]));
    var creer = function () {
      if (!sel.value) { AMX.toast('Choisissez une concession.', 'attention'); sel.focus(); return; }
      var conc = sel.value, nomClient = nom.value.trim(), telClient = tel.value.trim();
      btn.classList.add('occupe');
      AMX.post({ action: 'leadCreer', concession: conc, clientNom: nomClient, clientTel: telClient })
        .then(function (d) { AMX.verifier(d, 'Création impossible.'); if (!d.url) throw new Error('Le serveur n\'a pas renvoyé de lien.'); return d; })
        .then(function (d) {
          btn.classList.remove('occupe');
          AMX.memo.ecrire('leads_concession', conc);
          self.afficherLienCree(corps, m, d.url, nomClient, self.nomConcessionId(conc));
          AMX.toast('Lien créé — envoyez-le au client par texto ou par courriel.', 'ok');
          if (!self.detruit) self.charger();
        }, function (e) {
          btn.classList.remove('occupe');
          AMX.toast('Création impossible : ' + AMX.erreurTexte(e), 'erreur');
        });
    };
    btn.addEventListener('click', creer);
    [nom, tel].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); creer(); } }); });
    m = AMX.modale({ titre: 'Nouveau lien d\'évaluation', corps: corps, sansPied: true });
  };

  // Après création : le lien reste derrière des boutons (champ en lecture seule pour la copie).
  VueLeads.prototype.afficherLienCree = function (corps, m, url, nomClient, nomConc) {
    var self = this;
    var texte = messageClient(url, prenomDe(nomClient), nomConc, monNom());
    var champUrl = h('input.saisie.mono', { type: 'text', value: url, readonly: true, onclick: function () { this.select(); } });
    var ta = h('textarea.saisie', { rows: '4', spellcheck: 'false' });
    ta.value = texte;
    var lienCourriel = h('a.btn', { href: mailtoLien(texte, nomConc), html: I.courriel + '<span>Envoyer par courriel</span>' });
    ta.addEventListener('input', function () { lienCourriel.href = mailtoLien(ta.value, nomConc); });
    AMX.vider(corps);
    corps.appendChild(h('div.leads-pile-l', [
      h('div.alerte-bloc.ok', [h('span', { html: I.ok }), h('div', [h('b', 'Lien prêt à envoyer'), h('span', { text: ' — ' + (nomClient ? 'pour ' + nomClient + ', ' : '') + (nomConc || 'concession choisie') + '. Le lien est à usage unique.' })])]),
      h('div.champ', [h('label', 'Lien d\'évaluation'), h('div.leads-lien', [champUrl, h('button.btn.icone', { type: 'button', title: 'Copier le lien', html: I.copier, onclick: function () { AMX.copier(url, 'Lien copié'); } })])]),
      h('div.champ', [h('label', 'Message au client (modifiable)'), ta]),
      h('div.actions-ligne', [
        h('button.btn.primaire', { type: 'button', html: I.copier + '<span>Copier le lien</span>', onclick: function () { AMX.copier(url, 'Lien copié'); } }),
        h('button.btn', { type: 'button', html: I.copier + '<span>Copier le texte</span>', onclick: function () { AMX.copier(ta.value, 'Message copié'); } }),
        h('a.btn', { href: url, target: '_blank', rel: 'noopener', html: I.externe + '<span>Ouvrir</span>' }),
        lienCourriel
      ]),
      h('div.leads-droite', [
        h('button.btn', { type: 'button', text: 'Créer un autre lien', onclick: function () { m.fermer(); self.modaleCreer(); } }),
        h('button.btn.sombre', { type: 'button', text: 'Fermer', onclick: function () { m.fermer(); } })
      ])
    ]));
  };
})();
