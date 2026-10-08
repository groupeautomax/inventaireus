/* =========================================================================
   Section « Avis » : suivi des avis Google du groupe (8 octobre 2026).

   Trois onglets :
     Aperçu   — note et nombre d'avis par concession (relevé quotidien d'Avis.gs),
                nouveaux avis 7 / 30 jours, négatifs, à traiter, rang face aux
                concurrents (Concurrence.gs), et les statistiques PAR PERSONNE
                (demande de Maxime) : qui envoie des demandes d'avis, qui reçoit
                quelles notes (sondages et avis Google attribués).
     Avis     — la liste des avis, filtres, état interne (nouveau → réglé),
                assignation à un compte, attribution aux employés concernés.
     Sondages — les demandes d'avis envoyées aux clients (texto / courriel) et
                le bouton « Demander un avis » (livraison, fin de service).

   Règles (Maxime, 7 oct.) : le sondage part à TOUS les clients, le lien Google
   est montré à TOUS (jamais de filtrage selon la note) ; une note ≤ 3 alerte
   les directeurs (courriel + texto) pour rappeler le client dans l'heure.

   Routes serveur (AvisSuivi.gs) :
     GET  ?avis=1     POST avisEtat, avisAssigner, avisEmployes, sondageCreer
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, esc = AMX.esc, I = AMX.icones;

  I.avis = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/></svg>';
  I.etoile = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/></svg>';

  var ETATS = {
    nouveau:    { libelle: 'Nouveau',      couleur: 'bleu' },
    a_repondre: { libelle: 'À répondre',   couleur: 'rouge' },
    assigne:    { libelle: 'Assigné',      couleur: 'ambre' },
    brouillon:  { libelle: 'Brouillon',    couleur: 'violet' },
    repondu:    { libelle: 'Répondu',      couleur: 'vert' },
    regle:      { libelle: 'Réglé',        couleur: 'gris' }
  };
  var A_TRAITER = { nouveau: 1, a_repondre: 1, assigne: 1, brouillon: 1 };
  var SEUIL = 3;

  function injecterCss() {
    if (document.getElementById('css-avis')) return;
    var s = document.createElement('style');
    s.id = 'css-avis';
    s.textContent = [
      '.avis-page .carte { margin-bottom: 14px; overflow: hidden; }',
      '.avis-page .carte-entete h2 { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }',
      '.avis-page .carte-entete h2 .sous { font-weight: 400; font-size: 12px; color: var(--encre-3); }',
      '.avis-page .defile { overflow-x: auto; }',
      '.avis-page .tableau { border: none; border-radius: 0; box-shadow: none; }',
      '.avis-etoiles { display: inline-flex; gap: 1px; color: #F5B301; vertical-align: -2px; }',
      '.avis-etoiles svg { width: 14px; height: 14px; }',
      '.avis-etoiles svg.eteinte { color: var(--ligne-forte); }',
      '.avis-etoiles.grand svg { width: 18px; height: 18px; }',
      '.avis-note { font-weight: 700; font-variant-numeric: tabular-nums; }',
      '.avis-pos { color: var(--vert); } .avis-neg { color: var(--rouge); }',
      '.avis-liste { display: flex; flex-direction: column; gap: 10px; }',
      '.avis-carte { background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); padding: 14px 16px; display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 14px; }',
      '.avis-carte.negatif { border-left: 3px solid var(--rouge); }',
      '.avis-carte .haut { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }',
      '.avis-carte .auteur { font-weight: 600; font-size: 13.5px; }',
      '.avis-carte .meta { color: var(--encre-3); font-size: 12px; }',
      '.avis-carte .texte { font-size: 13.5px; line-height: 1.5; color: var(--encre-2); white-space: pre-wrap; }',
      '.avis-carte .texte.vide-texte { color: var(--encre-4); font-style: italic; }',
      '.avis-carte .reponse { margin-top: 10px; padding: 10px 12px; background: var(--carte-2); border-radius: var(--rayon-s); font-size: 12.5px; line-height: 1.5; border-left: 3px solid var(--vert); }',
      '.avis-carte .reponse .l { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin-bottom: 4px; }',
      '.avis-carte .cote { display: flex; flex-direction: column; gap: 8px; border-left: 1px solid var(--ligne); padding-left: 14px; }',
      '.avis-carte .cote .champ > label { font-size: 10.5px; }',
      '.avis-carte .cote select { height: 30px; font-size: 12.5px; }',
      '.avis-employes { display: flex; gap: 4px; flex-wrap: wrap; min-height: 22px; }',
      '.avis-filtres { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }',
      '.avis-filtres input.saisie { width: 220px; height: 32px; }',
      '.avis-filtres select.saisie { width: auto; height: 32px; }',
      '.avis-fiches { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }',
      '.avis-fiche { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 10px 12px; background: var(--carte-2); }',
      '.avis-fiche .n { font-size: 12.5px; font-weight: 600; margin-bottom: 4px; }',
      '.avis-fiche .v { display: flex; gap: 8px; align-items: baseline; font-size: 12px; color: var(--encre-3); flex-wrap: wrap; }',
      '.avis-fiche .v b { color: var(--encre); font-size: 15px; }',
      '.avis-moi { background: var(--vert-clair) !important; }',
      '.avis-ligne-neg td:first-child { box-shadow: inset 3px 0 0 var(--rouge); }',
      '.avis-repere { font-size: 11px; color: var(--encre-4); }',
      '@media (max-width: 860px) { .avis-carte { grid-template-columns: 1fr; } .avis-carte .cote { border-left: none; padding-left: 0; border-top: 1px solid var(--ligne); padding-top: 10px; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ----------------------------- Cache (AMX.avis) ---------------------------- */
  var cache = { reponse: null, quand: 0 };
  var promesse = null;
  AMX.avis = {
    enCache: function () { return cache.reponse; },
    charger: function (force) {
      if (!force && cache.reponse && Date.now() - cache.quand < 60000) return Promise.resolve(cache.reponse);
      if (promesse) return promesse;
      promesse = AMX.get({ avis: 1 }).then(function (d) {
        AMX.verifier(d, 'Suivi des avis indisponible');
        cache.reponse = d; cache.quand = Date.now(); promesse = null;
        document.dispatchEvent(new CustomEvent('amx:avis'));
        return d;
      }, function (e) { promesse = null; throw e; });
      return promesse;
    },
    invalider: function () { cache.quand = 0; }
  };

  function etoiles(n, grand) {
    var z = h('span.avis-etoiles' + (grand ? '.grand' : ''), { title: n + ' / 5' });
    for (var i = 1; i <= 5; i++) { var s = AMX.svg('etoile'); if (i > n) s.classList.add('eteinte'); z.appendChild(s); }
    return z;
  }
  function nomDe(courriel) {
    var d = cache.reponse; var c = String(courriel || '').toLowerCase();
    if (!c) return '';
    if (d && d.utilisateurs) for (var i = 0; i < d.utilisateurs.length; i++) if (d.utilisateurs[i].courriel === c) return d.utilisateurs[i].nom;
    return c.split('@')[0].replace(/[._-]/g, ' ');
  }
  function nomConcession(code) { return AMX.COMPAGNIES_TOUTES[code] || code || '—'; }
  function fmtTel(t) { var d = String(t || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + '-' + d.slice(6) : String(t || ''); }
  function fmtNote(n) { return n === null || n === undefined || isNaN(n) ? '—' : Number(n).toFixed(n >= 10 ? 0 : 2).replace('.', ','); }
  function fmtNote1(n) { return n === null || n === undefined || isNaN(n) ? '—' : Number(n).toFixed(1).replace('.', ','); }
  function signe(n) { if (n === null || n === undefined || isNaN(n)) return ''; return (n > 0 ? '+' : '') + String(Math.round(n * 100) / 100).replace('.', ','); }
  function badgeEtat(etat) { var e = ETATS[etat] || { libelle: etat, couleur: 'gris' }; return h('span.badge.' + e.couleur, { text: e.libelle }); }
  function estNegatif(a) { return a.etoiles > 0 && a.etoiles <= SEUIL; }

  /* --------------------------------- Section -------------------------------- */
  AMX.section('avis', {
    titre: 'Avis', icone: 'avis', ordre: 45,
    onglets: [
      { id: 'apercu', titre: 'Aperçu' },
      { id: 'avis', titre: 'Avis', compteur: function () { var d = cache.reponse; return d ? d.avis.filter(function (a) { return A_TRAITER[a.etat] && estNegatif(a); }).length || '' : ''; } },
      { id: 'sondages', titre: 'Sondages', compteur: function () { var d = cache.reponse; return d ? d.sondages.filter(function (s) { return s.note !== null && s.note <= SEUIL && AMX.joursDepuis(s.reponduLe) <= 7; }).length || '' : ''; } }
    ],
    monter: function (conteneur, ctx) { return new Avis(conteneur, ctx); }
  });

  function Avis(conteneur, ctx) {
    var self = this;
    injecterCss();
    this.conteneur = conteneur;
    this.onglet = ctx.onglet || 'apercu';
    this.params = ctx.params || {};
    this.filtres = { recherche: '', concession: AMX.maConcession(), etoiles: '', etat: '' };
    this.construire();
    this.charger();
    this.surAvis = function () { self.rendre(); AMX.rafraichirSousBarre(); };
    document.addEventListener('amx:avis', this.surAvis);
    this.minuterie = setInterval(function () { if (!document.hidden) self.charger(true); }, 300000);
  }
  Avis.prototype.demonter = function () { clearInterval(this.minuterie); document.removeEventListener('amx:avis', this.surAvis); };
  Avis.prototype.naviguer = function (ctx) { this.onglet = ctx.onglet || 'apercu'; this.params = ctx.params || {}; this.rendre(); };

  Avis.prototype.construire = function () {
    var self = this;
    var page = h('div.page.avis-page');
    this.elEntete = h('div.entete-page', [
      h('div', [h('h1', 'Avis Google'), this.elSous = h('p', 'Chargement…')]),
      h('div.actions', [
        h('button.btn.primaire', { type: 'button', onclick: function () { self.demanderAvis(); } }, [AMX.svg('plus'), ' Demander un avis']),
        h('button.btn', { type: 'button', title: 'Rafraîchir', onclick: function () { self.charger(true); } }, [AMX.svg('rafraichir'), ' Rafraîchir'])
      ])
    ]);
    this.elCorps = h('div');
    page.appendChild(this.elEntete); page.appendChild(this.elCorps);
    this.conteneur.appendChild(page);
  };
  Avis.prototype.charger = function (force) {
    var self = this;
    if (!cache.reponse) { AMX.vider(this.elCorps); this.elCorps.appendChild(h('div.chargement', [h('span.spin'), 'Chargement des avis…'])); }
    AMX.avis.charger(force).then(function () { self.rendre(); AMX.rafraichirSousBarre(); }, function (e) {
      AMX.vider(self.elCorps);
      self.elCorps.appendChild(h('div.alerte-bloc.erreur', [AMX.svg('alerte'), h('div', { text: AMX.erreurTexte(e) })]));
    });
  };

  Avis.prototype.rendre = function () {
    var d = cache.reponse; if (!d) return;
    var g = d.stats.groupe;
    this.elSous.textContent = (g.note !== null ? 'Note du groupe ' + fmtNote(g.note) + ' / 5 sur ' + AMX.fmtNombre(g.nombre) + ' avis' : 'Aucune mesure encore') +
      (g.nouveaux30 ? ' · ' + g.nouveaux30 + ' nouveaux en 30 jours' : '') + (g.negatifs30 ? ' · ' + g.negatifs30 + ' négatif' + (g.negatifs30 > 1 ? 's' : '') : '');
    AMX.vider(this.elCorps);
    if (d.api && !d.api.approuve) {
      this.elCorps.appendChild(h('div.alerte-bloc.info', { style: { marginBottom: '14px' } }, [AMX.svg('info'),
        h('div', [h('b', 'En attente de l\'approbation de Google (API Business Profile). '),
          'D\'ici là, les notes et le nombre d\'avis sont exacts (relevé quotidien), mais la liste ne montre que les 5 avis « les plus pertinents » de chaque fiche. Dès l\'approbation : tous les avis, les nouveaux en temps réel et la réponse directement d\'ici.'])]));
    }
    if (this.onglet === 'avis') this.rendreAvis(d);
    else if (this.onglet === 'sondages') this.rendreSondages(d);
    else this.rendreApercu(d);
  };

  /* --------------------------------- Aperçu --------------------------------- */
  Avis.prototype.rendreApercu = function (d) {
    var self = this, g = d.stats.groupe, ss = d.stats.sondages, rep = d.repere || {};
    var kpi = function (valeur, libelle, sous, classe, action) {
      return h('button.kpi' + (classe ? '.' + classe : '') + (action ? '' : '.neutre'), { type: 'button', onclick: action || null }, [
        h('div.valeur', { text: valeur }), h('div.libelle', { text: libelle }), sous ? h('div.sous', { text: sous }) : null]);
    };
    this.elCorps.appendChild(h('div.kpis', [
      kpi(fmtNote(g.note), 'Note du groupe', rep.note ? 'marché ' + fmtNote(rep.note) : ''),
      kpi(AMX.fmtNombre(g.nombre), 'Avis Google', d.fiches.length + ' fiches'),
      kpi(g.nouveaux30 ? '+' + g.nouveaux30 : '0', 'Nouveaux 30 j', g.nouveaux7 ? '+' + g.nouveaux7 + ' cette semaine' : 'aucun cette semaine'),
      kpi(String(g.negatifs30), 'Négatifs 30 j', '≤ ' + SEUIL + ' étoiles', g.negatifs30 ? 'alerte' : ''),
      kpi(String(g.aTraiter), 'À traiter', 'avis sans suite', g.aTraiter ? 'attention' : '', function () { AMX.aller('avis', 'avis'); }),
      kpi(String(ss.envoyes30), 'Sondages 30 j', ss.enAttente ? ss.enAttente + ' en attente d\'envoi' : (ss.envoyes + ' au total'), '', function () { AMX.aller('avis', 'sondages'); }),
      kpi(ss.note !== null ? fmtNote1(ss.note) : '—', 'Note sondages', ss.tauxReponse !== null ? ss.tauxReponse + ' % de réponses' : 'aucune réponse encore', ss.negatifs ? 'attention' : ''),
      kpi(String(ss.clicsGoogle), 'Clics vers Google', 'depuis le sondage')
    ]));

    // Par concession
    var lignes = d.stats.parConcession;
    var tbl = h('table.tableau', [
      h('thead', [h('tr', [h('th', 'Concession'), h('th.num', 'Note'), h('th.num', 'Avis'), h('th.num', '30 j'), h('th.num', 'Var. note'), h('th.num', 'Négatifs 30 j'), h('th.num', 'À traiter'), h('th', 'Face aux concurrents'), h('th.num', 'Réponses')])]),
      h('tbody', lignes.map(function (c) {
        return h('tr.cliquable', { onclick: function () { self.filtres.concession = c.code; AMX.aller('avis', 'avis'); } }, [
          h('td', [h('div', { style: { fontWeight: 600 } }, nomConcession(c.code)), h('div.mini', c.fiches.map(function (f) { return f.nom; }).join(' · '))]),
          h('td.num', [h('span.avis-note', fmtNote(c.note)), ' ', c.note !== null ? etoiles(Math.round(c.note)) : null]),
          h('td.num', AMX.fmtNombre(c.nombre)),
          h('td.num', c.nouveaux30 ? h('span.avis-pos', '+' + c.nouveaux30) : '0'),
          h('td.num', c.varNote30 === null ? h('span.doux', '—') : h('span' + (c.varNote30 > 0 ? '.avis-pos' : c.varNote30 < 0 ? '.avis-neg' : ''), signe(c.varNote30) || '0')),
          h('td.num', c.negatifs30 ? h('span.badge.rouge', String(c.negatifs30)) : h('span.doux', '0')),
          h('td.num', c.aTraiter ? h('span.badge.ambre', String(c.aTraiter)) : h('span.doux', '0')),
          h('td', c.concurrence.length ? c.concurrence.map(function (x) {
            var top = x.rang === 1;
            return h('div.mini', [h('span' + (top ? '.avis-pos' : ''), { style: { fontWeight: 600 } }, (top ? '1er' : x.rang + 'e') + ' / ' + x.total), ' ', x.marque ? x.marque : x.fiche, x.moyenneMarche ? h('span.avis-repere', ' · marché ' + fmtNote(x.moyenneMarche)) : null]);
          }) : h('span.doux', '—')),
          h('td.num', c.tauxReponse === null ? h('span.doux', '—') : [c.tauxReponse + ' %', c.delaiMedian !== null ? h('div.mini', 'médiane ' + c.delaiMedian + ' j') : null])
        ]);
      }))
    ]);
    this.elCorps.appendChild(h('div.carte', [
      h('div.carte-entete', [h('h2', ['Par concession', h('span.sous', 'relevé quotidien des fiches Google')])]),
      h('div.defile', [tbl])
    ]));

    // Par fiche (détail)
    var fiches = [];
    lignes.forEach(function (c) { c.fiches.forEach(function (f) { fiches.push(Object.assign({ code: c.code }, f)); }); });
    this.elCorps.appendChild(h('div.carte', [
      h('div.carte-entete', [h('h2', ['Par fiche Google', h('span.sous', fiches.length + ' fiches')])]),
      h('div.carte-corps', [h('div.avis-fiches', fiches.map(function (f) {
        return h('div.avis-fiche', [
          h('div.n', f.nom),
          h('div.v', [h('b', fmtNote(f.note)), f.note !== null ? etoiles(Math.round(f.note)) : null, h('span', f.nombre !== null ? AMX.fmtNombre(f.nombre) + ' avis' : 'pas encore mesurée'),
            f.nouveaux30 ? h('span.avis-pos', '+' + f.nouveaux30 + ' / 30 j') : null, f.varNote30 ? h('span' + (f.varNote30 > 0 ? '.avis-pos' : '.avis-neg'), signe(f.varNote30)) : null])
        ]);
      }))])
    ]));

    // Par personne
    var personnes = d.stats.personnes || [];
    var moi = AMX.session.courriel;
    var admin = AMX.estAdmin();
    var visibles = admin ? personnes.filter(function (p) { return p.demandesEnvoyees || p.avisAttribues || p.reponduesSondage || p.avisRepondus || p.role === 'vendeur' || p.role === 'utilisateur'; }) : personnes.filter(function (p) { return p.courriel === moi; });
    if (!admin && !visibles.length) visibles = [{ courriel: moi, nom: AMX.session.nom || moi, concession: AMX.maConcession(), demandesEnvoyees: 0, demandes30: 0, reponduesSondage: 0, noteSondage: null, negatifsSondage: 0, clicsGoogle: 0, avisAttribues: 0, noteAvis: null, avis5: 0, avisNegatifs: 0, avisRepondus: 0 }];
    var tblP = h('table.tableau', [
      h('thead', [h('tr', [h('th', 'Personne'), h('th', 'Concession'), h('th.num', { title: 'Demandes d\'avis envoyées aux clients (30 j / total)' }, 'Demandes envoyées'), h('th.num', { title: 'Sondages répondus par les clients de cette personne' }, 'Notes reçues'), h('th.num', 'Note moy.'), h('th.num', 'Négatifs'), h('th.num', 'Clics Google'), h('th.num', { title: 'Avis Google attribués à cette personne' }, 'Avis attribués'), h('th.num', 'Note avis'), h('th.num', '5 ★'), h('th.num', { title: 'Avis dont cette personne avait la charge et qui ont reçu une réponse' }, 'Réponses')])]),
      h('tbody', visibles.length ? visibles.map(function (p) {
        return h('tr' + (p.courriel === moi ? '.avis-moi' : ''), [
          h('td', [h('div', { style: { fontWeight: 600 } }, p.nom), h('div.mini', p.courriel)]),
          h('td', p.concession === '*' ? 'Groupe' : nomConcession(p.concession)),
          h('td.num', [h('b', String(p.demandes30)), h('span.doux', ' / ' + p.demandesEnvoyees)]),
          h('td.num', String(p.reponduesSondage)),
          h('td.num', p.noteSondage === null ? h('span.doux', '—') : [h('span.avis-note' + (p.noteSondage <= SEUIL ? '.avis-neg' : p.noteSondage >= 4.5 ? '.avis-pos' : ''), fmtNote1(p.noteSondage)), ' ', etoiles(Math.round(p.noteSondage))]),
          h('td.num', p.negatifsSondage ? h('span.badge.rouge', String(p.negatifsSondage)) : h('span.doux', '0')),
          h('td.num', String(p.clicsGoogle)),
          h('td.num', String(p.avisAttribues)),
          h('td.num', p.noteAvis === null ? h('span.doux', '—') : h('span.avis-note', fmtNote1(p.noteAvis))),
          h('td.num', p.avis5 ? h('span.avis-pos', String(p.avis5)) : h('span.doux', '0')),
          h('td.num', String(p.avisRepondus))
        ]);
      }) : [h('tr', [h('td', { colspan: 11 }, h('span.doux', 'Personne n\'a encore envoyé de demande ni reçu de note.'))])])
    ]);
    this.elCorps.appendChild(h('div.carte', [
      h('div.carte-entete', [h('h2', ['Par personne', h('span.sous', admin ? 'qui envoie des demandes d\'avis, qui reçoit quelles notes' : 'vos demandes et vos notes')]),
        h('span.doux.petit', 'Les avis Google sont attribués à la main dans l\'onglet Avis (bouton « Employés »).')]),
      h('div.defile', [tblP])
    ]));
  };

  /* ---------------------------------- Avis ---------------------------------- */
  Avis.prototype.rendreAvis = function (d) {
    var self = this, f = this.filtres;
    var liste = d.avis.filter(function (a) {
      if (f.concession && a.concession !== f.concession) return false;
      if (f.etoiles === 'neg' && !estNegatif(a)) return false;
      if (f.etoiles && f.etoiles !== 'neg' && a.etoiles !== Number(f.etoiles)) return false;
      if (f.etat === 'traiter' && !A_TRAITER[a.etat]) return false;
      if (f.etat && f.etat !== 'traiter' && a.etat !== f.etat) return false;
      if (f.recherche) { var q = f.recherche.toLowerCase(); if ((a.auteur + ' ' + a.texte + ' ' + a.fiche + ' ' + a.reponse).toLowerCase().indexOf(q) < 0) return false; }
      return true;
    });
    var concessions = Object.keys(AMX.COMPAGNIES);
    var filtres = h('div.avis-filtres', [
      h('input.saisie', { type: 'search', placeholder: 'Rechercher un avis…', value: f.recherche, oninput: AMX.debounce(function (e) { f.recherche = e.target.value.trim(); self.rendre(); }, 200) }),
      concessions.length > 1 ? h('select.saisie', { onchange: function (e) { f.concession = e.target.value; self.rendre(); } }, [h('option', { value: '', text: 'Toutes les concessions', selected: !f.concession })].concat(concessions.map(function (c) { return h('option', { value: c, text: AMX.COMPAGNIES[c], selected: f.concession === c }); }))) : null,
      h('select.saisie', { onchange: function (e) { f.etoiles = e.target.value; self.rendre(); } }, [
        h('option', { value: '', text: 'Toutes les notes', selected: !f.etoiles }), h('option', { value: 'neg', text: 'Négatifs (≤ ' + SEUIL + ' ★)', selected: f.etoiles === 'neg' }),
        h('option', { value: '5', text: '5 ★', selected: f.etoiles === '5' }), h('option', { value: '4', text: '4 ★', selected: f.etoiles === '4' }), h('option', { value: '3', text: '3 ★', selected: f.etoiles === '3' }), h('option', { value: '2', text: '2 ★', selected: f.etoiles === '2' }), h('option', { value: '1', text: '1 ★', selected: f.etoiles === '1' })]),
      h('select.saisie', { onchange: function (e) { f.etat = e.target.value; self.rendre(); } }, [h('option', { value: '', text: 'Tous les états', selected: !f.etat }), h('option', { value: 'traiter', text: 'À traiter', selected: f.etat === 'traiter' })].concat(Object.keys(ETATS).map(function (k) { return h('option', { value: k, text: ETATS[k].libelle, selected: f.etat === k }); }))),
      h('span.doux.petit', liste.length + ' avis' + (liste.length !== d.avis.length ? ' sur ' + d.avis.length : ''))
    ]);
    this.elCorps.appendChild(filtres);
    if (!liste.length) { this.elCorps.appendChild(h('div.vide', [AMX.svg('avis'), h('h3', 'Aucun avis'), h('p', 'Rien ne correspond à ces filtres.')])); return; }
    this.elCorps.appendChild(h('div.avis-liste', liste.map(function (a) { return self.carteAvis(a, d); })));
  };

  Avis.prototype.carteAvis = function (a, d) {
    var self = this;
    var utilisateurs = d.utilisateurs.filter(function (u) { return u.concession === '*' || u.concession === a.concession; });
    var selEtat = h('select.saisie', { onchange: function (e) { self.ecrire({ action: 'avisEtat', id: a.id, etat: e.target.value }, 'État mis à jour'); } },
      Object.keys(ETATS).map(function (k) { return h('option', { value: k, text: ETATS[k].libelle, selected: a.etat === k }); }));
    var selAssign = h('select.saisie', { onchange: function (e) { self.ecrire({ action: 'avisAssigner', id: a.id, courriel: e.target.value }, e.target.value ? 'Assigné à ' + nomDe(e.target.value) : 'Assignation retirée'); } },
      [h('option', { value: '', text: '— personne —', selected: !a.assigneA })].concat(utilisateurs.map(function (u) { return h('option', { value: u.courriel, text: u.nom, selected: a.assigneA === u.courriel }); })));
    var employes = h('div.avis-employes', a.employes.length ? a.employes.map(function (c) { return h('span.puce', nomDe(c)); }) : [h('span.doux.petit', 'aucun')]);
    var date = a.creeLe ? AMX.fmtDate(a.creeLe) : '';
    var jours = AMX.joursDepuis(a.creeLe);
    return h('div.avis-carte' + (estNegatif(a) ? '.negatif' : ''), [
      h('div', [
        h('div.haut', [etoiles(a.etoiles, true), h('span.auteur', a.auteur || 'Anonyme'), badgeEtat(a.etat),
          h('span.meta', [a.fiche, date ? ' · ' + date : '', jours !== null && jours <= 30 ? ' · il y a ' + (jours === 0 ? 'moins d\'un jour' : jours + ' j') : '', a.source !== 'google' ? ' · ' + a.source : '']),
          !a.enLigne ? h('span.badge.gris', 'Disparu de Google') : null,
          a.reponseEtat && a.reponseEtat !== 'APPROVED' ? h('span.badge.ambre', a.reponseEtat === 'PENDING' ? 'Réponse en modération' : 'Réponse refusée') : null]),
        h('div.texte' + (a.texte ? '' : '.vide-texte'), a.texte || 'Note sans commentaire.'),
        a.reponse ? h('div.reponse', [h('div.l', 'Réponse de la concession' + (a.reponseLe ? ' · ' + AMX.fmtDate(a.reponseLe) : '')), a.reponse]) : null
      ]),
      h('div.cote', [
        h('div.champ', [h('label', 'État'), selEtat]),
        h('div.champ', [h('label', 'Responsable'), selAssign]),
        h('div.champ', [h('label', ['Employés concernés ', h('button.btn.fantome.petit', { type: 'button', style: { marginLeft: '4px' }, onclick: function () { self.choisirEmployes(a, utilisateurs); } }, 'Modifier')]), employes]),
        a.lien ? h('a.btn.petit', { href: a.lien, target: '_blank', rel: 'noopener' }, [AMX.svg('externe'), ' Voir sur Google']) : null
      ])
    ]);
  };

  Avis.prototype.choisirEmployes = function (a, utilisateurs) {
    var self = this;
    var choix = {}; a.employes.forEach(function (c) { choix[c] = true; });
    var corps = h('div', [
      h('p', { style: { margin: '0 0 10px', color: 'var(--encre-2)', lineHeight: '1.5' } }, 'Qui est concerné par cet avis ? Ces personnes le verront dans leurs statistiques « notes reçues ».'),
      h('div', { style: { display: 'grid', gap: '6px', maxHeight: '320px', overflow: 'auto' } }, utilisateurs.map(function (u) {
        var cb = h('input', { type: 'checkbox', checked: !!choix[u.courriel], onchange: function (e) { if (e.target.checked) choix[u.courriel] = true; else delete choix[u.courriel]; } });
        return h('label.champ.inline', { style: { cursor: 'pointer' } }, [cb, h('span', [u.nom, h('span.doux.petit', ' · ' + (u.role || '') + (u.concession && u.concession !== '*' ? ' · ' + nomConcession(u.concession) : ''))])]);
      }))
    ]);
    AMX.modale({
      titre: 'Employés concernés', corps: corps,
      boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
        return self.ecrire({ action: 'avisEmployes', id: a.id, employes: Object.keys(choix) }, 'Attribution enregistrée');
      } }]
    });
  };

  Avis.prototype.ecrire = function (corps, message) {
    var self = this;
    return AMX.post(corps).then(function (r) {
      AMX.verifier(r, 'Écriture refusée');
      if (r.avis && cache.reponse) {
        cache.reponse.avis = cache.reponse.avis.map(function (x) { return x.id === r.avis.id ? r.avis : x; });
      }
      AMX.toast(message || 'Enregistré', 'ok');
      self.charger(true);
      return true;
    }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
  };

  /* -------------------------------- Sondages -------------------------------- */
  Avis.prototype.rendreSondages = function (d) {
    var self = this, ss = d.stats.sondages;
    var kpi = function (valeur, libelle, sous, classe) { return h('button.kpi.neutre' + (classe ? '.' + classe : ''), { type: 'button' }, [h('div.valeur', { text: valeur }), h('div.libelle', { text: libelle }), sous ? h('div.sous', { text: sous }) : null]); };
    this.elCorps.appendChild(h('div.kpis', [
      kpi(String(ss.envoyes), 'Envoyés', ss.envoyes30 + ' en 30 jours'),
      kpi(ss.tauxReponse !== null ? ss.tauxReponse + ' %' : '—', 'Taux de réponse', ss.repondus + ' réponses'),
      kpi(ss.note !== null ? fmtNote1(ss.note) : '—', 'Note moyenne', 'sur 5'),
      kpi(String(ss.negatifs), 'Négatifs', '≤ ' + SEUIL + ' — directeurs prévenus', ss.negatifs ? 'alerte' : ''),
      kpi(String(ss.clicsGoogle), 'Clics vers Google', 'depuis la page merci'),
      kpi(String(ss.enAttente), 'En attente', 'envoi entre 9 h et 20 h', ss.enAttente ? 'attention' : '')
    ]));
    this.elCorps.appendChild(h('div.alerte-bloc.ok', { style: { marginBottom: '14px' } }, [AMX.svg('ok'), h('div', [
      h('b', 'Comment ça marche. '), 'À la livraison ou à la fin d\'un service, cliquez « Demander un avis » : le client reçoit un texto (ou un courriel) avec un sondage de 10 secondes. ',
      'Tous les clients reçoivent ensuite le lien pour laisser un avis Google — c\'est la règle de Google. Une note de ', String(SEUIL), ' ou moins prévient tout de suite les directeurs (courriel + texto) pour rappeler le client dans l\'heure.'])]));
    var liste = d.sondages.filter(function (s) { return !self.filtres.concession || s.concession === self.filtres.concession; });
    if (!liste.length) { this.elCorps.appendChild(h('div.vide', [AMX.svg('courriel'), h('h3', 'Aucune demande d\'avis encore'), h('p', 'Le bouton « Demander un avis » en haut à droite envoie le premier sondage.')])); return; }
    var tbl = h('table.tableau', [
      h('thead', [h('tr', [h('th', 'Date'), h('th', 'Client'), h('th', 'Concession'), h('th', 'Type'), h('th', 'Vendeur / conseiller'), h('th', 'Envoyé par'), h('th', 'Envoi'), h('th.num', 'Note'), h('th', 'Commentaire'), h('th', 'Google')])]),
      h('tbody', liste.map(function (s) {
        var etat = s.stop ? h('span.badge.gris', 'STOP') : s.reponduLe ? h('span.badge.vert', 'Répondu ' + AMX.fmtDateCourte(s.reponduLe)) : s.envoyeLe ? h('span.badge.bleu', (s.canal || 'envoyé') + (s.rappelLe ? ' + rappel' : '')) : h('span.badge.ambre', 'En attente');
        return h('tr' + (s.note !== null && s.note <= SEUIL ? '.avis-ligne-neg' : ''), [
          h('td', AMX.fmtDate(s.creeLe, true)),
          h('td', [h('div', { style: { fontWeight: 600 } }, s.clientNom || '—'), h('div.mini', [fmtTel(s.clientTel), s.clientTel && s.clientCourriel ? ' · ' : '', s.clientCourriel])]),
          h('td', nomConcession(s.concession)),
          h('td', s.type === 'service' ? 'Service' : 'Vente'),
          h('td', nomDe(s.vendeur) || '—'),
          h('td', nomDe(s.envoyePar) || '—'),
          h('td', etat),
          h('td.num', s.note === null ? h('span.doux', '—') : [h('span.avis-note' + (s.note <= SEUIL ? '.avis-neg' : s.note >= 4 ? '.avis-pos' : ''), String(s.note)), ' ', etoiles(s.note)]),
          h('td', { style: { maxWidth: '320px', whiteSpace: 'normal' } }, s.commentaire ? h('span', { style: { fontSize: '12.5px' } }, s.commentaire) : h('span.doux', '—')),
          h('td', s.lienGoogleClique ? h('span.badge.vert', 'Cliqué') : h('span.doux', '—'))
        ]);
      }))
    ]);
    this.elCorps.appendChild(h('div.carte', [h('div.carte-entete', [h('h2', ['Demandes d\'avis', h('span.sous', liste.length + ' envoi' + (liste.length > 1 ? 's' : ''))])]), h('div.defile', [tbl])]));
  };

  Avis.prototype.demanderAvis = function () {
    var self = this, d = cache.reponse || { utilisateurs: [] };
    var concessions = Object.keys(AMX.COMPAGNIES);
    var conc = this.filtres.concession || AMX.maConcession() || concessions[0] || '';
    var selConc = h('select', { onchange: function (e) { conc = e.target.value; majVendeurs(); } }, concessions.map(function (c) { return h('option', { value: c, text: AMX.COMPAGNIES[c], selected: c === conc }); }));
    var type = 'vente';
    var segType = h('div.segment.bloc', [
      h('button' + (type === 'vente' ? '.actif' : ''), { type: 'button', onclick: function (e) { type = 'vente'; segType.querySelectorAll('button').forEach(function (b) { b.classList.remove('actif'); }); e.currentTarget.classList.add('actif'); } }, 'Vente / livraison'),
      h('button', { type: 'button', onclick: function (e) { type = 'service'; segType.querySelectorAll('button').forEach(function (b) { b.classList.remove('actif'); }); e.currentTarget.classList.add('actif'); } }, 'Service')
    ]);
    var nom = h('input', { type: 'text', placeholder: 'Prénom Nom', autocomplete: 'off' });
    var tel = h('input', { type: 'tel', placeholder: '514 555-1234', autocomplete: 'off', inputmode: 'tel' });
    var courriel = h('input', { type: 'email', placeholder: 'facultatif si cellulaire', autocomplete: 'off' });
    var vin = h('input', { type: 'text', placeholder: '17 caractères (facultatif)', autocomplete: 'off', maxlength: '17', spellcheck: 'false' });
    var selVendeur = h('select');
    function majVendeurs() {
      AMX.vider(selVendeur);
      var moi = AMX.session.courriel;
      var liste = d.utilisateurs.filter(function (u) { return u.concession === '*' || u.concession === conc; });
      if (!liste.some(function (u) { return u.courriel === moi; })) liste.unshift({ courriel: moi, nom: AMX.session.nom || moi });
      liste.forEach(function (u) { selVendeur.appendChild(h('option', { value: u.courriel, text: u.nom, selected: u.courriel === moi })); });
    }
    majVendeurs();
    var corps = h('div.grille', { style: { gap: '12px' } }, [
      concessions.length > 1 ? h('div.champ', [h('label', 'Concession'), selConc]) : null,
      h('div.champ', [h('label', 'Occasion'), segType]),
      h('div.champ', [h('label', 'Client'), nom]),
      h('div.grille.c2', [h('div.champ', [h('label', 'Cellulaire (texto)'), tel]), h('div.champ', [h('label', 'Courriel'), courriel])]),
      h('div.grille.c2', [h('div.champ', [h('label', 'Vendeur / conseiller crédité'), selVendeur]), h('div.champ', [h('label', 'NIV'), vin])]),
      h('p.doux.petit', { style: { margin: 0, lineHeight: '1.5' } }, 'Le texto part tout de suite (entre 9 h et 20 h, sinon à 9 h). Un seul rappel après 3 jours sans réponse. Le client peut répondre STOP.')
    ]);
    AMX.modale({
      titre: 'Demander un avis au client', corps: corps,
      boutons: [{ texte: 'Annuler' }, { texte: 'Envoyer le sondage', classe: 'primaire', action: function () {
        if (!tel.value.trim() && !courriel.value.trim()) { AMX.toast('Il faut un cellulaire ou un courriel.', 'erreur'); tel.focus(); return false; }
        return AMX.post({ action: 'sondageCreer', concession: conc, type: type, clientNom: nom.value.trim(), clientTel: tel.value.trim(), clientCourriel: courriel.value.trim(), vendeur: selVendeur.value, vin: vin.value.trim().toUpperCase() })
          .then(function (r) {
            AMX.verifier(r, 'Envoi impossible');
            var e = r.envoi || {};
            if (e.canaux && e.canaux.length) AMX.toast('Sondage envoyé par ' + e.canaux.join(' et ') + (nom.value.trim() ? ' à ' + nom.value.trim() : ''), 'ok', 5000);
            else if (e.horsHeures) AMX.toast('Hors des heures d\'envoi : le sondage partira à 9 h.', 'ok', 6000);
            else AMX.toast('Sondage créé, mais l\'envoi a échoué (texto ou courriel). Lien : ' + r.lien, 'erreur', 9000);
            self.filtres.concession = self.filtres.concession || '';
            self.charger(true);
            if (self.onglet !== 'sondages') AMX.aller('avis', 'sondages');
            return true;
          }, function (err) { AMX.toast(AMX.erreurTexte(err), 'erreur'); return false; });
      } }]
    });
  };
})();
