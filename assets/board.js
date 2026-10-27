/* =========================================================================
   Vente › Board des ventes — par représentant, neuf et occasion (27 octobre 2026)

   Maxime : « il faut construire un board de vente pour le neuf et l'usagé par représentant avec les RDR, ventes, les
   moyennes ; avoir la possibilité de mettre des objectifs ». Les chiffres viennent du Livre des ventes (BoardVentes.gs,
   GET ?boardVentes=1) : rien n'est retapé. Ce qui compte pour l'objectif (réglable par concession) : les LIVRÉES par
   défaut — c'est la règle des concessions (une vente pas livrée n'est pas une unité) ; les vendues à livrer sont à part.
   Une vente partagée (« Julie / Marc » au livre) compte une demi-unité chacun.

   Par représentant : neuf, occasion, total, objectif et % (avec le repère « où il faudrait être aujourd'hui »), projection
   de fin de mois et « reste X en N jours » (jours ouvrables), vendues à livrer, RDR, front / F&I / produits F&I par
   unité (montants : directeurs seulement), mois précédent. La direction fixe les objectifs (par représentant et par mois,
   copie du mois précédent), réunit les noms tapés différemment au livre (« Mathieu » = « Mathieu Tremblay »), lie un nom
   à son compte et choisit ce qui compte. « Écran télé » : le classement en grand, sans montants, rafraîchi aux 5 minutes.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var ORDRE = ['STM', 'HAWKS', 'BMW', 'VW', 'HYUNDAI'];
  var TYPES = [['total', 'Total'], ['neuf', 'Neuf'], ['usage', 'Occasion']];
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez une nouvelle version (BoardVentes.gs).';

  function moisCourant() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
  function moisLib(m) { var x = /^(\d{4})-(\d{2})$/.exec(m || ''); return x ? MOIS[parseInt(x[2], 10) - 1].replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + x[1] : m; }
  function moisDecale(m, n) { var a = parseInt(m.slice(0, 4), 10), mm = parseInt(m.slice(5, 7), 10) - 1 + n; a += Math.floor(mm / 12); mm = ((mm % 12) + 12) % 12; return a + '-' + ('0' + (mm + 1)).slice(-2); }
  function unites(x) { if (x === null || x === undefined || x === '') return '—'; var n = Number(x); return (Math.round(n * 2) / 2).toLocaleString('fr-CA', { maximumFractionDigits: 1 }); }
  function argent(x) { return x === null || x === undefined || x === '' ? '—' : AMX.fmtArgent(x); }
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c; }
  function peutVoir() { return AMX.perm('consulter') || AMX.perm('voirResultats') || AMX.estAdmin(); }

  /* ------------------------------ Données ------------------------------ */
  var cache = {};
  function charger(cie, mois, force) {
    var cle = (cie || '*') + '|' + mois, c = cache[cle];
    if (!force && c && c.rep && Date.now() - c.quand < 60000) return Promise.resolve(c.rep);
    if (c && c.promesse) return c.promesse;
    var params = { boardVentes: 1, mois: mois }; if (cie) params.compagnie = cie;
    c = cache[cle] = cache[cle] || {};
    c.promesse = AMX.get(params, { delai: 60000, secours: false }).then(function (d) {
      c.promesse = null;
      if (!d || !Array.isArray(d.cies)) throw new Error((d && d.erreur) || SCRIPT_PAS_A_JOUR);
      c.rep = d; c.quand = Date.now(); return d;
    }, function (e) { c.promesse = null; throw e; });
    return c.promesse;
  }
  function oublier() { cache = {}; }

  /* Mesure (ce qui compte pour l'objectif) d'un bloc { vendues, livrees, rdr }. */
  function val(bloc, mesure) { if (!bloc) return 0; return mesure === 'vendues' ? bloc.vendues : (mesure === 'rdr' ? bloc.rdr : bloc.livrees); }
  function chiffres(r, type, mesure) {
    var n = type === 'neuf' ? val(r.neuf, mesure) : (type === 'usage' ? (mesure === 'rdr' ? 0 : val(r.usage, mesure)) : val(r.neuf, mesure) + (mesure === 'rdr' ? 0 : val(r.usage, mesure)));
    var ob = r.objectif || {}, o = type === 'neuf' ? ob.neuf : (type === 'usage' ? ob.usage : ((ob.neuf === '' || ob.neuf === undefined) && (ob.usage === '' || ob.usage === undefined) ? '' : (Number(ob.neuf) || 0) + (Number(ob.usage) || 0)));
    return { n: Math.round(n * 2) / 2, obj: o === '' || o === undefined || o === null ? null : Number(o) };
  }
  function rythme(n, obj, jours) {
    var proj = jours.ecoules ? Math.round(n / jours.ecoules * jours.total * 10) / 10 : (jours.futur ? 0 : n);
    if (jours.passe) proj = n;
    var attendu = obj ? obj * (jours.total ? jours.ecoules / jours.total : 1) : null;
    var restantsInclus = jours.restants + (jours.aujourdhuiOuvrable ? 1 : 0);
    var parJour = obj && n < obj && restantsInclus ? Math.round((obj - n) / restantsInclus * 10) / 10 : (obj && n < obj ? null : 0);
    var pct = obj ? Math.round(100 * n / obj) : null;
    var etat = !obj ? 'gris' : (n >= obj ? 'vert' : (attendu === null || n >= attendu * 0.95 ? 'vert' : (n >= attendu * 0.8 ? 'ambre' : 'rouge')));
    return { proj: proj, attendu: attendu, parJour: parJour, pct: pct, etat: etat, reste: obj && n < obj ? obj - n : 0, jRest: restantsInclus };
  }
  /* jours ouvrables qui restent pour vendre, aujourd'hui compris (le même compte que « reste X en N jours ») */
  function joursAFaire(j) { var n = j.restants + (j.aujourdhuiOuvrable ? 1 : 0); return n + ' jour' + (n > 1 ? 's' : '') + ' ouvrable' + (n > 1 ? 's' : '') + (j.aujourdhuiOuvrable ? ', aujourd\'hui compris' : ''); }
  /* « reste 2 en 4 jours ouvrables » : plus parlant que 0,5 par jour pour des voitures */
  function resteTxt(ry, court) {
    if (!ry.reste) return '';
    if (!ry.jRest) return 'reste ' + unites(ry.reste) + ' — dernier jour passé';
    return 'reste ' + unites(ry.reste) + ' en ' + ry.jRest + (court ? ' j' : ' jour' + (ry.jRest > 1 ? 's' : '') + ' ouvrable' + (ry.jRest > 1 ? 's' : ''));
  }
  function barre(n, obj, attendu, etat) {
    var w = obj ? Math.min(100, Math.round(100 * n / obj)) : 0, a = obj && attendu !== null ? Math.min(100, Math.round(100 * attendu / obj)) : null;
    return h('div.bv-barre.' + (etat || 'gris'), { title: obj ? unites(n) + ' sur ' + unites(obj) + (a !== null ? ' — il faudrait être à ' + unites(attendu) + ' aujourd\'hui' : '') : 'Pas d\'objectif' }, [h('span.rempli', { style: { width: w + '%' } }), a !== null ? h('span.repere', { style: { left: a + '%' } }) : null]);
  }

  /* ------------------------------ Page ------------------------------ */
  AMX.section('board', {
    titre: 'Board des ventes', icone: 'vente', ordre: 9,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new Board(conteneur, ctx); }
  });

  function Board(conteneur, ctx) {
    injecterCss();
    var self = this;
    this.el = conteneur; this.detruit = false; this.generation = 0;
    this.mois = (ctx && ctx.params && /^\d{4}-\d{2}$/.test(ctx.params.mois || '')) ? ctx.params.mois : moisCourant();
    this.type = AMX.memo.lire('board_type', 'total');
    this.q = '';
    this.donnees = null; this.erreur = '';
    this.construire();
    this.charger(false);
    this.surCie = function () { if (!self.detruit) self.charger(false); };
    document.addEventListener('amx:compagnie', this.surCie);
    this.minuterie = setInterval(function () { if (!self.detruit && !document.hidden) self.charger(true, true); }, 5 * 60000);
  }
  Board.prototype.demonter = function () { this.detruit = true; this.generation++; clearInterval(this.minuterie); document.removeEventListener('amx:compagnie', this.surCie); this.fermerTele(); };
  Board.prototype.naviguer = function (ctx) { var m = ctx && ctx.params && ctx.params.mois; if (m && /^\d{4}-\d{2}$/.test(m) && m !== this.mois) { this.mois = m; this.selMois.value = m; this.charger(false); } };
  Board.prototype.cie = function () {
    var c = AMX.compagnieChoisie('inventaire');
    if (c) return c;
    var codes = AMX.codesPour('inventaire') || [];
    return codes.length === 1 ? codes[0] : '';
  };

  Board.prototype.construire = function () {
    var self = this;
    this.selMois = h('select.saisie.bv-mois', { 'aria-label': 'Mois', onchange: function () { self.mois = self.selMois.value; self.charger(false); } });
    var m0 = moisCourant();
    for (var i = 0; i < 13; i++) { var m = moisDecale(m0, -i); this.selMois.appendChild(h('option', { value: m, text: moisLib(m) + (i === 0 ? ' (en cours)' : '') })); }
    this.selMois.value = this.mois;
    this.btnObjectifs = h('button.btn', { type: 'button', html: I.ok + '<span>Objectifs</span>', onclick: function () { self.modaleObjectifs(); } });
    this.btnReps = h('button.btn', { type: 'button', html: I.filtre + '<span>Représentants</span>', onclick: function () { self.modaleReps(); } });
    this.btnTele = h('button.btn.primaire', { type: 'button', html: I.externe + '<span>Écran télé</span>', title: 'Le classement en grand pour la salle d\'exposition (sans montants)', onclick: function () { self.ouvrirTele(); } });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnExporter = h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter (Excel)</span>', onclick: function () { self.exporter(); } });
    this.elSous = h('p.sous-titre');
    var actions = AMX.actionsEntete ? AMX.actionsEntete([this.btnRafraichir, this.btnExporter, this.btnReps, this.btnObjectifs, this.selMois, this.btnTele], [this.selMois, this.btnTele, this.btnObjectifs]) : [this.selMois, this.btnObjectifs, this.btnReps, this.btnTele, this.btnRafraichir, this.btnExporter];
    var entete = h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', 'Board des ventes'), this.elSous]), h('div.actions', actions)]);
    this.elCies = h('div');
    this.inputQ = h('input.saisie', { type: 'search', placeholder: 'Chercher un représentant', oninput: function () { self.q = self.inputQ.value; self.rendreListe(); } });
    this.segType = h('div.segment', TYPES.map(function (t) {
      return h('button', { type: 'button', 'data-type': t[0], 'aria-pressed': String(self.type === t[0]), text: t[1], onclick: function () { self.type = t[0]; AMX.memo.ecrire('board_type', t[0]); self.rendre(); } });
    }));
    this.elFiltres = h('div.bv-filtres', [h('div.recherche', [h('span', { html: I.recherche }), this.inputQ]), this.segType]);
    this.elPortee = h('div');
    this.elMoi = h('div');
    this.elTuiles = h('div.bv-tuiles');
    this.elListe = h('div.carte.bv-liste');
    this.page = h('div.bv-page', [entete, this.elCies, this.elFiltres, this.elPortee, this.elMoi, this.elTuiles, this.elListe]);
    this.el.appendChild(this.page);
  };

  Board.prototype.charger = function (force, silencieux) {
    var self = this, gen = ++this.generation, cie = this.cie();
    if (!this.donnees) { AMX.vider(this.elListe); this.elListe.appendChild(AMX.chargeur ? AMX.chargeur('Board des ventes') : h('p.doux', 'Lecture…')); }
    charger(cie, this.mois, force).then(function (d) {
      if (gen !== self.generation || self.detruit) return;
      self.donnees = d; self.erreur = ''; self.rendre();
      if (force && !silencieux) AMX.toast('Board à jour', 'ok', 2000);
      if (self.tele) self.rendreTele();
    }).catch(function (e) {
      if (gen !== self.generation || self.detruit) return;
      self.erreur = AMX.erreurTexte(e); self.rendre();
      if (!silencieux) AMX.toast(self.erreur, 'erreur', 8000);
    });
  };

  /* Les concessions affichées : celle choisie (ou la seule du compte), sinon toutes (résumé par concession). */
  Board.prototype.blocs = function () { var d = this.donnees; if (!d) return []; var c = this.cie(); return d.cies.filter(function (x) { return !c || x.compagnie === c; }); };

  Board.prototype.rendre = function () {
    var self = this, d = this.donnees;
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: AMX.compagnieChoisie('inventaire'), onchange: function (c) { AMX.choisirCompagnie(c); } });
    [].forEach.call(this.segType.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-type') === self.type)); });
    var peutRegler = !!(d && d.peutRegler);
    this.btnObjectifs.style.display = peutRegler && this.cie() ? '' : 'none';
    this.btnReps.style.display = peutRegler && this.cie() ? '' : 'none';
    if (this.erreur && !d) { AMX.vider(this.elListe); this.elListe.appendChild(h('div.carte-corps', [h('p', { style: { color: 'var(--rouge)' }, text: this.erreur })])); this.elSous.textContent = ''; return; }
    if (!d) return;
    var blocs = this.blocs();
    var b0 = blocs[0];
    var j = b0 ? b0.jours : null;
    this.elSous.textContent = moisLib(d.mois) + (b0 ? ' · compte : ' + b0.mesureLibelle.toLowerCase() : '') + (j ? (j.passe ? ' · mois terminé' : ' · jour ouvrable ' + j.ecoules + ' sur ' + j.total + ' · il reste ' + joursAFaire(j)) : '') + (this.erreur ? ' — mise à jour impossible : ' + this.erreur : '');
    if (blocs.length > 1) { this.rendreGroupe(blocs); return; }
    this.rendreListe();
  };

  /* Toutes les concessions : une ligne par concession, un clic la choisit. */
  Board.prototype.rendreGroupe = function (blocs) {
    var self = this, d = this.donnees;
    AMX.vider(this.elPortee); AMX.vider(this.elMoi); AMX.vider(this.elTuiles); AMX.vider(this.elListe);
    this.elFiltres.style.display = 'none';
    var lignes = blocs.slice().sort(function (a, b) { return ORDRE.indexOf(a.compagnie) - ORDRE.indexOf(b.compagnie); }).map(function (b) {
      var tot = { neuf: { vendues: b.totaux.neuf.vendues, livrees: b.totaux.neuf.livrees, rdr: b.totaux.neuf.rdr }, usage: b.totaux.usage, objectif: b.objectif };
      var cN = chiffres(tot, 'neuf', b.mesure), cU = chiffres(tot, 'usage', b.mesure), cT = chiffres(tot, 'total', b.mesure), ry = rythme(cT.n, cT.obj, b.jours);
      return h('tr.cliquable', { onclick: function () { AMX.choisirCompagnie(b.compagnie); } }, [
        h('td', [h('b', { text: b.nom }), h('div.mini', { text: 'compte : ' + b.mesureLibelle.toLowerCase() })]),
        h('td.num', { text: unites(cN.n) + (cN.obj !== null ? ' / ' + unites(cN.obj) : '') }),
        h('td.num', { text: unites(cU.n) + (cU.obj !== null ? ' / ' + unites(cU.obj) : '') }),
        h('td.num', [h('b', { text: unites(cT.n) }), cT.obj !== null ? h('span.mini', { text: ' / ' + unites(cT.obj) }) : null]),
        h('td', [barre(cT.n, cT.obj, ry.attendu, ry.etat), h('div.mini', { text: ry.pct !== null ? ry.pct + ' %' : 'pas d\'objectif' })]),
        h('td.num', { text: unites(ry.proj) }),
        h('td.num', { text: unites(b.totaux.neuf.aLivrer + b.totaux.usage.aLivrer) }),
        h('td.num', { text: unites(b.totaux.neuf.rdr) }),
        d.montants ? h('td.num', { text: argent(b.totaux.profit && b.totaux.profit.frontMoyen) }) : null,
        d.montants ? h('td.num', { text: argent(b.totaux.profit && b.totaux.profit.fiMoyen) }) : null
      ]);
    });
    this.elListe.appendChild(h('div.carte-entete', [h('h2', ['Toutes les concessions', h('span.sous', { text: 'touchez une concession pour son board des représentants' })])]));
    this.elListe.appendChild(h('div.carte-corps', { style: { overflowX: 'auto' } }, [h('table.tableau.bv-table', [
      h('thead', [h('tr', [h('th', 'Concession'), h('th.num', 'Neuf'), h('th.num', 'Occasion'), h('th.num', 'Total'), h('th', 'Objectif'), h('th.num', 'Projection'), h('th.num', 'À livrer'), h('th.num', 'RDR')].concat(d.montants ? [h('th.num', 'Front / u.'), h('th.num', 'F&I / u.')] : []))]),
      h('tbody', lignes)
    ])]));
  };

  Board.prototype.representants = function (b) {
    var self = this, mots = AMX.motsCherches(this.q);
    return b.representants.filter(function (r) { return !mots.length || AMX.correspond([r.nom].concat(r.variantes || []), mots); });
  };

  Board.prototype.rendreListe = function () {
    var self = this, d = this.donnees, b = this.blocs()[0];
    this.elFiltres.style.display = '';
    AMX.vider(this.elPortee); AMX.vider(this.elMoi); AMX.vider(this.elTuiles); AMX.vider(this.elListe);
    if (!d || !b) return;
    var reps = this.representants(b), type = this.type, mesure = b.mesure, j = b.jours;
    var libType = { total: 'neuf + occasion', neuf: 'neuf', usage: 'occasion' }[type];
    AMX.porteeChiffres(this.elPortee, { n: reps.length, unite: ['représentant', 'représentants'], contexte: [b.nom, moisLib(d.mois)], filtres: [type !== 'total' ? libType : '', this.q ? '« ' + this.q + ' »' : ''], effacer: function () { self.q = ''; self.inputQ.value = ''; self.type = 'total'; AMX.memo.ecrire('board_type', 'total'); self.rendre(); } });

    /* Tuiles (sur les représentants affichés) */
    var somme = function (f) { return Math.round(reps.reduce(function (s, r) { return s + (f(r) || 0); }, 0) * 2) / 2; };
    var n = somme(function (r) { return chiffres(r, type, mesure).n; });
    var objRep = reps.some(function (r) { return chiffres(r, type, mesure).obj !== null; }) ? somme(function (r) { return chiffres(r, type, mesure).obj; }) : null;
    var obC = b.objectif && b.objectif.fixe && !this.q ? chiffres({ objectif: b.objectif }, type, mesure).obj : null;
    var obj = obC !== null ? obC : objRep;
    var ry = rythme(n, obj, j);
    var tuile = function (titre, valeur, bas, couleur, extra) { return h('div.kpi' + (couleur ? '.' + couleur : ''), [h('div.titre', { text: titre }), h('div.valeur', { text: valeur }), bas ? h('div.bas', { text: bas }) : null, extra || null]); };
    this.elTuiles.appendChild(tuile(b.mesureLibelle + ' — ' + libType, unites(n) + (obj !== null ? ' / ' + unites(obj) : ''), obj !== null ? (ry.pct + ' % de l\'objectif' + (obC !== null ? ' (objectif de la concession)' : '')) : 'aucun objectif fixé', ry.etat === 'gris' ? '' : ry.etat, obj !== null ? barre(n, obj, ry.attendu, ry.etat) : null));
    this.elTuiles.appendChild(tuile('Projection fin de mois', j.passe ? unites(n) : unites(ry.proj), j.passe ? 'mois terminé' : (obj !== null ? (n >= obj ? 'objectif atteint' : resteTxt(ry)) : 'il reste ' + joursAFaire(j)), obj !== null && !j.passe ? (ry.proj >= obj ? 'vert' : (ry.proj >= obj * 0.9 ? 'ambre' : 'rouge')) : ''));
    var aLiv = somme(function (r) { return type === 'neuf' ? r.neuf.aLivrer : (type === 'usage' ? r.usage.aLivrer : r.total.aLivrer); });
    this.elTuiles.appendChild(tuile('Vendues à livrer', unites(aLiv), 'vendues, pas encore livrées'));
    if (type !== 'usage') this.elTuiles.appendChild(tuile('RDR — neuf', unites(somme(function (r) { return r.neuf.rdr; })), b.rdrPortail ? 'livre et portail du constructeur' : 'date RDR du livre'));
    if (d.montants) {
      var tp = { f: 0, nf: 0, g: 0, ng: 0 };
      reps.forEach(function (r) { if (!r.profit) return; if (r.profit.frontMoyen !== null) { tp.f += r.profit.front; tp.nf += r.unitesProfit; } if (r.profit.fiMoyen !== null) { tp.g += r.profit.fi; tp.ng += r.unitesProfit; } });
      this.elTuiles.appendChild(tuile('Front / unité', tp.nf ? argent(Math.round(tp.f / tp.nf)) : '—', 'F&I / unité : ' + (tp.ng ? argent(Math.round(tp.g / tp.ng)) : '—')));
    }
    var prec = somme(function (r) { return type === 'neuf' ? r.prec.neuf : (type === 'usage' ? r.prec.usage : r.prec.neuf + r.prec.usage); });
    this.elTuiles.appendChild(tuile(moisLib(d.moisPrec), unites(prec), 'livrées le mois précédent'));

    /* Votre mois */
    var moi = b.moi ? b.representants.filter(function (r) { return r.cle === b.moi; })[0] : null;
    if (moi && !this.q) {
      var cm = chiffres(moi, type, mesure), rm = rythme(cm.n, cm.obj, j);
      var rang = b.representants.indexOf(moi) + 1;
      this.elMoi.appendChild(h('div.bv-moi.' + rm.etat, [h('b', { text: 'Votre mois : ' }), h('span', { text: unites(cm.n) + ' ' + b.mesureLibelle.toLowerCase() + (cm.obj !== null ? ' sur ' + unites(cm.obj) + ' (' + rm.pct + ' %)' : '') + ' · rang ' + rang + ' sur ' + b.representants.length + (cm.obj !== null && cm.n < cm.obj && !j.passe ? ' · ' + resteTxt(rm) : (cm.obj !== null && cm.n >= cm.obj ? ' · objectif atteint' : '')) })]));
    }

    /* Tableau */
    var tri = reps.slice().sort(function (a, c) { return chiffres(c, type, mesure).n - chiffres(a, type, mesure).n || c.total.vendues - a.total.vendues || String(a.nom).localeCompare(String(c.nom), 'fr'); });
    var lignes = tri.map(function (r, i) {
      var ci = chiffres(r, type, mesure), ryi = rythme(ci.n, ci.obj, j);
      var cN = chiffres(r, 'neuf', mesure), cU = chiffres(r, 'usage', mesure);
      return h('tr.cliquable' + (r.cle === b.moi ? '.moi' : ''), { onclick: function () { self.detail(b, r); } }, [
        h('td.num.rang', { text: String(i + 1) }),
        h('td', [h('b', { text: r.nom }), r.cle === b.moi ? h('span.badge.vert.sans-point', { text: 'vous', style: { marginLeft: '6px' } }) : null, r.variantes && r.variantes.length > 1 ? h('div.mini', { text: 'au livre : ' + r.variantes.join(', ') }) : null]),
        h('td.num', { text: unites(cN.n) + (cN.obj !== null ? ' / ' + unites(cN.obj) : '') }),
        h('td.num', { text: unites(cU.n) + (cU.obj !== null ? ' / ' + unites(cU.obj) : '') }),
        h('td', [barre(ci.n, ci.obj, ryi.attendu, ryi.etat), h('div.mini', { text: ci.obj !== null ? unites(ci.n) + ' / ' + unites(ci.obj) + ' · ' + ryi.pct + ' %' : unites(ci.n) + ' · pas d\'objectif' })]),
        h('td.num', [h('span', { text: unites(ryi.proj) }), ci.obj !== null && ci.n < ci.obj && !j.passe ? h('div.mini', { text: resteTxt(ryi, true) }) : null]),
        h('td.num', { text: unites(type === 'neuf' ? r.neuf.aLivrer : (type === 'usage' ? r.usage.aLivrer : r.total.aLivrer)) }),
        h('td.num', { text: unites(r.neuf.rdr) }),
        d.montants ? h('td.num', { text: argent(r.profit && r.profit.frontMoyen) }) : null,
        d.montants ? h('td.num', { text: argent(r.profit && r.profit.fiMoyen) }) : null,
        h('td.num', { text: r.produitsParUnite === null || r.produitsParUnite === undefined ? '—' : String(r.produitsParUnite).replace('.', ',') }),
        h('td.num', { text: unites(type === 'neuf' ? r.prec.neuf : (type === 'usage' ? r.prec.usage : r.prec.neuf + r.prec.usage)) })
      ]);
    });
    var entetes = [h('th.num', '#'), h('th', 'Représentant'), h('th.num', 'Neuf'), h('th.num', 'Occasion'), h('th', 'Objectif — ' + libType), h('th.num', 'Projection'), h('th.num', 'À livrer'), h('th.num', 'RDR')]
      .concat(d.montants ? [h('th.num', 'Front / u.'), h('th.num', 'F&I / u.')] : []).concat([h('th.num', 'Produits / u.'), h('th.num', moisLib(d.moisPrec).split(' ')[0])]);
    this.elListe.appendChild(h('div.carte-entete', [h('h2', ['Représentants', h('span.sous', { text: b.mesureLibelle + ' par représentant · ' + (j.passe ? 'mois terminé' : 'il reste ' + joursAFaire(j)) })])]));
    if (!tri.length) { this.elListe.appendChild(h('div.carte-corps', [h('p.doux', { text: this.q ? 'Aucun représentant pour « ' + this.q + ' ».' : 'Aucune vente au Livre des ventes ce mois-ci.' })])); }
    else this.elListe.appendChild(h('div.carte-corps', { style: { overflowX: 'auto' } }, [h('table.tableau.bv-table', [h('thead', [h('tr', entetes)]), h('tbody', lignes)])]));
    if (b.suggestions && b.suggestions.length && d.peutRegler) {
      this.elListe.appendChild(h('div.carte-corps.bv-sugg', [h('span', { text: 'Même personne ? ' })].concat(b.suggestions.map(function (s) {
        return h('button.btn.petit', { type: 'button', text: '« ' + s.nomVariante + ' » → ' + s.nomVers, onclick: function () { self.fusionner(b, s.vers, s.nomVers, [s.nomVariante]); } });
      }))));
    }
    this.elListe.appendChild(h('div.carte-corps.mini', { text: 'Une vente partagée au livre (« Julie / Marc ») compte une demi-unité chacun. Le wholesale n\'est pas compté. ' + (mesure === 'livrees' ? 'Compte les ventes livrées (date de livraison du livre).' : (mesure === 'vendues' ? 'Compte les ventes par date de vente.' : 'Compte les RDR du neuf (livre et portail du constructeur).')) }));
  };

  /* ------------------------------ Détail d'un représentant ------------------------------ */
  Board.prototype.detail = function (b, r) {
    var self = this, corps = h('div', [h('p.doux', 'Lecture des ventes…')]);
    var m = AMX.modale({ titre: r.nom + ' — ' + moisLib(this.donnees.mois), corps: corps, large: true, boutons: [{ texte: 'Fermer', action: function (f) { f(); } }] });
    if (!AMX.ventes || !AMX.ventes.charger) { AMX.vider(corps); corps.appendChild(h('p.doux', 'Le Livre des ventes n\'est pas chargé.')); return; }
    AMX.ventes.charger(b.compagnie, 'tout').then(function (d) {
      var ids = {}; (r.ventes || []).forEach(function (id) { ids[id] = 1; });
      var liste = (d.ventes || []).filter(function (v) { return ids[v.id]; }).sort(function (a, c) { return String(c.dateLivraison || c.dateVente).localeCompare(String(a.dateLivraison || a.dateVente)); });
      AMX.vider(corps);
      if (!liste.length) { corps.appendChild(h('p.doux', 'Aucune vente ce mois-ci.')); return; }
      corps.appendChild(h('table.tableau', [h('thead', [h('tr', [h('th', 'Vente'), h('th', 'Véhicule'), h('th', 'Client'), h('th', 'Vendue'), h('th', 'Livrée'), h('th', 'RDR')])]),
        h('tbody', liste.map(function (v) {
          return h('tr.cliquable', { onclick: function () { m.fermer(); AMX.aller('ventes', 'liste', { id: v.id }); } }, [
            h('td', [h('b', { text: v.id }), h('div.mini', { text: v.typeLibelle || v.type })]), h('td', { text: v.vehicule || [v.annee, v.marque, v.modele].filter(Boolean).join(' ') }),
            h('td', { text: v.client || '—' }), h('td', { text: v.dateVente ? AMX.fmtDate(v.dateVente) : '—' }), h('td', { text: v.dateLivraison ? AMX.fmtDate(v.dateLivraison) : '—' }), h('td', { text: v.dateRdr ? AMX.fmtDate(v.dateRdr) : '—' })]);
        }))]));
    }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('p', { style: { color: 'var(--rouge)' }, text: AMX.erreurTexte(e) })); });
  };

  /* ------------------------------ Objectifs (direction) ------------------------------ */
  Board.prototype.modaleObjectifs = function () {
    var self = this, d = this.donnees, b = this.blocs()[0]; if (!d || !b) return;
    var noms = {}; b.representants.forEach(function (r) { noms[r.cle] = r; });
    /* les comptes de vendeur (et BDC) pas encore au livre ce mois-ci ; un directeur qui vend apparaît dès sa première vente */
    (b.comptes || []).forEach(function (c) { if (c.role && c.role !== 'vendeur' && c.role !== 'bdc') return; if (!noms[c.cle]) noms[c.cle] = { cle: c.cle, nom: c.nom, objectif: null, compte: true }; });
    var cles = Object.keys(noms).filter(function (k) { return k !== '(sans conseiller)'; }).sort(function (a, c) { return String(noms[a].nom).localeCompare(String(noms[c].nom), 'fr'); });
    var champ = function (v, montant) { return h('input.saisie.num', { type: 'text', inputmode: montant ? 'numeric' : 'decimal', value: v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','), placeholder: '—', style: { width: montant ? '110px' : '70px' } }); };
    var lignes = cles.map(function (k) {
      var r = noms[k], o = r.objectif || {};
      var c = { neuf: champ(o.neuf), usage: champ(o.usage), profit: d.montants ? champ(o.profit, true) : null };
      return { cle: k, nom: r.nom, champs: c, el: h('tr', [h('td', [h('b', { text: r.nom }), r.compte && !r.objectif && !r.total ? h('div.mini', { text: 'compte ScanAutomax, pas encore au livre ce mois-ci' }) : null]), h('td', [c.neuf]), h('td', [c.usage])].concat(d.montants ? [h('td', [c.profit])] : [])) };
    });
    var oc = b.objectif && b.objectif.fixe ? b.objectif : {};
    var cC = { neuf: champ(oc.neuf), usage: champ(oc.usage), profit: d.montants ? champ(oc.profit, true) : null };
    var selMesure = h('select.saisie', Object.keys(d.mesures || { livrees: 'Livrées', vendues: 'Vendues', rdr: 'RDR' }).map(function (k) { return h('option', { value: k, text: d.mesures[k], selected: b.mesure === k }); }));
    var caseSamedi = h('input', { type: 'checkbox', checked: b.samedi !== false });
    var corps = h('div.bv-objectifs', [
      h('p.doux', { text: 'Objectifs de ' + moisLib(d.mois) + ' pour ' + b.nom + '. Une case vide = pas d\'objectif. Les demi-unités sont permises (4,5).' }),
      h('div.actions-ligne', { style: { gap: '12px', flexWrap: 'wrap', alignItems: 'center', margin: '0 0 10px' } }, [h('label.champ.inline', ['Compte pour l\'objectif : ', selMesure]), h('label.case', [caseSamedi, ' Samedi ouvrable']),
        h('button.btn.petit', { type: 'button', text: 'Copier les objectifs du mois précédent', onclick: function () {
          AMX.post({ action: 'boardObjectifsCopier', compagnie: b.compagnie, mois: d.mois }, { secours: false }).then(function (x) {
            if (!x || x.ok === false || x.refuse) throw new Error((x && x.erreur) || 'Refusé');
            AMX.toast(x.message || 'Copié', 'ok'); m.fermer(); oublier(); self.charger(true, true);
          }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
        } })]),
      h('div', { style: { overflowX: 'auto', maxHeight: '55vh' } }, [h('table.tableau', [
        h('thead', [h('tr', [h('th', 'Représentant'), h('th', 'Neuf'), h('th', 'Occasion')].concat(d.montants ? [h('th', 'Profit total ($)')] : []))]),
        h('tbody', lignes.map(function (l) { return l.el; }).concat([h('tr.bv-ligne-cie', [h('td', [h('b', 'Objectif de la concession'), h('div.mini', 'facultatif — sinon la somme des représentants')]), h('td', [cC.neuf]), h('td', [cC.usage])].concat(d.montants ? [h('td', [cC.profit])] : []))]))
      ])])
    ]);
    var lire = function (el) { return el ? el.value.replace(/\s/g, '').replace(',', '.') : ''; };
    var m = AMX.modale({ titre: 'Objectifs — ' + b.nom, corps: corps, large: true, boutons: [
      { texte: 'Annuler', action: function (f) { f(); } },
      { texte: 'Enregistrer', classe: 'primaire', action: function (f) {
        var objectifs = lignes.map(function (l) { return { cle: l.cle, nom: l.nom, neuf: lire(l.champs.neuf), usage: lire(l.champs.usage), profit: lire(l.champs.profit) }; })
          .filter(function (o) { var r = noms[o.cle].objectif || {}; return String(o.neuf) !== String(r.neuf === undefined ? '' : r.neuf) || String(o.usage) !== String(r.usage === undefined ? '' : r.usage) || (d.montants && String(o.profit) !== String(r.profit === undefined ? '' : r.profit)); });
        var cie = { cle: '__concession__', nom: 'Concession', neuf: lire(cC.neuf), usage: lire(cC.usage), profit: lire(cC.profit) };
        if (cie.neuf !== String(oc.neuf || '') || cie.usage !== String(oc.usage || '') || (d.montants && cie.profit !== String(oc.profit || ''))) objectifs.push(cie);
        var reg = selMesure.value !== b.mesure || caseSamedi.checked !== (b.samedi !== false);
        var suite = Promise.resolve();
        if (objectifs.length) suite = suite.then(function () { return AMX.post({ action: 'boardObjectifs', compagnie: b.compagnie, mois: d.mois, objectifs: objectifs }, { secours: false }); }).then(function (x) { if (!x || x.ok === false || x.refuse) throw new Error((x && x.erreur) || 'Refusé'); });
        if (reg) suite = suite.then(function () { return AMX.post({ action: 'boardReglages', compagnie: b.compagnie, mesure: selMesure.value, samedi: caseSamedi.checked }, { secours: false }); }).then(function (x) { if (x && (x.ok === false || x.refuse)) throw new Error(x.erreur || 'Refusé'); });
        if (!objectifs.length && !reg) { f(); return; }
        suite.then(function () { AMX.toast('Objectifs enregistrés', 'ok'); f(); oublier(); self.charger(true, true); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 8000); });
      } }
    ] });
  };

  /* ------------------------------ Représentants (direction) ------------------------------ */
  Board.prototype.fusionner = function (b, cle, nom, alias) {
    var self = this;
    return AMX.post({ action: 'boardRepresentant', compagnie: b.compagnie, cle: cle, nom: nom, alias: alias }, { secours: false }).then(function (x) {
      if (!x || x.ok === false || x.refuse) throw new Error((x && x.erreur) || 'Refusé');
      AMX.toast('« ' + alias.join(', ') + ' » compte maintenant pour ' + nom, 'ok'); oublier(); self.charger(true, true);
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  Board.prototype.modaleReps = function () {
    var self = this, d = this.donnees, b = this.blocs()[0]; if (!d || !b) return;
    var reps = b.representants.filter(function (r) { return r.cle !== '(sans conseiller)'; });
    var corps = h('div', [h('p.doux', { text: 'Le livre écrit parfois le même représentant de deux façons (« Mathieu », « Mathieu Tremblay ») : réunissez-les, liez chaque nom à son compte ScanAutomax (il voit alors « Votre mois »), ou masquez un ancien employé.' })]);
    var table = h('tbody');
    reps.forEach(function (r) {
      var selFusion = h('select.saisie', [h('option', { value: '', text: 'Réunir avec…' })].concat(reps.filter(function (x) { return x.cle !== r.cle; }).map(function (x) { return h('option', { value: x.cle, text: x.nom }); })));
      selFusion.onchange = function () {
        var vers = reps.filter(function (x) { return x.cle === selFusion.value; })[0]; if (!vers) return;
        AMX.confirmer('Réunir les noms ?', '« ' + r.nom + ' » comptera pour ' + vers.nom + ' (ventes, objectifs, board).', { ok: 'Réunir' }).then(function (ok) { if (ok) { m.fermer(); self.fusionner(b, vers.cle, vers.nom, [r.nom].concat(r.variantes || [])); } else selFusion.value = ''; });
      };
      var selCompte = h('select.saisie', [h('option', { value: '', text: '— aucun compte —' })].concat((b.comptes || []).map(function (c) { return h('option', { value: c.courriel, text: c.nom, selected: r.courriel === c.courriel }); })));
      selCompte.onchange = function () {
        AMX.post({ action: 'boardRepresentant', compagnie: b.compagnie, cle: r.cle, nom: r.nom, courriel: selCompte.value }, { secours: false }).then(function (x) { if (!x || x.ok === false || x.refuse) throw new Error((x && x.erreur) || 'Refusé'); AMX.toast('Compte lié', 'ok'); oublier(); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
      };
      var masquer = h('button.btn.petit', { type: 'button', text: 'Masquer', title: 'Ancien employé : plus de ligne vide les mois sans vente', onclick: function () {
        AMX.post({ action: 'boardRepresentant', compagnie: b.compagnie, cle: r.cle, nom: r.nom, actif: 'non' }, { secours: false }).then(function (x) { if (!x || x.ok === false || x.refuse) throw new Error((x && x.erreur) || 'Refusé'); AMX.toast(r.nom + ' masqué', 'ok'); masquer.disabled = true; oublier(); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
      } });
      table.appendChild(h('tr', [h('td', [h('b', { text: r.nom }), r.variantes && r.variantes.length ? h('div.mini', { text: 'au livre : ' + r.variantes.join(', ') }) : null]), h('td', [selCompte]), h('td', [selFusion]), h('td', [masquer])]));
    });
    corps.appendChild(h('div', { style: { overflowX: 'auto', maxHeight: '60vh' } }, [h('table.tableau', [h('thead', [h('tr', [h('th', 'Nom au livre'), h('th', 'Compte ScanAutomax'), h('th', 'Même personne'), h('th', '')])]), table])]));
    var m = AMX.modale({ titre: 'Représentants — ' + b.nom, corps: corps, large: true, boutons: [{ texte: 'Fermer', action: function (f) { f(); self.charger(true, true); } }] });
  };

  /* ------------------------------ Écran télé ------------------------------ */
  Board.prototype.ouvrirTele = function () {
    var self = this;
    if (this.tele) return;
    this.tele = h('div.bv-tele', { tabindex: '-1' });
    document.body.appendChild(this.tele);
    this.surTouche = function (e) { if (e.key === 'Escape') self.fermerTele(); };
    document.addEventListener('keydown', this.surTouche);
    try { if (this.tele.requestFullscreen) this.tele.requestFullscreen().catch(function () {}); } catch (e) {}
    this.rendreTele();
    this.horloge = setInterval(function () { self.rendreTele(); }, 30000);
  };
  Board.prototype.fermerTele = function () {
    if (!this.tele) return;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    clearInterval(this.horloge); document.removeEventListener('keydown', this.surTouche);
    if (this.tele.parentNode) this.tele.parentNode.removeChild(this.tele);
    this.tele = null;
  };
  Board.prototype.rendreTele = function () {
    var self = this, d = this.donnees, el = this.tele; if (!el) return;
    AMX.vider(el);
    var fermer = h('button.bv-tele-fermer', { type: 'button', text: '× Fermer', onclick: function () { self.fermerTele(); } });
    if (!d) { el.appendChild(fermer); el.appendChild(h('p', 'Lecture…')); return; }
    var blocs = this.blocs(), heure = new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
    el.appendChild(h('div.bv-tele-tete', [h('div', [h('div.t1', { text: blocs.length === 1 ? blocs[0].nom : 'Groupe Automax' }), h('div.t2', { text: 'Board des ventes — ' + moisLib(d.mois) })]), h('div.t3', { text: heure }), fermer]));
    blocs.forEach(function (b) {
      var j = b.jours, mesure = b.mesure;
      var tot = { neuf: b.totaux.neuf, usage: b.totaux.usage, objectif: b.objectif };
      var cT = chiffres(tot, 'total', mesure), ry = rythme(cT.n, cT.obj, j);
      el.appendChild(h('div.bv-tele-cie', [
        blocs.length > 1 ? h('div.nom', { text: b.nom }) : null,
        h('div.gros', [h('span.n', { text: unites(cT.n) }), cT.obj !== null ? h('span.o', { text: ' / ' + unites(cT.obj) }) : null, h('span.l', { text: ' ' + b.mesureLibelle.toLowerCase() })]),
        cT.obj !== null ? barre(cT.n, cT.obj, ry.attendu, ry.etat) : null,
        h('div.info', { text: (j.passe ? 'Mois terminé' : 'Il reste ' + joursAFaire(j)) + (cT.obj !== null && cT.n < cT.obj && !j.passe ? ' · ' + resteTxt(ry) : (cT.obj !== null && cT.n >= cT.obj ? ' · objectif atteint !' : '')) + ' · neuf ' + unites(chiffres(tot, 'neuf', mesure).n) + ' · occasion ' + unites(chiffres(tot, 'usage', mesure).n) })
      ]));
      if (blocs.length > 1) return;
      var reps = b.representants.slice().sort(function (a, c) { return chiffres(c, 'total', mesure).n - chiffres(a, 'total', mesure).n || String(a.nom).localeCompare(String(c.nom), 'fr'); }).slice(0, 14);
      el.appendChild(h('div.bv-tele-liste', reps.map(function (r, i) {
        var c = chiffres(r, 'total', mesure), rr = rythme(c.n, c.obj, j);
        return h('div.bv-tele-ligne', [h('span.r', { text: String(i + 1) }), h('span.nom', { text: r.nom }),
          h('span.u', { text: 'N ' + unites(chiffres(r, 'neuf', mesure).n) + ' · O ' + unites(chiffres(r, 'usage', mesure).n) }),
          h('span.b', [barre(c.n, c.obj, rr.attendu, rr.etat)]), h('span.t', { text: unites(c.n) + (c.obj !== null ? ' / ' + unites(c.obj) : '') })]);
      })));
    });
    el.appendChild(h('div.bv-tele-pied', { text: 'Mis à jour à ' + heure + ' · Échap pour fermer' }));
  };

  /* ------------------------------ Export ------------------------------ */
  Board.prototype.exporter = function () {
    var d = this.donnees, self = this; if (!d) return;
    if (typeof XLSX === 'undefined') { AMX.toast('Excel pas disponible sur cette page.', 'attention'); return; }
    var lignes = [];
    this.blocs().forEach(function (b) {
      b.representants.forEach(function (r) {
        var o = { Concession: b.nom, Mois: d.mois, 'Représentant': r.nom, 'Noms au livre': (r.variantes || []).join(', '),
          'Neuf livrées': r.neuf.livrees, 'Neuf vendues': r.neuf.vendues, 'Neuf à livrer': r.neuf.aLivrer, 'RDR': r.neuf.rdr,
          'Occasion livrées': r.usage.livrees, 'Occasion vendues': r.usage.vendues, 'Occasion à livrer': r.usage.aLivrer,
          'Objectif neuf': r.objectif ? r.objectif.neuf : '', 'Objectif occasion': r.objectif ? r.objectif.usage : '',
          'Mois précédent (livrées)': r.prec.neuf + r.prec.usage, 'Produits F&I / unité': r.produitsParUnite === null ? '' : r.produitsParUnite };
        if (d.montants && r.profit) { o['Front / unité'] = r.profit.frontMoyen; o['F&I / unité'] = r.profit.fiMoyen; o['Profit total'] = r.profit.total; o['Objectif profit'] = r.objectif ? r.objectif.profit : ''; }
        lignes.push(o);
      });
    });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Board');
    XLSX.writeFile(wb, 'board-ventes-' + d.mois + (self.cie() ? '-' + self.cie() : '') + '.xlsx');
  };

  AMX.board = { charger: charger, oublier: oublier };

  function injecterCss() {
    if (document.getElementById('css-board')) return;
    var s = document.createElement('style'); s.id = 'css-board';
    s.textContent = [
      '.bv-page .carte { margin-bottom: 14px; }',
      '.bv-page .mini { font-size: 12px; color: var(--encre-3); }',
      '.bv-page .carte-entete h2 .sous { font-size: 12px; font-weight: 400; color: var(--encre-3); margin-left: 8px; text-transform: none; letter-spacing: 0; }',
      '.bv-page .entete-page .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; }',
      '.bv-page select.saisie.bv-mois { width: auto; min-width: 200px; height: 36px; font-weight: 600; flex: 0 0 auto; }',
      '.bv-filtres { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 0 0 8px; }',
      '.bv-filtres .recherche { flex: 1 1 220px; max-width: 360px; }',
      '.bv-tuiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin: 0 0 14px; }',
      '.bv-tuiles .kpi .bas { font-size: 12px; color: var(--encre-3); margin-top: 2px; }',
      '.bv-tuiles .kpi .bv-barre { margin-top: 8px; }',
      '.bv-barre { position: relative; height: 10px; border-radius: 6px; background: var(--fond-2, #EEF1F4); overflow: visible; min-width: 90px; }',
      '.bv-barre .rempli { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 6px; background: var(--encre-4); }',
      '.bv-barre.vert .rempli { background: var(--vert); } .bv-barre.ambre .rempli { background: var(--ambre); } .bv-barre.rouge .rempli { background: var(--rouge); }',
      '.bv-barre .repere { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--encre-1, #141A1F); border-radius: 1px; }',
      '.bv-table td, .bv-table th { white-space: nowrap; }',
      '.bv-table td.rang { color: var(--encre-3); width: 28px; }',
      '.bv-table tr.cliquable { cursor: pointer; } .bv-table tr.cliquable:hover td { background: var(--fond-2, #F3F5F7); }',
      '.bv-table tr.moi td { background: var(--vert-clair, #E8F6EC); }',
      '.bv-table td .bv-barre { margin: 4px 0 2px; }',
      '.bv-moi { padding: 10px 14px; border-radius: 10px; margin: 0 0 12px; background: var(--fond-2, #F3F5F7); border-left: 4px solid var(--encre-4); }',
      '.bv-moi.vert { border-left-color: var(--vert); background: var(--vert-clair, #E8F6EC); } .bv-moi.ambre { border-left-color: var(--ambre); } .bv-moi.rouge { border-left-color: var(--rouge); }',
      '.bv-sugg { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; border-top: 1px solid var(--trait, #E3E7EB); }',
      '.bv-objectifs input.num { text-align: right; }',
      '.bv-objectifs tr.bv-ligne-cie td { border-top: 2px solid var(--trait, #E3E7EB); }',
      '.bv-tele { position: fixed; inset: 0; z-index: 9000; background: #0F1418; color: #fff; padding: 28px 40px; overflow: auto; font-size: 22px; }',
      '.bv-tele-tete { display: flex; align-items: center; gap: 20px; margin-bottom: 18px; } .bv-tele-tete > div:first-child { flex: 1; }',
      '.bv-tele .t1 { font-size: 34px; font-weight: 700; } .bv-tele .t2 { font-size: 20px; color: #9FB0BC; } .bv-tele .t3 { font-size: 34px; font-variant-numeric: tabular-nums; color: #9FB0BC; }',
      '.bv-tele-fermer { background: transparent; border: 1px solid #44525C; color: #9FB0BC; border-radius: 8px; padding: 8px 14px; font-size: 16px; cursor: pointer; }',
      '.bv-tele-cie { background: #182027; border-radius: 14px; padding: 18px 22px; margin-bottom: 16px; } .bv-tele-cie .nom { font-size: 22px; color: #9FB0BC; margin-bottom: 4px; }',
      '.bv-tele-cie .gros .n { font-size: 64px; font-weight: 800; } .bv-tele-cie .gros .o { font-size: 36px; color: #9FB0BC; } .bv-tele-cie .gros .l { font-size: 22px; color: #9FB0BC; }',
      '.bv-tele-cie .bv-barre { height: 16px; margin: 10px 0; background: #2A343C; } .bv-tele-cie .info { font-size: 20px; color: #C8D3DB; }',
      '.bv-tele .bv-barre .repere { background: #fff; }',
      '.bv-tele-liste { display: grid; gap: 8px; } .bv-tele-ligne { display: grid; grid-template-columns: 50px 1fr 200px 1.2fr 130px; gap: 16px; align-items: center; background: #182027; border-radius: 10px; padding: 12px 18px; }',
      '.bv-tele-ligne .r { font-size: 26px; color: #9FB0BC; font-weight: 700; } .bv-tele-ligne .nom { font-size: 26px; font-weight: 600; } .bv-tele-ligne .u { color: #9FB0BC; font-size: 18px; } .bv-tele-ligne .t { text-align: right; font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }',
      '.bv-tele-ligne .bv-barre { height: 14px; background: #2A343C; }',
      '.bv-tele-pied { margin-top: 16px; font-size: 14px; color: #6B7B86; }',
      '@media (max-width: 860px) { .bv-tele { padding: 16px; font-size: 16px; } .bv-tele-ligne { grid-template-columns: 30px 1fr 90px; } .bv-tele-ligne .u, .bv-tele-ligne .b { display: none; } }'
    ].join('\n');
    document.head.appendChild(s);
  }
})();
