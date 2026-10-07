/* Aide ScanAutomax (7 oct. 2026) — Maxime : « mettre les guides disponibles dans les profils de
   chacun des utilisateurs ; plus détaillé sur comment utiliser les fonctions ; ça doit servir de
   référence et de centre de questions qui couvre tous les sujets ; un outil de recherche à
   question pour trouver rapidement une réponse ».

   Section « Aide » (barre, après Admin) + ligne « Guide et aide » dans le menu du compte (app.js).
   Le contenu est dans assets/aide-contenu.js (AMX.AIDE_CONTENU) ; ce fichier n'est que la vue :
   - onglet Recherche : une question → les articles classés par pertinence, termes surlignés ;
     sans texte : les questions fréquentes et la liste des sujets ;
   - onglet Guide : tous les sujets, articles dépliables, « Tout ouvrir » ;
   - onglet Administrateurs (admins et propriétaire) : les sujets réservés ;
   - onglet Nouveautés : ce qui a changé, semaine par semaine.
   Les articles réservés à un rôle (directeur, admin, propriétaire) ne sont pas montrés aux autres.
   Liens profonds : #/aide/questions?q=statut, #/aide/guide?a=inv-statut (ouvre et défile),
   #/aide/guide?s=service (le sujet). AMX.aide.ouvrir(q) et AMX.aide.article(id) depuis ailleurs. */
