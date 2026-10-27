/* =========================================================================
   Vente › Board des ventes — par représentant, neuf et occasion (27 octobre 2026)

   Maxime : « il faut construire un board de vente pour le neuf et l'usagé par représentant avec les RDR, ventes, les
   moyennes ; avoir la possibilité de mettre des objectifs ». Les chiffres viennent du Livre des ventes (BoardVentes.gs,
   GET ?boardVentes=1) : rien n'est retapé. Ce qui compte pour l'objectif (réglable par concession) : les LIVRÉES par
   défaut — c'est la règle des concessions (une vente pas livrée n'est pas une unité) ; les vendues à livrer sont à part.
   Une vente partagée (« Julie / Marc » au livre) compte une demi-unité chacun.

   27 oct., suite (Maxime : « le board est très fade et pas beau ») — refait sur le modèle des boards du marché
   (Spinify, SalesScreen, Hoopla, LevelEleven, Leaderboarded) : bandeau avec l'anneau de l'objectif de la concession et
   le rythme, podium des trois premiers, classement avec flèches de rang (▲ ▼ depuis hier), barre de progression
   colorée selon le RYTHME (en avance, dans le rythme, en retard), écart avec le rang au-dessus, petite courbe des
   unités par jour, fil des dernières livraisons ; écran télé sombre qui alterne Total / Neuf / Occasion aux 15 s et
   célèbre chaque nouvelle livraison. Seuls les représentants sont classés : la direction, le F&I, le service, une
   vente « maison » comptent dans les totaux de la concession, pas au classement (BoardVentes.gs, BRD_genre_). Le droit
   « Board des ventes » (Admin › Droits, voirBoard) décide qui voit la page.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var ORDRE = ['STM', 'HAWKS', 'BMW', 'VW', 'HYUNDAI'];
  var TYPES = [['total', 'Total'], ['neuf', 'Neuf'], ['usage', 'Occasion']];
  var TEINTES = ['#1A64BF', '#0B7189', '#6D4FC7', '#B4541A', '#008840', '#9B2C6F', '#4B5563', '#955F10'];
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez une nouvelle version (BoardVentes.gs).';

  function moisCourant() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
  function moisLib(m) { var x = /^(\d{4})-(\d{2})$/.exec(m || ''); return x ? MOIS[parseInt(x[2], 10) - 1].replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + x[1] : m; }
  function moisDecale(m, n) { var a = parseInt(m.slice(0, 4), 10), mm = parseInt(m.slice(5, 7), 10) - 1 + n; a += Math.floor(mm / 12); mm = ((mm % 12) + 12) % 12; return a + '-' + ('0' + (mm + 1)).slice(-2); }
  function unites(x) { if (x === null || x === undefined || x === '') return '—'; var n = Number(x); return (Math.round(n * 2) / 2).toLocaleString('fr-CA', { maximumFractionDigits: 1 }); }
  function argent(x) { return x === null || x === undefined || x === '' ? '—' : AMX.fmtArgent(x); }
  function ordinal(n) { return n === 1 ? '1er' : n + 'e'; }
  function teinte(cle) { var s = 0; String(cle || '').split('').forEach(function (c) { s = (s * 31 + c.charCodeAt(0)) >>> 0; }); return TEINTES[s % TEINTES.length]; }
  function initiales(r) { if (r.initiales) return r.initiales; var m = String(r.nom || '').trim().split(/\s+/); return ((m[0] || '?').charAt(0) + (m.length > 1 ? m[m.length - 1].charAt(0) : (m[0] || '').charAt(1))).toUpperCase(); }
  function avatar(r, taille) { return h('span.bv-av', { style: { background: teinte(r.cle), width: taille + 'px', height: taille + 'px', fontSize: Math.round(taille * 0.38) + 'px' }, text: initiales(r), 'aria-hidden': 'true' }); }
  function quand(d, auj) {
    if (!d) return '';
    if (d === auj) return 'aujourd\'hui';
    var a = new Date(auj + 'T12:00:00'), b = new Date(d + 'T12:00:00'), n = Math.round((a - b) / 86400000);
    if (n === 1) return 'hier';
    return parseInt(d.slice(8, 10), 10) + ' ' + MOIS_COURT[parseInt(d.slice(5, 7), 10) - 1];
  }
  /* Le droit « Board des ventes » (Admin › Droits) ; sans lui (Role.gs d'avant), les rôles qui l'ont d'office. */
  function peutVoir() {
    var p = AMX.session && AMX.session.perms;
    if (p && typeof p.voirBoard === 'boolean') return p.voirBoard;
    var r = String((AMX.session && AMX.session.role) || '');
    return AMX.estAdmin() || ['proprietaire', 'admin', 'gestionnaire', 'direction_ventes', 'directeur_commercial', 'vendeur'].indexOf(r) >= 0;
  }

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
  /* Le rythme : où il faudrait être aujourd'hui (objectif × jours ouvrables écoulés ÷ jours du mois).
     atteint · avance (≥ 105 % du rythme) · rythme (≥ 95 %) · leger (≥ 80 %) · retard · gris (pas d'objectif). */
  var ETATS = {
    atteint: { couleur: 'vert', texte: 'Objectif atteint', signe: '✓' },
    avance: { couleur: 'vert', texte: 'En avance', signe: '▲' },
    rythme: { couleur: 'bleu', texte: 'Dans le rythme', signe: '●' },
    leger: { couleur: 'ambre', texte: 'Un peu en retard', signe: '▼' },
    retard: { couleur: 'rouge', texte: 'En retard', signe: '▼' },
    gris: { couleur: 'gris', texte: 'Pas d\'objectif', signe: '' }
  };
  function rythme(n, obj, jours) {
    var proj = jours.ecoules ? Math.round(n / jours.ecoules * jours.total * 10) / 10 : (jours.futur ? 0 : n);
    if (jours.passe) proj = n;
    var attendu = obj ? obj * (jours.total ? jours.ecoules / jours.total : 1) : null;
    var restantsInclus = jours.restants + (jours.aujourdhuiOuvrable ? 1 : 0);
    var pct = obj ? Math.round(100 * n / obj) : null;
    var etat = !obj ? 'gris' : (n >= obj ? 'atteint' : (attendu === null || attendu === 0 ? 'rythme' : (n >= attendu * 1.05 ? 'avance' : (n >= attendu * 0.95 ? 'rythme' : (n >= attendu * 0.8 ? 'leger' : 'retard')))));
    if (jours.passe && obj && n < obj) etat = 'retard';
    return { proj: proj, attendu: attendu, pct: pct, etat: etat, couleur: ETATS[etat].couleur, reste: obj && n < obj ? obj - n : 0, jRest: restantsInclus };
  }
  function joursAFaire(j) { var n = j.restants + (j.aujourdhuiOuvrable ? 1 : 0); return n + ' jour' + (n > 1 ? 's' : '') + ' ouvrable' + (n > 1 ? 's' : '') + (j.aujourdhuiOuvrable ? ', aujourd\'hui compris' : ''); }
  function resteTxt(ry, court) {
    if (!ry.reste) return '';
    if (!ry.jRest) return 'reste ' + unites(ry.reste) + ' — dernier jour passé';
    return 'reste ' + unites(ry.reste) + ' en ' + ry.jRest + (court ? ' j' : ' jour' + (ry.jRest > 1 ? 's' : '') + ' ouvrable' + (ry.jRest > 1 ? 's' : ''));
  }
  function pastilleEtat(ry, court) {
    var e = ETATS[ry.etat]; if (ry.etat === 'gris') return h('span.bv-etat.gris', { text: court ? 'sans objectif' : e.texte });
    return h('span.bv-etat.' + e.couleur, { text: e.signe + ' ' + e.texte });
  }
  function barre(n, obj, attendu, couleur, grosse) {
    var w = obj ? Math.min(100, Math.round(100 * n / obj)) : 0, a = obj && attendu !== null ? Math.min(100, Math.round(100 * attendu / obj)) : null;
    return h('div.bv-barre.' + (couleur || 'gris') + (grosse ? '.grosse' : ''), { title: obj ? unites(n) + ' sur ' + unites(obj) + (a !== null ? ' — il faudrait être à ' + unites(attendu) + ' aujourd\'hui' : '') : 'Pas d\'objectif' }, [h('span.rempli', { style: { width: w + '%' } }), a !== null && a > 0 && a < 100 ? h('span.repere', { style: { left: a + '%' } }) : null]);
  }
  /* Anneau de l'objectif (SVG) : arc rempli selon le %, petit trait au rythme attendu. */
  var COULEURS_ANNEAU = { vert: '#2DB862', bleu: '#5B9BEA', ambre: '#E8A33A', rouge: '#F0605A', gris: '#8A97A1' };
  function anneau(n, obj, attendu, couleur, taille, sombre) {
    var r = 52, c = 2 * Math.PI * r, p = obj ? Math.min(1, n / obj) : 0, a = obj && attendu !== null ? Math.min(1, attendu / obj) : null;
    var piste = sombre ? 'rgba(255,255,255,.14)' : 'var(--fond-2, #EEF1F4)', coul = COULEURS_ANNEAU[couleur] || COULEURS_ANNEAU.gris;
    var rep = '';
    if (a !== null && a > 0 && a < 1) { var ang = (a * 360 - 90) * Math.PI / 180, x1 = 60 + 44 * Math.cos(ang), y1 = 60 + 44 * Math.sin(ang), x2 = 60 + 60 * Math.cos(ang), y2 = 60 + 60 * Math.sin(ang); rep = '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + (sombre ? '#fff' : '#141A1F') + '" stroke-width="3" stroke-linecap="round"/>'; }
    var svg = '<svg viewBox="0 0 120 120" width="' + taille + '" height="' + taille + '" role="img" aria-label="' + (obj ? unites(n) + ' sur ' + unites(obj) : unites(n)) + '">' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + piste + '" stroke-width="12"/>' +
      (obj ? '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + coul + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + (c * p).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 60 60)"/>' : '') + rep + '</svg>';
    return h('span.bv-anneau', { html: svg });
  }
  /* Petite courbe des unités par jour (barres), les jours à venir en pâle. */
  function courbe(parJour, auj, mois, couleur, sombre) {
    if (!parJour || !parJour.length) return null;
    var max = Math.max.apply(null, parJour.concat([1])), w = 3, g = 1.4, H = 22, jAuj = auj.slice(0, 7) === mois ? parseInt(auj.slice(8, 10), 10) : (mois < auj.slice(0, 7) ? 99 : 0);
    var coul = COULEURS_ANNEAU[couleur] || '#8A97A1', pale = sombre ? 'rgba(255,255,255,.12)' : '#E3E7EB';
    var rects = parJour.map(function (v, i) {
      var hh = v ? Math.max(3, Math.round(H * v / max)) : 1.5;
      return '<rect x="' + (i * (w + g)).toFixed(1) + '" y="' + (H - hh) + '" width="' + w + '" height="' + hh + '" rx="1" fill="' + (i + 1 > jAuj ? pale : (v ? coul : pale)) + '"/>';
    }).join('');
    var W = parJour.length * (w + g);
    return h('span.bv-courbe', { html: '<svg viewBox="0 0 ' + W.toFixed(0) + ' ' + H + '" width="' + Math.round(W) + '" height="' + H + '" aria-hidden="true">' + rects + '</svg>', title: 'Unités par jour ce mois-ci' });
  }
  function fleche(r, type) {
    if (type !== 'total' || !r.rangHier || !r.rang) return h('span.bv-fl.zero', { text: '' });
    var d = r.rangHier - r.rang;
    if (d > 0) return h('span.bv-fl.monte', { text: '▲' + d, title: ordinal(r.rangHier) + ' hier' });
    if (d < 0) return h('span.bv-fl.baisse', { text: '▼' + (-d), title: ordinal(r.rangHier) + ' hier' });
    return h('span.bv-fl.zero', { text: '–', title: 'même rang qu\'hier' });
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
    this.minuterie = setInterval(function () { if (!self.detruit && !document.hidden) self.charger(true, true); }, (self.tele ? 2 : 5) * 60000);
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
    this.elHero = h('div');
    this.elPodium = h('div');
    this.elMoi = h('div');
    this.elListe = h('div.carte.bv-liste');
    this.elFil = h('div.carte.bv-fil');
    this.elTri = h('div');
    this.page = h('div.bv-page', [entete, this.elCies, this.elFiltres, this.elPortee, this.elHero, this.elMoi, this.elPodium,
      h('div.bv-grille', [h('div.bv-gauche', [this.elListe, this.elTri]), h('div.bv-droite', [this.elFil])])]);
    this.el.appendChild(this.page);
  };

  Board.prototype.charger = function (force, silencieux) {
    var self = this, gen = ++this.generation, cie = this.cie();
    if (!this.donnees) { AMX.vider(this.elListe); this.elListe.appendChild(AMX.chargeur ? AMX.chargeur('Board des ventes') : h('p.doux', 'Lecture…')); }
    charger(cie, this.mois, force).then(function (d) {
      if (gen !== self.generation || self.detruit) return;
      self.donnees = d; self.erreur = ''; self.rendre();
      if (force && !silencieux) AMX.toast('Board à jour', 'ok', 2000);
      if (self.tele) self.rendreTele(true);
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
    this.elSous.textContent = moisLib(d.mois) + (b0 ? ' · compte : ' + b0.mesureLibelle.toLowerCase() : '') + (j ? (j.passe ? ' · mois terminé' : ' · jour ouvrable ' + j.ecoules + ' sur ' + j.total) : '') + (this.erreur ? ' — mise à jour impossible : ' + this.erreur : '');
    if (blocs.length > 1) { this.rendreGroupe(blocs); return; }
    this.rendreListe();
  };

  /* ------------------------------ Toutes les concessions ------------------------------ */
  Board.prototype.rendreGroupe = function (blocs) {
    var self = this, d = this.donnees;
    [this.elPortee, this.elHero, this.elMoi, this.elPodium, this.elListe, this.elFil, this.elTri].forEach(AMX.vider);
    this.elFiltres.style.display = 'none'; this.elFil.style.display = 'none';
    var cartes = blocs.slice().sort(function (a, b) { return ORDRE.indexOf(a.compagnie) - ORDRE.indexOf(b.compagnie); }).map(function (b) {
      var tot = { neuf: b.totaux.neuf, usage: b.totaux.usage, objectif: b.objectif };
      var cN = chiffres(tot, 'neuf', b.mesure), cU = chiffres(tot, 'usage', b.mesure), cT = chiffres(tot, 'total', b.mesure), ry = rythme(cT.n, cT.obj, b.jours);
      var premier = (b.representants || [])[0];
      return h('button.bv-cie', { type: 'button', onclick: function () { AMX.choisirCompagnie(b.compagnie); } }, [
        h('div.bv-cie-tete', [h('b', { text: b.nom }), pastilleEtat(ry, true)]),
        h('div.bv-cie-corps', [
          h('div.bv-cie-anneau', [anneau(cT.n, cT.obj, ry.attendu, ry.couleur, 92), h('div.centre', [h('b', { text: unites(cT.n) }), h('span', { text: cT.obj !== null ? 'sur ' + unites(cT.obj) : b.mesureLibelle.toLowerCase() })])]),
          h('div.bv-cie-chiffres', [
            h('div', [h('span', 'Neuf'), h('b', { text: unites(cN.n) })]), h('div', [h('span', 'Occasion'), h('b', { text: unites(cU.n) })]),
            h('div', [h('span', 'RDR'), h('b', { text: unites(b.totaux.neuf.rdr) })]), h('div', [h('span', 'Projection'), h('b', { text: unites(ry.proj) })]),
            h('div', [h('span', 'À livrer'), h('b', { text: unites(b.totaux.neuf.aLivrer + b.totaux.usage.aLivrer) })]),
            d.montants && b.totaux.profit ? h('div', [h('span', 'Front / u.'), h('b', { text: argent(b.totaux.profit.frontMoyen) })]) : null
          ])
        ]),
        premier ? h('div.bv-cie-pied', [avatar(premier, 24), h('span', { text: 'En tête : ' + premier.nom + ' · ' + unites(chiffres(premier, 'total', b.mesure).n) })]) : h('div.bv-cie-pied', [h('span.doux', 'Aucune vente ce mois-ci')])
      ]);
    });
    this.elListe.appendChild(h('div.carte-entete', [h('h2', ['Toutes les concessions', h('span.sous', { text: 'touchez une concession pour son classement des représentants' })])]));
    this.elListe.appendChild(h('div.carte-corps', [h('div.bv-cies', cartes)]));
  };

  Board.prototype.representants = function (b) {
    var mots = AMX.motsCherches(this.q);
    return b.representants.filter(function (r) { return !mots.length || AMX.correspond([r.nom].concat(r.variantes || []), mots); });
  };

  /* ------------------------------ Une concession ------------------------------ */
  Board.prototype.rendreListe = function () {
    var self = this, d = this.donnees, b = this.blocs()[0];
    this.elFiltres.style.display = ''; this.elFil.style.display = '';
    [this.elPortee, this.elHero, this.elMoi, this.elPodium, this.elListe, this.elFil, this.elTri].forEach(AMX.vider);
    if (!d || !b) return;
    var reps = this.representants(b), type = this.type, mesure = b.mesure, j = b.jours;
    var libType = { total: 'neuf + occasion', neuf: 'neuf', usage: 'occasion' }[type];
    AMX.porteeChiffres(this.elPortee, { n: reps.length, unite: ['représentant', 'représentants'], contexte: [b.nom, moisLib(d.mois)], filtres: [type !== 'total' ? libType : '', this.q ? '« ' + this.q + ' »' : ''], effacer: function () { self.q = ''; self.inputQ.value = ''; self.type = 'total'; AMX.memo.ecrire('board_type', 'total'); self.rendre(); } });

    /* Bandeau : la concession (tous ceux qui vendent, représentants ou non) — ou les représentants filtrés. */
    var filtre = !!this.q;
    var somme = function (liste, f) { return Math.round(liste.reduce(function (s, r) { return s + (f(r) || 0); }, 0) * 2) / 2; };
    var tot = { neuf: b.totaux.neuf, usage: b.totaux.usage, objectif: b.objectif };
    var n = filtre ? somme(reps, function (r) { return chiffres(r, type, mesure).n; }) : chiffres(tot, type, mesure).n;
    var objRep = reps.some(function (r) { return chiffres(r, type, mesure).obj !== null; }) ? somme(reps, function (r) { return chiffres(r, type, mesure).obj; }) : null;
    var obC = !filtre && b.objectif && b.objectif.fixe ? chiffres({ objectif: b.objectif }, type, mesure).obj : null;
    var obj = obC !== null ? obC : objRep;
    var ry = rythme(n, obj, j);
    var nNeuf = filtre ? somme(reps, function (r) { return chiffres(r, 'neuf', mesure).n; }) : chiffres(tot, 'neuf', mesure).n;
    var nOcc = filtre ? somme(reps, function (r) { return chiffres(r, 'usage', mesure).n; }) : chiffres(tot, 'usage', mesure).n;
    var rdr = filtre ? somme(reps, function (r) { return r.neuf.rdr; }) : b.totaux.neuf.rdr;
    var aLiv = filtre ? somme(reps, function (r) { return type === 'neuf' ? r.neuf.aLivrer : (type === 'usage' ? r.usage.aLivrer : r.total.aLivrer); }) : (type === 'neuf' ? b.totaux.neuf.aLivrer : (type === 'usage' ? b.totaux.usage.aLivrer : b.totaux.neuf.aLivrer + b.totaux.usage.aLivrer));
    var prec = filtre ? somme(reps, function (r) { return type === 'neuf' ? r.prec.neuf : (type === 'usage' ? r.prec.usage : r.prec.neuf + r.prec.usage); }) : (type === 'neuf' ? b.totaux.prec.neuf : (type === 'usage' ? b.totaux.prec.usage : b.totaux.prec.neuf + b.totaux.prec.usage));
    var stat = function (titre, valeur, bas, cls) { return h('div.bv-stat' + (cls ? '.' + cls : ''), [h('span.t', { text: titre }), h('b', { text: valeur }), bas ? h('span.b', { text: bas }) : null]); };
    var stats = [];
    if (type === 'total') { stats.push(stat('Neuf', unites(nNeuf))); stats.push(stat('Occasion', unites(nOcc))); }
    if (type !== 'usage') stats.push(stat('RDR neuf', unites(rdr), b.rdrPortail ? 'livre + portail' : 'livre'));
    stats.push(stat('Vendues à livrer', unites(aLiv)));
    stats.push(stat('Projection', j.passe ? unites(n) : unites(ry.proj), j.passe ? 'mois terminé' : 'fin de mois'));
    var dPrec = n - prec;
    stats.push(stat(moisLib(d.moisPrec).split(' ')[0], unites(prec), j.passe ? 'mois précédent' : '', ''));
    if (d.montants) {
      var tp = filtre ? (function () { var x = { f: 0, nf: 0, g: 0, ng: 0 }; reps.forEach(function (r) { if (!r.profit) return; if (r.profit.frontMoyen !== null) { x.f += r.profit.front; x.nf += r.unitesProfit; } if (r.profit.fiMoyen !== null) { x.g += r.profit.fi; x.ng += r.unitesProfit; } }); return { front: x.nf ? Math.round(x.f / x.nf) : null, fi: x.ng ? Math.round(x.g / x.ng) : null }; })() : { front: b.totaux.profit && b.totaux.profit.frontMoyen, fi: b.totaux.profit && b.totaux.profit.fiMoyen };
      stats.push(stat('Front / unité', argent(tp.front), 'F&I / u. ' + argent(tp.fi), 'montant'));
    }
    var titreHero = filtre ? 'Représentants affichés' : b.nom;
    this.elHero.appendChild(h('div.bv-hero', [
      h('div.bv-hero-anneau', [anneau(n, obj, ry.attendu, ry.couleur, 150, true), h('div.centre', [h('b', { text: unites(n) }), h('span', { text: obj !== null ? 'sur ' + unites(obj) : b.mesureLibelle.toLowerCase() }), obj !== null ? h('em', { text: ry.pct + ' %' }) : null])]),
      h('div.bv-hero-texte', [
        h('div.sur', { text: titreHero + ' · ' + moisLib(d.mois) }),
        h('div.titre', { text: b.mesureLibelle + ' — ' + libType }),
        h('div.ligne-etat', [pastilleEtat(ry), h('span', { text: j.passe ? 'Mois terminé' : (obj !== null ? (n >= obj ? 'objectif atteint — il reste ' + joursAFaire(j) : resteTxt(ry) + (ry.attendu !== null ? ' · il faudrait être à ' + unites(Math.round(ry.attendu * 2) / 2) + ' aujourd\'hui' : '')) : 'aucun objectif fixé · il reste ' + joursAFaire(j)) })]),
        h('div.bv-hero-stats', stats),
        h('div.bv-hero-courbe', [courbe(b.parJour, d.aujourdhui, d.mois, ry.couleur === 'gris' ? 'vert' : ry.couleur, true), h('span', { text: b.mesureLibelle.toLowerCase() + ' par jour' + (prec ? ' · ' + (dPrec >= 0 ? '+' : '') + unites(dPrec) + ' vs ' + moisLib(d.moisPrec).split(' ')[0].toLowerCase() : '') })])
      ])
    ]));

    /* Votre mois */
    var moi = b.moi ? b.representants.filter(function (r) { return r.cle === b.moi; })[0] : null;
    var tri = reps.slice().sort(function (a, c) { return chiffres(c, type, mesure).n - chiffres(a, type, mesure).n || c.total.vendues - a.total.vendues || String(a.nom).localeCompare(String(c.nom), 'fr'); });
    if (moi && !this.q) {
      var cm = chiffres(moi, type, mesure), rm = rythme(cm.n, cm.obj, j);
      var rang = tri.indexOf(moi) + 1;
      var devant = rang > 1 ? chiffres(tri[rang - 2], type, mesure).n - cm.n : 0;
      this.elMoi.appendChild(h('div.bv-moi.' + rm.couleur, [avatar(moi, 40), h('div.txt', [
        h('div', [h('b', { text: 'Votre mois : ' + unites(cm.n) + ' ' + b.mesureLibelle.toLowerCase() + (cm.obj !== null ? ' sur ' + unites(cm.obj) : '') }), h('span', { text: ' · ' + ordinal(rang) + ' sur ' + tri.length })]),
        h('div.mini', { text: (cm.obj !== null ? (cm.n >= cm.obj ? 'Objectif atteint' : resteTxt(rm)) : 'Pas d\'objectif ce mois-ci') + (rang > 1 ? ' · ' + (devant > 0 ? 'à ' + unites(devant) + ' du ' + ordinal(rang - 1) : 'à égalité avec le ' + ordinal(rang - 1)) : ' · en tête') })
      ]), cm.obj !== null ? h('div.barre-moi', [barre(cm.n, cm.obj, rm.attendu, rm.couleur, true)]) : null]));
    }

    /* Podium des trois premiers (au moins une unité) */
    var podium = tri.filter(function (r) { return chiffres(r, type, mesure).n > 0; }).slice(0, 3);
    if (podium.length >= 2 && !this.q) {
      var places = [podium[1], podium[0], podium[2]].filter(Boolean);
      this.elPodium.appendChild(h('div.bv-podium', places.map(function (r) {
        var pos = tri.indexOf(r) + 1, c = chiffres(r, type, mesure), rr = rythme(c.n, c.obj, j);
        return h('button.bv-place.p' + pos + (r.cle === b.moi ? '.moi' : ''), { type: 'button', onclick: function () { self.detail(b, r); } }, [
          h('div.medaille', { text: String(pos) }), avatar(r, pos === 1 ? 64 : 52),
          h('div.nom', { text: r.nom }),
          h('div.gros', [h('b', { text: unites(c.n) }), c.obj !== null ? h('span', { text: ' / ' + unites(c.obj) }) : null]),
          h('div.detail', { text: 'neuf ' + unites(chiffres(r, 'neuf', mesure).n) + ' · occasion ' + unites(chiffres(r, 'usage', mesure).n) }),
          c.obj !== null ? barre(c.n, c.obj, rr.attendu, rr.couleur) : null,
          h('div.socle')
        ]);
      })));
    }

    /* Classement */
    var regle = !!d.peutRegler;
    var lignes = tri.map(function (r, i) {
      var ci = chiffres(r, type, mesure), ryi = rythme(ci.n, ci.obj, j);
      var cN = chiffres(r, 'neuf', mesure), cU = chiffres(r, 'usage', mesure);
      var ecart = i > 0 ? chiffres(tri[i - 1], type, mesure).n - ci.n : 0;
      var aLivR = type === 'neuf' ? r.neuf.aLivrer : (type === 'usage' ? r.usage.aLivrer : r.total.aLivrer);
      return h('button.bv-ligne' + (r.cle === b.moi ? '.moi' : ''), { type: 'button', onclick: function () { self.detail(b, r); } }, [
        h('div.c-rang', [h('b', { text: String(i + 1) }), fleche(r, type)]),
        h('div.c-nom', [avatar(r, 36), h('div', [
          h('div.nom', [h('span', { text: r.nom }), r.cle === b.moi ? h('span.badge.vert.sans-point', { text: 'vous' }) : null, regle && r.genre === 'inconnu' ? h('span.badge.ambre.sans-point', { text: 'à identifier', title: r.raison || '' }) : null]),
          h('div.mini', { text: (type === 'total' ? 'neuf ' + unites(cN.n) + ' · occasion ' + unites(cU.n) : '') + (aLivR ? (type === 'total' ? ' · ' : '') + '+' + unites(aLivR) + ' à livrer' : '') })
        ])]),
        h('div.c-total', [h('b', { text: unites(ci.n) }), ci.obj !== null ? h('span', { text: '/ ' + unites(ci.obj) }) : null]),
        h('div.c-barre', [barre(ci.n, ci.obj, ryi.attendu, ryi.couleur), h('div.mini', [ci.obj !== null ? h('span', { text: ryi.pct + ' %' }) : h('span', { text: 'pas d\'objectif' }), ci.obj !== null && !j.passe && ci.n < ci.obj ? h('span', { text: ' · ' + resteTxt(ryi, true) }) : null])]),
        h('div.c-etat', [pastilleEtat(ryi, true), h('div.mini', { text: i > 0 ? (ecart > 0 ? 'à ' + unites(ecart) + ' du ' + ordinal(i) : 'à égalité') : (tri.length > 1 ? 'en tête' : '') })]),
        h('div.c-courbe', [courbe(r.parJour, d.aujourdhui, d.mois, ryi.couleur === 'gris' ? 'bleu' : ryi.couleur), h('div.mini', { text: 'proj. ' + unites(ryi.proj) })]),
        h('div.c-num', [h('span.t', 'RDR'), h('b', { text: unites(r.neuf.rdr) })]),
        d.montants ? h('div.c-num.montant', [h('span.t', 'Front / u.'), h('b', { text: argent(r.profit && r.profit.frontMoyen) })]) : null,
        d.montants ? h('div.c-num.montant', [h('span.t', 'F&I / u.'), h('b', { text: argent(r.profit && r.profit.fiMoyen) })]) : null,
        h('div.c-num', [h('span.t', moisLib(d.moisPrec).split(' ')[0].slice(0, 4) + '.'), h('b', { text: unites(type === 'neuf' ? r.prec.neuf : (type === 'usage' ? r.prec.usage : r.prec.neuf + r.prec.usage)) })])
      ]);
    });
    this.elListe.appendChild(h('div.carte-entete', [h('h2', ['Classement des représentants', h('span.sous', { text: b.mesureLibelle + ' ' + libType + ' · ' + (j.passe ? 'mois terminé' : 'il reste ' + joursAFaire(j)) })])]));
    if (!tri.length) this.elListe.appendChild(h('div.carte-corps', [h('p.doux', { text: this.q ? 'Aucun représentant pour « ' + this.q + ' ».' : 'Aucune vente de représentant au Livre des ventes ce mois-ci.' })]));
    else this.elListe.appendChild(h('div.bv-classement' + (d.montants ? '.avec-montants' : ''), lignes));
    this.elListe.appendChild(h('div.carte-corps.mini.bv-note', { text: 'Barre : la couleur suit le rythme (vert en avance ou atteint, bleu dans le rythme, ambre un peu en retard, rouge en retard) ; le trait = où il faudrait être aujourd\'hui. ▲ ▼ = rang gagné ou perdu depuis hier. Une vente partagée au livre (« Julie / Marc ») compte une demi-unité chacun ; le wholesale ne compte pas. ' + (mesure === 'livrees' ? 'Compte les ventes livrées (date de livraison du livre).' : (mesure === 'vendues' ? 'Compte les ventes par date de vente.' : 'Compte les RDR du neuf (livre et portail du constructeur).')) }));

    /* Fil des dernières livraisons */
    var fil = b.fil || [];
    this.elFil.appendChild(h('div.carte-entete', [h('h2', [mesure === 'vendues' ? 'Dernières ventes' : (mesure === 'rdr' ? 'Derniers RDR' : 'Dernières livraisons')])]));
    if (!fil.length) this.elFil.appendChild(h('div.carte-corps', [h('p.doux', 'Rien encore ce mois-ci.')]));
    else this.elFil.appendChild(h('ul.bv-fil-liste', fil.slice(0, 12).map(function (e) {
      return h('li', [h('span.q', { text: quand(e.d, d.aujourdhui) }), h('div', [h('b', { text: e.qui }), h('div.mini', { text: e.vehicule || (e.stock ? '# ' + e.stock : '') })]), h('span.type.' + (e.type === 'neuf' ? 'neuf' : 'occ'), { text: e.type === 'neuf' ? 'Neuf' : 'Occasion' })]);
    })));

    /* Direction : qui n'est pas au classement, qui reste à identifier */
    if (regle) this.rendreTri(b);
  };

  Board.prototype.rendreTri = function (b) {
    var self = this, autres = b.autres || [], inconnus = b.representants.filter(function (r) { return r.genre === 'inconnu'; });
    if (!autres.length && !inconnus.length) return;
    var marquer = function (r, vend, btn) {
      btn.disabled = true;
      AMX.post({ action: 'boardRepresentant', compagnie: b.compagnie, cle: r.cle, nom: r.nom, vend: vend }, { secours: false }).then(function (x) {
        if (!x || x.ok === false || x.refuse) throw new Error((x && x.erreur) || 'Refusé');
        AMX.toast(r.nom + (vend === 'oui' ? ' : représentant' : (vend === 'non' ? ' : ne vend pas' : ' : automatique')), 'ok'); oublier(); self.charger(true, true);
      }).catch(function (e) { btn.disabled = false; AMX.toast(AMX.erreurTexte(e), 'erreur'); });
    };
    var ligne = function (r, boutons) { return h('li', [avatar(r, 28), h('div', [h('b', { text: r.nom }), h('div.mini', { text: (r.raison || '') + ' · ' + unites(r.total.livrees) + ' livrée(s), ' + unites(r.total.vendues) + ' vendue(s)' })]), h('div.btns', boutons)]); };
    var corps = [];
    if (inconnus.length) corps.push(h('div.bloc-tri', [h('h3', { text: 'À identifier (' + inconnus.length + ') — au classement, sans compte ScanAutomax reconnu' }), h('ul', inconnus.map(function (r) {
      var b1 = h('button.btn.petit', { type: 'button', text: 'C\'est un représentant' }), b2 = h('button.btn.petit', { type: 'button', text: 'Ne vend pas d\'autos' });
      b1.onclick = function () { marquer(r, 'oui', b1); }; b2.onclick = function () { marquer(r, 'non', b2); };
      return ligne(r, [b1, b2]);
    }))]));
    if (autres.length) corps.push(h('div.bloc-tri', [h('h3', { text: 'Ne vendent pas d\'autos (' + autres.length + ') — comptés dans les totaux de la concession, pas au classement' }), h('ul', autres.map(function (r) {
      var b1 = h('button.btn.petit', { type: 'button', text: r.vend === 'non' ? 'Remettre en automatique' : 'C\'est un représentant' });
      b1.onclick = function () { marquer(r, r.vend === 'non' ? '' : 'oui', b1); };
      return ligne(r, [b1]);
    }))]));
    this.elTri.appendChild(h('details.carte.bv-tri', inconnus.length ? { open: true } : {}, [h('summary', { text: 'Qui est représentant ? ' + (inconnus.length ? inconnus.length + ' à identifier · ' : '') + autres.length + ' hors classement' }), h('div.carte-corps', corps)]));
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
    /* les comptes de vendeur pas encore au livre ce mois-ci (la direction, le F&I, le service ne sont pas des représentants) */
    (b.comptes || []).forEach(function (c) { if (c.role && c.role !== 'vendeur') return; if (!noms[c.cle]) noms[c.cle] = { cle: c.cle, nom: c.nom, objectif: null, compte: true }; });
    var cles = Object.keys(noms).filter(function (k) { return k !== '(sans conseiller)'; }).sort(function (a, c) { return String(noms[a].nom).localeCompare(String(noms[c].nom), 'fr'); });
    var champ = function (v, montant) { return h('input.saisie.num', { type: 'text', inputmode: montant ? 'numeric' : 'decimal', value: v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','), placeholder: '—', style: { width: montant ? '110px' : '70px' } }); };
    var lignes = cles.map(function (k) {
      var r = noms[k], o = r.objectif || {};
      var c = { neuf: champ(o.neuf), usage: champ(o.usage), profit: d.montants ? champ(o.profit, true) : null };
      return { cle: k, nom: r.nom, champs: c, el: h('tr', [h('td', [h('b', { text: r.nom }), r.compte && !r.objectif && !r.total ? h('div.mini', { text: 'compte de vendeur, pas encore au livre ce mois-ci' }) : null]), h('td', [c.neuf]), h('td', [c.usage])].concat(d.montants ? [h('td', [c.profit])] : [])) };
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
    var reps = b.representants.filter(function (r) { return r.cle !== '(sans conseiller)'; }).concat((b.autres || []).map(function (r) { return Object.assign({ hors: true }, r); }));
    var corps = h('div', [h('p.doux', { text: 'Chaque nom du livre est rattaché à un compte ScanAutomax de la concession : un compte de vendeur est représentant ; direction, F&I, service et BDC ne sont pas classés (leurs ventes restent dans les totaux). Tranchez à la main au besoin, réunissez deux façons d\'écrire le même nom, ou masquez un ancien employé.' })]);
    var table = h('tbody');
    reps.forEach(function (r) {
      var selVend = h('select.saisie', [h('option', { value: '', text: 'Automatique' }), h('option', { value: 'oui', text: 'Représentant' }), h('option', { value: 'non', text: 'Ne vend pas d\'autos' })]);
      selVend.value = r.vend || '';
      selVend.onchange = function () {
        AMX.post({ action: 'boardRepresentant', compagnie: b.compagnie, cle: r.cle, nom: r.nom, vend: selVend.value }, { secours: false }).then(function (x) { if (!x || x.ok === false || x.refuse) throw new Error((x && x.erreur) || 'Refusé'); AMX.toast(r.nom + ' : ' + selVend.options[selVend.selectedIndex].text.toLowerCase(), 'ok'); oublier(); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
      };
      var selFusion = h('select.saisie', [h('option', { value: '', text: 'Réunir avec…' })].concat(reps.filter(function (x) { return x.cle !== r.cle; }).map(function (x) { return h('option', { value: x.cle, text: x.nom }); })));
      selFusion.onchange = function () {
        var vers = reps.filter(function (x) { return x.cle === selFusion.value; })[0]; if (!vers) return;
        AMX.confirmer('Réunir les noms ?', '« ' + r.nom + ' » comptera pour ' + vers.nom + ' (ventes, objectifs, board).', { ok: 'Réunir' }).then(function (ok) { if (ok) { m.fermer(); self.fusionner(b, vers.cle, vers.nom, [r.nom].concat(r.variantes || [])); } else selFusion.value = ''; });
      };
      var selCompte = h('select.saisie', [h('option', { value: '', text: '— reconnaissance automatique —' })].concat((b.comptes || []).map(function (c) { return h('option', { value: c.courriel, text: c.nom }); })));
      if (r.courriel && (b.comptes || []).some(function (c) { return c.courriel === r.courriel; })) selCompte.value = r.courriel;
      selCompte.onchange = function () {
        AMX.post({ action: 'boardRepresentant', compagnie: b.compagnie, cle: r.cle, nom: r.nom, courriel: selCompte.value }, { secours: false }).then(function (x) { if (!x || x.ok === false || x.refuse) throw new Error((x && x.erreur) || 'Refusé'); AMX.toast('Compte lié', 'ok'); oublier(); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
      };
      var masquer = h('button.btn.petit', { type: 'button', text: 'Masquer', title: 'Ancien employé : plus de ligne vide les mois sans vente', onclick: function () {
        AMX.post({ action: 'boardRepresentant', compagnie: b.compagnie, cle: r.cle, nom: r.nom, actif: 'non' }, { secours: false }).then(function (x) { if (!x || x.ok === false || x.refuse) throw new Error((x && x.erreur) || 'Refusé'); AMX.toast(r.nom + ' masqué', 'ok'); masquer.disabled = true; oublier(); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
      } });
      table.appendChild(h('tr', [
        h('td', [h('b', { text: r.nom }), h('div.mini', { text: (r.raison || '') + (r.variantes && r.variantes.length ? ' · au livre : ' + r.variantes.join(', ') : '') })]),
        h('td', [selVend]), h('td', [selCompte]), h('td', [selFusion]), h('td', [masquer])]));
    });
    corps.appendChild(h('div', { style: { overflowX: 'auto', maxHeight: '60vh' } }, [h('table.tableau', [h('thead', [h('tr', [h('th', 'Nom au livre'), h('th', 'Vend des autos ?'), h('th', 'Compte ScanAutomax'), h('th', 'Même personne'), h('th', '')])]), table])]));
    var m = AMX.modale({ titre: 'Représentants — ' + b.nom, corps: corps, large: true, boutons: [{ texte: 'Fermer', action: function (f) { f(); self.charger(true, true); } }] });
  };

  /* ------------------------------ Écran télé ------------------------------ */
  /* Sombre, sans montants, lisible de loin ; alterne Total / Neuf / Occasion aux 15 s ; relu aux 2 min ; une nouvelle
     livraison du fil interrompt l'écran 7 s pour la célébrer. */
  var VUES_TELE = ['total', 'neuf', 'usage'];
  Board.prototype.ouvrirTele = function () {
    var self = this;
    if (this.tele) return;
    this.tele = h('div.bv-tele', { tabindex: '-1' });
    document.body.appendChild(this.tele);
    this.vueTele = 0; this.vusTele = null; this.fileFete = [];
    this.surTouche = function (e) { if (e.key === 'Escape') self.fermerTele(); };
    document.addEventListener('keydown', this.surTouche);
    try { if (this.tele.requestFullscreen) this.tele.requestFullscreen().catch(function () {}); } catch (e) {}
    this.rendreTele(true);
    this.horloge = setInterval(function () { self.vueTele = (self.vueTele + 1) % VUES_TELE.length; self.rendreTele(false); }, 15000);
    this.releveTele = setInterval(function () { if (!self.detruit) self.charger(true, true); }, 2 * 60000);
  };
  Board.prototype.fermerTele = function () {
    if (!this.tele) return;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    clearInterval(this.horloge); clearInterval(this.releveTele); clearTimeout(this.minuterieFete);
    document.removeEventListener('keydown', this.surTouche);
    if (this.tele.parentNode) this.tele.parentNode.removeChild(this.tele);
    this.tele = null;
  };
  Board.prototype.rendreTele = function (donneesNeuves) {
    var self = this, d = this.donnees, el = this.tele; if (!el) return;
    AMX.vider(el);
    var fermer = h('button.bv-tele-fermer', { type: 'button', text: '× Fermer', onclick: function () { self.fermerTele(); } });
    if (!d) { el.appendChild(fermer); el.appendChild(h('p', 'Lecture…')); return; }
    var blocs = this.blocs(), heure = new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
    var type = blocs.length === 1 ? VUES_TELE[this.vueTele || 0] : 'total';
    var libType = { total: 'Neuf + occasion', neuf: 'Neuf', usage: 'Occasion' }[type];
    el.appendChild(h('div.bv-tele-tete', [h('div', [h('div.t1', { text: blocs.length === 1 ? blocs[0].nom : 'Groupe Automax' }), h('div.t2', { text: 'Board des ventes · ' + moisLib(d.mois) + (blocs.length === 1 ? ' · ' + libType : '') })]),
      blocs.length === 1 ? h('div.vues', VUES_TELE.map(function (v) { return h('span' + (v === type ? '.actif' : ''), { text: { total: 'Total', neuf: 'Neuf', usage: 'Occasion' }[v] }); })) : null,
      h('div.t3', { text: heure }), fermer]));
    if (blocs.length > 1) {
      el.appendChild(h('div.bv-tele-cies', blocs.slice().sort(function (a, b) { return ORDRE.indexOf(a.compagnie) - ORDRE.indexOf(b.compagnie); }).map(function (b) {
        var tot = { neuf: b.totaux.neuf, usage: b.totaux.usage, objectif: b.objectif }, c = chiffres(tot, 'total', b.mesure), ry = rythme(c.n, c.obj, b.jours);
        return h('div.bv-tele-cie', [h('div.nom', { text: b.nom }), h('div.bv-tele-anneau', [anneau(c.n, c.obj, ry.attendu, ry.couleur, 170, true), h('div.centre', [h('b', { text: unites(c.n) }), h('span', { text: c.obj !== null ? 'sur ' + unites(c.obj) : b.mesureLibelle.toLowerCase() })])]),
          h('div.info', { text: 'neuf ' + unites(chiffres(tot, 'neuf', b.mesure).n) + ' · occasion ' + unites(chiffres(tot, 'usage', b.mesure).n) })]);
      })));
      el.appendChild(h('div.bv-tele-pied', { text: 'Mis à jour à ' + heure + ' · Échap pour fermer' }));
      return;
    }
    var b = blocs[0], j = b.jours, mesure = b.mesure;
    var tot1 = { neuf: b.totaux.neuf, usage: b.totaux.usage, objectif: b.objectif }, cT = chiffres(tot1, type, mesure), ry = rythme(cT.n, cT.obj, j);
    var tri = b.representants.slice().sort(function (a, c) { return chiffres(c, type, mesure).n - chiffres(a, type, mesure).n || String(a.nom).localeCompare(String(c.nom), 'fr'); });
    var podium = tri.filter(function (r) { return chiffres(r, type, mesure).n > 0; }).slice(0, 3);
    var corps = h('div.bv-tele-corps');
    var gauche = h('div.bv-tele-g');
    gauche.appendChild(h('div.bv-tele-total', [h('div.bv-tele-anneau', [anneau(cT.n, cT.obj, ry.attendu, ry.couleur, 190, true), h('div.centre', [h('b', { text: unites(cT.n) }), h('span', { text: cT.obj !== null ? 'sur ' + unites(cT.obj) : b.mesureLibelle.toLowerCase() })])]),
      h('div.txt', [h('div.etat.' + ry.couleur, { text: (ETATS[ry.etat].signe ? ETATS[ry.etat].signe + ' ' : '') + ETATS[ry.etat].texte }), h('div', { text: j.passe ? 'Mois terminé' : 'Il reste ' + joursAFaire(j) }), cT.obj !== null && cT.n < cT.obj && !j.passe ? h('div', { text: resteTxt(ry) }) : null, h('div', { text: 'Projection : ' + unites(ry.proj) })])]));
    if (podium.length) gauche.appendChild(h('div.bv-tele-podium', [podium[1], podium[0], podium[2]].filter(Boolean).map(function (r) {
      var pos = tri.indexOf(r) + 1, c = chiffres(r, type, mesure);
      return h('div.place.p' + pos, [h('div.med', { text: String(pos) }), avatar(r, pos === 1 ? 90 : 70), h('div.nom', { text: r.nom }), h('div.n', { text: unites(c.n) + (c.obj !== null ? ' / ' + unites(c.obj) : '') })]);
    })));
    corps.appendChild(gauche);
    var milieu = h('div.bv-tele-liste', tri.slice(0, 12).map(function (r, i) {
      var c = chiffres(r, type, mesure), rr = rythme(c.n, c.obj, j);
      return h('div.bv-tele-ligne', [h('span.r', { text: String(i + 1) }), fleche(r, type), avatar(r, 40), h('span.nom', { text: r.nom }),
        h('span.b', [barre(c.n, c.obj, rr.attendu, rr.couleur, true)]), h('span.t', { text: unites(c.n) + (c.obj !== null ? ' / ' + unites(c.obj) : '') })]);
    }));
    corps.appendChild(milieu);
    var fil = (b.fil || []).slice(0, 8);
    corps.appendChild(h('div.bv-tele-fil', [h('div.titre', { text: mesure === 'vendues' ? 'Dernières ventes' : 'Dernières livraisons' })].concat(fil.map(function (e) {
      return h('div.ev', [h('span.q', { text: quand(e.d, d.aujourdhui) }), h('div', [h('b', { text: e.qui }), h('div', { text: e.vehicule || '' })]), h('span.type.' + (e.type === 'neuf' ? 'neuf' : 'occ'), { text: e.type === 'neuf' ? 'N' : 'O' })]);
    }))));
    el.appendChild(corps);
    el.appendChild(h('div.bv-tele-pied', { text: 'Mis à jour à ' + heure + ' · relu aux 2 minutes · Échap pour fermer' }));

    /* Célébration : une livraison du fil qu'on n'avait pas encore vue depuis l'ouverture de l'écran télé. */
    if (donneesNeuves) {
      var cles = (b.fil || []).map(function (e) { return e.d + '|' + e.qui + '|' + (e.stock || e.vehicule); });
      if (this.vusTele === null) this.vusTele = {};
      else cles.forEach(function (k, i) { if (!self.vusTele[k]) self.fileFete.push(b.fil[i]); });
      cles.forEach(function (k) { self.vusTele[k] = true; });
      this.feter(b);
    }
  };
  Board.prototype.feter = function (b) {
    var self = this;
    if (!this.tele || this.feteEnCours || !this.fileFete.length) return;
    var e = this.fileFete.shift(), nb = (b.fil || []).length;
    var nRep = b.representants.filter(function (r) { return r.nom === e.qui; })[0];
    var nTot = chiffres({ neuf: b.totaux.neuf, usage: b.totaux.usage }, 'total', b.mesure).n;
    var fete = h('div.bv-fete', [h('div.cartef', [
      h('div.confettis', { html: Array.apply(null, Array(36)).map(function (x, i) { return '<i style="left:' + ((i * 37) % 100) + '%;animation-delay:' + ((i % 9) * 0.12).toFixed(2) + 's;background:' + ['#2DB862', '#5B9BEA', '#E8A33A', '#fff', '#F0605A'][i % 5] + '"></i>'; }).join('') }),
      h('div.sur', { text: b.mesure === 'vendues' ? 'Nouvelle vente !' : 'Nouvelle livraison !' }),
      nRep ? avatar(nRep, 110) : null,
      h('div.qui', { text: e.qui }), h('div.quoi', { text: (e.vehicule || '') + ' · ' + (e.type === 'neuf' ? 'neuf' : 'occasion') }),
      h('div.rang', { text: ordinal(Math.round(nTot)) + ' ' + (b.mesure === 'vendues' ? 'vente' : 'livraison') + ' du mois pour ' + b.nom })
    ])]);
    this.feteEnCours = true;
    this.tele.appendChild(fete);
    this.minuterieFete = setTimeout(function () { if (fete.parentNode) fete.parentNode.removeChild(fete); self.feteEnCours = false; self.feter(b); }, 7000);
    void nb;
  };

  /* ------------------------------ Export ------------------------------ */
  Board.prototype.exporter = function () {
    var d = this.donnees, self = this; if (!d) return;
    if (typeof XLSX === 'undefined') { AMX.toast('Excel pas disponible sur cette page.', 'attention'); return; }
    var lignes = [];
    this.blocs().forEach(function (b) {
      b.representants.forEach(function (r) {
        var o = { Concession: b.nom, Mois: d.mois, Rang: r.rang || '', 'Représentant': r.nom, 'Noms au livre': (r.variantes || []).join(', '),
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

  AMX.board = { charger: charger, oublier: oublier, rythme: rythme, chiffres: chiffres };

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
      /* avatars, états, barres */
      '.bv-av { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; color: #fff; font-weight: 700; letter-spacing: .02em; flex: 0 0 auto; box-shadow: 0 0 0 2px rgba(255,255,255,.9); }',
      '.bv-etat { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }',
      '.bv-etat.vert { color: var(--vert-fonce); background: var(--vert-clair); } .bv-etat.bleu { color: var(--bleu); background: var(--bleu-bg); } .bv-etat.ambre { color: var(--ambre); background: var(--ambre-bg); } .bv-etat.rouge { color: var(--rouge); background: var(--rouge-bg); } .bv-etat.gris { color: var(--encre-3); background: var(--fond-2, #F3F5F7); font-weight: 600; }',
      '.bv-barre { position: relative; height: 10px; border-radius: 6px; background: var(--fond-2, #EEF1F4); min-width: 90px; }',
      '.bv-barre.grosse { height: 14px; border-radius: 8px; }',
      '.bv-barre .rempli { position: absolute; left: 0; top: 0; bottom: 0; border-radius: inherit; background: var(--encre-4); transition: width .6s ease; }',
      '.bv-barre.vert .rempli { background: linear-gradient(90deg, #12A150, var(--vert-vif, #2DB862)); } .bv-barre.bleu .rempli { background: linear-gradient(90deg, #1A64BF, #5B9BEA); } .bv-barre.ambre .rempli { background: linear-gradient(90deg, #C27B12, #E8A33A); } .bv-barre.rouge .rempli { background: linear-gradient(90deg, #C0281C, #F0605A); }',
      '.bv-barre .repere { position: absolute; top: -4px; bottom: -4px; width: 2px; background: var(--encre-1, #141A1F); border-radius: 1px; }',
      '.bv-anneau { display: inline-block; line-height: 0; }',
      '.bv-courbe { display: inline-block; line-height: 0; }',
      '.bv-fl { font-size: 12px; font-weight: 700; min-width: 26px; } .bv-fl.monte { color: var(--vert); } .bv-fl.baisse { color: var(--rouge); } .bv-fl.zero { color: var(--encre-4); }',
      /* bandeau */
      '.bv-hero { position: relative; display: flex; gap: 28px; align-items: center; border-radius: 16px; padding: 22px 26px; margin: 4px 0 14px; color: #fff; background: radial-gradient(800px 360px at 90% -30%, rgba(45,184,98,.30), transparent 60%), radial-gradient(500px 260px at 0% 120%, rgba(29,111,209,.22), transparent 60%), linear-gradient(135deg, var(--noir, #141A1F) 0%, var(--noir-2, #1E272E) 60%, #243039 100%); box-shadow: 0 14px 40px rgba(16,24,40,.20); }',
      '.bv-hero-anneau, .bv-cie-anneau, .bv-tele-anneau { position: relative; flex: 0 0 auto; }',
      '.bv-hero-anneau .centre, .bv-cie-anneau .centre, .bv-tele-anneau .centre { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; }',
      '.bv-hero-anneau .centre b { font-size: 40px; font-weight: 800; font-variant-numeric: tabular-nums; } .bv-hero-anneau .centre span { font-size: 13px; color: #B8C4CD; } .bv-hero-anneau .centre em { font-style: normal; font-size: 13px; font-weight: 700; color: #fff; margin-top: 2px; }',
      '.bv-hero-texte { flex: 1; min-width: 0; } .bv-hero-texte .sur { font-size: 13px; color: #9FB0BC; } .bv-hero-texte .titre { font-size: 22px; font-weight: 800; margin: 2px 0 8px; }',
      '.bv-hero .ligne-etat { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 14px; color: #DCE4EA; margin-bottom: 14px; }',
      '.bv-hero .bv-etat.vert { background: rgba(45,184,98,.22); color: #7FE3A4; } .bv-hero .bv-etat.bleu { background: rgba(91,155,234,.22); color: #A9CBF5; } .bv-hero .bv-etat.ambre { background: rgba(232,163,58,.22); color: #F5C77E; } .bv-hero .bv-etat.rouge { background: rgba(240,96,90,.22); color: #F7A29E; } .bv-hero .bv-etat.gris { background: rgba(255,255,255,.1); color: #C8D3DB; }',
      '.bv-hero-stats { display: flex; flex-wrap: wrap; gap: 10px; }',
      '.bv-stat { display: flex; flex-direction: column; min-width: 92px; padding: 8px 12px; border-radius: 10px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.08); }',
      '.bv-stat .t { font-size: 12px; color: #9FB0BC; } .bv-stat b { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; } .bv-stat .b { font-size: 12px; color: #9FB0BC; }',
      '.bv-hero-courbe { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 12px; color: #9FB0BC; }',
      /* votre mois */
      '.bv-moi { display: flex; gap: 14px; align-items: center; padding: 12px 16px; border-radius: 12px; margin: 0 0 14px; background: var(--fond-2, #F3F5F7); border-left: 5px solid var(--encre-4); }',
      '.bv-moi .txt { flex: 1; min-width: 0; } .bv-moi .barre-moi { flex: 0 1 260px; }',
      '.bv-moi.vert { border-left-color: var(--vert); background: var(--vert-clair); } .bv-moi.bleu { border-left-color: var(--bleu); background: var(--bleu-bg); } .bv-moi.ambre { border-left-color: var(--ambre); background: var(--ambre-bg); } .bv-moi.rouge { border-left-color: var(--rouge); background: var(--rouge-bg); }',
      /* podium */
      '.bv-podium { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: end; margin: 0 0 14px; max-width: 820px; }',
      '.bv-place { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 14px 0; border: 1px solid var(--trait, #E3E7EB); border-radius: 14px; background: var(--fond-carte, #fff); cursor: pointer; font: inherit; color: inherit; overflow: hidden; }',
      '.bv-place:hover { border-color: var(--vert); } .bv-place.moi { box-shadow: 0 0 0 2px var(--vert) inset; }',
      '.bv-place .medaille { position: absolute; top: 10px; left: 12px; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; color: #fff; }',
      '.bv-place.p1 .medaille { background: linear-gradient(135deg, #E9B949, #B9861C); } .bv-place.p2 .medaille { background: linear-gradient(135deg, #C9D1D8, #8C98A3); } .bv-place.p3 .medaille { background: linear-gradient(135deg, #D79A63, #9A5B2C); }',
      '.bv-place .nom { font-weight: 700; text-align: center; } .bv-place .gros b { font-size: 30px; font-weight: 800; font-variant-numeric: tabular-nums; } .bv-place .gros span { color: var(--encre-3); font-size: 16px; } .bv-place .detail { font-size: 12px; color: var(--encre-3); }',
      '.bv-place .bv-barre { width: 80%; margin: 4px 0; }',
      '.bv-place .socle { align-self: stretch; margin-top: 10px; height: 10px; } .bv-place.p1 .socle { height: 28px; background: linear-gradient(180deg, rgba(233,185,73,.25), rgba(233,185,73,.05)); } .bv-place.p2 .socle { height: 16px; background: rgba(140,152,163,.12); } .bv-place.p3 .socle { height: 8px; background: rgba(154,91,44,.10); }',
      '.bv-place.p1 { padding-top: 22px; border-color: #E9B949; }',
      /* grille principale */
      '.bv-grille { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; align-items: start; }',
      '.bv-classement { display: flex; flex-direction: column; }',
      '.bv-ligne { display: grid; grid-template-columns: 54px minmax(180px, 1.6fr) 74px minmax(150px, 1.3fr) 128px 104px 54px 54px; gap: 12px; align-items: center; padding: 10px 16px; border: 0; border-top: 1px solid var(--trait, #E3E7EB); background: transparent; text-align: left; font: inherit; color: inherit; cursor: pointer; width: 100%; }',
      '.bv-classement.avec-montants .bv-ligne { grid-template-columns: 54px minmax(180px, 1.6fr) 74px minmax(150px, 1.3fr) 128px 104px 54px 84px 84px 54px; }',
      '.bv-ligne:hover { background: var(--fond-2, #F6F8FA); } .bv-ligne.moi { background: var(--vert-clair); }',
      '.bv-ligne .c-rang { display: flex; align-items: baseline; gap: 6px; } .bv-ligne .c-rang b { font-size: 18px; font-weight: 800; color: var(--encre-2, #2B3640); min-width: 20px; text-align: right; }',
      '.bv-ligne .c-nom { display: flex; align-items: center; gap: 10px; min-width: 0; } .bv-ligne .c-nom .nom { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-weight: 700; }',
      '.bv-ligne .c-total { display: flex; align-items: baseline; gap: 4px; } .bv-ligne .c-total b { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; } .bv-ligne .c-total span { color: var(--encre-3); font-size: 13px; }',
      '.bv-ligne .c-barre .mini { margin-top: 4px; } .bv-ligne .c-etat .mini { margin-top: 4px; }',
      '.bv-ligne .c-num { display: flex; flex-direction: column; align-items: flex-end; font-variant-numeric: tabular-nums; } .bv-ligne .c-num .t { font-size: 11px; color: var(--encre-3); text-transform: uppercase; letter-spacing: .03em; } .bv-ligne .c-num b { font-size: 15px; }',
      '.bv-note { border-top: 1px solid var(--trait, #E3E7EB); }',
      /* fil */
      '.bv-fil-liste { list-style: none; margin: 0; padding: 4px 0; } .bv-fil-liste li { display: grid; grid-template-columns: 64px 1fr auto; gap: 8px; align-items: center; padding: 8px 14px; border-top: 1px solid var(--trait, #E3E7EB); } .bv-fil-liste li:first-child { border-top: 0; }',
      '.bv-fil-liste .q { font-size: 12px; color: var(--encre-3); } .bv-fil-liste b { font-size: 14px; }',
      '.type { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 999px; } .type.neuf { color: var(--bleu); background: var(--bleu-bg); } .type.occ { color: var(--sarcelle); background: var(--sarcelle-bg); }',
      /* tri (direction) */
      '.bv-tri summary { cursor: pointer; padding: 12px 16px; font-weight: 700; } .bv-tri h3 { font-size: 13px; margin: 6px 0; color: var(--encre-2, #2B3640); } .bv-tri ul { list-style: none; margin: 0 0 10px; padding: 0; }',
      '.bv-tri li { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; padding: 6px 0; border-top: 1px solid var(--trait, #E3E7EB); } .bv-tri .btns { display: flex; gap: 6px; flex-wrap: wrap; }',
      /* toutes les concessions */
      '.bv-cies { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }',
      '.bv-cie { display: flex; flex-direction: column; gap: 10px; text-align: left; padding: 14px 16px; border: 1px solid var(--trait, #E3E7EB); border-radius: 14px; background: var(--fond-carte, #fff); font: inherit; color: inherit; cursor: pointer; }',
      '.bv-cie:hover { border-color: var(--vert); box-shadow: 0 6px 20px rgba(16,24,40,.08); }',
      '.bv-cie-tete { display: flex; justify-content: space-between; gap: 8px; align-items: center; } .bv-cie-corps { display: flex; gap: 16px; align-items: center; }',
      '.bv-cie-anneau .centre b { font-size: 24px; font-weight: 800; } .bv-cie-anneau .centre span { font-size: 11px; color: var(--encre-3); }',
      '.bv-cie-chiffres { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; flex: 1; } .bv-cie-chiffres div { display: flex; flex-direction: column; } .bv-cie-chiffres span { font-size: 11px; color: var(--encre-3); } .bv-cie-chiffres b { font-variant-numeric: tabular-nums; }',
      '.bv-cie-pied { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--encre-2, #2B3640); border-top: 1px solid var(--trait, #E3E7EB); padding-top: 8px; }',
      '.bv-objectifs input.num { text-align: right; }',
      '.bv-objectifs tr.bv-ligne-cie td { border-top: 2px solid var(--trait, #E3E7EB); }',
      /* téléphone */
      '@media (max-width: 1180px) { .bv-grille { grid-template-columns: minmax(0, 1fr); } .bv-ligne .c-courbe { display: none; } .bv-ligne, .bv-classement.avec-montants .bv-ligne { grid-template-columns: 54px minmax(160px, 1.6fr) 70px minmax(140px, 1.3fr) 128px 54px 54px; } .bv-classement.avec-montants .bv-ligne .montant { display: none; } }',
      '@media (max-width: 760px) { .bv-hero { flex-direction: column; align-items: flex-start; padding: 18px; } .bv-podium { gap: 8px; } .bv-place .gros b { font-size: 22px; } .bv-place .detail, .bv-place .bv-barre { display: none; }',
      '  .bv-ligne, .bv-classement.avec-montants .bv-ligne { grid-template-columns: 40px 1fr auto; grid-template-areas: "r n t" "r b b"; row-gap: 6px; padding: 10px 12px; }',
      '  .bv-ligne .c-rang { grid-area: r; flex-direction: column; } .bv-ligne .c-nom { grid-area: n; } .bv-ligne .c-total { grid-area: t; } .bv-ligne .c-barre { grid-area: b; } .bv-ligne .c-etat, .bv-ligne .c-num, .bv-ligne .c-courbe { display: none; } .bv-moi { flex-wrap: wrap; } .bv-moi .barre-moi { flex-basis: 100%; } }',
      /* écran télé */
      '.bv-tele { position: fixed; inset: 0; z-index: 9000; background: radial-gradient(1200px 600px at 85% -20%, rgba(45,184,98,.18), transparent 60%), #0D1216; color: #fff; padding: 26px 36px; overflow: auto; font-size: 22px; display: flex; flex-direction: column; }',
      '.bv-tele-tete { display: flex; align-items: center; gap: 24px; margin-bottom: 18px; } .bv-tele-tete > div:first-child { flex: 1; }',
      '.bv-tele .t1 { font-size: 36px; font-weight: 800; } .bv-tele .t2 { font-size: 20px; color: #9FB0BC; } .bv-tele .t3 { font-size: 40px; font-weight: 700; font-variant-numeric: tabular-nums; color: #DCE4EA; }',
      '.bv-tele .vues { display: flex; gap: 6px; } .bv-tele .vues span { font-size: 15px; padding: 5px 12px; border-radius: 999px; color: #9FB0BC; border: 1px solid #2E3A43; } .bv-tele .vues span.actif { background: #2DB862; border-color: #2DB862; color: #06210F; font-weight: 800; }',
      '.bv-tele-fermer { background: transparent; border: 1px solid #44525C; color: #9FB0BC; border-radius: 8px; padding: 8px 14px; font-size: 16px; cursor: pointer; }',
      '.bv-tele-corps { flex: 1; display: grid; grid-template-columns: 370px minmax(0, 1fr) 300px; gap: 20px; min-height: 0; }',
      '.bv-tele-total { display: flex; gap: 18px; align-items: center; background: #151D23; border-radius: 16px; padding: 18px; }',
      '.bv-tele-anneau .centre b { font-size: 52px; font-weight: 800; } .bv-tele-anneau .centre span { font-size: 16px; color: #9FB0BC; }',
      '.bv-tele-total .txt { font-size: 17px; color: #C8D3DB; display: flex; flex-direction: column; gap: 6px; } .bv-tele-total .etat { font-weight: 800; font-size: 20px; } .bv-tele-total .etat.vert { color: #7FE3A4; } .bv-tele-total .etat.bleu { color: #A9CBF5; } .bv-tele-total .etat.ambre { color: #F5C77E; } .bv-tele-total .etat.rouge { color: #F7A29E; }',
      '.bv-tele-podium { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; align-items: end; margin-top: 18px; }',
      '.bv-tele-podium .place { display: flex; flex-direction: column; align-items: center; gap: 6px; background: #151D23; border-radius: 14px; padding: 14px 8px; position: relative; } .bv-tele-podium .place.p1 { padding-top: 22px; border: 1px solid #E9B949; }',
      '.bv-tele-podium .med { position: absolute; top: 8px; left: 10px; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; } .bv-tele-podium .p1 .med { background: #E9B949; color: #2A1E00; } .bv-tele-podium .p2 .med { background: #C9D1D8; color: #1C232A; } .bv-tele-podium .p3 .med { background: #D79A63; color: #2B1606; }',
      '.bv-tele-podium .nom { font-size: 19px; font-weight: 700; text-align: center; } .bv-tele-podium .n { font-size: 30px; font-weight: 800; font-variant-numeric: tabular-nums; }',
      '.bv-tele .bv-av { box-shadow: 0 0 0 3px #0D1216; }',
      '.bv-tele-liste { display: flex; flex-direction: column; gap: 8px; } .bv-tele-ligne { display: grid; grid-template-columns: 34px 40px 40px minmax(130px, 1.5fr) minmax(80px, 1fr) auto; gap: 12px; align-items: center; background: #151D23; border-radius: 12px; padding: 10px 16px; }',
      '.bv-tele-ligne .r { font-size: 26px; color: #9FB0BC; font-weight: 800; text-align: right; } .bv-tele-ligne .nom { font-size: 25px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .bv-tele-ligne .t { text-align: right; font-size: 28px; font-weight: 800; font-variant-numeric: tabular-nums; }',
      '.bv-tele .bv-fl { font-size: 18px; } .bv-tele .bv-fl.monte { color: #7FE3A4; } .bv-tele .bv-fl.baisse { color: #F7A29E; } .bv-tele .bv-fl.zero { color: #4E5C66; }',
      '.bv-tele .bv-barre { background: #26313A; } .bv-tele .bv-barre .repere { background: #fff; }',
      '.bv-tele-fil { background: #151D23; border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; overflow: hidden; } .bv-tele-fil .titre { font-size: 18px; color: #9FB0BC; text-transform: uppercase; letter-spacing: .06em; }',
      '.bv-tele-fil .ev { display: grid; grid-template-columns: 92px 1fr auto; gap: 10px; align-items: center; font-size: 17px; } .bv-tele-fil .ev .q { color: #9FB0BC; font-size: 15px; } .bv-tele-fil .ev b { font-size: 19px; } .bv-tele-fil .ev div div { color: #9FB0BC; font-size: 15px; }',
      '.bv-tele .type.neuf { background: rgba(91,155,234,.2); color: #A9CBF5; } .bv-tele .type.occ { background: rgba(11,113,137,.3); color: #8FD3E3; }',
      '.bv-tele-cies { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; } .bv-tele-cie { background: #151D23; border-radius: 16px; padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; } .bv-tele-cie .nom { font-size: 24px; font-weight: 700; } .bv-tele-cie .info { color: #C8D3DB; font-size: 18px; }',
      '.bv-tele-pied { margin-top: 14px; font-size: 14px; color: #6B7B86; }',
      '.bv-fete { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(6,12,16,.82); animation: bvApparait .4s ease; z-index: 2; }',
      '.bv-fete .cartef { position: relative; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 70px; border-radius: 24px; background: linear-gradient(135deg, #0B3B23, #12603A); box-shadow: 0 30px 80px rgba(0,0,0,.5); overflow: hidden; text-align: center; animation: bvRebond .6s cubic-bezier(.2,1.4,.4,1); }',
      '.bv-fete .sur { font-size: 28px; font-weight: 800; color: #7FE3A4; text-transform: uppercase; letter-spacing: .08em; } .bv-fete .qui { font-size: 54px; font-weight: 800; } .bv-fete .quoi { font-size: 26px; color: #DCE4EA; } .bv-fete .rang { font-size: 20px; color: #B8E8C8; }',
      '.bv-fete .confettis { position: absolute; inset: 0; pointer-events: none; } .bv-fete .confettis i { position: absolute; top: -12px; width: 8px; height: 14px; border-radius: 2px; animation: bvTombe 2.4s linear infinite; opacity: .9; }',
      '@keyframes bvTombe { 0% { transform: translateY(-20px) rotate(0); } 100% { transform: translateY(520px) rotate(540deg); } }',
      '@keyframes bvApparait { from { opacity: 0; } to { opacity: 1; } } @keyframes bvRebond { from { transform: scale(.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }',
      '@media (prefers-reduced-motion: reduce) { .bv-fete .confettis { display: none; } .bv-fete, .bv-fete .cartef { animation: none; } .bv-barre .rempli { transition: none; } }',
      '@media (max-width: 1600px) { .bv-tele-ligne .bv-av { display: none; } .bv-tele-ligne { grid-template-columns: 34px 40px minmax(130px, 1.5fr) minmax(80px, 1fr) auto; } }',
      '@media (max-width: 1280px) { .bv-tele-corps { grid-template-columns: 340px minmax(0, 1fr); } .bv-tele-fil { display: none; } }',
      '@media (max-width: 860px) { .bv-tele { padding: 16px; font-size: 16px; } .bv-tele-corps { grid-template-columns: 1fr; } .bv-tele-ligne { grid-template-columns: 30px 30px 1fr 90px; } .bv-tele-ligne .bv-av, .bv-tele-ligne .b { display: none; } }'
    ].join('\n');
    document.head.appendChild(s);
  }
})();
