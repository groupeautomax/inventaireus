/* ScanAutomax — Vente › Ventes (21 oct. 2026)
   Maxime : « je cherche à utiliser l'app et le site pour remplir le livre des ventes plutôt que de remplir le
   livre des ventes lui-même. » Le conseiller déclare la vente ici (client, véhicule, date, type, prix) ; le
   directeur commercial la complète (profit front prévu, F&I prévu, pneus, accessoires, paiement) ; ScanAutomax
   écrit la ligne dans le Livre des ventes Google de la concession et relit ce que la comptabilité y inscrit
   (Comptabilisé, profit réel). Routes : GET ?ventes=1 · ?venteVin= ; POST venteDeclarer · venteCompleter ·
   venteAnnuler · venteRenvoyer · venteRelire · venteLivreCreer (Vente.gs via RoutesAjout.gs). */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour (Vente.gs) : redéployez-le.';
  var TYPES = { neuf: 'Neuf', usage: 'Usagé', wholesale: 'Wholesale' };
  var CATEGORIES = {
    neuf: [['stock', 'Stock'], ['locate', 'Locate'], ['commande', 'Commande'], ['demo', 'Démo'], ['courtoisie', 'Courtoisie'], ['fleet', 'Flotte']],
    usage: [['certifie', 'Certifié'], ['noncertifie', 'Non certifié'], ['autremarque', 'Autre marque'], ['rachat', 'Rachat de bail']],
    wholesale: [['achat', 'Achat revendu'], ['echange', 'Échange revendu'], ['lmb', 'LMB']]
  };
  var PAIEMENTS = [['financement', 'Financement'], ['location', 'Location'], ['comptant', 'Comptant']];
  var ETATS = { declaree: 'À compléter', completee: 'Au livre', comptabilisee: 'Comptabilisée', annulee: 'Annulée' };
  var PERIODES = [['', '60 jours'], ['mois', 'Ce mois'], ['precedent', 'Mois dernier'], ['tout', 'Tout']];

  function isoLocal(d) { var p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function moisDe(periode) {
    var d = new Date();
    if (periode === 'mois') return isoLocal(d).slice(0, 7);
    if (periode === 'precedent') { d.setDate(1); d.setMonth(d.getMonth() - 1); return isoLocal(d).slice(0, 7); }
    return periode === 'tout' ? 'tout' : '';
  }
  function nombre(x) { if (x === null || x === undefined || x === '') return null; var s = String(x).replace(/\s| | /g, '').replace(/\$/g, ''); var neg = /^\(.*\)$/.test(s) || s.indexOf('-') >= 0; s = s.replace(/[()\-]/g, ''); var v = s.lastIndexOf(','), pt = s.lastIndexOf('.'); if (v >= 0 && pt >= 0) { if (v > pt) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); } else if (v >= 0) s = s.replace(',', '.'); var n = parseFloat(s); return isNaN(n) ? null : (neg ? -n : n); }
  function argent(n) { return n === null || n === undefined || n === '' || isNaN(n) ? '—' : AMX.fmtArgent(n); }
  function libCategorie(type, c) { var l = CATEGORIES[type] || []; for (var i = 0; i < l.length; i++) if (l[i][0] === c) return l[i][1]; return c || ''; }
  function libPaiement(p) { for (var i = 0; i < PAIEMENTS.length; i++) if (PAIEMENTS[i][0] === p) return PAIEMENTS[i][1]; return p || ''; }
  function vehiculeTexte(v) { return v.vehicule || [v.annee, v.marque, v.modele, v.version].filter(Boolean).join(' ') || v.modeleTexte || ''; }

  /* ------------------------------ Cache et appels ------------------------------ */
  var cache = { rep: null, quand: 0, cle: '', cleEnCours: '', promesse: null, copieLe: 0 };
  function cleDe(cie, mois) { return String(cie || '') + '|' + String(mois || ''); }
  function verifier(d) {
    if (!d) throw new Error('Aucune réponse');
    if (d.refuse) throw new Error(d.erreur || 'Accès refusé.');
    if (d.ok === false) throw new Error(d.erreur || 'Le serveur a refusé.');
    if (!Array.isArray(d.ventes) || !d.etats) throw new Error(SCRIPT_PAS_A_JOUR);
    return d;
  }
  function verifierPost(r) {
    if (!r) throw new Error('Aucune réponse');
    if (r.refuse) throw new Error(r.erreur || 'Action refusée pour ce compte.');
    if (r.ok === false) { var e = new Error(r.erreur || 'Le serveur a refusé.'); e.code = r.code; e.vente = r.vente; throw e; }
    if (!r.vente && r.vehicules) throw new Error(SCRIPT_PAS_A_JOUR);
    return r;
  }
  AMX.ventes = {
    charger: function (cie, mois, force) {
      var cle = cleDe(cie, mois);
      if (!force && cache.rep && cache.cle === cle && Date.now() - cache.quand < 45000) return Promise.resolve(cache.rep);
      if (cache.promesse && cache.cleEnCours === cle) return cache.promesse;
      var params = { ventes: 1 }; if (cie) params.compagnie = cie; if (mois) params.mois = mois; if (force === 'relire') params.relire = 1;
      cache.cleEnCours = cle;
      cache.promesse = AMX.get(params, { copie: 'ventes_' + cle.replace(/[^A-Za-z0-9]/g, '_'), secours: false, delai: 60000 }).then(function (d) {
        cache.promesse = null; cache.cleEnCours = '';
        verifier(d);
        cache.rep = d; cache.quand = Date.now(); cache.cle = cle; cache.copieLe = 0;
        document.dispatchEvent(new CustomEvent('amx:ventes'));
        return d;
      }, function (e) { cache.promesse = null; cache.cleEnCours = ''; throw e; });
      return cache.promesse;
    },
    copie: function (cie, mois) { return AMX.cacheLocal.lireGz('ventes_' + cleDe(cie, mois).replace(/[^A-Za-z0-9]/g, '_'), 7 * 86400000); },
    enCache: function () { return cache.rep; },
    invalider: function () { cache.quand = 0; },
    poser: function (v) {
      if (!cache.rep || !v) return;
      if (v.type === 'neuf' && AMX.neufs && AMX.neufs.charger && AMX.neufs.enCache()) setTimeout(function () { AMX.neufs.charger(true).catch(function () {}); }, 150);   /* le serveur a marqué le neuf « Vendu » (ou l'a démarqué) */
      var i = cache.rep.ventes.findIndex(function (x) { return x.id === v.id; });
      if (i >= 0) cache.rep.ventes[i] = v; else cache.rep.ventes.unshift(v);
      var n = { declaree: 0, completee: 0, comptabilisee: 0, annulee: 0, erreurLivre: 0 };
      cache.rep.ventes.forEach(function (x) { if (n[x.statut] !== undefined) n[x.statut]++; if (x.livre === 'erreur') n.erreurLivre++; });
      cache.rep.compte = n;
      document.dispatchEvent(new CustomEvent('amx:ventes'));
    },
    peutDeclarer: function () { var p = AMX.session && AMX.session.perms; if (cache.rep && cache.rep.peutDeclarer !== undefined) return !!cache.rep.peutDeclarer; if (p && p.ventesDeclarer !== undefined) return !!p.ventesDeclarer; return AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.estAdmin(); },
    peutCompleter: function () { var p = AMX.session && AMX.session.perms; if (cache.rep && cache.rep.peutCompleter !== undefined) return !!cache.rep.peutCompleter; if (p && p.ventesCompleter !== undefined) return !!p.ventesCompleter; return AMX.perm('modifierMontants') || AMX.estAdmin(); },
    montants: function () { if (cache.rep && cache.rep.montants !== undefined) return !!cache.rep.montants; return AMX.ventes.peutCompleter() || AMX.perm('voirResultats') || AMX.perm('modifierMontants'); },
    compteur: function () { var d = cache.rep; if (!d) return ''; var cie = AMX.compagnieChoisie('inventaire'); var n = d.ventes.filter(function (v) { return v.statut === 'declaree' && (!cie || v.compagnie === cie); }).length; return n || ''; },
    parVin: function (vin) { var d = cache.rep; vin = String(vin || '').toUpperCase(); if (!d || !vin) return null; return d.ventes.filter(function (v) { return v.vin === vin && v.statut !== 'annulee'; })[0] || null; },
    // Ouvrir la fenêtre « Déclarer une vente » depuis n'importe quelle page (ligne d'un neuf, panneau d'un usagé) :
    // prefill = { compagnie, type, vin, stock, annee, marque, modele, version, modeleTexte, coutant }.
    declarer: function (prefill) { return ouvrirFormulaire(prefill || {}, null); },
    completer: function (v) { return ouvrirFormulaire({}, v); },
    annuler: function (v) { return modaleAnnuler(v); },
    monter: function (conteneur, ctx) { return new VueVentes(conteneur, ctx); }
  };

  function injecterCss() {
    if (document.getElementById('css-ventes')) return;
    var s = document.createElement('style');
    s.id = 'css-ventes';
    s.textContent = [
      '.ventes-page .kpis { margin-bottom: 12px; }',
      '.ventes-filtres { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }',
      '.ventes-filtres input { height: 32px; min-width: 220px; }',
      '.ventes-table td.vehicule .nom { font-weight: 600; } .ventes-table td.vehicule .vin { font-family: var(--mono); font-size: 11px; color: var(--encre-3); }',
      '.ventes-table td .sous { font-size: 11.5px; color: var(--encre-3); }',
      '.ventes-table tr.annulee td { color: var(--encre-4); text-decoration: line-through; } .ventes-table tr.annulee td .puce, .ventes-table tr.annulee td .btn { text-decoration: none; }',
      '.ventes-table td.etat { white-space: nowrap; }',
      '.ventes-table td.actions { white-space: nowrap; text-align: right; }',
      '.ventes-table td.actions .btn { margin-left: 4px; }',
      '.ventes-vide { padding: 28px; text-align: center; color: var(--encre-3); }',
      '.ventes-form .champ { margin-bottom: 10px; }',
      '.ventes-form .grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px 12px; }',
      '.ventes-form .grille .large { grid-column: 1 / -1; }',
      '.ventes-form h4 { margin: 14px 0 8px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); display: flex; align-items: center; gap: 8px; }',
      '.ventes-form h4::after { content: ""; flex: 1; height: 1px; background: var(--ligne); }',
      '.ventes-vehicule { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }',
      '.ventes-vehicule .champ { flex: 1 1 220px; margin: 0; }',
      '.ventes-trouve { margin: 6px 0 12px; padding: 8px 12px; border-radius: var(--rayon-s); background: var(--vert-clair); border: 1px solid #B6E0C6; font-size: 12.5px; }',
      '.ventes-trouve.gris { background: var(--carte-2); border-color: var(--ligne); color: var(--encre-3); }',
      '.ventes-aide { font-size: 12px; color: var(--encre-3); margin: 0 0 10px; line-height: 1.5; }',
      '.ventes-livre { font-size: 12px; color: var(--encre-3); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 8px; }',
      '.ventes-fiche dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; font-size: 12.5px; }',
      '.ventes-fiche dt { color: var(--encre-3); } .ventes-fiche dd { margin: 0; }',
      '.ventes-fiche .journal { margin-top: 10px; font-size: 11.5px; color: var(--encre-3); } .ventes-fiche .journal li { margin: 2px 0; }',
      '@media (max-width: 760px) { .ventes-table th:nth-child(5), .ventes-table td:nth-child(5), .ventes-table th:nth-child(6), .ventes-table td:nth-child(6) { display: none; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ Section ------------------------------ */
  AMX.section('ventes', {
    titre: 'Ventes', icone: 'vente', ordre: 12,
    visible: function () { return AMX.perm('consulter') || AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.estAdmin(); },
    onglets: [{ id: 'liste', titre: 'Ventes', compteur: function () { return AMX.ventes.compteur(); } }],
    monter: function (conteneur, ctx) { return new VueVentes(conteneur, ctx); }
  });

  function VueVentes(conteneur, ctx) {
    var self = this;
    injecterCss();
    this.conteneur = conteneur;
    this.params = (ctx && ctx.params) || {};
    this.compagnie = AMX.compagnieChoisie('inventaire');
    this.periode = String(AMX.memo.lire('ventes_periode', '') || '');
    this.filtres = { etat: this.params.etat || '', type: '', recherche: '' };
    this.construire();
    this.charger(false);
    this.sur = function () { self.rendre(); AMX.rafraichirSousBarre(); };
    this.surCompagnie = function (e) { self.compagnie = (e.detail && e.detail.compagnie) || ''; self.charger(false); };
    this.surProfil = function () { self.compagnie = AMX.compagnieChoisie('inventaire'); self.rendreCies(); self.rendre(); };   /* les droits et la portée arrivent après le premier rendu */
    document.addEventListener('amx:ventes', this.sur);
    document.addEventListener('amx:compagnie', this.surCompagnie);
    document.addEventListener('amx:profil', this.surProfil);
    if (this.params.nouvelle) setTimeout(function () { AMX.ventes.declarer({ compagnie: self.compagnie }); }, 60);
    if (this.params.id) setTimeout(function () { self.ouvrirId(self.params.id); }, 60);
  }
  VueVentes.prototype.demonter = function () { document.removeEventListener('amx:ventes', this.sur); document.removeEventListener('amx:compagnie', this.surCompagnie); document.removeEventListener('amx:profil', this.surProfil); };
  VueVentes.prototype.naviguer = function (ctx) { this.params = (ctx && ctx.params) || {}; if (this.params.etat !== undefined) this.filtres.etat = this.params.etat; if (this.params.nouvelle) AMX.ventes.declarer({ compagnie: this.compagnie }); if (this.params.id) this.ouvrirId(this.params.id); this.rendre(); };

  VueVentes.prototype.construire = function () {
    var self = this;
    var page = h('div.page.ventes-page');
    this.elSous = h('p', 'Chargement…');
    this.elActions = h('div.actions');
    page.appendChild(h('div.entete-page', [h('div', [h('h1', 'Ventes'), this.elSous]), this.elActions]));
    this.elCies = h('div.barre-cies');
    this.elKpis = h('div.kpis');
    this.elFiltres = h('div.ventes-filtres');
    this.elListe = h('div');
    page.appendChild(this.elCies); page.appendChild(this.elKpis); page.appendChild(this.elFiltres); page.appendChild(this.elListe);
    this.conteneur.appendChild(page);
    this.rendreEntete();
    this.rendreCies();
  };
  VueVentes.prototype.rendreEntete = function () {
    var self = this, d = cache.rep;
    AMX.vider(this.elActions);
    if (AMX.ventes.peutDeclarer()) this.elActions.appendChild(h('button.btn.primaire#ventes-nouvelle', { type: 'button', onclick: function () { AMX.ventes.declarer({ compagnie: self.compagnie }); } }, [AMX.svg('plus'), ' Déclarer une vente']));
    var livre = d && d.livres && self.compagnie ? d.livres[self.compagnie] : null;
    if (livre && livre.url) this.elActions.appendChild(h('a.btn#ventes-livre', { href: livre.url, target: '_blank', rel: 'noopener', title: livre.titre }, [AMX.svg('externe'), ' Ouvrir le livre']));
    if (livre && livre.aCreer && d.admin) this.elActions.appendChild(h('button.btn#ventes-creer-livre', { type: 'button', onclick: function () { self.creerLivre(); } }, [AMX.svg('plus'), ' Créer le livre de ' + (AMX.COMPAGNIES_TOUTES[self.compagnie] || self.compagnie)]));
    if (self.compagnie) this.elActions.appendChild(h('button.btn#ventes-relire', { type: 'button', title: 'Relire tout de suite ce que la comptabilité a inscrit dans le livre (Comptabilisé, profit réel)', onclick: function () { self.relire(); } }, [AMX.svg('rafraichir'), ' Relire le livre']));
    this.elActions.appendChild(h('button.btn', { type: 'button', title: 'Rafraîchir', onclick: function () { self.charger(true); } }, [AMX.svg('rafraichir')]));
  };
  VueVentes.prototype.rendreCies = function () {
    var self = this, d = cache.rep;
    var seg = h('div.segment.petit', PERIODES.map(function (p) { return h('button' + (self.periode === p[0] ? '.actif' : ''), { type: 'button', 'data-periode': p[0], text: p[1], onclick: function () { self.periode = p[0]; AMX.memo.ecrire('ventes_periode', p[0]); self.rendreCies(); self.charger(false); } }); }));
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.compagnie, extra: [seg],
      compte: function (code) { if (!d || !cache.cle || cache.cle.split('|')[0] !== '') return null; var n = d.ventes.filter(function (v) { return v.statut === 'declaree' && (!code || v.compagnie === code); }).length; return n || null; },
      onchange: function (code) { self.compagnie = code; self.charger(false); } });
  };
  VueVentes.prototype.charger = function (force) {
    var self = this, cie = this.compagnie, mois = moisDe(this.periode);
    if (!cache.rep || cache.cle !== cleDe(cie, mois)) {
      if (!cache.rep) this.elListe.appendChild(AMX.chargeur('Ventes'));
      AMX.ventes.copie(cie, mois).then(function (o) { if (o && o.donnees && (!cache.rep || cache.cle !== cleDe(cie, mois))) { try { verifier(o.donnees); cache.rep = o.donnees; cache.cle = cleDe(cie, mois); cache.quand = 0; cache.copieLe = o.quand; self.rendre(); } catch (e) {} } }).catch(function () {});
    }
    AMX.ventes.charger(cie, mois, force).then(function () { self.rendre(); if (force === true) AMX.toast('Ventes mises à jour', 'ok'); }, function (e) {
      var msg = AMX.erreurTexte(e);
      self.elSous.textContent = /route|absent|inconnue|pas à jour/i.test(msg) ? 'Route absente — redéployez le script (Vente.gs).' : msg;
      if (!cache.rep) { AMX.vider(self.elListe); self.elListe.appendChild(h('div.carte', [h('div.ventes-vide', { text: msg })])); }
      else AMX.toast('Ventes : mise à jour impossible (' + msg + ') — copie affichée', 'erreur');
    });
  };
  VueVentes.prototype.relire = function () {
    var self = this;
    AMX.post({ action: 'venteRelire', compagnie: this.compagnie }, { delai: 90000 }).then(function (r) {
      if (!r || !r.ok) { AMX.toast((r && r.erreur) || 'Relecture impossible', 'erreur'); return; }
      AMX.toast(r.message || 'Livre relu', 'ok'); self.charger(true);
    }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  VueVentes.prototype.creerLivre = function () {
    var self = this, nom = AMX.COMPAGNIES_TOUTES[self.compagnie] || self.compagnie;
    AMX.confirmer('Créer le livre de ' + nom, 'ScanAutomax crée un classeur Google « Livre des ventes ' + nom + ' 2026 » (onglets Neuf, Occasion, Wholesale, section Comptabilité) et le partage en édition avec vous et la comptabilité de la concession. Les ventes déclarées ici y seront écrites.', { ok: 'Créer le livre' }).then(function (ok) {
      if (!ok) return;
      AMX.post({ action: 'venteLivreCreer', compagnie: self.compagnie }, { delai: 90000 }).then(function (r) {
        if (!r || !r.ok) { AMX.toast((r && r.erreur) || 'Création refusée', 'erreur'); return; }
        AMX.toast(r.message || 'Livre créé', 'ok', 8000); self.charger(true);
      }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
    });
  };

  VueVentes.prototype.rendre = function () {
    var self = this, d = cache.rep;
    this.rendreEntete();
    if (!d) return;
    var n = d.compte || {}, total = d.ventes.length;
    var copie = cache.copieLe ? 'Copie du ' + AMX.copieTexte(cache.copieLe) + ' — mise à jour en cours… · ' : '';
    this.elSous.textContent = copie + (total ? total + ' vente' + (total > 1 ? 's' : '') + (n.declaree ? ' · ' + n.declaree + ' à compléter' : '') + (n.comptabilisee ? ' · ' + n.comptabilisee + ' comptabilisée' + (n.comptabilisee > 1 ? 's' : '') : '') + (n.erreurLivre ? ' · ' + n.erreurLivre + ' pas au livre' : '') : 'Aucune vente déclarée pour cette période.') + (d.relu && d.relu.le && !d.relu.duCache ? ' · livre relu à ' + AMX.fmtDate(d.relu.le, true).split(' ').pop() : '');
    if (!cache.copieLe && cache.cle && cache.cle.split('|')[0] !== this.compagnie) { /* la réponse est d'une autre concession : on attend */ }
    AMX.vider(this.elKpis);
    var kpi = function (etat, libelle, valeur, cls) {
      return h('div.kpi' + (cls ? '.' + cls : '') + (self.filtres.etat === etat ? '.actif' : ''), { role: 'button', tabindex: '0', 'data-etat': etat, onclick: function () { self.filtres.etat = self.filtres.etat === etat ? '' : etat; self.rendre(); } }, [h('div.valeur', { text: String(valeur || 0) }), h('div.libelle', { text: libelle })]);
    };
    this.elKpis.appendChild(kpi('declaree', 'À compléter', n.declaree, n.declaree ? 'alerte' : ''));
    this.elKpis.appendChild(kpi('completee', 'Au livre', n.completee, ''));
    this.elKpis.appendChild(kpi('comptabilisee', 'Comptabilisées', n.comptabilisee, ''));
    this.elKpis.appendChild(kpi('annulee', 'Annulées', n.annulee, ''));
    if (n.erreurLivre) this.elKpis.appendChild(kpi('erreur', 'Pas au livre', n.erreurLivre, 'alerte'));
    if (d.montants) {
      var actives = d.ventes.filter(function (v) { return v.statut !== 'annulee'; });
      var front = actives.reduce(function (s, v) { return s + (nombre(v.profitReel !== null && v.profitReel !== undefined ? v.profitReel : v.profitPrevu) || 0); }, 0), fi = actives.reduce(function (s, v) { return s + (nombre(v.profitFIReel !== null && v.profitFIReel !== undefined ? v.profitFIReel : v.profitFIPrevu) || 0); }, 0);
      this.elKpis.appendChild(h('div.kpi.neutre', [h('div.valeur', { text: argent(front + fi) }), h('div.libelle', 'Profit (front + F&I)'), h('div.sous', { text: 'front ' + argent(front) + ' · F&I ' + argent(fi) + ' · réel quand inscrit, sinon prévu' })]));
    }
    AMX.vider(this.elFiltres);
    var segType = h('div.segment', [['', 'Tous'], ['neuf', 'Neufs'], ['usage', 'Usagés'], ['wholesale', 'Wholesale']].map(function (t) { return h('button' + (self.filtres.type === t[0] ? '.actif' : ''), { type: 'button', 'data-type': t[0], text: t[1], onclick: function () { self.filtres.type = t[0]; self.rendre(); } }); }));
    var rech = h('input.saisie#ventes-recherche', { type: 'search', placeholder: 'Client, NIV, # stock, conseiller…', value: this.filtres.recherche });
    rech.addEventListener('input', function () { self.filtres.recherche = rech.value; self.rendreListe(); });
    this.elFiltres.appendChild(segType); this.elFiltres.appendChild(rech);
    if (typeof XLSX !== 'undefined') this.elFiltres.appendChild(h('button.btn.petit#ventes-export', { type: 'button', onclick: function () { self.exporter(); } }, [AMX.svg('telecharger'), ' Excel']));
    this.rendreListe();
  };
  VueVentes.prototype.visibles = function () {
    var d = cache.rep; if (!d) return [];
    var f = this.filtres, q = (f.recherche || '').trim().toLowerCase();
    return d.ventes.filter(function (v) {
      if (f.etat === 'erreur') { if (v.livre !== 'erreur') return false; }
      else if (f.etat && v.statut !== f.etat) return false;
      if (f.type && v.type !== f.type) return false;
      if (q && [v.client, v.venduA, v.vin, v.stock, v.conseiller, v.directeur, vehiculeTexte(v), v.id].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  };
  function puceEtat(v) {
    if (v.statut === 'annulee') return h('span.puce', { text: 'Annulée', title: v.annuleRaison || '' });
    if (v.statut === 'comptabilisee') return h('span.puce.ok', { text: 'Comptabilisée' + (v.comptabiliseLe ? ' · ' + AMX.fmtDateCourte(v.comptabiliseLe) : '') });
    if (v.statut === 'declaree') return h('span.puce.alerte', { text: 'À compléter', title: 'Le directeur commercial doit inscrire profit prévu, F&I, pneus, accessoires, paiement' });
    if (v.livre !== 'ecrit') return h('span.puce.info', { text: 'Complétée', title: 'Complétée, mais pas encore écrite dans le livre (voir la colonne Livre)' });
    return h('span.puce.info', { text: 'Au livre', title: 'Écrite dans le livre, en attente de la comptabilité' });
  }
  function puceLivre(v) {
    if (v.livre === 'erreur') return h('span.puce.alerte', { text: 'Pas au livre', title: v.livreErreur || '' });
    if (v.livre === 'ecrit' && v.livreLigne) return h('a.puce.mono', { href: v.livreUrl || '#', target: '_blank', rel: 'noopener', text: 'ligne ' + v.livreLigne, title: (v.livreOnglet || '') + ' — ouvrir le livre', onclick: function (e) { e.stopPropagation(); } });
    return h('span.puce', { text: '—' });
  }
  VueVentes.prototype.rendreListe = function () {
    var self = this, d = cache.rep; if (!d) return;
    var liste = this.visibles(), montants = !!d.montants;
    AMX.vider(this.elListe);
    if (!liste.length) {
      this.elListe.appendChild(h('div.carte', [h('div.ventes-vide', [h('div', { text: (this.filtres.etat || this.filtres.type || this.filtres.recherche) ? 'Aucune vente pour ce filtre.' : 'Aucune vente déclarée pour cette période.' }),
        AMX.ventes.peutDeclarer() ? h('button.btn.primaire', { type: 'button', style: { marginTop: '10px' }, onclick: function () { AMX.ventes.declarer({ compagnie: self.compagnie }); } }, [AMX.svg('plus'), ' Déclarer une vente']) : null])]));
      return;
    }
    var entete = h('tr', [h('th', 'Date'), h('th', 'Véhicule'), h('th', 'Client'), h('th', 'Type'), h('th', 'Conseiller'), h('th', 'Dir. comm.')].concat(montants ? [h('th.num', 'Prix'), h('th.num', 'Front'), h('th.num', 'F&I')] : []).concat([h('th', 'Livre'), h('th', 'État'), h('th', '')]));
    var corps = h('tbody');
    liste.forEach(function (v) {
      var tr = h('tr.cliquable' + (v.statut === 'annulee' ? '.annulee' : ''), { dataset: { id: v.id } }, [
        h('td', [h('div', { text: AMX.fmtDateCourte(v.dateVente) }), v.dateLivraison ? h('div.sous', { text: 'livr. ' + AMX.fmtDateCourte(v.dateLivraison) }) : null]),
        h('td.vehicule', [h('div.nom', { text: vehiculeTexte(v) || '(véhicule à préciser)' }), h('div.vin', { text: [v.stock ? '# ' + v.stock : '', v.vin].filter(Boolean).join(' · ') })]),
        h('td', [h('div', { text: v.client || v.venduA || '—' }), v.type === 'wholesale' && v.acheteDe ? h('div.sous', { text: 'acheté de ' + v.acheteDe }) : (v.echangeStock || v.echangeModele ? h('div.sous', { text: 'échange ' + [v.echangeStock, v.echangeModele].filter(Boolean).join(' ') }) : null)]),
        h('td', [h('span.badge.' + (v.type === 'neuf' ? 'vert' : (v.type === 'usage' ? 'bleu' : 'ambre')) + '.sans-point', { text: TYPES[v.type] || v.type }), h('div.sous', { text: libCategorie(v.type, v.categorie) + (v.paiement ? ' · ' + libPaiement(v.paiement) : '') })]),
        h('td', { text: v.conseiller || '—' }),
        h('td', { text: v.directeur || '—' })
      ].concat(montants ? [
        h('td.num', { text: argent(v.prixVente) }),
        h('td.num', [h('div', { text: argent(v.profitReel !== null && v.profitReel !== undefined ? v.profitReel : v.profitPrevu) }), v.profitReel !== null && v.profitReel !== undefined ? h('div.sous', { text: 'prévu ' + argent(v.profitPrevu) }) : (v.profitPrevu !== null && v.profitPrevu !== undefined ? h('div.sous', 'prévu') : null)]),
        h('td.num', [h('div', { text: argent(v.profitFIReel !== null && v.profitFIReel !== undefined ? v.profitFIReel : v.profitFIPrevu) }), v.pneus === 'oui' ? h('div.sous', 'pneus') : null])
      ] : []).concat([
        h('td', [puceLivre(v)]),
        h('td.etat', [puceEtat(v)]),
        h('td.actions', [
          v.statut === 'declaree' && AMX.ventes.peutCompleter() ? h('button.btn.petit.primaire.ventes-completer', { type: 'button', text: 'Compléter', onclick: function (e) { e.stopPropagation(); AMX.ventes.completer(v); } }) : null,
          v.livre === 'erreur' && (AMX.ventes.peutDeclarer() || AMX.ventes.peutCompleter()) ? h('button.btn.petit.ventes-renvoyer', { type: 'button', text: 'Renvoyer au livre', onclick: function (e) { e.stopPropagation(); renvoyer(v); } }) : null
        ])
      ]));
      tr.addEventListener('click', function () { self.ouvrir(v); });
      corps.appendChild(tr);
    });
    this.elListe.appendChild(h('table.tableau.ventes-table', [h('thead', [entete]), corps]));
  };
  VueVentes.prototype.ouvrirId = function (id) { var d = cache.rep; var v = d ? d.ventes.filter(function (x) { return x.id === id; })[0] : null; if (v) this.ouvrir(v); };
  VueVentes.prototype.ouvrir = function (v) {
    var d = cache.rep, montants = !!(d && d.montants);
    var l = [['Concession', AMX.COMPAGNIES_TOUTES[v.compagnie] || v.compagnie], ['Type', (TYPES[v.type] || v.type) + ' · ' + libCategorie(v.type, v.categorie)], ['Date de vente', AMX.fmtDate(v.dateVente)], ['Livraison', v.dateLivraison ? AMX.fmtDate(v.dateLivraison) : '—'],
      [v.type === 'wholesale' ? 'Vendu à' : 'Client', v.client || v.venduA || '—'], v.telephone ? ['Téléphone', AMX.telephoneTexte ? AMX.telephoneTexte(v.telephone) : v.telephone] : null, v.courriel ? ['Courriel', v.courriel] : null,
      v.type === 'wholesale' ? ['Acheté de', v.acheteDe || '—'] : null, ['Véhicule', vehiculeTexte(v) || '—'], ['# Stock', v.stock || '—'], ['NIV', v.vin || '—'], ['Conseiller', v.conseiller || '—'], ['Dir. commercial', v.directeur || '—'],
      montants ? ['Prix de vente', argent(v.prixVente)] : null, montants ? ['Profit front prévu', argent(v.profitPrevu)] : null, montants ? ['Profit F&I prévu', argent(v.profitFIPrevu)] : null,
      montants && v.profitReel !== null && v.profitReel !== undefined ? ['Profit front réel', argent(v.profitReel)] : null, montants && v.profitFIReel !== null && v.profitFIReel !== undefined ? ['Profit F&I réel', argent(v.profitFIReel)] : null,
      ['Pneus', v.pneus === 'oui' ? 'Oui' : (v.pneus === 'non' ? 'Non' : '—')], montants ? ['Accessoires', argent(v.accessoires)] : null, ['Paiement', libPaiement(v.paiement) || '—'],
      (v.echangeStock || v.echangeModele || v.echangeVin) ? ['Échange', [v.echangeStock, v.echangeModele, v.echangeVin].filter(Boolean).join(' · ')] : null, v.note ? ['Note', v.note] : null,
      ['Livre', v.livre === 'ecrit' ? (v.livreOnglet || '') + ' · ligne ' + v.livreLigne : (v.livre === 'erreur' ? 'PAS ÉCRITE — ' + (v.livreErreur || '') : 'pas encore écrite')],
      ['Déclarée', (v.declareParNom || v.declarePar || '') + (v.declareLe ? ' · ' + AMX.fmtDate(v.declareLe, true) : '')], v.completeLe ? ['Complétée', (v.completeParNom || v.completePar || '') + ' · ' + AMX.fmtDate(v.completeLe, true)] : null,
      v.statut === 'annulee' ? ['Annulée', v.annuleRaison || ''] : null].filter(Boolean);
    var corps = h('div.ventes-fiche', [
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' } }, [puceEtat(v), puceLivre(v), h('span.puce.mono', { text: v.id })]),
      h('dl', l.map(function (x) { return [h('dt', { text: x[0] }), h('dd', { text: String(x[1]) })]; })),
      v.journal && v.journal.length ? h('div.journal', [h('b', 'Historique'), h('ul', { style: { margin: '4px 0 0', paddingLeft: '16px' } }, v.journal.slice().reverse().map(function (j) { return h('li', { text: AMX.fmtDate(j.le, true) + ' — ' + j.quoi + (j.par ? ' (' + j.par + ')' : '') }); }))]) : null
    ]);
    var boutons = [];
    if (v.statut !== 'annulee' && v.statut !== 'comptabilisee') {
      if (AMX.ventes.peutCompleter()) boutons.push({ texte: v.statut === 'declaree' ? 'Compléter' : 'Modifier', classe: 'primaire', action: function (f) { f(); AMX.ventes.completer(v); return false; } });
      else if (AMX.ventes.peutDeclarer()) boutons.push({ texte: 'Modifier', action: function (f) { f(); AMX.ventes.completer(v); return false; } });
      if (v.livre === 'erreur') boutons.push({ texte: 'Renvoyer au livre', action: function (f) { f(); renvoyer(v); return false; } });
      if (AMX.ventes.peutCompleter() || AMX.ventes.peutDeclarer()) boutons.push({ texte: 'Annuler la vente…', classe: 'danger fantome', action: function (f) { f(); modaleAnnuler(v); return false; } });
    }
    if (v.livreUrl) boutons.push({ texte: 'Ouvrir le livre', action: function () { window.open(v.livreUrl, '_blank', 'noopener'); return false; } });
    boutons.push({ texte: 'Fermer' });
    AMX.modale({ titre: (vehiculeTexte(v) || 'Vente') + (v.client || v.venduA ? ' — ' + (v.client || v.venduA) : ''), corps: corps, boutons: boutons });
  };
  VueVentes.prototype.exporter = function () {
    var d = cache.rep, liste = this.visibles(), montants = !!(d && d.montants);
    var lignes = liste.map(function (v) {
      var o = { Id: v.id, Concession: v.compagnie, Type: TYPES[v.type] || v.type, 'Catégorie': libCategorie(v.type, v.categorie), 'État': ETATS[v.statut] || v.statut, 'Date vente': v.dateVente, 'Date livraison': v.dateLivraison, Client: v.client || v.venduA, 'Acheté de': v.acheteDe, 'Véhicule': vehiculeTexte(v), '# Stock': v.stock, NIV: v.vin, Conseiller: v.conseiller, 'Dir. commercial': v.directeur, Pneus: v.pneus, Paiement: libPaiement(v.paiement), 'Échange': [v.echangeStock, v.echangeModele].filter(Boolean).join(' '), Livre: v.livreOnglet, 'Ligne du livre': v.livreLigne || '', Note: v.note };
      if (montants) { o['Prix de vente'] = v.prixVente; o['Profit front prévu'] = v.profitPrevu; o['Profit F&I prévu'] = v.profitFIPrevu; o.Accessoires = v.accessoires; o['Profit front réel'] = v.profitReel; o['Profit F&I réel'] = v.profitFIReel; }
      return o;
    });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Ventes');
    XLSX.writeFile(wb, 'ventes-' + (this.compagnie || 'groupe') + '-' + isoLocal(new Date()) + '.xlsx');
  };

  /* ------------------------------ Actions ------------------------------ */
  function renvoyer(v) {
    return AMX.post({ action: 'venteRenvoyer', id: v.id }, { delai: 90000 }).then(function (r) {
      verifierPost(r); AMX.ventes.poser(r.vente); AMX.toast(r.message || 'Renvoyée', r.livre && r.livre.ok ? 'ok' : 'erreur', 6000); return true;
    }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
  }
  function modaleAnnuler(v) {
    var ta = h('textarea.saisie#vente-raison', { rows: '3', placeholder: 'Client désisté, refus de crédit, erreur de saisie…' });
    AMX.modale({
      titre: 'Annuler la vente ' + v.id, corps: h('div.ventes-form', [h('p.ventes-aide', { text: 'La ligne du livre reste, marquée « Annulé » avec CANCELLÉ dans les profits prévus, comme la comptabilité le fait déjà.' }), h('div.champ', [h('label', { 'for': 'vente-raison', text: 'Pourquoi ?' }), ta])]),
      boutons: [{ texte: 'Garder la vente' }, { texte: 'Annuler la vente', classe: 'danger', action: function () {
        var raison = ta.value.trim(); if (raison.length < 3) { AMX.toast('Dites pourquoi.', 'erreur'); ta.focus(); return false; }
        return AMX.post({ action: 'venteAnnuler', id: v.id, raison: raison }, { delai: 90000 }).then(function (r) { verifierPost(r); AMX.ventes.poser(r.vente); AMX.toast(r.message || 'Vente annulée', 'ok'); return true; }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
      } }]
    });
  }

  /* ------------------------------ Trouver le véhicule (neufs, registres) ------------------------------ */
  function chercherVehicule(cie, texte) {
    var q = String(texte || '').trim().toUpperCase().replace(/\s+/g, ''); if (!q) return null;
    var estVin = /^[A-HJ-NPR-Z0-9]{17}$/.test(q);
    var neufs = AMX.neufs && AMX.neufs.enCache ? AMX.neufs.enCache() : null;
    if (neufs && neufs.vehicules) {
      var n = neufs.vehicules.filter(function (v) { return (!cie || String(v.compagnie).toUpperCase() === cie) && ((estVin && String(v.vin).toUpperCase() === q) || (!estVin && String(v.stock || '').toUpperCase() === q)); })[0];
      if (n) return { type: 'neuf', compagnie: String(n.compagnie).toUpperCase(), vin: n.vin, stock: n.stock || '', annee: n.annee || '', marque: n.marque || '', modele: n.modele || '', version: n.version || '', coutant: n.coutFacture || '', source: 'Inventaire › Neufs' };
    }
    if (AMX.inventaire && AMX.inventaire.enCache) {
      var trouve = null, reg = '';
      ['DETAIL', 'CAN', 'US'].some(function (f) { var l = AMX.inventaire.enCache(f) || []; var v = l.filter(function (x) { return (!cie || String(x.compagnie || '').toUpperCase() === cie) && ((estVin && String(x.vin).toUpperCase() === q) || (!estVin && String(x.stock || '').toUpperCase() === q)); })[0]; if (v) { trouve = v; reg = f; return true; } return false; });
      if (trouve) {
        var m = /^(\d{4})\s+(\S+)\s+(.*)$/.exec(trouve.modele || '') || /^(\S+)\s+(.*?)\s+(\d{4})$/.exec(trouve.modele || ''), o = { type: reg === 'DETAIL' ? 'usage' : 'wholesale', compagnie: String(trouve.compagnie || '').toUpperCase(), vin: trouve.vin, stock: trouve.stock || '', coutant: trouve.cout || '', modeleTexte: trouve.modele || '', source: 'Inventaire › Usagé › ' + AMX.inventaire.nomFeuille(reg), registre: reg };
        if (m) { if (/^\d{4}$/.test(m[1])) { o.annee = m[1]; o.marque = m[2]; o.modele = m[3]; } else { o.marque = m[1]; o.modele = m[2]; o.annee = m[3]; } } else o.modele = trouve.modele || '';
        return o;
      }
    }
    return estVin ? { vin: q, inconnu: true } : { stock: q, inconnu: true };
  }

  /* ------------------------------ Formulaire : déclarer (conseiller) / compléter (directeur) ------------------------------ */
  function ouvrirFormulaire(prefill, existante) {
    injecterCss();
    var edition = !!existante, v = existante || {};
    var peutCompleter = AMX.ventes.peutCompleter(), peutDeclarer = AMX.ventes.peutDeclarer();
    if (!edition && !peutDeclarer) { AMX.toast('Déclarer une vente est réservé aux conseillers et directeurs (droit « Ventes — déclarer une vente »).', 'erreur'); return null; }
    var codes = AMX.codesPour('inventaire');
    var cie = String(v.compagnie || prefill.compagnie || AMX.compagnieChoisie('inventaire') || (codes.length === 1 ? codes[0] : '') || '').toUpperCase();
    var type = v.type || prefill.type || 'neuf';
    var vehicule = { vin: v.vin || prefill.vin || '', stock: v.stock || prefill.stock || '', annee: v.annee || prefill.annee || '', marque: v.marque || prefill.marque || '', modele: v.modele || prefill.modele || '', version: v.version || prefill.version || '', coutant: v.coutant !== undefined && v.coutant !== null ? v.coutant : (prefill.coutant || ''), source: prefill.source || '' };
    var rep = cache.rep && cache.cle && cache.cle.split('|')[0] === cie ? cache.rep : null;

    var selCie = h('select.saisie#vente-compagnie', [h('option', { value: '', text: 'Concession…' })].concat(codes.map(function (c) { return h('option', { value: c, text: AMX.COMPAGNIES_TOUTES[c] || c, selected: c === cie ? 'selected' : undefined }); })));
    if (edition) selCie.disabled = true;
    var segType = h('div.segment.bloc#vente-type', Object.keys(TYPES).map(function (t) { return h('button' + (type === t ? '.actif' : ''), { type: 'button', 'data-type': t, text: TYPES[t], onclick: function () { if (edition) return; type = t; segType.querySelectorAll('button').forEach(function (b) { b.classList.toggle('actif', b.dataset.type === t); }); rendreCategories(); rendreWholesale(); } }); }));
    var inRecherche = h('input.saisie#vente-recherche', { type: 'text', placeholder: '# stock ou NIV', autocomplete: 'off', spellcheck: 'false', value: vehicule.stock || vehicule.vin || '' });
    var btnChercher = h('button.btn', { type: 'button', text: 'Trouver', onclick: function () { trouver(inRecherche.value); } });
    var elTrouve = h('div.ventes-trouve.gris', { text: 'Tapez le # stock ou le NIV puis « Trouver » : les neufs (DMS / manufacturier) et les registres usagés sont fouillés.' });
    var inVin = h('input.saisie#vente-vin', { type: 'text', maxlength: '17', placeholder: 'NIV (17 caractères)', value: vehicule.vin, autocomplete: 'off', spellcheck: 'false' });
    var inStock = h('input.saisie#vente-stock', { type: 'text', placeholder: '# stock', value: vehicule.stock });
    var inAnnee = h('input.saisie#vente-annee', { type: 'text', placeholder: '2026', value: vehicule.annee, maxlength: '4' });
    var inMarque = h('input.saisie#vente-marque', { type: 'text', placeholder: 'Marque', value: vehicule.marque });
    var inModele = h('input.saisie#vente-modele', { type: 'text', placeholder: 'Modèle', value: vehicule.modele });
    var inVersion = h('input.saisie#vente-version', { type: 'text', placeholder: 'Version', value: vehicule.version });
    var inClient = h('input.saisie#vente-client', { type: 'text', placeholder: 'Nom du client', value: v.client || '' });
    var inTel = h('input.saisie#vente-telephone', { type: 'tel', placeholder: '514 555-0147', value: v.telephone || '' });
    var inCourriel = h('input.saisie#vente-courriel', { type: 'email', placeholder: 'courriel (facultatif)', value: v.courriel || '' });
    var inDate = h('input.saisie#vente-date', { type: 'date', value: v.dateVente || isoLocal(new Date()) });
    var inLivraison = h('input.saisie#vente-livraison', { type: 'date', value: v.dateLivraison || '' });
    var selCat = h('select.saisie#vente-categorie');
    var inConseiller = h('input.saisie#vente-conseiller', { type: 'text', list: 'vente-conseillers', placeholder: 'Conseiller', value: v.conseiller || '', autocomplete: 'off' });
    var dlConseillers = h('datalist#vente-conseillers');
    var inPrix = h('input.saisie#vente-prix', { type: 'text', inputmode: 'decimal', placeholder: '0,00 $', value: v.prixVente !== undefined && v.prixVente !== null ? v.prixVente : '' });
    var selPaiement = h('select.saisie#vente-paiement', [h('option', { value: '', text: '—' })].concat(PAIEMENTS.map(function (p) { return h('option', { value: p[0], text: p[1], selected: v.paiement === p[0] ? 'selected' : undefined }); })));
    var inEchStock = h('input.saisie#vente-echange-stock', { type: 'text', placeholder: '# stock de l\'échange', value: v.echangeStock || '' });
    var inEchModele = h('input.saisie#vente-echange-modele', { type: 'text', placeholder: 'Modèle de l\'échange (ex. Civic 2019)', value: v.echangeModele || '' });
    var inEchVin = h('input.saisie#vente-echange-vin', { type: 'text', maxlength: '17', placeholder: 'NIV de l\'échange', value: v.echangeVin || '', spellcheck: 'false' });
    var inNote = h('textarea.saisie#vente-note', { rows: '2', placeholder: 'Note (facultatif)' }); inNote.value = v.note || '';
    // Wholesale
    var inVenduA = h('input.saisie#vente-vendua', { type: 'text', placeholder: 'Acheteur (EBLOCK, OPENLANE, un concessionnaire…)', value: v.venduA || '' });
    var inAcheteDe = h('input.saisie#vente-achetede', { type: 'text', placeholder: 'Acheté de (Échange, Encan, Enterprise…)', value: v.acheteDe || '' });
    var inAcheteur = h('input.saisie#vente-acheteur', { type: 'text', placeholder: 'Acheteur interne', value: v.acheteur || '' });
    var inCoutant = h('input.saisie#vente-coutant', { type: 'text', inputmode: 'decimal', placeholder: 'Coûtant', value: vehicule.coutant !== '' && vehicule.coutant !== null && vehicule.coutant !== undefined ? vehicule.coutant : '' });
    // Directeur commercial
    var inDirecteur = h('input.saisie#vente-directeur', { type: 'text', list: 'vente-directeurs', placeholder: 'Directeur commercial', value: v.directeur || (peutCompleter && !edition ? (AMX.session.nom || '') : ''), autocomplete: 'off' });
    var dlDirecteurs = h('datalist#vente-directeurs');
    var inFront = h('input.saisie#vente-front', { type: 'text', inputmode: 'decimal', placeholder: '0,00 $', value: v.profitPrevu !== undefined && v.profitPrevu !== null ? v.profitPrevu : '' });
    var inFI = h('input.saisie#vente-fi', { type: 'text', inputmode: 'decimal', placeholder: '0,00 $', value: v.profitFIPrevu !== undefined && v.profitFIPrevu !== null ? v.profitFIPrevu : '' });
    var inAccess = h('input.saisie#vente-accessoires', { type: 'text', inputmode: 'decimal', placeholder: '0,00 $', value: v.accessoires !== undefined && v.accessoires !== null ? v.accessoires : '' });
    var inOver = h('input.saisie#vente-over', { type: 'text', inputmode: 'decimal', placeholder: 'Over / under allowance', value: v.overUnder !== undefined && v.overUnder !== null ? v.overUnder : '' });
    var pneus = v.pneus || '';
    var segPneus = h('div.segment.bloc#vente-pneus', [['', '—'], ['oui', 'Oui'], ['non', 'Non']].map(function (p) { return h('button' + (pneus === p[0] ? '.actif' : ''), { type: 'button', 'data-pneus': p[0], text: p[1], onclick: function () { pneus = p[0]; segPneus.querySelectorAll('button').forEach(function (b) { b.classList.toggle('actif', b.dataset.pneus === p[0]); }); } }); }));

    var champ = function (id, libelle, el, cls) { return h('div.champ' + (cls ? '.' + cls : ''), [h('label', { 'for': id, text: libelle }), el]); };
    var blocWholesale = h('div.grille', [champ('vente-vendua', 'Vendu à', inVenduA, 'large'), champ('vente-achetede', 'Acheté de', inAcheteDe), champ('vente-acheteur', 'Acheteur interne', inAcheteur), champ('vente-coutant', 'Coûtant', inCoutant)]);
    var blocClient = h('div.grille', [champ('vente-client', 'Client', inClient, 'large'), champ('vente-telephone', 'Téléphone', inTel), champ('vente-courriel', 'Courriel', inCourriel)]);
    var blocEchange = h('div.grille', [champ('vente-echange-stock', '# stock', inEchStock), champ('vente-echange-modele', 'Modèle', inEchModele), champ('vente-echange-vin', 'NIV', inEchVin)]);
    var titreEchange = h('h4', 'Échange (s\'il y en a un)'), pEchange = h('p.ventes-aide', { text: 'L\'échange entre à l\'inventaire par sa fiche d\'achat (Inventaire › Fiche d\'achat) : ici on note seulement de quel véhicule il s\'agit.' });
    var sectionDirecteur = peutCompleter ? h('div', [
      h('h4', 'Directeur commercial'),
      h('div.grille', [champ('vente-directeur', 'Directeur commercial', inDirecteur), champ('vente-front', 'Profit front prévu', inFront), champ('vente-fi', 'Profit F&I prévu', inFI), champ('vente-accessoires', 'Accessoires ($)', inAccess), champ('vente-pneus', 'Pneus vendus', segPneus), champ('vente-over', 'Over / under', inOver)])
    ]) : h('p.ventes-aide', { text: 'Profit prévu, F&I, pneus, accessoires : le directeur commercial les complète ensuite (la vente reste « À compléter » en rouge).' });
    var corps = h('div.ventes-form', [
      edition ? h('p.ventes-aide', { text: v.id + ' · ' + (TYPES[v.type] || v.type) + ' · déclarée par ' + (v.declareParNom || v.declarePar || '') + (v.livre === 'ecrit' ? ' · au livre ligne ' + v.livreLigne : '') }) : null,
      h('div.grille', [champ('vente-compagnie', 'Concession', selCie), champ('vente-type', 'Type de vente', segType)]),
      h('h4', 'Véhicule'),
      edition ? null : h('div.ventes-vehicule', [champ('vente-recherche', '# stock ou NIV', inRecherche), btnChercher]),
      edition ? null : elTrouve,
      h('div.grille', [champ('vente-vin', 'NIV', inVin), champ('vente-stock', '# Stock', inStock), champ('vente-annee', 'Année', inAnnee), champ('vente-marque', 'Marque', inMarque), champ('vente-modele', 'Modèle', inModele), champ('vente-version', 'Version', inVersion)]),
      h('h4', 'Vente'),
      h('div.grille', [champ('vente-date', 'Date de vente', inDate), champ('vente-livraison', 'Livraison (prévue)', inLivraison), champ('vente-categorie', 'Catégorie', selCat), champ('vente-conseiller', 'Conseiller', inConseiller), champ('vente-prix', 'Prix de vente', inPrix), champ('vente-paiement', 'Mode de paiement', selPaiement)]),
      dlConseillers, dlDirecteurs,
      h('h4#vente-titre-client', 'Client'),
      blocClient, blocWholesale,
      titreEchange,
      blocEchange,
      pEchange,
      sectionDirecteur,
      h('div.champ', [h('label', { 'for': 'vente-note', text: 'Note' }), inNote])
    ]);
    function rendreCategories() {
      AMX.vider(selCat);
      (CATEGORIES[type] || []).forEach(function (c) { selCat.appendChild(h('option', { value: c[0], text: c[1], selected: (v.categorie || prefill.categorie) === c[0] ? 'selected' : undefined })); });
    }
    function rendreWholesale() {
      var ws = type === 'wholesale';
      blocWholesale.style.display = ws ? '' : 'none'; blocClient.style.display = ws ? 'none' : '';
      corps.querySelector('#vente-titre-client').textContent = ws ? 'Acheteur (wholesale)' : 'Client';
      titreEchange.style.display = ws ? 'none' : ''; blocEchange.style.display = ws ? 'none' : ''; pEchange.style.display = ws ? 'none' : '';
    }
    function rendrePersonnes(d) {
      AMX.vider(dlConseillers); AMX.vider(dlDirecteurs);
      var noms = {}, nomsD = {};
      if (d && d.personnes) { (d.personnes.conseillers || []).forEach(function (p) { noms[p.nom] = 1; }); (d.personnes.directeurs || []).forEach(function (p) { nomsD[p.nom] = 1; }); }
      if (d && d.nomsConnus) { (d.nomsConnus.conseillers || []).forEach(function (n) { noms[n] = 1; }); (d.nomsConnus.directeurs || []).forEach(function (n) { nomsD[n] = 1; }); }
      Object.keys(noms).sort().forEach(function (n) { dlConseillers.appendChild(h('option', { value: n })); });
      Object.keys(nomsD).sort().forEach(function (n) { dlDirecteurs.appendChild(h('option', { value: n })); });
      if (!inConseiller.value && !edition) inConseiller.value = AMX.session.nom || '';
    }
    function trouver(texte) {
      var r = chercherVehicule(selCie.value || cie, texte);
      if (!r) return;
      if (r.inconnu) { elTrouve.className = 'ventes-trouve gris'; elTrouve.textContent = (r.vin ? 'NIV ' + r.vin : '# stock ' + r.stock) + ' : pas trouvé dans les neufs ni les registres — remplissez année, marque et modèle à la main (le serveur complétera s\'il le connaît).'; if (r.vin) inVin.value = r.vin; else inStock.value = r.stock; return; }
      inVin.value = r.vin || ''; inStock.value = r.stock || ''; inAnnee.value = r.annee || ''; inMarque.value = r.marque || ''; inModele.value = r.modele || (r.modeleTexte || ''); inVersion.value = r.version || '';
      if (r.coutant !== undefined && r.coutant !== '' && !inCoutant.value) inCoutant.value = r.coutant;
      if (r.type && !edition) { type = r.type; segType.querySelectorAll('button').forEach(function (b) { b.classList.toggle('actif', b.dataset.type === type); }); rendreCategories(); rendreWholesale(); }
      elTrouve.className = 'ventes-trouve'; elTrouve.textContent = ([r.annee, r.marque, r.modele, r.version].filter(Boolean).join(' ') || r.modeleTexte || '') + (r.stock ? ' · # ' + r.stock : '') + ' · ' + r.source + (r.type ? ' → ' + TYPES[r.type] : '');
    }
    rendreCategories(); rendreWholesale(); rendrePersonnes(rep);
    selCie.addEventListener('change', function () { cie = selCie.value; AMX.ventes.charger(cie, moisDe('')).then(rendrePersonnes, function () {}); });
    inRecherche.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); trouver(inRecherche.value); } });
    if (!rep && cie) AMX.ventes.charger(cie, moisDe('')).then(function (d) { rendrePersonnes(d); }, function () {});
    if (!edition && (vehicule.vin || vehicule.stock) && !vehicule.modele) setTimeout(function () { trouver(vehicule.vin || vehicule.stock); }, 30);

    var m = AMX.modale({
      titre: edition ? (peutCompleter && v.statut === 'declaree' ? 'Compléter la vente ' + v.id : 'Modifier la vente ' + v.id) : 'Déclarer une vente',
      corps: corps, large: true,
      boutons: [{ texte: 'Annuler' }, { texte: edition ? 'Enregistrer' : 'Déclarer la vente', classe: 'primaire', action: function (fermer, btn) {
        var compagnie = (selCie.value || cie || '').toUpperCase();
        if (!compagnie) { AMX.toast('Choisissez la concession.', 'erreur'); selCie.focus(); return false; }
        var vin = inVin.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase(), stock = inStock.value.trim().toUpperCase();
        if (vin && vin.length !== 17) { AMX.toast('Le NIV a 17 caractères (ou laissez-le vide et donnez le # stock).', 'erreur'); inVin.focus(); return false; }
        if (!vin && !stock) { AMX.toast('Il faut le NIV ou le # stock du véhicule.', 'erreur'); inRecherche.focus(); return false; }
        if (type !== 'wholesale' && inClient.value.trim().length < 2) { AMX.toast('Le nom du client est obligatoire.', 'erreur'); inClient.focus(); return false; }
        if (type === 'wholesale' && inVenduA.value.trim().length < 2) { AMX.toast('À qui le véhicule est-il vendu ?', 'erreur'); inVenduA.focus(); return false; }
        if (!inDate.value) { AMX.toast('La date de vente est obligatoire.', 'erreur'); inDate.focus(); return false; }
        var corpsEnvoi = { compagnie: compagnie, type: type, vin: vin, stock: stock, annee: inAnnee.value.trim(), marque: inMarque.value.trim(), modele: inModele.value.trim(), version: inVersion.value.trim(),
          client: inClient.value.trim(), telephone: inTel.value.trim(), courriel: inCourriel.value.trim(), dateVente: inDate.value, dateLivraison: inLivraison.value, categorie: selCat.value, conseiller: inConseiller.value.trim(),
          prixVente: inPrix.value.trim(), paiement: selPaiement.value, echangeStock: inEchStock.value.trim(), echangeModele: inEchModele.value.trim(), echangeVin: inEchVin.value.trim(), note: inNote.value.trim(),
          venduA: inVenduA.value.trim(), acheteDe: inAcheteDe.value.trim(), acheteur: inAcheteur.value.trim(), coutant: inCoutant.value.trim() };
        if (peutCompleter) Object.assign(corpsEnvoi, { directeur: inDirecteur.value.trim(), profitPrevu: inFront.value.trim(), profitFIPrevu: inFI.value.trim(), accessoires: inAccess.value.trim(), overUnder: inOver.value.trim(), pneus: pneus });
        corpsEnvoi.action = edition ? 'venteCompleter' : 'venteDeclarer';
        if (edition) corpsEnvoi.id = v.id;
        if (prefill.forcer) corpsEnvoi.forcer = true;
        return AMX.post(corpsEnvoi, { delai: 90000 }).then(function (r) {
          if (r && r.ok === false && r.code === 'DOUBLON' && r.vente) {
            AMX.confirmer('Déjà déclarée', r.erreur + '\n\nDéclarer quand même une deuxième vente pour ce véhicule ?', { ok: 'Déclarer quand même' }).then(function (ok) { if (ok) ouvrirFormulaire(Object.assign({}, prefill, { forcer: true, compagnie: compagnie, type: type, vin: vin, stock: stock }), null); else AMX.ventes.poser(r.vente); });
            return true;
          }
          verifierPost(r);
          AMX.ventes.poser(r.vente);
          AMX.toast(r.message || 'Enregistré', r.livre && r.livre.ok === false ? 'erreur' : 'ok', 7000);
          if (!(AMX.courante && AMX.courante.section && AMX.courante.section.id === 'vente' && AMX.courante.onglet && AMX.courante.onglet.id === 'ventes')) {
            if (!edition && !prefill.resterIci) AMX.aller('ventes', 'liste', { id: r.vente.id });
          }
          return true;
        }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
      } }]
    });
    return m;
  }
})();