(function () {
  'use strict';
  var h = AMX.h, esc = AMX.esc;

  AMX.icones.aide = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"/><path d="M12 17h.01"/></svg>';

  function contenu() { return AMX.AIDE_CONTENU || { version: '', sections: [], nouveautes: [], frequentes: [] }; }

  /* Rôle de la personne → ce qu'elle a le droit de lire. */
  function rang() {
    var r = AMX.session.role || '';
    if (r === 'proprietaire' || AMX.perm('gererAdmins')) return 4;
    if (r === 'admin' || AMX.perm('gererUtilisateurs')) return 3;
    if (r === 'gestionnaire' || AMX.perm('modifierMontants') || AMX.perm('voirResultats')) return 2;
    return 1;
  }
  var RANGS = { directeur: 2, admin: 3, proprietaire: 4 };
  function visible(x) { return !x.roles || rang() >= (RANGS[x.roles] || 1); }

  /* Articles visibles, à plat, avec leur sujet. */
  function articles() {
    var liste = [];
    contenu().sections.forEach(function (s) {
      if (!visible(s)) return;
      s.articles.forEach(function (a) { if (visible(a)) liste.push({ a: a, s: s }); });
    });
    return liste;
  }
  function trouver(id) { return articles().filter(function (x) { return x.a.id === id; })[0] || null; }

  /* Recherche : sans accents ni majuscules ; chaque mot de la question compte dans la question
     de l'article (×4), ses mots-clés (×3), son sujet (×2) et sa réponse (×1) ; les mots de moins
     de 3 lettres et les mots vides sont ignorés. */
  var VIDES = { les: 1, des: 1, une: 1, pour: 1, dans: 1, est: 1, que: 1, qui: 1, comment: 1, quoi: 1, mon: 1, mes: 1, sur: 1, pas: 1, avec: 1, sans: 1, par: 1, peut: 1, puis: 1, faire: 1, dois: 1, est: 1, ce: 1, se: 1, je: 1, on: 1, le: 1, la: 1, de: 1, du: 1, un: 1, et: 1, ou: 1, au: 1, aux: 1, en: 1, veut: 1, dire: 1, voir: 1, sert: 1, quel: 1, quelle: 1, quels: 1 };
  var norm = AMX.aideNorm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' '); };
  function texteDe(html) { return String(html || '').replace(/<[^>]+>/g, ' '); }
  function mots(q) { return norm(q).split(/[^a-z0-9#]+/).filter(function (m) { return m.length >= 2 && !VIDES[m]; }); }
  function racine(m) { return m.length > 5 ? m.slice(0, m.length - 1) : m; }   // « statuts » trouve « statut »
  function chercher(q) {
    var ms = mots(q);
    if (!ms.length) return [];
    var res = [];
    articles().forEach(function (x) {
      var a = x.a;
      var cq = norm(a.q), cm = norm(a.mots), cs = norm(x.s.titre), cr = norm(texteDe(a.r));
      var score = 0, trouves = 0;
      ms.forEach(function (m) {
        var r = racine(m), t = 0;
        if (cq.indexOf(r) >= 0) t += 4;
        if (cm.indexOf(r) >= 0) t += 3;
        if (cs.indexOf(r) >= 0) t += 2;
        if (cr.indexOf(r) >= 0) t += 1;
        if (t) trouves++;
        score += t;
      });
      if (!score) return;
      if (trouves === ms.length) score += 5;            // tous les mots trouvés : en tête
      res.push({ x: x, score: score });
    });
    res.sort(function (p, q2) { return q2.score - p.score; });
    return res.slice(0, 40).map(function (r) { return r.x; });
  }
  function surligner(html, q) {
    var ms = mots(q).map(racine).filter(function (m) { return m.length >= 3; });
    if (!ms.length) return html;
    // Ne surligne que le texte, pas les balises.
    return String(html).split(/(<[^>]+>)/).map(function (part) {
      if (part[0] === '<') return part;
      var out = part, i;
      for (i = 0; i < ms.length; i++) {
        var re = new RegExp('(' + ms[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split('').map(function (c) {
          return ({ a: '[aàâä]', e: '[eéèêë]', i: '[iîï]', o: '[oôö]', u: '[uùûü]', c: '[cç]' })[c] || c;
        }).join('') + ')', 'gi');
        out = out.replace(re, '\u0001$1\u0002');
      }
      return esc(out).replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');
    }).join('');
  }

  function lienSite(l) { return h('a.btn.petit.aide-lien', { href: l.u || AMX.lien(l.s, l.o, l.p), html: esc(l.t) + ' <span class="fl">→</span>' }); }

  /* Un article rendu (question, réponse, liens, sujet). */
  function rendreArticle(x, opts) {
    opts = opts || {};
    var a = x.a;
    var corps = h('div.aide-reponse', { html: opts.q ? surligner(a.r, opts.q) : a.r });
    var pied = h('div.aide-pied', [
      (a.liens || []).map(lienSite),
      h('span.aide-sujet-ref', [h('button.lien-sujet', { type: 'button', text: x.s.titre, onclick: function () { AMX.aller('aide', x.s.roles === 'admin' ? 'admin' : 'guide', { s: x.s.id }); } })]),
      h('button.btn.petit.fantome.aide-copier', { type: 'button', text: 'Copier le lien', title: 'Lien direct vers cette réponse', onclick: function (ev) {
        ev.stopPropagation();
        var url = location.href.split('#')[0] + AMX.lien('aide', 'guide', { a: a.id });
        try { navigator.clipboard.writeText(url).then(function () { AMX.toast('Lien copié'); }, function () { AMX.toast(url, 'info', 6000); }); } catch (e) { AMX.toast(url, 'info', 6000); }
      } })
    ]);
    if (opts.plat) {
      return h('article.aide-article.plat', { id: 'aide-' + a.id }, [h('h3', { html: opts.q ? surligner(a.q, opts.q) : esc(a.q) }), corps, pied]);
    }
    var det = h('details.aide-article', { id: 'aide-' + a.id }, [h('summary', { text: a.q }), corps, pied]);
    if (opts.ouvert) det.open = true;
    return det;
  }

  function VueAide(conteneur, ctx) {
    injecterCss();
    this.conteneur = conteneur;
    this.onglet = ctx.onglet || 'questions';
    this.params = ctx.params || {};
    this.el = h('div.page.etroite.aide-page');
    conteneur.appendChild(this.el);
    this.rendre();
    var self = this;
    this.surProfil = function () { self.rendre(); };
    document.addEventListener('amx:profil', this.surProfil);
  }
  VueAide.prototype.demonter = function () { document.removeEventListener('amx:profil', this.surProfil); };
  VueAide.prototype.naviguer = function (ctx) { this.onglet = ctx.onglet || 'questions'; this.params = ctx.params || {}; this.rendre(); };

  VueAide.prototype.rendre = function () {
    AMX.vider(this.el);
    var c = contenu();
    var entete = h('div.entete-page', [
      h('div', [h('h1', 'Guide et aide'), h('p', 'Toutes les fonctions du site et de l\'app ScanAutomax, expliquées. Posez une question ou parcourez les sujets. Mise à jour : ' + esc(c.version) + '.')]),
      h('div.actions', [h('a.btn', { href: AMX.lien('aide', 'nouveautes'), text: 'Nouveautés' })])
    ]);
    this.el.appendChild(entete);
    if (this.onglet === 'guide' || this.onglet === 'admin') this.rendreGuide(this.onglet === 'admin');
    else if (this.onglet === 'nouveautes') this.rendreNouveautes();
    else this.rendreRecherche();
  };

  /* --- Recherche ------------------------------------------------------- */
  VueAide.prototype.rendreRecherche = function () {
    var self = this;
    var q0 = this.params.q || '';
    var champ = h('input.aide-champ', { type: 'search', id: 'aide-recherche', placeholder: 'Posez votre question : comment changer un statut ? où mettre le km ? qui autorise au détail ?', autocomplete: 'off', value: q0 });
    var elRes = h('div.aide-resultats');
    var carte = h('div.carte.aide-carte-recherche', [h('div.carte-corps', [
      h('div.aide-barre', [h('span.loupe', { html: AMX.icones.recherche }), champ, h('button.btn.petit.fantome', { type: 'button', text: 'Effacer', onclick: function () { champ.value = ''; montrer(''); champ.focus(); } })]),
      elRes
    ])]);
    this.el.appendChild(carte);

    function montrer(q) {
      AMX.vider(elRes);
      q = String(q || '').trim();
      if (q.length < 2) { accueil(); return; }
      var res = chercher(q);
      if (!res.length) {
        elRes.appendChild(h('div.vide.aide-vide', [h('h3', 'Aucune réponse pour « ' + q + ' »'), h('p', 'Essayez un autre mot (statut, stock, km, autorisation, offre, texto…) ou parcourez le guide.'), h('a.btn', { href: AMX.lien('aide', 'guide'), text: 'Ouvrir le guide' })]));
        return;
      }
      elRes.appendChild(h('div.aide-compte', { text: res.length + (res.length > 1 ? ' réponses' : ' réponse') + ' pour « ' + q + ' »' }));
      res.forEach(function (x, i) { elRes.appendChild(rendreArticle(x, { plat: i < 3, ouvert: false, q: q })); });
    }
    function accueil() {
      var c = contenu();
      var freq = (c.frequentes || []).map(trouver).filter(Boolean);
      elRes.appendChild(h('div.aide-chips', [h('span.etiq', 'Questions fréquentes'), freq.map(function (x) {
        return h('button.chip', { type: 'button', text: x.a.q, onclick: function () { champ.value = x.a.q; montrer(x.a.q); } });
      })]));
      var sujets = c.sections.filter(visible);
      elRes.appendChild(h('div.aide-sujets', sujets.map(function (s) {
        var n = s.articles.filter(visible).length;
        return h('a.aide-sujet-carte', { href: AMX.lien('aide', s.roles === 'admin' ? 'admin' : 'guide', { s: s.id }) }, [
          h('div.t', { text: s.titre }), h('div.d', { text: s.intro }), h('div.n', { text: n + (n > 1 ? ' réponses' : ' réponse') + (s.roles ? ' · ' + (s.roles === 'admin' ? 'administrateurs' : 'directeurs') : '') })
        ]);
      })));
    }
    var minuterie = null;
    champ.addEventListener('input', function () { clearTimeout(minuterie); minuterie = setTimeout(function () { montrer(champ.value); }, 120); });
    champ.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); clearTimeout(minuterie); montrer(champ.value); } });
    montrer(q0);
    if (!q0) setTimeout(function () { try { champ.focus(); } catch (e) {} }, 60);
    self.champ = champ;
  };

  /* --- Guide ----------------------------------------------------------- */
  VueAide.prototype.rendreGuide = function (admin) {
    var self = this;
    var c = contenu();
    var sujets = c.sections.filter(function (s) { return visible(s) && (admin ? s.roles === 'admin' : s.roles !== 'admin'); });
    var cibleSujet = this.params.s || '', cibleArticle = this.params.a || '';
    if (cibleArticle) { var xa = trouver(cibleArticle); if (xa) { cibleSujet = xa.s.id; if ((xa.s.roles === 'admin') !== !!admin) { AMX.aller('aide', xa.s.roles === 'admin' ? 'admin' : 'guide', { a: cibleArticle }); return; } } }

    var rail = h('aside.rail.aide-rail', [h('div.groupe', [h('h3', 'Sujets'), sujets.map(function (s) {
      var n = s.articles.filter(visible).length;
      return h('a.aide-rail-lien' + (s.id === cibleSujet ? '.actif' : ''), { href: '#aide-sujet-' + s.id, text: s.titre, onclick: function (ev) { ev.preventDefault(); defiler('aide-sujet-' + s.id); } }, [h('span.compte', { text: ' ' + n })]);
    })]), h('div.groupe', [h('h3', 'Affichage'), h('div.aide-outils', [
      h('button.btn.petit', { type: 'button', text: 'Tout ouvrir', onclick: function () { principal.querySelectorAll('details').forEach(function (d) { d.open = true; }); } }),
      h('button.btn.petit', { type: 'button', text: 'Tout fermer', onclick: function () { principal.querySelectorAll('details').forEach(function (d) { d.open = false; }); } })
    ])])]);

    var principal = h('div.aide-principal');
    sujets.forEach(function (s) {
      var arts = s.articles.filter(visible);
      principal.appendChild(h('section.aide-sujet', { id: 'aide-sujet-' + s.id }, [
        h('div.aide-sujet-entete', [h('h2', { text: s.titre }), h('p.doux', { text: s.intro })]),
        arts.map(function (a) { return rendreArticle({ a: a, s: s }, { ouvert: a.id === cibleArticle || s.id === cibleSujet && !cibleArticle && arts.length <= 4 }); })
      ]));
    });
    this.el.appendChild(h('div.agencement.aide-agencement', [rail, principal]));

    function defiler(id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'DETAILS') el.open = true;
      var y = el.getBoundingClientRect().top + window.scrollY - 118;
      window.scrollTo({ top: y, behavior: 'smooth' });
      el.classList.add('cible'); setTimeout(function () { el.classList.remove('cible'); }, 1600);
    }
    if (cibleArticle) setTimeout(function () { defiler('aide-' + cibleArticle); }, 80);
    else if (cibleSujet) setTimeout(function () { defiler('aide-sujet-' + cibleSujet); }, 80);
  };

  /* --- Nouveautés ------------------------------------------------------ */
  VueAide.prototype.rendreNouveautes = function () {
    var c = contenu();
    var liste = h('div.aide-nouveautes', (c.nouveautes || []).map(function (n) {
      return h('article.carte', [h('div.carte-corps', [
        h('div.date', { text: n.date }), h('h2', { text: n.titre }), h('p', { text: n.texte }),
        n.liens && n.liens.length ? h('div.aide-pied', n.liens.map(lienSite)) : null
      ])]);
    }));
    if (!(c.nouveautes || []).length) liste.appendChild(h('div.vide', 'Rien de nouveau cette semaine.'));
    this.el.appendChild(h('p.doux.aide-note', 'Une entrée par semaine : ce qui a changé dans le site et dans l\'app. Le guide est mis à jour en même temps.'));
    this.el.appendChild(liste);
  };

  function injecterCss() {
    if (document.getElementById('css-aide')) return;
    var s = document.createElement('style'); s.id = 'css-aide';
    s.textContent = [
      '.aide-page .aide-carte-recherche { margin-bottom: 14px; }',
      '.aide-barre { display: flex; gap: 10px; align-items: center; }',
      '.aide-barre .loupe { color: var(--encre-3); display: inline-flex; width: 22px; height: 22px; } .aide-barre .loupe svg { width: 22px; height: 22px; }',
      '.aide-champ { flex: 1; min-width: 0; font-size: 16px; padding: 12px 14px; border: 1px solid var(--ligne-forte); border-radius: 10px; background: var(--carte); color: var(--encre); }',
      '.aide-champ:focus { border-color: var(--vert); box-shadow: 0 0 0 3px rgba(0, 136, 64, .15); outline: none; }',
      '.aide-resultats { margin-top: 16px; display: grid; gap: 10px; }',
      '.aide-compte { font-size: 12px; color: var(--encre-3); text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }',
      '.aide-chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }',
      '.aide-chips .etiq { font-size: 12px; color: var(--encre-3); text-transform: uppercase; letter-spacing: .06em; font-weight: 600; width: 100%; }',
      '.aide-chips .chip { border: 1px solid var(--ligne-forte); background: var(--carte-2); color: var(--encre-2); border-radius: 999px; padding: 6px 12px; font-size: 12.5px; cursor: pointer; }',
      '.aide-chips .chip:hover { border-color: var(--vert); color: var(--vert); }',
      '.aide-sujets { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; margin-top: 8px; }',
      '.aide-sujet-carte { display: block; border: 1px solid var(--ligne); border-radius: var(--rayon); padding: 12px 14px; background: var(--carte-2); color: inherit; }',
      '.aide-sujet-carte:hover { border-color: var(--vert); text-decoration: none; }',
      '.aide-sujet-carte .t { font-weight: 700; color: var(--encre); } .aide-sujet-carte .d { font-size: 12.5px; color: var(--encre-3); margin-top: 2px; min-height: 2.6em; } .aide-sujet-carte .n { font-size: 11.5px; color: var(--vert); margin-top: 6px; font-weight: 600; }',
      '.aide-article { border: 1px solid var(--ligne); border-radius: var(--rayon); background: var(--carte); }',
      '.aide-article summary { cursor: pointer; padding: 11px 14px; font-weight: 600; color: var(--encre); list-style: none; display: flex; gap: 10px; align-items: center; }',
      '.aide-article summary::-webkit-details-marker { display: none; }',
      '.aide-article summary::before { content: ""; width: 8px; height: 8px; border-right: 2px solid var(--vert); border-bottom: 2px solid var(--vert); transform: rotate(-45deg); flex: none; transition: transform .15s; margin-left: 2px; }',
      '.aide-article[open] summary::before { transform: rotate(45deg); }',
      '.aide-article summary:hover { color: var(--vert); }',
      '.aide-article.plat { padding: 12px 14px 10px; border-color: var(--vert-clair); background: #FBFDFC; }',
      '.aide-article.plat h3 { font-size: 15px; margin: 0 0 6px; color: var(--encre); }',
      '.aide-reponse { padding: 0 14px 6px; color: var(--encre-2); font-size: 13.5px; line-height: 1.55; max-width: 72ch; }',
      '.aide-article.plat .aide-reponse { padding-left: 0; padding-right: 0; }',
      '.aide-reponse p { margin: 0 0 8px; } .aide-reponse ol, .aide-reponse ul { margin: 0 0 8px; padding-left: 22px; } .aide-reponse li { margin-bottom: 4px; } .aide-reponse b { color: var(--encre); }',
      '.aide-reponse mark, .aide-article h3 mark, .aide-article summary mark { background: #FFF3B0; color: inherit; border-radius: 2px; padding: 0 1px; }',
      '.aide-pied { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 4px 14px 12px; }',
      '.aide-article.plat .aide-pied { padding-left: 0; padding-right: 0; padding-bottom: 2px; }',
      '.aide-pied .aide-lien { color: var(--vert); border-color: var(--vert-clair); background: var(--vert-clair); } .aide-pied .aide-lien .fl { font-family: var(--mono); }',
      '.aide-pied .aide-sujet-ref { margin-left: auto; font-size: 12px; color: var(--encre-4); }',
      '.aide-pied .lien-sujet { border: none; background: none; color: var(--encre-3); font-size: 12px; text-decoration: underline; cursor: pointer; padding: 0; }',
      '.aide-pied .aide-copier { color: var(--encre-4); border-color: transparent; background: none; }',
      '.aide-pied .aide-copier:hover { color: var(--encre-2); border-color: var(--ligne-forte); }',
      '.aide-agencement { --rail-l: 220px; }',
      '.aide-rail-lien { display: flex; justify-content: space-between; padding: 5px 0; color: var(--encre-2); font-size: 13px; border-radius: 6px; }',
      '.aide-rail-lien:hover, .aide-rail-lien.actif { color: var(--vert); text-decoration: none; }',
      '.aide-rail-lien .compte { color: var(--encre-4); font-size: 11.5px; font-variant-numeric: tabular-nums; }',
      '.aide-outils { display: flex; gap: 6px; flex-wrap: wrap; }',
      '.aide-principal { min-width: 0; display: grid; gap: 22px; }',
      '.aide-sujet { display: grid; gap: 8px; scroll-margin-top: 120px; }',
      '.aide-sujet-entete h2 { font-size: 18px; margin: 0; } .aide-sujet-entete p { margin: 2px 0 4px; }',
      '.aide-sujet.cible .aide-sujet-entete h2, .aide-article.cible summary { color: var(--vert); }',
      '.aide-article.cible { box-shadow: 0 0 0 3px rgba(0, 136, 64, .18); }',
      '.aide-nouveautes { display: grid; gap: 12px; }',
      '.aide-nouveautes .date { font-size: 11.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--vert); font-weight: 700; }',
      '.aide-nouveautes h2 { font-size: 16px; margin: 2px 0 6px; } .aide-nouveautes p { margin: 0 0 8px; color: var(--encre-2); line-height: 1.55; max-width: 80ch; }',
      '.aide-nouveautes .aide-pied { padding: 0; }',
      '.aide-note { margin: 0 0 12px; }',
      '.aide-vide { padding: 28px 16px; } .aide-vide h3 { margin-bottom: 6px; } .aide-vide p { margin: 0 0 12px; }',
      '@media (max-width: 900px) { .aide-agencement { grid-template-columns: minmax(0, 1fr); } .aide-rail { position: static; max-height: none; } .aide-rail .groupe:first-child .aide-rail-lien { display: inline-flex; gap: 4px; margin-right: 10px; } }',
      '@media print { .aide-rail, .aide-pied, .entete-page .actions { display: none !important; } .aide-article { break-inside: avoid; } details.aide-article > *:not(summary) { display: block !important; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  AMX.section('aide', {
    titre: 'Aide', icone: 'aide', ordre: 95,
    onglets: [
      { id: 'questions', titre: 'Recherche' },
      { id: 'guide', titre: 'Guide' },
      { id: 'admin', titre: 'Administrateurs', visible: function () { return rang() >= 3; } },
      { id: 'nouveautes', titre: 'Nouveautés' }
    ],
    monter: function (conteneur, ctx) { return new VueAide(conteneur, ctx); }
  });

  AMX.aide = {
    ouvrir: function (q) { AMX.aller('aide', 'questions', q ? { q: q } : null); },
    article: function (id) { var x = trouver(id); AMX.aller('aide', x && x.s.roles === 'admin' ? 'admin' : 'guide', { a: id }); },
    chercher: chercher,
    articles: articles
  };
})();
