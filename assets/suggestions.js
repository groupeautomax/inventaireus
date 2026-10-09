/* ScanAutomax — Suggestions (8 oct. 2026, soir)
   Maxime : « un onglet Suggestions où les utilisateurs font des demandes de
   changement ; en ROUGE jusqu'à ce qu'elles soient traitées ; on les traite
   ensemble (Maxime + Claude) ; quand c'est fait → VERT et un courriel à
   l'employé qui explique ce qui a changé. »

   - Tout compte connecté : « Nouvelle suggestion » (page, titre, ce qui
     manque, pourquoi, exemple, urgence) et la liste de SES suggestions.
   - Admin / propriétaire : toutes les suggestions, filtres, « Marquer
     traitée » (texte « ce qui a changé » → courriel), « Refuser » (raison →
     courriel), « Rouvrir », et « Copier la liste pour Claude » (les demandes
     à traiter en texte, à coller dans la conversation).
   Routes : GET ?suggestions=1 ; POST suggestionCreer, suggestionTraiter
   (Suggestion.gs via RoutesAjout.gs). */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;

  var PAGES_DEFAUT = [
    { id: 'inventaire', libelle: 'Inventaire' }, { id: 'service', libelle: 'Suivi service' }, { id: 'achat', libelle: 'Fiche d\'achat' },
    { id: 'evaluation', libelle: 'Évaluation' }, { id: 'offres', libelle: 'Offres et clients' }, { id: 'resultat', libelle: 'Résultat' },
    { id: 'avis', libelle: 'Avis Google' }, { id: 'admin', libelle: 'Admin' }, { id: 'app', libelle: 'Application iPhone' }, { id: 'autre', libelle: 'Autre / général' }
  ];
  var URGENCES = [['normal', 'Normal'], ['important', 'Important'], ['bloquant', 'Bloquant (m\'empêche de travailler)']];
  var ETATS = { recue: 'À traiter', traitee: 'Traitée', refusee: 'Refusée' };

  var cache = { rep: null, quand: 0, promesse: null };
  AMX.suggestions = {
    charger: function (force) {
      if (!force && cache.rep && Date.now() - cache.quand < 60000) return Promise.resolve(cache.rep);
      if (cache.promesse) return cache.promesse;
      cache.promesse = AMX.get({ suggestions: 1 }).then(function (d) {
        cache.promesse = null;
        if (!d || !d.ok) throw new Error((d && d.erreur) || 'Suggestions indisponibles');
        cache.rep = d; cache.quand = Date.now();
        document.dispatchEvent(new CustomEvent('amx:suggestions'));
        return d;
      }, function (e) { cache.promesse = null; throw e; });
      return cache.promesse;
    },
    poser: function (s) {
      if (!cache.rep) return;
      var i = cache.rep.suggestions.findIndex(function (x) { return x.id === s.id; });
      if (i >= 0) cache.rep.suggestions[i] = s; else cache.rep.suggestions.unshift(s);
      var n = { recue: 0, traitee: 0, refusee: 0 }; cache.rep.suggestions.forEach(function (x) { if (n[x.etat] !== undefined) n[x.etat]++; }); cache.rep.compte = n;
      document.dispatchEvent(new CustomEvent('amx:suggestions'));
    },
    aTraiter: function () { return cache.rep && cache.rep.admin ? (cache.rep.compte && cache.rep.compte.recue) || 0 : 0; },
    // Le formulaire, appelable d'ailleurs (menu du compte, Aide).
    nouvelle: function () { return ouvrirFormulaire(); }
  };

  function injecterCss() {
    if (document.getElementById('css-suggestions')) return;
    var s = document.createElement('style');
    s.id = 'css-suggestions';
    s.textContent = [
      '.sug-page .kpis { margin-bottom: 14px; }',
      '.sug-filtres { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }',
      '.sug-filtres input, .sug-filtres select { height: 32px; }',
      '.sug-liste { display: flex; flex-direction: column; gap: 10px; }',
      '.sug-carte { background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); box-shadow: var(--ombre); padding: 12px 14px 12px 16px; position: relative; }',
      '.sug-carte::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; border-radius: var(--rayon) 0 0 var(--rayon); background: var(--gris-bord); }',
      '.sug-carte.recue::before { background: var(--rouge); } .sug-carte.traitee::before { background: var(--vert); } .sug-carte.refusee::before { background: var(--gris); }',
      '.sug-carte.recue { background: #FFF7F6; } .sug-carte.traitee { background: #F3FBF6; }',
      '.sug-tete { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }',
      '.sug-tete h3 { margin: 0; font-size: 14.5px; flex: 1 1 300px; }',
      '.sug-tete .puce.etat { font-weight: 700; }',
      '.sug-meta { font-size: 11.5px; color: var(--encre-3); margin-top: 3px; display: flex; gap: 6px; flex-wrap: wrap; }',
      '.sug-corps { margin-top: 8px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px 16px; font-size: 12.5px; line-height: 1.5; }',
      '.sug-corps .l { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); font-weight: 700; }',
      '.sug-corps .t { white-space: pre-wrap; }',
      '.sug-reponse { margin-top: 10px; padding: 10px 12px; border-radius: var(--rayon-s); font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; }',
      '.sug-carte.traitee .sug-reponse { background: var(--vert-clair); border: 1px solid #B6E0C6; } .sug-carte.refusee .sug-reponse { background: var(--gris-bg); border: 1px solid var(--gris-bord); }',
      '.sug-reponse .l { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; margin-bottom: 3px; display: block; }',
      '.sug-actions { margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap; }',
      '.sug-vide { padding: 28px; text-align: center; color: var(--encre-3); }',
      '.sug-form .champ { margin-bottom: 10px; }',
      '.sug-form .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }',
      '@media (max-width: 640px) { .sug-form .deux { grid-template-columns: 1fr; } }',
      '.sug-aide { font-size: 12px; color: var(--encre-3); margin: 0 0 12px; line-height: 1.5; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  AMX.section('suggestions', {
    titre: 'Suggestions', icone: 'suggestions', ordre: 60,
    onglets: [
      { id: 'liste', titre: 'Suggestions', compteur: function () { return AMX.suggestions.aTraiter() || ''; } }
    ],
    monter: function (conteneur, ctx) { return new Suggestions(conteneur, ctx); }
  });

  function Suggestions(conteneur, ctx) {
    var self = this;
    injecterCss();
    this.conteneur = conteneur;
    this.params = ctx.params || {};
    this.filtres = { etat: (ctx.params && ctx.params.etat) || '', concession: '', recherche: '' };
    this.construire();
    this.charger();
    this.sur = function () { self.rendre(); AMX.rafraichirSousBarre(); };
    document.addEventListener('amx:suggestions', this.sur);
  }
  Suggestions.prototype.demonter = function () { document.removeEventListener('amx:suggestions', this.sur); };
  Suggestions.prototype.naviguer = function (ctx) { this.params = ctx.params || {}; if (this.params.nouvelle) ouvrirFormulaire(); this.rendre(); };

  Suggestions.prototype.construire = function () {
    var self = this;
    var page = h('div.page.sug-page.etroite');
    this.elSous = h('p', 'Chargement…');
    page.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Suggestions'), this.elSous]),
      h('div.actions', [
        h('button.btn.primaire#sug-nouvelle', { type: 'button', onclick: function () { ouvrirFormulaire(); } }, [AMX.svg('plus'), ' Nouvelle suggestion']),
        h('button.btn', { type: 'button', title: 'Rafraîchir', onclick: function () { self.charger(true); } }, [AMX.svg('rafraichir'), ' Rafraîchir'])
      ])
    ]));
    page.appendChild(h('p.sug-aide', { text: 'Une suggestion reste en rouge jusqu\'à ce qu\'elle soit traitée. Quand c\'est fait, elle passe au vert et vous recevez un courriel qui explique ce qui a changé.' }));
    this.elKpis = h('div.kpis');
    this.elFiltres = h('div.sug-filtres');
    this.elListe = h('div.sug-liste');
    page.appendChild(this.elKpis); page.appendChild(this.elFiltres); page.appendChild(this.elListe);
    this.conteneur.appendChild(page);
    if (this.params.nouvelle) setTimeout(function () { ouvrirFormulaire(); }, 50);
  };

  Suggestions.prototype.charger = function (force) {
    var self = this;
    AMX.suggestions.charger(force).then(function () { self.rendre(); }, function (e) {
      self.elSous.textContent = /route|absent|inconnue/i.test(e.message) ? 'Route absente — redéployez le script (Suggestion.gs).' : (e.message || 'Erreur');
    });
  };

  Suggestions.prototype.rendre = function () {
    var self = this, d = cache.rep;
    if (!d) return;
    var liste = d.suggestions || [], n = d.compte || { recue: 0, traitee: 0, refusee: 0 };
    this.elSous.textContent = d.admin ? (n.recue ? n.recue + ' à traiter · ' : 'Rien à traiter · ') + n.traitee + ' traitée' + (n.traitee > 1 ? 's' : '') + (n.refusee ? ' · ' + n.refusee + ' refusée' + (n.refusee > 1 ? 's' : '') : '') : (liste.length ? liste.length + ' suggestion' + (liste.length > 1 ? 's' : '') + ' de vous' : 'Vous n\'avez pas encore fait de suggestion.');
    // KPI = filtres par état
    AMX.vider(this.elKpis);
    var kpi = function (etat, libelle, valeur, cls) {
      return h('div.kpi' + (cls ? '.' + cls : '') + (self.filtres.etat === etat ? '.actif' : ''), { role: 'button', tabindex: '0', onclick: function () { self.filtres.etat = self.filtres.etat === etat ? '' : etat; self.rendre(); } }, [h('div.valeur', { text: String(valeur) }), h('div.libelle', { text: libelle })]);
    };
    this.elKpis.appendChild(kpi('recue', 'À traiter (rouge)', n.recue, n.recue ? 'alerte' : ''));
    this.elKpis.appendChild(kpi('traitee', 'Traitées (vert)', n.traitee, ''));
    this.elKpis.appendChild(kpi('refusee', 'Refusées', n.refusee, ''));
    // Filtres (admin : concession, recherche ; « Copier pour Claude »)
    AMX.vider(this.elFiltres);
    if (d.admin) {
      var codes = {}; liste.forEach(function (s) { if (s.concession) codes[s.concession] = true; });
      var sel = h('select.saisie#sug-concession', [h('option', { value: '', text: 'Toutes les concessions' })].concat(Object.keys(codes).sort().map(function (c) { return h('option', { value: c, text: AMX.COMPAGNIES_TOUTES[c] || c, selected: self.filtres.concession === c ? 'selected' : undefined }); })));
      sel.addEventListener('change', function () { self.filtres.concession = sel.value; self.rendre(); });
      var rech = h('input.saisie#sug-recherche', { type: 'search', placeholder: 'Rechercher (titre, auteur, page…)', value: this.filtres.recherche });
      rech.addEventListener('input', function () { self.filtres.recherche = rech.value; self.rendreListe(); });
      this.elFiltres.appendChild(sel); this.elFiltres.appendChild(rech);
      var aTraiter = liste.filter(function (s) { return s.etat === 'recue'; });
      this.elFiltres.appendChild(h('button.btn#sug-copier', { type: 'button', disabled: aTraiter.length ? undefined : 'disabled', title: 'Copie les suggestions à traiter en texte, à coller dans la conversation avec Claude', onclick: function () { AMX.copier(texteClaude(aTraiter), aTraiter.length + ' suggestion' + (aTraiter.length > 1 ? 's' : '') + ' copiée' + (aTraiter.length > 1 ? 's' : '') + ' — collez dans la conversation avec Claude'); } }, [AMX.svg('copier'), ' Copier la liste pour Claude']));
    }
    this.rendreListe();
  };

  Suggestions.prototype.rendreListe = function () {
    var self = this, d = cache.rep; if (!d) return;
    var f = this.filtres, q = (f.recherche || '').trim().toLowerCase();
    var liste = (d.suggestions || []).filter(function (s) {
      if (f.etat && s.etat !== f.etat) return false;
      if (f.concession && s.concession !== f.concession) return false;
      if (q && [s.titre, s.nom, s.pageLibelle, s.description, s.courriel].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    AMX.vider(this.elListe);
    if (!liste.length) {
      this.elListe.appendChild(h('div.carte', [h('div.sug-vide', [
        h('div', { text: f.etat || q || f.concession ? 'Aucune suggestion pour ce filtre.' : (d.admin ? 'Aucune suggestion pour l\'instant.' : 'Vous n\'avez pas encore fait de suggestion.') }),
        d.admin && !(f.etat || q || f.concession) ? null : null,
        h('button.btn.primaire', { type: 'button', style: { marginTop: '10px' }, onclick: function () { ouvrirFormulaire(); } }, [AMX.svg('plus'), ' Nouvelle suggestion'])
      ])]));
      return;
    }
    liste.forEach(function (s) { self.elListe.appendChild(carte(s, d.admin, self)); });
  };

  function puceEtat(s) {
    var cls = s.etat === 'recue' ? 'alerte' : (s.etat === 'traitee' ? 'ok' : '');
    return h('span.puce.etat' + (cls ? '.' + cls : ''), { text: ETATS[s.etat] || s.etatLibelle || s.etat });
  }
  function puceUrgence(s) {
    if (s.urgence === 'bloquant') return h('span.puce.alerte', { text: 'Bloquant' });
    if (s.urgence === 'important') return h('span.puce.attention', { text: 'Important' });
    return null;
  }
  function carte(s, admin, vue) {
    var el = h('div.sug-carte.' + s.etat, { dataset: { id: s.id } });
    el.appendChild(h('div.sug-tete', [
      h('h3', { text: s.titre }),
      puceUrgence(s), puceEtat(s)
    ]));
    var meta = [(s.nom || s.courriel) + (s.concession ? ' · ' + (AMX.COMPAGNIES_TOUTES[s.concession] || s.concession) : ''), s.pageLibelle || s.page, AMX.fmtDate(s.date)];
    if (s.etat !== 'recue' && s.traiteLe) meta.push((s.etat === 'traitee' ? 'traitée' : 'refusée') + ' le ' + AMX.fmtDate(s.traiteLe) + (s.traiteParNom ? ' par ' + s.traiteParNom : '') + (s.version ? ' (' + s.version + ')' : ''));
    el.appendChild(h('div.sug-meta', { text: meta.join(' · ') }));
    el.appendChild(h('div.sug-corps', [
      h('div', [h('div.l', 'Ce qui manque / devrait changer'), h('div.t', { text: s.description })]),
      h('div', [h('div.l', 'Pourquoi'), h('div.t', { text: s.pourquoi })]),
      s.exemple ? h('div', [h('div.l', 'Exemple concret'), h('div.t', { text: s.exemple })]) : null
    ]));
    if (s.etat !== 'recue' && s.reponse) el.appendChild(h('div.sug-reponse', [h('span.l', { text: s.etat === 'traitee' ? 'Ce qui a changé' : 'Pourquoi ce n\'est pas retenu' }), h('span', { text: s.reponse })]));
    if (admin) {
      var actions = h('div.sug-actions');
      if (s.etat === 'recue') {
        actions.appendChild(h('button.btn.primaire.petit', { type: 'button', onclick: function () { modaleTraiter(s, 'traitee', vue); } }, [AMX.svg('ok'), ' Marquer traitée (vert)']));
        actions.appendChild(h('button.btn.petit', { type: 'button', onclick: function () { modaleTraiter(s, 'refusee', vue); } }, 'Refuser…'));
      } else {
        actions.appendChild(h('button.btn.petit.fantome', { type: 'button', onclick: function () { traiter(s.id, 'recue', '', '', vue); } }, 'Rouvrir (rouge)'));
      }
      el.appendChild(actions);
    }
    return el;
  }

  function texteClaude(liste) {
    return 'Suggestions à traiter (' + liste.length + ') — ScanAutomax, ' + AMX.fmtDate(new Date().toISOString()) + '\n\n' + liste.map(function (s, i) {
      return (i + 1) + '. [' + s.id + '] ' + s.titre + ' — ' + (s.nom || s.courriel) + (s.concession ? ' (' + s.concession + ')' : '') + ' · page : ' + (s.pageLibelle || s.page) + ' · urgence : ' + (s.urgenceLibelle || s.urgence) + ' · ' + AMX.fmtDate(s.date) + '\n' +
        '   Ce qui manque : ' + s.description + '\n' +
        '   Pourquoi : ' + s.pourquoi + (s.exemple ? '\n   Exemple : ' + s.exemple : '');
    }).join('\n\n');
  }

  function traiter(id, etat, reponse, version, vue) {
    return AMX.post({ action: 'suggestionTraiter', id: id, etat: etat, reponse: reponse, version: version }).then(function (r) {
      if (!r || !r.ok) { AMX.toast((r && r.erreur) || 'Refusé', 'erreur'); return false; }
      AMX.suggestions.poser(r.suggestion);
      AMX.toast(r.message || 'Fait', 'ok');
      return true;
    }, function (e) { AMX.toast(e.message || 'Erreur', 'erreur'); return false; });
  }

  function modaleTraiter(s, etat, vue) {
    var traitee = etat === 'traitee';
    var ta = h('textarea.saisie#sug-reponse', { rows: '6', placeholder: traitee ? 'Ce qui a changé, en clair, pour ' + (s.nom || 'l\'employé') + ' (ex. : « Dans Résultat, un filtre Marque / Modèle / Année au-dessus du tableau. »)' : 'Pourquoi ce n\'est pas retenu (envoyé à l\'employé).' });
    var ver = h('input.saisie#sug-version', { type: 'text', placeholder: 'ex. v=58', style: { maxWidth: '140px' } });
    var corps = h('div.sug-form', [
      h('p.sug-aide', { text: traitee ? 'La suggestion passe au vert et ' + (s.nom || 'l\'employé') + ' reçoit un courriel « Fait : ' + s.titre + ' » avec ce texte.' : (s.nom || 'L\'employé') + ' reçoit un courriel « Suggestion non retenue » avec cette raison.' }),
      h('div.champ', [h('label', { 'for': 'sug-reponse', text: traitee ? 'Ce qui a changé' : 'Raison' }), ta]),
      traitee ? h('div.champ', [h('label', { 'for': 'sug-version', text: 'Version du site / de l\'app (facultatif)' }), ver]) : null
    ]);
    AMX.modale({
      titre: traitee ? 'Marquer traitée : ' + s.titre : 'Refuser : ' + s.titre,
      corps: corps,
      boutons: [
        { texte: 'Annuler' },
        { texte: traitee ? 'Traitée — envoyer le courriel' : 'Refuser — envoyer le courriel', classe: traitee ? 'primaire' : 'danger', action: function () {
          var txt = ta.value.trim();
          if (txt.length < 10) { AMX.toast(traitee ? 'Expliquez ce qui a changé (au moins 10 caractères).' : 'Donnez la raison (au moins 10 caractères).', 'erreur'); ta.focus(); return false; }
          return traiter(s.id, etat, txt, traitee ? ver.value.trim() : '', vue);
        } }
      ]
    });
  }

  function ouvrirFormulaire() {
    var pages = (cache.rep && cache.rep.pages && cache.rep.pages.length) ? cache.rep.pages : PAGES_DEFAUT;
    var secCourante = AMX.courante && AMX.courante.section ? AMX.courante.section.id : '';
    var selPage = h('select.saisie#sug-page', pages.map(function (p) { return h('option', { value: p.id, text: p.libelle, selected: p.id === secCourante ? 'selected' : undefined }); }));
    var titre = h('input.saisie#sug-titre', { type: 'text', maxlength: '120', placeholder: 'En quelques mots (ex. : Filtre par modèle dans Résultat)' });
    var desc = h('textarea.saisie#sug-description', { rows: '4', placeholder: 'Ce qui manque ou ce qui devrait changer, le plus précisément possible.' });
    var pourquoi = h('textarea.saisie#sug-pourquoi', { rows: '2', placeholder: 'À quoi ça sert, combien de fois par semaine, ce que ça éviterait.' });
    var exemple = h('textarea.saisie#sug-exemple', { rows: '2', placeholder: 'Un cas vécu : quel véhicule, quelle page, qu\'est-ce que vous vouliez faire.' });
    var selUrg = h('select.saisie#sug-urgence', URGENCES.map(function (u) { return h('option', { value: u[0], text: u[1] }); }));
    var corps = h('div.sug-form', [
      h('p.sug-aide', { text: 'Une demande claire se traite vite : dites quoi, pourquoi, et donnez un exemple. Elle reste en rouge jusqu\'à ce qu\'elle soit traitée ; vous recevrez un courriel avec ce qui a changé.' }),
      h('div.deux', [
        h('div.champ', [h('label', { 'for': 'sug-page', text: 'Page concernée' }), selPage]),
        h('div.champ', [h('label', { 'for': 'sug-urgence', text: 'Urgence' }), selUrg])
      ]),
      h('div.champ', [h('label', { 'for': 'sug-titre', text: 'Titre' }), titre]),
      h('div.champ', [h('label', { 'for': 'sug-description', text: 'Ce qui manque / devrait changer' }), desc]),
      h('div.champ', [h('label', { 'for': 'sug-pourquoi', text: 'Pourquoi' }), pourquoi]),
      h('div.champ', [h('label', { 'for': 'sug-exemple', text: 'Exemple concret (facultatif)' }), exemple])
    ]);
    return AMX.modale({
      titre: 'Nouvelle suggestion',
      corps: corps,
      boutons: [
        { texte: 'Annuler' },
        { texte: 'Envoyer', classe: 'primaire', action: function () {
          var t = titre.value.trim(), d = desc.value.trim(), p = pourquoi.value.trim();
          if (t.length < 5) { AMX.toast('Donnez un titre (au moins 5 caractères).', 'erreur'); titre.focus(); return false; }
          if (d.length < 20) { AMX.toast('Décrivez ce qui manque (au moins 20 caractères).', 'erreur'); desc.focus(); return false; }
          if (p.length < 10) { AMX.toast('Dites pourquoi (au moins 10 caractères).', 'erreur'); pourquoi.focus(); return false; }
          return AMX.post({ action: 'suggestionCreer', page: selPage.value, titre: t, description: d, pourquoi: p, exemple: exemple.value.trim(), urgence: selUrg.value }).then(function (r) {
            if (!r || !r.ok) { AMX.toast((r && r.erreur) || 'Refusé', 'erreur'); return false; }
            AMX.suggestions.poser(r.suggestion);
            AMX.toast(r.message || 'Suggestion envoyée', 'ok', 6000);
            if (!(AMX.courante && AMX.courante.section && AMX.courante.section.id === 'suggestions')) AMX.aller('suggestions', 'liste');
            return true;
          }, function (e) { AMX.toast(e.message || 'Erreur', 'erreur'); return false; });
        } }
      ]
    });
  }
})();
