/* =====================================================================================================
   lmb.js — Vente › LMB : Location LMB, la compagnie de location du Groupe Automax (29 oct. 2026)

   Maxime : « un onglet dans Vente que moi seul je vais avoir accès, avec LMB, pour connecter le Google Sheet
   LMB et un onglet que je vais t'envoyer ; un beau résumé et facile à rechercher ».
   - Réservé au propriétaire (rôle proprietaire). Le serveur (Lmb.gs) refuse tous les autres.
   - Lecture seule des classeurs de LMB (GET ?lmb=1) ; le propriétaire connecte ou retire des onglets
     (GET ?lmbOnglets=1&lien=, POST lmbSources).
   - Vues : Résumé (chiffres clés, à surveiller, locataires, prélèvements, fins de contrat, sources) puis une
     vue par onglet connecté (Flotte, Contrats, Vendus, Achats / revente, onglets libres).
   - Une seule recherche pour tout (AMX.correspond sur toutes les colonnes), et la règle v138 : filtres →
     « Chiffres et liste » → chiffres de la liste filtrée → liste.
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h;

  var CSS = [
    '.lmb-vues { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }',
    '.lmb-vues button { border: 1px solid var(--ligne); background: var(--carte); border-radius: 999px; padding: 6px 13px; font-size: 13px; font-weight: 600; color: var(--encre-2); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }',
    '.lmb-vues button.actif { background: var(--vert-fonce); border-color: var(--vert-fonce); color: #fff; }',
    '.lmb-vues button .n { font-weight: 700; opacity: .75; font-variant-numeric: tabular-nums; }',
    '.lmb-vues button.erreur { border-color: var(--rouge); color: var(--rouge); }',
    '.lmb-filtres { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 8px; }',
    '.lmb-filtres .saisie.recherche { flex: 1 1 280px; max-width: 520px; }',
    '.lmb-filtres .lmb-client { width: auto; flex: 0 1 300px; max-width: 340px; }',
    '.lmb-pastilles { display: flex; gap: 6px; flex-wrap: wrap; }',
    '.lmb-pastilles button { border: 1px solid var(--ligne); background: var(--carte); border-radius: 999px; padding: 4px 11px; font-size: 12.5px; cursor: pointer; color: var(--encre-2); }',
    '.lmb-pastilles button.actif { background: var(--encre); border-color: var(--encre); color: #fff; }',
    '.lmb-pastilles button.alerte { border-color: var(--rouge-bg); color: var(--rouge); } .lmb-pastilles button.alerte.actif { background: var(--rouge); border-color: var(--rouge); color: #fff; }',
    '.lmb-grille { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 14px; }',
    '@media (max-width: 900px) { .lmb-grille { grid-template-columns: 1fr; } }',
    '.lmb-grille .carte.large { grid-column: 1 / -1; }',
    '.lmb-liste-simple { list-style: none; margin: 0; padding: 0; }',
    '.lmb-liste-simple li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--ligne); font-size: 13px; }',
    '.lmb-liste-simple li:last-child { border-bottom: none; }',
    '.lmb-liste-simple li.cliquable { cursor: pointer; } .lmb-liste-simple li.cliquable:hover { background: var(--carte-2); }',
    '.lmb-liste-simple .g { min-width: 0; } .lmb-liste-simple .g b { display: block; } .lmb-liste-simple .g span { color: var(--encre-3); font-size: 12px; }',
    '.lmb-liste-simple .d { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }',
    '.lmb-barre { height: 6px; border-radius: 3px; background: var(--gris-bg); overflow: hidden; margin-top: 4px; } .lmb-barre i { display: block; height: 100%; background: var(--vert); }',
    '.lmb-alerte-n { min-width: 28px; height: 24px; border-radius: 999px; display: inline-grid; place-items: center; font-weight: 800; font-size: 12.5px; padding: 0 8px; }',
    '.lmb-alerte-n.rouge { background: var(--rouge-bg); color: var(--rouge); } .lmb-alerte-n.ambre { background: var(--ambre-bg); color: var(--ambre); } .lmb-alerte-n.ok { background: var(--vert-clair); color: var(--vert-fonce); }',
    '.lmb-table-cadre { overflow-x: auto; }',
    '.lmb-table td .s { display: block; color: var(--encre-3); font-size: 12px; }',
    '.lmb-table td.mono, .lmb-table td .mono { font-family: var(--mono); font-size: 12px; }',
    '.lmb-table mark, .lmb-detail mark { background: #fff1a8; color: inherit; border-radius: 2px; }',
    '.lmb-detail { display: grid; grid-template-columns: minmax(150px, 34%) 1fr; gap: 0; margin: 0; }',
    '.lmb-detail dt, .lmb-detail dd { padding: 7px 8px; border-bottom: 1px solid var(--ligne); margin: 0; font-size: 13px; }',
    '.lmb-detail dt { color: var(--encre-3); font-weight: 600; } .lmb-detail dd { word-break: break-word; }',
    '.lmb-erreur-source { border-left: 4px solid var(--rouge); background: var(--rouge-bg); padding: 10px 12px; border-radius: 8px; margin: 0 0 10px; font-size: 13px; }',
    '.lmb-erreur-source code { font-family: var(--mono); font-weight: 700; }',
    '.lmb-vide { padding: 28px; text-align: center; color: var(--encre-3); }'
  ].join('\n');
  function css() { if (!document.getElementById('css-lmb')) { var s = document.createElement('style'); s.id = 'css-lmb'; s.textContent = CSS; document.head.appendChild(s); } }

  /* ------------------------------------------------------------------------------- données */
  var cache = { rep: null, le: 0, enCours: null, copieLe: 0 };
  function charger(force) {
    if (cache.enCours && !force) return cache.enCours;
    var p = force ? { lmb: '1', frais: '1' } : { lmb: '1' };
    cache.enCours = AMX.get(p, { delai: 150000, secours: false, gz: true, copie: 'lmb' }).then(function (d) {
      cache.enCours = null;
      if (d && d.refuse) throw new Error(d.erreur || 'Réservé au propriétaire.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!Array.isArray(d.sources)) throw new Error('Le script n\'est pas à jour — déployez la version qui contient Lmb.gs.');
      cache.rep = d; cache.le = Date.now(); cache.copieLe = 0;
      return d;
    }, function (e) { cache.enCours = null; throw e; });
    return cache.enCours;
  }
  /* Le rôle est lu au démarrage dans les permissions gardées (comme la page KPI) : AMX.session.role peut arriver plus tard. */
  function peutVoir() { var p = AMX.session && AMX.session.perms; return !!((p && p.role === 'proprietaire') || (AMX.session && AMX.session.role === 'proprietaire')); }

  var TYPES = { flotte: 'Flotte', contrats: 'Contrats', vendus: 'Vendus', achats: 'Achats / revente', libre: 'Onglet' };
  var argent = function (n) { return n === null || n === undefined || isNaN(n) ? '—' : AMX.fmtArgent(n); };
  var argent2 = function (n) { return n === null || n === undefined || isNaN(n) ? '—' : AMX.fmtArgent(n, 2); };
  var somme = function (l, f) { return l.reduce(function (a, x) { var v = x.f[f]; return a + (typeof v === 'number' ? v : 0); }, 0); };
  function aujourdhui() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function plusJours(iso, j) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + j); return d.toISOString().slice(0, 10); }
  function plusMois(iso, m) { var d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); }
  function joursEntre(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
  function dateCourte(iso) { return iso ? AMX.fmtDateCourte(iso + 'T12:00:00') + ' ' + iso.slice(0, 4) : '—'; }
  function pluriel(n, s, p) { return AMX.fmtNombre(n) + ' ' + (n > 1 ? (p || s + 's') : s); }

  /* Type de location d'une ligne de la flotte (colonne FLOOR PLAN : RENTAL / LEASE / À FINANCER…). */
  function typeLoc(f) {
    var t = AMX.texteCherche(f.type || '');
    if (/lease/.test(t)) return 'LEASE';
    if (/rental/.test(t)) return 'RENTAL';
    if (/financ/.test(t)) return 'À FINANCER';
    return 'Autre';
  }
  /* Enrichit chaque ligne une fois (champs calculés préfixés par _). */
  /* 29 oct. (Maxime) : « fais un croisement entre les ventes et les locations pour enlever les vendus des locations actives ».
     Un véhicule de la flotte dont le NIV (complet, ou ses 8 derniers caractères) ou le no LOC est aussi dans un onglet
     « Vendus » n'est plus une location active. */
  function cleNiv(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function indexVendus(rep) {
    var idx = { vin: {}, fin: {}, stock: {} };
    (rep.sources || []).forEach(function (s) {
      if (s.type !== 'vendus') return;
      (s.lignes || []).forEach(function (l) {
        var v = cleNiv(l.f.vin), st = cleNiv(l.f.stock), info = { onglet: s.nom, stock: l.f.stock || '', r: l.r, vin: v };
        if (v.length >= 11) idx.vin[v] = info;
        if (v.length >= 8) idx.fin[v.slice(-8)] = info;
        if (/^LOC\d{3,}$/.test(st)) idx.stock[st] = info;
      });
    });
    return idx;
  }
  function vendu(idx, f) {
    var v = cleNiv(f.vin), st = cleNiv(f.stock);
    if (v.length >= 11 && idx.vin[v]) return idx.vin[v];
    if (v.length >= 8 && idx.fin[v.slice(-8)]) return idx.fin[v.slice(-8)];
    if (st && idx.stock[st] && (!v || !idx.stock[st].vin)) return idx.stock[st];
    return null;
  }
  /* Client d'une ligne, selon l'onglet, et sa clé (sans ce qui est entre parenthèses, sans « inc », sans accents). */
  function clientDe(type, f) { return type === 'contrats' ? f.client : (type === 'achats' ? f.acheteur : f.loueA); }
  function cleClient(nom) {
    var t = AMX.texteCherche(String(nom || '').replace(/\(.*?\)/g, ' ').replace(/\s+-\s+.*$/, ' '));
    return t.replace(/\b(inc|ltee|ltd|enr|senc)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function preparer(rep) {
    var auj = aujourdhui(), idxV = indexVendus(rep);
    (rep.sources || []).forEach(function (s) {
      (s.lignes || []).forEach(function (l) {
        var f = l.f || (l.f = {});
        var nomC = (s.type === 'flotte' || s.type === 'vendus') && !f.vin ? '' : clientDe(s.type, f);   /* une ligne de dépôt (sans NIV) n'a pas de client */
        f._client = nomC ? String(nomC).replace(/\s+/g, ' ').trim() : ''; f._clientCle = f._client ? cleClient(f._client) : '';
        if (s.type === 'flotte' || s.type === 'vendus') {
          f._loc = typeLoc(f);
          f._vendu = s.type === 'flotte' ? vendu(idxV, f) : null;
          f._actif = s.type === 'flotte' && !!f.vin && !f.retour && !f.retourTexte && !f._vendu;
          var al = [];
          if (s.type === 'flotte') {
            if (f._actif && f._loc === 'LEASE' && !f.rdprm) al.push(['rdprm', 'RDPRM non noté']);
            if (f._actif && !f.contrat && !f.contratTexte) al.push(['contrat', 'Sans date de contrat']);
            if ((f.retour || f.retourTexte) && !f.payeFp) al.push(['fp', 'Retourné, floor plan pas payé']);
            if ((f.retour || f.retourTexte) && f.rdprm && !f.radiation) al.push(['radiation', 'Retourné, RDPRM pas radié']);
          }
          f._alertes = al;
        }
        if (s.type === 'achats') {
          f._note = typeof f.prixPaye !== 'number' && typeof f.prixVente !== 'number' && typeof f.profit !== 'number';
          f._vehicule = [f.annee, f.marque, f.modeleNom].filter(Boolean).join(' ');
        }
        if (s.type === 'contrats') {
          if (f.debut && f.duree) { f._fin = plusMois(f.debut, Math.round(f.duree)); f._joursFin = joursEntre(auj, f._fin); }
          if (f.prochain) f._joursProchain = joursEntre(auj, f.prochain);
          f._incomplet = /incomplet/i.test(f.statut || '');
        }
      });
      /* Achats / revente : un véhicule inscrit dans les deux tableaux de l'onglet (même NIV) ne compte qu'une fois — la ligne la plus basse gagne. */
      if (s.type === 'achats') {
        var vu = {};
        for (var i = (s.lignes || []).length - 1; i >= 0; i--) { var f2 = s.lignes[i].f, v = String(f2.vin || '').toUpperCase(); if (f2._note || !/^[A-Z0-9]{11,17}$/.test(v)) continue; if (vu[v]) f2._doublon = true; else vu[v] = true; }
      }
    });
    return rep;
  }

  /* ------------------------------------------------------------------------------- section */
  AMX.section('lmb', {
    titre: 'LMB', icone: 'kpi', ordre: 52,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new Lmb(conteneur, ctx); }
  });
  AMX.lmb = { charger: charger, vider: function () { cache = { rep: null, le: 0, enCours: null, copieLe: 0 }; } };

  function Lmb(conteneur, ctx) {
    css();
    var self = this;
    this.conteneur = conteneur; this.detruit = false;
    this.vue = (ctx && ctx.params && ctx.params.vue) || AMX.memo.lire('lmb_vue', 'resume');
    this.q = ''; this.filtres = {}; this.client = '';
    this.erreur = '';
    AMX.vider(conteneur);
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', text: 'Exporter (Excel)', onclick: function () { self.exporter(); } });
    this.btnSources = h('button.btn', { type: 'button', text: 'Onglets connectés', onclick: function () { self.ouvrirSources(); } });
    this.btnOuvrir = h('button.btn.primaire', { type: 'button', text: 'Ouvrir le classeur', onclick: function () { var s = self.sourceVue() || (self.rep && self.rep.sources[0]); if (s) window.open(s.lien, '_blank', 'noopener'); } });
    this.elSous = h('p');
    conteneur.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Location LMB'), this.elSous]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnExport, this.btnSources, this.btnOuvrir], [this.btnOuvrir]))
    ]));
    this.elVues = h('div.lmb-vues');
    this.inRecherche = h('input.saisie.recherche', { type: 'search', placeholder: 'Chercher : stock, NIV, client, plaque, modèle, montant…', autocomplete: 'off', 'aria-label': 'Chercher dans LMB' });
    this.elPastilles = h('div.lmb-pastilles');
    this.elPortee = h('div');
    this.elKpis = h('div.kpis');
    this.elCorps = h('div');
    conteneur.appendChild(this.elVues);
    this.selClient = h('select.saisie.lmb-client', { 'aria-label': 'Filtrer par client' });
    this.selClient.addEventListener('change', function () { self.client = self.selClient.value; self.rafraichir(); });
    conteneur.appendChild(h('div.lmb-filtres', [this.inRecherche, this.selClient, this.elPastilles]));
    conteneur.appendChild(this.elPortee);
    conteneur.appendChild(this.elKpis);
    conteneur.appendChild(this.elCorps);
    var relancer = AMX.debounce(function () { self.q = self.inRecherche.value; self.rafraichir(); }, 160);
    this.inRecherche.addEventListener('input', relancer);
    this.inRecherche.addEventListener('keydown', function (e) { if (e.key === 'Escape') { self.inRecherche.value = ''; self.q = ''; self.rafraichir(); } });
    if (cache.rep) { this.rep = cache.rep; this.rendre(); }
    else {
      this.elCorps.appendChild(AMX.chargeur('Location LMB'));
      if (AMX.cacheLocal && AMX.cacheLocal.lireGz) AMX.cacheLocal.lireGz('lmb', 7 * 864e5).then(function (o) { if (o && o.donnees && !self.rep && !self.detruit && Array.isArray(o.donnees.sources)) { self.rep = preparer(o.donnees); cache.copieLe = o.quand; self.rendre(); } }).catch(function () {});
    }
    this.charger(false);
  }
  Lmb.prototype.demonter = function () { this.detruit = true; };
  Lmb.prototype.naviguer = function (ctx) { var p = (ctx && ctx.params) || {}; if (p.vue) { this.vue = p.vue; this.rendre(); } if (p.q !== undefined) { this.inRecherche.value = p.q; this.q = p.q; this.rafraichir(); } };
  Lmb.prototype.charger = function (force) {
    var self = this;
    if (force) { this.btnRafraichir.disabled = true; this.btnRafraichir.textContent = 'Lecture des classeurs…'; }
    charger(force).then(function (d) {
      if (self.detruit) return;
      self.btnRafraichir.disabled = false; self.btnRafraichir.textContent = 'Rafraîchir';
      self.erreur = ''; self.rep = preparer(d); self.rendre();
      if (force) AMX.toast('Classeurs relus', 'ok');
    }, function (e) {
      if (self.detruit) return;
      self.btnRafraichir.disabled = false; self.btnRafraichir.textContent = 'Rafraîchir';
      self.erreur = AMX.erreurTexte(e);
      if (!self.rep) { AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.lmb-vide', { text: self.erreur })); }
      else AMX.toast(self.erreur + ' (copie affichée)', 'erreur');
      self.rendreSous();
    });
  };
  Lmb.prototype.sourceVue = function () { var v = this.vue; return (this.rep && this.rep.sources || []).filter(function (s) { return s.cle === v; })[0] || null; };
  Lmb.prototype.sources = function (type) { return (this.rep && this.rep.sources || []).filter(function (s) { return !type || s.type === type; }); };
  Lmb.prototype.rendreSous = function () {
    var d = this.rep, t = [];
    t.push('Compagnie de location du Groupe Automax — lecture seule des classeurs');
    if (d && d.luLe) t.push((cache.copieLe ? 'copie du ' + AMX.copieTexte(cache.copieLe) : 'lus ' + AMX.fmtDate(d.luLe, true).replace(/^\S+\s/, 'à ')));
    if (this.erreur && d) t.push('mise à jour impossible : ' + this.erreur);
    this.elSous.textContent = t.join(' · ');
  };
  /* Lignes qui passent la recherche (toutes les colonnes de l'onglet). */
  Lmb.prototype.trouvees = function (s) {
    var q = this.q, cle = this.client, nom = this.clientNom();
    return (s.lignes || []).filter(function (l) {
      if (!AMX.correspond(l.c, q)) return false;
      if (!cle) return true;
      if (s.type === 'libre') return AMX.correspond(l.c, nom);
      return l.f._clientCle === cle;
    });
  };
  /* Les clients de tous les onglets (la graphie la plus fréquente), avec leur nombre de lignes. */
  Lmb.prototype.clients = function () {
    var par = {};
    this.sources().forEach(function (s) {
      if (s.type === 'libre') return;
      (s.lignes || []).forEach(function (l) {
        var k = l.f._clientCle; if (!k) return;
        var c = par[k] || (par[k] = { cle: k, n: 0, noms: {} });
        c.n++; c.noms[l.f._client] = (c.noms[l.f._client] || 0) + 1;
      });
    });
    return Object.keys(par).map(function (k) {
      var c = par[k], noms = Object.keys(c.noms).sort(function (a, b) { return c.noms[b] - c.noms[a]; });
      return { cle: k, nom: noms[0], n: c.n };
    }).sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr'); });
  };
  Lmb.prototype.clientNom = function () {
    var cle = this.client; if (!cle) return '';
    var c = (this.listeClients || []).filter(function (x) { return x.cle === cle; })[0];
    return c ? c.nom : cle;
  };
  Lmb.prototype.choisirClient = function (cle) { this.client = cle || ''; this.rendreClients(); this.rafraichir(); };
  Lmb.prototype.rendreClients = function () {
    var self = this, sel = this.selClient;
    this.listeClients = this.clients();
    AMX.vider(sel);
    sel.appendChild(h('option', { value: '', text: 'Tous les clients (' + this.listeClients.length + ')' }));
    this.listeClients.forEach(function (c) { sel.appendChild(h('option', { value: c.cle, text: c.nom + ' — ' + c.n, selected: c.cle === self.client ? true : undefined })); });
    if (this.client && !this.listeClients.some(function (c) { return c.cle === self.client; })) this.client = '';
    sel.value = this.client;
  };

  Lmb.prototype.rendre = function () {
    if (this.detruit || !this.rep) return;
    var self = this;
    if (this.vue !== 'resume' && !this.sourceVue()) this.vue = 'resume';
    AMX.memo.ecrire('lmb_vue', this.vue);
    this.rendreSous();
    AMX.vider(this.elVues);
    var bouton = function (cle, titre, n, erreur) {
      return h('button' + (self.vue === cle ? '.actif' : '') + (erreur ? '.erreur' : ''), { type: 'button', onclick: function () { self.vue = cle; self.filtres = {}; self.rendre(); } }, [titre, n !== null ? h('span.n', { text: AMX.fmtNombre(n) }) : null]);
    };
    this.elVues.appendChild(bouton('resume', 'Résumé', null));
    this.sources().forEach(function (s) { self.elVues.appendChild(bouton(s.cle, s.nom, s.erreur ? null : (s.lignes || []).length, !!s.erreur)); });
    this.rendreClients();
    this.rafraichir();
  };
  Lmb.prototype.rafraichir = function () {
    if (!this.rep) return;
    if (this.vue === 'resume') this.rendreResume(); else this.rendreSource(this.sourceVue());
  };

  /* ------------------------------------------------------------------------------- résumé */
  Lmb.prototype.rendreResume = function () {
    var self = this, q = this.q;
    AMX.vider(this.elPastilles);
    var flotte = [], contrats = [], achats = [], toutes = 0;
    this.sources().forEach(function (s) {
      var l = self.trouvees(s); toutes += l.length;
      if (s.type === 'flotte') flotte = flotte.concat(l);
      if (s.type === 'contrats') contrats = contrats.concat(l);
      if (s.type === 'achats') achats = achats.concat(l.filter(function (x) { return garde('achats', 'tous', x); }));
    });
    AMX.porteeChiffres(this.elPortee, { n: toutes, unite: ['ligne', 'lignes'], contexte: 'tous les onglets connectés', filtres: [this.client ? 'Client : ' + this.clientNom() : '', q.trim() ? '« ' + q.trim() + ' »' : ''], effacer: function () { self.effacerFiltres(); } });
    var actifs = flotte.filter(function (l) { return l.f._actif; });
    var lease = actifs.filter(function (l) { return l.f._loc === 'LEASE'; }).length, rental = actifs.filter(function (l) { return l.f._loc === 'RENTAL'; }).length;
    var revenu = somme(actifs, 'cout'), avecCout = actifs.filter(function (l) { return typeof l.f.cout === 'number' && l.f.cout > 0; }).length;
    var solde = somme(contrats, 'solde'), interet = somme(contrats, 'interetJour');
    var sept = contrats.filter(function (l) { return l.f._joursProchain !== undefined && l.f._joursProchain >= 0 && l.f._joursProchain <= 7; });
    var profit = somme(achats, 'profit');
    AMX.vider(this.elKpis);
    var tuile = function (valeur, libelle, sous, vue, classe) {
      return h('button.kpi' + (classe ? '.' + classe : ''), { type: 'button', onclick: vue ? function () { self.vue = vue.cle; self.filtres = vue.filtres || {}; self.rendre(); } : null }, [h('span.libelle', { text: libelle }), h('span.valeur', { text: valeur }), sous ? h('span.sous', { text: sous }) : null]);
    };
    var cleFlotte = (this.sources('flotte')[0] || {}).cle, cleContrats = (this.sources('contrats')[0] || {}).cle, cleAchats = (this.sources('achats')[0] || {}).cle;
    var vendusRetires = flotte.filter(function (l) { return l.f._vendu; }).length;
    this.elKpis.appendChild(tuile(AMX.fmtNombre(actifs.length), 'Véhicules en location', lease + ' LEASE · ' + rental + ' RENTAL · ' + (actifs.length - lease - rental) + ' autres' + (vendusRetires ? ' · ' + vendusRetires + ' vendu' + (vendusRetires > 1 ? 's' : '') + ' retiré' + (vendusRetires > 1 ? 's' : '') : ''), cleFlotte ? { cle: cleFlotte } : null));
    this.elKpis.appendChild(tuile(argent(revenu), 'Location mensuelle', avecCout ? 'moyenne ' + argent(revenu / avecCout) + ' · ' + pluriel(avecCout, 'véhicule') : 'coût de location non inscrit', cleFlotte ? { cle: cleFlotte } : null));
    if (this.sources('contrats').length) {
      this.elKpis.appendChild(tuile(argent(solde), 'Solde des contrats', pluriel(contrats.length, 'contrat') + ' · intérêt ' + argent2(interet) + ' / jour', cleContrats ? { cle: cleContrats } : null));
      this.elKpis.appendChild(tuile(argent(somme(sept, 'paiement')), 'Prélèvements 7 jours', pluriel(sept.length, 'contrat'), cleContrats ? { cle: cleContrats, filtres: { contrats: 'prochain' } } : null));
      this.elKpis.appendChild(tuile(argent(somme(contrats, 'encaisse')), 'Encaissé à ce jour', 'intérêt gagné ' + argent(somme(contrats, 'interetGagne')), cleContrats ? { cle: cleContrats } : null));
    }
    if (this.sources('achats').length) this.elKpis.appendChild(tuile(argent(profit), 'Profit achats / revente', pluriel(achats.length, 'transaction'), cleAchats ? { cle: cleAchats } : null));

    AMX.vider(this.elCorps);
    var grille = h('div.lmb-grille');
    if ((q && q.trim()) || this.client) grille.appendChild(this.carteResultats());
    grille.appendChild(this.carteAlertes(flotte, contrats));
    grille.appendChild(this.carteLocataires(actifs));
    if (this.sources('contrats').length) {
      grille.appendChild(this.cartePrelevements(contrats));
      grille.appendChild(this.carteFins(contrats));
    }
    grille.appendChild(this.carteSources());
    this.elCorps.appendChild(grille);
  };
  function carte(titre, droite, corps, large) {
    return h('div.carte' + (large ? '.large' : ''), [h('div.carte-entete', [h('h2', titre), droite || null]), h('div.carte-corps', [corps])]);
  }
  Lmb.prototype.effacerFiltres = function () { this.inRecherche.value = ''; this.q = ''; this.client = ''; this.selClient.value = ''; this.rafraichir(); };
  Lmb.prototype.carteResultats = function () {
    var self = this, ul = h('ul.lmb-liste-simple'), n = 0;
    this.sources().forEach(function (s) {
      self.trouvees(s).slice(0, 40).forEach(function (l) {
        n++;
        ul.appendChild(h('li.cliquable', { onclick: function () { self.detail(s, l); } }, [
          h('div.g', [h('b', { text: titreLigne(s, l) }), h('span', { text: s.nom + ' · ' + sousLigne(s, l) })]),
          h('div.d', [h('span.puce', { text: TYPES[s.type] || 'Onglet' })])
        ]));
      });
    });
    if (!n) ul.appendChild(h('li', [h('span.doux', { text: 'Rien ne correspond.' })]));
    return carte(this.client && !this.q.trim() ? 'Tout pour ' + this.clientNom() : 'Résultats de la recherche', h('span.doux', { text: n >= 40 ? '40 premiers par onglet' : '' }), ul, true);
  };
  Lmb.prototype.carteAlertes = function (flotte, contrats) {
    var self = this, ul = h('ul.lmb-liste-simple'), cleF = (this.sources('flotte')[0] || {}).cle, cleC = (this.sources('contrats')[0] || {}).cle;
    var compte = function (code) { return flotte.filter(function (l) { return (l.f._alertes || []).some(function (a) { return a[0] === code; }); }).length; };
    var lignes = [
      ['rdprm', 'Baux (LEASE) sans RDPRM noté au classeur', 'Colonne « RDPRM » vide. Un bail de plus d\'un an se publie au RDPRM dans les 7 jours (art. 1852 C.c.Q.) pour être opposable aux tiers.', compte('rdprm'), 'rouge', cleF, { flotte: 'al:rdprm' }],
      ['radiation', 'Retournés : RDPRM pas radié', 'Radier l\'inscription une fois le véhicule revenu.', compte('radiation'), 'ambre', cleF, { flotte: 'al:radiation' }],
      ['fp', 'Retournés : floor plan pas payé', 'Colonne « Payé floor plan » vide.', compte('fp'), 'ambre', cleF, { flotte: 'al:fp' }],
      ['contrat', 'Loués sans date de contrat', 'Véhicule au nom d\'un locataire, sans date du contrat de location.', compte('contrat'), 'ambre', cleF, { flotte: 'al:contrat' }]
    ];
    if (this.sources('contrats').length) {
      lignes.push(['fin90', 'Contrats qui finissent dans 90 jours', 'Prévoir le rachat (valeur résiduelle) ou le retour.', contrats.filter(function (l) { return l.f._joursFin !== undefined && l.f._joursFin >= 0 && l.f._joursFin <= 90; }).length, 'ambre', cleC, { contrats: 'fin90' }]);
      lignes.push(['incomplet', 'Contrats incomplets dans le calculateur', 'Prix, durée, date, paiement, taux ou jour de prélèvement manquant à la feuille source.', contrats.filter(function (l) { return l.f._incomplet; }).length, 'rouge', cleC, { contrats: 'incomplet' }]);
    }
    lignes.forEach(function (a) {
      if (!a[5]) return;
      var classe = a[3] ? a[4] : 'ok';
      ul.appendChild(h('li' + (a[3] ? '.cliquable' : ''), { onclick: a[3] ? function () { self.vue = a[5]; self.filtres = a[6]; self.rendre(); } : null }, [
        h('div.g', [h('b', { text: a[1] }), h('span', { text: a[2] })]), h('div.d', [h('span.lmb-alerte-n.' + classe, { text: a[3] ? String(a[3]) : '✓' })])
      ]));
    });
    return carte('À surveiller', null, ul);
  };
  Lmb.prototype.carteLocataires = function (actifs) {
    var self = this, par = {};
    actifs.forEach(function (l) { var k = l.f._client || 'Non inscrit', cle = l.f._clientCle || ''; if (!par[cle]) par[cle] = { nom: k, cle: cle, n: 0, cout: 0 }; par[cle].n++; if (typeof l.f.cout === 'number') par[cle].cout += l.f.cout; });
    var liste = Object.keys(par).map(function (k) { return par[k]; }).sort(function (a, b) { return b.n - a.n || b.cout - a.cout; }).slice(0, 10), max = liste.length ? liste[0].n : 1;
    var ul = h('ul.lmb-liste-simple'), cleF = (this.sources('flotte')[0] || {}).cle;
    liste.forEach(function (x) {
      ul.appendChild(h('li.cliquable', { title: 'Filtrer sur ce client', onclick: function () { self.client = x.cle; self.rendre(); } }, [
        h('div.g', { style: { flex: '1' } }, [h('b', { text: x.nom }), h('div.lmb-barre', [h('i', { style: { width: Math.round(100 * x.n / max) + '%' } })])]),
        h('div.d', [h('b', { text: pluriel(x.n, 'véhicule') }), h('span.s', { style: { display: 'block', color: 'var(--encre-3)', fontSize: '12px' }, text: x.cout ? argent(x.cout) + ' / mois' : '' })])
      ]));
    });
    if (!liste.length) ul.appendChild(h('li', [h('span.doux', { text: 'Aucun véhicule en location.' })]));
    return carte('Par locataire', h('span.doux', { text: actifs.length ? 'véhicules en location' : '' }), ul);
  };
  Lmb.prototype.cartePrelevements = function (contrats) {
    var self = this, s = this.sources('contrats')[0];
    var liste = contrats.filter(function (l) { return l.f._joursProchain !== undefined && l.f._joursProchain >= 0 && l.f._joursProchain <= 14; }).sort(function (a, b) { return a.f._joursProchain - b.f._joursProchain; });
    var ul = h('ul.lmb-liste-simple');
    liste.forEach(function (l) {
      ul.appendChild(h('li.cliquable', { onclick: function () { self.detail(s, l); } }, [
        h('div.g', [h('b', { text: (l.f.client || '—') + ' · ' + (l.f.stock || '') }), h('span', { text: dateCourte(l.f.prochain) + (l.f._joursProchain === 0 ? ' (aujourd\'hui)' : ' (dans ' + pluriel(l.f._joursProchain, 'jour') + ')') })]),
        h('div.d', [h('b', { text: argent2(l.f.paiement) })])
      ]));
    });
    if (!liste.length) ul.appendChild(h('li', [h('span.doux', { text: 'Aucun prélèvement dans les 14 prochains jours.' })]));
    return carte('Prochains prélèvements', h('span.doux', { text: liste.length ? argent2(somme(liste, 'paiement')) + ' en 14 jours' : '' }), ul);
  };
  Lmb.prototype.carteFins = function (contrats) {
    var self = this, s = this.sources('contrats')[0];
    var liste = contrats.filter(function (l) { return l.f._joursFin !== undefined && l.f._joursFin >= -30 && l.f._joursFin <= 365; }).sort(function (a, b) { return a.f._joursFin - b.f._joursFin; });
    var ul = h('ul.lmb-liste-simple');
    liste.forEach(function (l) {
      ul.appendChild(h('li.cliquable', { onclick: function () { self.detail(s, l); } }, [
        h('div.g', [h('b', { text: (l.f.client || '—') + ' · ' + (l.f.modele || l.f.stock || '') }), h('span', { text: 'fin ' + dateCourte(l.f._fin) + (l.f._joursFin < 0 ? ' (passée)' : ' (dans ' + pluriel(l.f._joursFin, 'jour') + ')') })]),
        h('div.d', [h('b', { text: argent(l.f.residuelle) }), h('span.s', { style: { display: 'block', color: 'var(--encre-3)', fontSize: '12px' }, text: 'valeur résiduelle' })])
      ]));
    });
    if (!liste.length) ul.appendChild(h('li', [h('span.doux', { text: 'Aucun contrat ne finit dans les 12 prochains mois.' })]));
    return carte('Fins de contrat (12 mois)', h('span.doux', { text: liste.length ? argent(somme(liste, 'residuelle')) + ' de résiduelles' : '' }), ul);
  };
  Lmb.prototype.carteSources = function () {
    var self = this, ul = h('ul.lmb-liste-simple');
    this.sources().forEach(function (s) {
      ul.appendChild(h('li.cliquable', { onclick: function () { if (s.erreur) self.ouvrirSources(); else { self.vue = s.cle; self.filtres = {}; self.rendre(); } } }, [
        h('div.g', [h('b', { text: s.nom }), h('span', { text: (s.classeur || 'classeur') + ' › ' + s.onglet })]),
        h('div.d', [s.erreur ? h('span.puce.alerte', { text: 'À partager', title: s.erreur }) : h('span.puce.ok', { text: pluriel((s.lignes || []).length, 'ligne') })])
      ]));
    });
    return carte('Onglets connectés', h('button.btn.petit', { type: 'button', text: 'Gérer', onclick: function () { self.ouvrirSources(); } }), ul, true);
  };

  /* ------------------------------------------------------------------------------- vue d'un onglet */
  var PASTILLES = {
    flotte: [['actifs', 'En location'], ['lease', 'LEASE'], ['rental', 'RENTAL'], ['retour', 'Retournés'], ['vendus', 'Vendus (onglet Vendus)', 1], ['tous', 'Toutes les lignes'], ['al:rdprm', 'RDPRM non noté', 1], ['al:radiation', 'RDPRM pas radié', 1], ['al:fp', 'Floor plan pas payé', 1], ['al:contrat', 'Sans date de contrat', 1]],
    contrats: [['tous', 'Tous'], ['prochain', 'Prélèvement 7 j'], ['fin90', 'Fin dans 90 j'], ['incomplet', 'Incomplets', 1]]
  };
  function garde(type, filtre, l) {
    var f = l.f;
    if (type === 'flotte') {
      if (filtre === 'actifs') return f._actif;
      if (filtre === 'lease') return f._actif && f._loc === 'LEASE';
      if (filtre === 'rental') return f._actif && f._loc === 'RENTAL';
      if (filtre === 'retour') return !!(f.retour || f.retourTexte);
      if (filtre === 'vendus') return !!f._vendu;
      if (/^al:/.test(filtre)) return (f._alertes || []).some(function (a) { return a[0] === filtre.slice(3); });
      return true;
    }
    if (type === 'achats') return !f._note && !f._doublon;
    if (type === 'contrats') {
      if (filtre === 'prochain') return f._joursProchain !== undefined && f._joursProchain >= 0 && f._joursProchain <= 7;
      if (filtre === 'fin90') return f._joursFin !== undefined && f._joursFin >= 0 && f._joursFin <= 90;
      if (filtre === 'incomplet') return f._incomplet;
    }
    return true;
  }
  Lmb.prototype.rendreSource = function (s) {
    var self = this;
    AMX.vider(this.elPastilles); AMX.vider(this.elKpis); AMX.vider(this.elCorps);
    if (s.erreur) {
      AMX.vider(this.elPortee);
      var compte = (this.rep && this.rep.compteScript) || 'le compte du script';
      this.elCorps.appendChild(h('div.lmb-erreur-source', [h('b', { text: s.nom + ' : ' }), s.erreur, s.partage ? h('div', { style: { marginTop: '6px' } }, ['Dans Google Sheets : Partager › ajouter ', h('code', { text: compte }), ' en « Lecteur », puis Rafraîchir.']) : null,
        s.ongletsDispo ? h('div', { style: { marginTop: '6px' }, text: 'Onglets du classeur : ' + s.ongletsDispo.join(', ') }) : null]));
      this.elCorps.appendChild(h('div', [h('button.btn', { type: 'button', text: 'Ouvrir le classeur', onclick: function () { window.open(s.lien, '_blank', 'noopener'); } }), ' ', h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } })]));
      return;
    }
    var defs = PASTILLES[s.type], filtre = this.filtres[s.type] || (s.type === 'flotte' ? 'actifs' : 'tous');
    var trouvees = this.trouvees(s);
    if (defs) defs.forEach(function (d) {
      var n = trouvees.filter(function (l) { return garde(s.type, d[0], l); }).length;
      if (d[2] && !n && filtre !== d[0]) return;
      self.elPastilles.appendChild(h('button' + (filtre === d[0] ? '.actif' : '') + (d[2] ? '.alerte' : ''), { type: 'button', onclick: function () { self.filtres[s.type] = d[0]; self.rafraichir(); } }, [d[1] + ' ', h('b', { text: AMX.fmtNombre(n) })]));
    });
    var liste = trouvees.filter(function (l) { return garde(s.type, filtre, l); });
    var libFiltre = defs ? (defs.filter(function (d) { return d[0] === filtre; })[0] || [])[1] : '';
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['ligne', 'lignes'], contexte: s.nom,
      filtres: [defs && filtre !== (s.type === 'flotte' ? 'actifs' : 'tous') ? libFiltre : '', this.client ? 'Client : ' + this.clientNom() : '', this.q.trim() ? '« ' + this.q.trim() + ' »' : ''],
      effacer: function () { self.filtres[s.type] = null; self.effacerFiltres(); } });
    this.rendreChiffres(s, liste);
    if (s.type === 'achats') { var dbl = trouvees.filter(function (l) { return l.f._doublon; }).length; if (dbl) this.elCorps.appendChild(h('p.doux', { style: { margin: '0 0 8px' }, text: pluriel(dbl, 'véhicule') + ' inscrit' + (dbl > 1 ? 's' : '') + ' dans les deux tableaux de l\'onglet (même NIV) : compté' + (dbl > 1 ? 's' : '') + ' une seule fois.' })); }
    this.elCorps.appendChild(this.tableau(s, liste));
  };
  Lmb.prototype.rendreChiffres = function (s, liste) {
    var k = this.elKpis, t = function (v, lib, sous) { k.appendChild(h('div.kpi', { style: { cursor: 'default' } }, [h('span.libelle', { text: lib }), h('span.valeur', { text: v }), sous ? h('span.sous', { text: sous }) : null])); };
    if (s.type === 'flotte') {
      var cout = liste.filter(function (l) { return typeof l.f.cout === 'number' && l.f.cout > 0; });
      t(AMX.fmtNombre(liste.length), 'Lignes', liste.filter(function (l) { return l.f._actif; }).length + ' en location');
      t(argent(somme(liste, 'cout')), 'Location mensuelle', cout.length ? 'moyenne ' + argent(somme(cout, 'cout') / cout.length) : '');
      t(String(liste.filter(function (l) { return l.f._loc === 'LEASE'; }).length), 'LEASE', 'baux clients');
      t(String(liste.filter(function (l) { return l.f._loc === 'RENTAL'; }).length), 'RENTAL', 'courtoisie, concessions');
      t(String(liste.filter(function (l) { return (l.f._alertes || []).length; }).length), 'À surveiller', 'lignes avec une alerte');
    } else if (s.type === 'contrats') {
      t(AMX.fmtNombre(liste.length), 'Contrats', '');
      t(argent(somme(liste, 'solde')), 'Solde de la dette', 'intérêt ' + argent2(somme(liste, 'interetJour')) + ' / jour');
      t(argent2(somme(liste, 'paiement')), 'Paiements mensuels', 'taxes incluses');
      t(argent(somme(liste, 'encaisse')), 'Encaissé à ce jour', 'intérêt gagné ' + argent(somme(liste, 'interetGagne')));
      t(argent(somme(liste, 'residuelle')), 'Valeurs résiduelles', 'rachats en fin de bail');
    } else if (s.type === 'achats') {
      var paye = somme(liste, 'prixPaye'), vente = somme(liste, 'prixVente'), profit = somme(liste, 'profit');
      t(AMX.fmtNombre(liste.length), 'Transactions', '');
      t(argent(paye), 'Achats', ''); t(argent(vente), 'Ventes', '');
      t(argent(profit), 'Profit', paye ? (Math.round(1000 * profit / paye) / 10).toString().replace('.', ',') + ' % de l\'achat' : '');
    } else {
      t(AMX.fmtNombre(liste.length), 'Lignes', s.classeur ? s.classeur : '');
    }
  };
  /* Colonnes du tableau par type ; un onglet libre montre ses 8 premières colonnes. */
  function colonnes(s) {
    if (s.type === 'flotte' || s.type === 'vendus') return [
      ['Stock', function (f) { return h('b.mono', { text: f.stock || '—' }); }],
      ['Véhicule', function (f) { return [f.modele || '—', f.vin ? h('span.s.mono', { text: f.vin }) : null]; }],
      ['Plaque', function (f) { return f.plaque || '—'; }],
      ['Loué à', function (f) { return f.loueA || '—'; }],
      ['Type', function (f) { return f._loc === 'Autre' ? (f.type || '—') : h('span.puce' + (f._loc === 'LEASE' ? '.info' : (f._loc === 'RENTAL' ? '.ok' : '.attention')), { text: f._loc }); }],
      ['Contrat', function (f) { return f.contrat ? dateCourte(f.contrat) : (f.contratTexte || '—'); }],
      ['Location / mois', function (f) { return argent2(f.cout); }, 'num'],
      ['Retour', function (f) { return f.retour ? [dateCourte(f.retour), f.kmRetour ? h('span.s', { text: AMX.fmtNombre(f.kmRetour) + ' km' }) : null] : (f.retourTexte || ''); }],
      ['À surveiller', function (f) { return (f._vendu ? [h('span.puce', { text: 'Vendu (' + f._vendu.onglet + ')', style: { marginRight: '4px' } })] : []).concat((f._alertes || []).map(function (a) { return h('span.puce.' + (a[0] === 'rdprm' ? 'alerte' : 'attention'), { text: a[1], style: { marginRight: '4px' } }); })); }]
    ];
    if (s.type === 'contrats') return [
      ['Stock', function (f) { return h('b.mono', { text: f.stock || '—' }); }],
      ['Client', function (f) { return [f.client || '—', f.modele ? h('span.s', { text: f.modele }) : null]; }],
      ['Paiement', function (f) { return [argent2(f.paiement), f.jour ? h('span.s', { text: 'le ' + f.jour + ' du mois' }) : null]; }, 'num'],
      ['Prochain', function (f) { return f.prochain ? dateCourte(f.prochain) : '—'; }],
      ['Solde', function (f) { return argent2(f.solde); }, 'num'],
      ['Intérêt / jour', function (f) { return argent2(f.interetJour); }, 'num'],
      ['Résiduelle', function (f) { return argent(f.residuelle); }, 'num'],
      ['Fin', function (f) { return f._fin ? dateCourte(f._fin) : '—'; }],
      ['Statut', function (f) { return f.statut ? h('span.puce' + (f._incomplet ? '.alerte' : ''), { text: f.statut }) : '—'; }]
    ];
    if (s.type === 'achats') return [
      ['Achat', function (f) { return f.date ? dateCourte(f.date) : (f.stock ? h('b.mono', { text: f.stock }) : '—'); }],
      ['Véhicule', function (f) { return [f._vehicule || '—', f.vin ? h('span.s.mono', { text: f.vin }) : null]; }],
      ['Vendeur', function (f) { return f.vendeur || '—'; }],
      ['Prix payé', function (f) { return argent2(f.prixPaye); }, 'num'],
      ['Acheteur', function (f) { return f.acheteur || '—'; }],
      ['Prix de vente', function (f) { return argent2(f.prixVente); }, 'num'],
      ['Profit', function (f) { return argent2(f.profit); }, 'num']
    ];
    return null;
  }
  Lmb.prototype.tableau = function (s, liste) {
    var self = this, cols = colonnes(s);
    if (!liste.length) return h('div.lmb-vide', { text: this.q ? 'Rien ne correspond à la recherche.' : 'Aucune ligne.' });
    var max = 500, thead, corps = h('tbody');
    if (cols) thead = h('thead', [h('tr', cols.map(function (c) { return h('th' + (c[2] ? '.' + c[2] : ''), { text: c[0] }); }))]);
    else thead = h('thead', [h('tr', s.entetes.slice(0, 8).map(function (e) { return h('th', { text: e }); }))]);
    liste.slice(0, max).forEach(function (l) {
      var tds = cols ? cols.map(function (c) { return h('td' + (c[2] ? '.' + c[2] : ''), [c[1](l.f)]); }) : l.c.slice(0, 8).map(function (v) { return h('td', { text: v }); });
      corps.appendChild(h('tr.cliquable', { onclick: function () { self.detail(s, l); } }, tds));
    });
    var bloc = h('div', [h('div.lmb-table-cadre', [h('table.tableau.lmb-table', [thead, corps])])]);
    if (liste.length > max) bloc.appendChild(h('p.doux', { text: max + ' premières lignes sur ' + AMX.fmtNombre(liste.length) + ' — précisez la recherche.' }));
    return bloc;
  };
  function titreLigne(s, l) {
    var f = l.f;
    if (s.type === 'contrats') return (f.stock ? f.stock + ' · ' : '') + (f.client || f.modele || '');
    if (s.type === 'achats') return (f.stock ? f.stock + ' · ' : '') + (f._vehicule || f.vin || '') + (f.acheteur ? ' → ' + f.acheteur : '');
    if (f.stock || f.modele) return (f.stock ? f.stock + ' · ' : '') + (f.modele || '');
    return l.c.filter(Boolean).slice(0, 2).join(' · ');
  }
  function sousLigne(s, l) {
    var f = l.f;
    if (s.type === 'contrats') return [f.modele, f.solde !== undefined ? 'solde ' + argent(f.solde) : ''].filter(Boolean).join(' · ');
    if (s.type === 'flotte' || s.type === 'vendus') return [f.loueA, f.plaque, f.vin].filter(Boolean).join(' · ');
    if (s.type === 'achats') return [f.vendeur, f.profit !== undefined ? 'profit ' + argent(f.profit) : ''].filter(Boolean).join(' · ');
    return l.c.filter(Boolean).slice(2, 5).join(' · ');
  }
  Lmb.prototype.detail = function (s, l) {
    var dl = h('dl.lmb-detail'), ent = (l.b && s.blocs && s.blocs[l.b]) || s.entetes;
    ent.forEach(function (e, i) { var v = l.c[i]; if (!v) return; dl.appendChild(h('dt', { text: e })); dl.appendChild(h('dd', { text: v })); });
    if (!dl.firstChild) dl.appendChild(h('dd', { text: 'Ligne vide.' }));
    var lien = s.lien + (s.lien.indexOf('#') >= 0 ? '&' : '#') + 'range=A' + l.r;
    AMX.modale({ titre: titreLigne(s, l) || s.nom, corps: h('div', [h('p.doux', { style: { margin: '0 0 10px' }, text: s.nom + ' · ' + (s.classeur || '') + ' › ' + s.onglet + ', ligne ' + l.r }), dl]), large: true,
      boutons: [{ texte: 'Fermer' }, { texte: 'Ouvrir la ligne dans Google Sheets', classe: 'primaire', action: function () { window.open(lien, '_blank', 'noopener'); return false; } }] });
  };

  /* ------------------------------------------------------------------------------- onglets connectés */
  Lmb.prototype.ouvrirSources = function () {
    var self = this, rep = this.rep || { sources: [] }, compte = rep.compteScript || 'le compte du script';
    var corps = h('div');
    var liste = h('ul.lmb-liste-simple');
    (rep.sources || []).forEach(function (s) {
      liste.appendChild(h('li', [
        h('div.g', [h('b', { text: s.nom + ' — ' + (TYPES[s.type] || 'Onglet') }), h('span', { text: (s.classeur || s.id) + ' › ' + s.onglet + (s.erreur ? ' · ' + s.erreur : ' · ' + pluriel((s.lignes || []).length, 'ligne')) })]),
        h('div.d', [h('button.btn.petit.fantome', { type: 'button', text: 'Retirer', onclick: function () { AMX.confirmer('Retirer « ' + s.nom + ' »', 'L\'onglet ne sera plus lu par ScanAutomax (le classeur ne change pas).', { ok: 'Retirer', danger: true }).then(function (oui) { if (oui) self.sourcesPost({ op: 'retirer', cle: s.cle }, 'Onglet retiré', m); }); } })])
      ]));
    });
    corps.appendChild(liste);
    corps.appendChild(h('h4', { style: { margin: '16px 0 6px' }, text: 'Connecter un onglet' }));
    corps.appendChild(h('p.doux', { style: { margin: '0 0 8px' }, text: 'Collez le lien du classeur Google Sheets. Il doit être partagé en lecture avec ' + compte + '.' }));
    var inLien = h('input.saisie', { type: 'url', placeholder: 'https://docs.google.com/spreadsheets/d/…', autocomplete: 'off' });
    var btnVoir = h('button.btn', { type: 'button', text: 'Voir les onglets' });
    var zone = h('div', { style: { marginTop: '10px' } });
    corps.appendChild(h('div', { style: { display: 'flex', gap: '6px' } }, [inLien, btnVoir]));
    corps.appendChild(zone);
    btnVoir.addEventListener('click', function () {
      var lien = inLien.value.trim(); if (!lien) { inLien.focus(); return; }
      btnVoir.disabled = true; AMX.vider(zone); zone.appendChild(h('p.doux', { text: 'Lecture du classeur…' }));
      AMX.get({ lmbOnglets: '1', lien: lien }, { delai: 60000, secours: false }).then(function (d) {
        btnVoir.disabled = false; AMX.vider(zone);
        if (!d || d.ok === false || d.refuse) { zone.appendChild(h('div.lmb-erreur-source', { text: (d && d.erreur) || 'Lecture impossible.' })); return; }
        var sel = h('select.saisie'), inNom = h('input.saisie', { type: 'text', placeholder: 'Nom dans ScanAutomax' }), selType = h('select.saisie');
        d.onglets.forEach(function (o) { sel.appendChild(h('option', { value: o.nom, text: o.nom + ' (' + o.lignes + ' lignes)' })); });
        Object.keys(TYPES).forEach(function (t) { selType.appendChild(h('option', { value: t, text: t === 'libre' ? 'Libre (colonnes telles quelles)' : TYPES[t] })); });
        var majType = function () { var o = d.onglets.filter(function (x) { return x.nom === sel.value; })[0]; if (o) selType.value = o.type; inNom.value = sel.value; };
        sel.addEventListener('change', majType); majType();
        zone.appendChild(h('p', { style: { margin: '0 0 6px' } }, [h('b', { text: d.classeur })]));
        zone.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' } }, [sel, inNom, selType]));
        zone.appendChild(h('div', { style: { marginTop: '8px' } }, [h('button.btn.primaire', { type: 'button', text: 'Connecter cet onglet', onclick: function () { self.sourcesPost({ op: 'ajouter', lien: lien, onglet: sel.value, nom: inNom.value.trim() || sel.value, type: selType.value }, 'Onglet connecté', m); } })]));
      }, function (e) { btnVoir.disabled = false; AMX.vider(zone); zone.appendChild(h('div.lmb-erreur-source', { text: AMX.erreurTexte(e) })); });
    });
    var m = AMX.modale({ titre: 'Onglets connectés', corps: corps, large: true, proteger: false,
      boutons: [{ texte: 'Remettre par défaut', action: function () { AMX.confirmer('Remettre les onglets par défaut', 'Les quatre onglets de départ (flotte, contrats, vendus, achats / revente) reviennent ; les autres sont retirés.', { ok: 'Remettre' }).then(function (oui) { if (oui) self.sourcesPost({ op: 'reinitialiser' }, 'Onglets remis par défaut', m); }); return false; } }, { texte: 'Fermer' }] });
  };
  Lmb.prototype.sourcesPost = function (corps, ok, modale) {
    var self = this;
    corps.action = 'lmbSources';
    return AMX.post(corps, { delai: 60000 }).then(function (d) {
      if (!d || d.ok === false || d.refuse) { AMX.toast((d && d.erreur) || 'Refusé', 'erreur'); return; }
      AMX.toast(ok, 'ok');
      if (modale) try { modale.fermer(); } catch (e) {}
      if (corps.cle && corps.op === 'retirer' && self.vue === corps.cle) self.vue = 'resume';
      if (d.cle) self.vue = d.cle;
      self.charger(true);
    }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };

  /* ------------------------------------------------------------------------------- export */
  Lmb.prototype.exporter = function () {
    if (!this.rep) return;
    var self = this, feuilles = [];
    this.sources().forEach(function (s) {
      if (s.erreur) return;
      var l = self.trouvees(s); if (!l.length) return;
      feuilles.push({ nom: s.nom.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31), lignes: [s.entetes].concat(l.map(function (x) { return x.c; })) });
    });
    if (!feuilles.length) { AMX.toast('Rien à exporter.', 'attention'); return; }
    var nom = 'lmb-' + new Date().toISOString().slice(0, 10);
    if (typeof XLSX === 'undefined') { AMX.toast('Excel indisponible dans ce navigateur.', 'erreur'); return; }
    var wb = XLSX.utils.book_new();
    feuilles.forEach(function (f) { var ws = XLSX.utils.aoa_to_sheet(f.lignes); ws['!cols'] = f.lignes[0].map(function (e, i) { return { wch: Math.min(40, Math.max(10, f.lignes.reduce(function (m, r) { return Math.max(m, String(r[i] || '').length); }, 0) + 2)) }; }); XLSX.utils.book_append_sheet(wb, ws, f.nom); });
    XLSX.writeFile(wb, nom + '.xlsx');
    AMX.toast(pluriel(feuilles.length, 'onglet') + ' exporté' + (feuilles.length > 1 ? 's' : '') + (this.q ? ' (filtrés par la recherche)' : ''), 'ok');
  };
})();
