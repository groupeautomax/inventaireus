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
    '.lmb-table td.num, .lmb-table th.num { white-space: nowrap; text-align: right; }',
    '.lmb-table td.mono, .lmb-table td .mono { font-family: var(--mono); font-size: 12px; }',
    '.lmb-table mark, .lmb-detail mark { background: #fff1a8; color: inherit; border-radius: 2px; }',
    '.lmb-detail { display: grid; grid-template-columns: minmax(150px, 34%) 1fr; gap: 0; margin: 0; }',
    '.lmb-detail dt, .lmb-detail dd { padding: 7px 8px; border-bottom: 1px solid var(--ligne); margin: 0; font-size: 13px; }',
    '.lmb-detail dt { color: var(--encre-3); font-weight: 600; } .lmb-detail dd { word-break: break-word; }',
    '.lmb-erreur-source { border-left: 4px solid var(--rouge); background: var(--rouge-bg); padding: 10px 12px; border-radius: 8px; margin: 0 0 10px; font-size: 13px; }',
    '.lmb-erreur-source code { font-family: var(--mono); font-weight: 700; }',
    '.lmb-vide { padding: 28px; text-align: center; color: var(--encre-3); }',
    '.lmb-outils { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 8px; }',
    '.lmb-table td.note { max-width: 260px; white-space: normal; font-size: 12.5px; color: var(--encre-2); }',
    '.lmb-note { display: block; margin-top: 3px; padding: 4px 8px; background: #fff8d6; border-left: 3px solid #e0b400; border-radius: 4px; color: var(--encre); font-size: 12.5px; white-space: normal; }',
    '.lmb-maitre { margin-left: auto; align-self: center; font-size: 13px; font-weight: 700; color: var(--vert-fonce); text-decoration: none; border: 1px solid var(--vert-clair); background: var(--vert-clair); border-radius: 999px; padding: 6px 13px; }',
    '.lmb-maitre:hover { text-decoration: underline; }',
    '.lmb-lien-maitre { display: block; font-size: 12px; font-weight: 600; color: var(--vert-fonce); text-decoration: none; margin-top: 2px; } .lmb-lien-maitre:hover { text-decoration: underline; }',
    '.lmb-contrat-maitre { display: grid; gap: 3px; margin: 0 0 10px; padding: 9px 12px; border-left: 4px solid var(--vert); background: var(--vert-clair); border-radius: 6px; font-size: 13px; }',
    '.lmb-contrat-maitre a { font-weight: 700; color: var(--vert-fonce); }',
    '.lmb-masquees { margin-top: 14px; border: 1px dashed var(--ligne); border-radius: 10px; padding: 8px 12px; background: var(--carte); }',
    '.lmb-masquees summary { cursor: pointer; font-weight: 700; color: var(--encre-2); font-size: 13px; }',
    '.lmb-masquees .lmb-liste-simple li { opacity: .85; }'
  ].join('\n');
  function css() { if (!document.getElementById('css-lmb')) { var s = document.createElement('style'); s.id = 'css-lmb'; s.textContent = CSS; document.head.appendChild(s); } }

  /* ------------------------------------------------------------------------------- données */
  var cache = { rep: null, le: 0, enCours: null, copieLe: 0, masques: lireMasquesLocaux(), masquesLus: false };
  /* 29 oct. (Maxime) : « enlever une location ou autre qu'on ne veut plus suivre, mais pas l'effacer dans la base de
     données ». Rien n'est écrit dans les classeurs : la liste des lignes retirées est gardée par le script (lmbSources
     op 'masquer', GET ?lmb=1&masques=1) et copiée dans ce navigateur pour s'appliquer dès l'ouverture. */
  function lireMasquesLocaux() { try { var o = AMX.cacheLocal && AMX.cacheLocal.lire('lmb_masques', 30 * 864e5); return (o && o.donnees && typeof o.donnees === 'object') ? o.donnees : {}; } catch (e) { return {}; } }
  function poserMasques(m) { cache.masques = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {}; cache.masquesLus = true; try { if (AMX.cacheLocal) AMX.cacheLocal.ecrire('lmb_masques', cache.masques); } catch (e) {} }
  function chargerMasques() {
    return AMX.get({ lmb: '1', masques: '1' }, { delai: 30000, secours: false }).then(function (d) {
      if (d && d.ok !== false && !d.refuse && d.masques && typeof d.masques === 'object' && !Array.isArray(d.masques)) { poserMasques(d.masques); return true; }
      return false;   /* script d'avant (pas de « masques ») : on garde la copie locale */
    }, function () { return false; });
  }
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
  /* 29 oct. (Maxime) : « location long terme : inclure un lien vers le fichier maître de calcul de location ». Le fichier maître =
     « Calcul LMB - Suivi Location » (onglet Contrats : soldes, échéanciers). Son adresse vient de la source « contrats » ; à défaut,
     de l'identifiant connu. */
  var ID_FICHIER_MAITRE = '1nyIISPlTH29HbbbsUQrshT1dmtgw3OBcak2jhyWL2Yw';
  function fichierMaitre(rep) {
    var s = ((rep && rep.sources) || []).filter(function (x) { return x.type === 'contrats' && x.id; })[0];
    return { lien: s ? s.lien : 'https://docs.google.com/spreadsheets/d/' + ID_FICHIER_MAITRE + '/edit', nom: (s && s.classeur) || 'Calcul LMB - Suivi Location', source: s || null };
  }
  function lienLigne(s, l) { return s.lien + (s.lien.indexOf('#') >= 0 ? '&' : '#') + 'range=A' + l.r; }
  function cleNiv(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function indexVendus(rep) {
    var idx = { vin: {}, fin: {}, stock: {} };
    (rep.sources || []).forEach(function (s) {
      if (s.type !== 'vendus') return;
      (s._toutes || s.lignes || []).forEach(function (l) {   /* une ligne Vendus retirée du suivi dit quand même que le véhicule est vendu */
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
  /* Clé stable d'une ligne : onglet + NIV et client (un même véhicule reloué à un autre client reste suivi), sinon # stock,
     sinon le début du texte de la ligne. Ne dépend pas du numéro de ligne : un tri du classeur ne change rien. */
  function cleLigne(s, l) {
    var f = l.f || {}, v = cleNiv(f.vin), st = cleNiv(f.stock), id;
    if (v.length >= 11) id = 'v:' + v + (f._clientCle ? '~' + f._clientCle.slice(0, 40) : '');
    else if (st) id = 's:' + st + (f._clientCle ? '~' + f._clientCle.slice(0, 40) : '');
    else id = 't:' + AMX.texteCherche((l.c || []).filter(Boolean).slice(0, 3).join(' ')).replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
    return (s.cle + '|' + id).slice(0, 160);
  }
  /* Colonne NOTE (ajoutée par Maxime le 29 oct.) : lue dans les colonnes de la ligne si le script ne la nomme pas encore. */
  function colNote(s, l) {
    var ent = (l.b && s.blocs && s.blocs[l.b]) || s.entetes || [];
    for (var i = 0; i < ent.length; i++) if (/^notes?$/.test(AMX.texteCherche(ent[i] || '').trim())) return i;
    return -1;
  }
  function indexContrats(rep) {
    var idx = { vin: {}, fin: {}, stock: {} };
    (rep.sources || []).forEach(function (s) {
      if (s.type !== 'contrats') return;
      (s._toutes || s.lignes || []).forEach(function (l) {
        var v = cleNiv(l.f.vin), st = cleNiv(l.f.stock), info = { s: s, l: l };
        if (v.length >= 11) idx.vin[v] = info;
        if (v.length >= 8) idx.fin[v.slice(-8)] = info;
        if (/^LOC\d{3,}$/.test(st)) idx.stock[st] = info;
      });
    });
    return idx;
  }
  function contratDe(idx, f) {
    var v = cleNiv(f.vin), st = cleNiv(f.stock);
    if (v.length >= 11 && idx.vin[v]) return idx.vin[v];
    if (v.length >= 8 && idx.fin[v.slice(-8)]) return idx.fin[v.slice(-8)];
    if (st && idx.stock[st] && (!v || !cleNiv(idx.stock[st].l.f.vin))) return idx.stock[st];
    return null;
  }
  function preparer(rep) {
    var auj = aujourdhui(), idxV = indexVendus(rep), idxC = indexContrats(rep), masques = cache.masques || {};
    (rep.sources || []).forEach(function (s) {
      if (!s._toutes) { try { Object.defineProperty(s, '_toutes', { value: s.lignes || [], enumerable: false, configurable: true, writable: true }); } catch (eT) { s._toutes = s.lignes || []; } }
      s._toutes.forEach(function (l) {
        var f = l.f || (l.f = {});
        try { Object.defineProperty(l, '_src', { value: s, enumerable: false, configurable: true }); } catch (e0) {}
        if (f.note === undefined) { var iN = colNote(s, l); if (iN >= 0 && l.c[iN]) f.note = l.c[iN]; }
        var nomC = (s.type === 'flotte' || s.type === 'vendus') && !f.vin ? '' : clientDe(s.type, f);   /* une ligne de dépôt (sans NIV) n'a pas de client */
        f._client = nomC ? String(nomC).replace(/\s+/g, ' ').trim() : ''; f._clientCle = f._client ? cleClient(f._client) : '';
        if (s.type === 'flotte' || s.type === 'vendus') {
          f._loc = typeLoc(f);
          f._vendu = s.type === 'flotte' ? vendu(idxV, f) : null;
          try { Object.defineProperty(f, '_contratMaitre', { value: s.type === 'flotte' ? contratDe(idxC, f) : null, enumerable: false, configurable: true, writable: true }); } catch (eC) {}
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
          f._doublon = false;
          f._note = typeof f.prixPaye !== 'number' && typeof f.prixVente !== 'number' && typeof f.profit !== 'number';
          f._vehicule = [f.annee, f.marque, f.modeleNom].filter(Boolean).join(' ');
        }
        if (s.type === 'contrats') {
          if (f.debut && f.duree) { f._fin = plusMois(f.debut, Math.round(f.duree)); f._joursFin = joursEntre(auj, f._fin); }
          if (f.prochain) f._joursProchain = joursEntre(auj, f.prochain);
          f._incomplet = /incomplet/i.test(f.statut || '');
        }
        f._cle = cleLigne(s, l); f._masque = masques[f._cle] || null;
      });
      s.lignes = s._toutes.filter(function (l) { return !l.f._masque; });
      try { Object.defineProperty(s, 'masquees', { value: s._toutes.filter(function (l) { return !!l.f._masque; }), enumerable: false, configurable: true, writable: true }); } catch (eM) { s.masquees = []; }
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
  AMX.lmb = { charger: charger, vider: function () { cache = { rep: null, le: 0, enCours: null, copieLe: 0, masques: {}, masquesLus: false }; try { if (AMX.cacheLocal) AMX.cacheLocal.oublier('lmb_masques'); } catch (e) {} } };

  function Lmb(conteneur, ctx) {
    css();
    var self = this;
    this.conteneur = conteneur; this.detruit = false;
    this.vue = (ctx && ctx.params && ctx.params.vue) || AMX.memo.lire('lmb_vue', 'resume');
    this.q = ''; this.filtres = {}; this.client = ''; this.explicites = {};
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
    this.selClient.addEventListener('change', function () { self.choisirClient(self.selClient.value); });
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
    this.selection = AMX.modeSelection ? AMX.modeSelection({ liste: this.elCorps, selecteur: 'tr',
      actions: [{ texte: 'Ne plus suivre', action: function (cles, fini) { self.masquer(self.lignesDeCles(cles), true, fini); } }] }) : null;
    this.charger(false);
    chargerMasques().then(function (ok) { if (ok && self.rep && !self.detruit) { self.rep = preparer(self.rep); self.rendre(); } });
  }
  Lmb.prototype.lignesDeCles = function (cles) {
    var voulu = {}, out = []; (cles || []).forEach(function (c) { voulu[c] = true; });
    this.sources().forEach(function (s) { (s._toutes || s.lignes || []).forEach(function (l) { if (voulu[l.f._cle]) { out.push(l); voulu[l.f._cle] = false; } }); });
    return out;
  };
  /* Retirer du suivi (masquer = true) ou remettre (false). Rien n'est écrit dans le classeur. */
  Lmb.prototype.masquer = function (lignes, masquer, fini) {
    var self = this, n = lignes.length;
    if (!n) return Promise.resolve(false);
    var envoyer = function (raison) {
      var titres = {}; lignes.forEach(function (l) { titres[l.f._cle] = (titreLigne(l._src || self.sourceVue(), l) || '').slice(0, 90); });
      return AMX.post({ action: 'lmbSources', op: 'masquer', cles: lignes.map(function (l) { return l.f._cle; }), masquer: masquer, raison: raison || '', titres: titres }, { delai: 30000 }).then(function (d) {
        if (!d || d.refuse) throw new Error((d && d.erreur) || 'Refusé.');
        if (d.ok === false) throw new Error(/op[ée]ration inconnue/i.test(d.erreur || '') ? 'Le script n\'est pas à jour — déployez la version qui contient « Ne plus suivre ».' : (d.erreur || 'Refusé.'));
        if (!d.masques) throw new Error('Le script n\'est pas à jour — déployez la version qui contient « Ne plus suivre ».');
        poserMasques(d.masques);
        if (self.rep) self.rep = preparer(self.rep);
        if (fini) fini();
        self.rendre();
        AMX.toast(masquer ? pluriel(n, 'ligne') + ' retirée' + (n > 1 ? 's' : '') + ' du suivi (le classeur ne change pas)' : pluriel(n, 'ligne') + ' remise' + (n > 1 ? 's' : '') + ' au suivi', 'ok');
        return true;
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
    };
    if (!masquer) return envoyer('');
    var inRaison = h('input.saisie', { type: 'text', maxlength: '120', placeholder: 'Raison (facultatif) : terminé, doublon, essai…', autocomplete: 'off' });
    var titre1 = n === 1 ? (titreLigne(lignes[0]._src || this.sourceVue(), lignes[0]) || 'cette ligne') : '';
    AMX.modale({ titre: n === 1 ? 'Ne plus suivre « ' + titre1 + ' »' : 'Ne plus suivre ' + n + ' lignes', proteger: false,
      corps: h('div', [
        h('p', { style: { margin: '0 0 10px' }, text: 'Rien n\'est effacé : ' + (n === 1 ? 'la ligne reste' : 'les lignes restent') + ' dans le classeur Google. ' + (n === 1 ? 'Elle disparaît' : 'Elles disparaissent') + ' de cette page et des chiffres ; « Retirés du suivi », au bas de l\'onglet, permet de ' + (n === 1 ? 'la' : 'les') + ' remettre.' }),
        h('label.champ', [h('span', { text: 'Raison' }), inRaison])
      ]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Ne plus suivre', classe: 'primaire', action: function () { return envoyer(inRaison.value.trim()); } }] });
    setTimeout(function () { try { inRaison.focus(); } catch (e) {} }, 50);
    return Promise.resolve(true);
  };
  Lmb.prototype.demonter = function () { this.detruit = true; if (this.selection && this.selection.actif()) this.selection.quitter(); };
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
  /* 29 oct. (Maxime) : « quand je choisis, le premier filtre se fait automatiquement » — un client absent de l'onglet ouvert
     mène au premier onglet où il a des lignes, et les pastilles repartent du premier filtre qui a des lignes. */
  Lmb.prototype.choisirClient = function (cle) {
    var self = this;
    this.client = cle || ''; this.explicites = {}; this.filtres = {};
    if (this.client && this.vue !== 'resume') {
      var s0 = this.sourceVue();
      if (!s0 || !this.trouvees(s0).length) {
        var autre = this.sources().filter(function (s) { return !s.erreur && self.trouvees(s).length; })[0];
        if (autre) this.vue = autre.cle;
      }
    }
    this.rendre();
  };
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
      return h('button' + (self.vue === cle ? '.actif' : '') + (erreur ? '.erreur' : ''), { type: 'button', onclick: function () { self.vue = cle; self.filtres = {}; self.explicites = {}; self.rendre(); } }, [titre, n !== null ? h('span.n', { text: AMX.fmtNombre(n) }) : null]);
    };
    this.elVues.appendChild(bouton('resume', 'Résumé', null));
    this.sources().forEach(function (s) { self.elVues.appendChild(bouton(s.cle, s.nom, s.erreur ? null : (s.lignes || []).length, !!s.erreur)); });
    var fm = fichierMaitre(this.rep);
    this.elVues.appendChild(h('a.lmb-maitre', { href: fm.lien, target: '_blank', rel: 'noopener', title: fm.nom + ' — soldes, échéanciers et calculs des locations long terme' }, ['Fichier maître de calcul ↗']));
    var sv = this.sourceVue();
    this.btnOuvrir.textContent = sv && sv.type === 'contrats' ? 'Ouvrir le fichier maître' : 'Ouvrir le classeur';
    this.rendreClients();
    this.rafraichir();
  };
  Lmb.prototype.rafraichir = function () {
    if (!this.rep) return;
    if (this.vue === 'resume' && this.selection && this.selection.actif()) this.selection.quitter();
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
    /* 29 oct. (Maxime) : « quand je clique sur une icône, on doit voir le détail du clic » — chaque chiffre ouvre ses lignes. */
    var tuile = function (valeur, libelle, sous, vue, classe, detail) {
      return h('button.kpi' + (classe ? '.' + classe : ''), { type: 'button', title: 'Voir le détail', onclick: function () { if (detail) self.ouvrirDetail(Object.assign({ titre: libelle, total: valeur, aller: vue }, detail)); else if (vue) { self.vue = vue.cle; self.filtres = vue.filtres || {}; self.explicites = {}; self.rendre(); } } }, [h('span.libelle', { text: libelle }), h('span.valeur', { text: valeur }), sous ? h('span.sous', { text: sous }) : null]);
    };
    var cleFlotte = (this.sources('flotte')[0] || {}).cle, cleContrats = (this.sources('contrats')[0] || {}).cle, cleAchats = (this.sources('achats')[0] || {}).cle;
    var vendusRetires = flotte.filter(function (l) { return l.f._vendu; }).length;
    this.elKpis.appendChild(tuile(AMX.fmtNombre(actifs.length), 'Véhicules en location', lease + ' LEASE · ' + rental + ' RENTAL · ' + (actifs.length - lease - rental) + ' autres' + (vendusRetires ? ' · ' + vendusRetires + ' vendu' + (vendusRetires > 1 ? 's' : '') + ' retiré' + (vendusRetires > 1 ? 's' : '') : ''), cleFlotte ? { cle: cleFlotte } : null, null, { lignes: actifs, droite: function (l) { return l.f._loc + (typeof l.f.cout === 'number' ? ' · ' + argent2(l.f.cout) + ' / mois' : ''); } }));
    this.elKpis.appendChild(tuile(argent(revenu), 'Location mensuelle', avecCout ? 'moyenne ' + argent(revenu / avecCout) + ' · ' + pluriel(avecCout, 'véhicule') : 'coût de location non inscrit', cleFlotte ? { cle: cleFlotte } : null, null, { lignes: actifs.filter(function (l) { return typeof l.f.cout === 'number' && l.f.cout > 0; }), valeur: 'cout' }));
    if (this.sources('contrats').length) {
      this.elKpis.appendChild(tuile(argent(solde), 'Solde des contrats', pluriel(contrats.length, 'contrat') + ' · intérêt ' + argent2(interet) + ' / jour', cleContrats ? { cle: cleContrats } : null, null, { lignes: contrats, valeur: 'solde', droite: function (l) { return typeof l.f.interetJour === 'number' ? 'intérêt ' + argent2(l.f.interetJour) + ' / jour' : ''; } }));
      this.elKpis.appendChild(tuile(argent(somme(sept, 'paiement')), 'Prélèvements 7 jours', pluriel(sept.length, 'contrat'), cleContrats ? { cle: cleContrats, filtres: { contrats: 'prochain' } } : null, null, { lignes: sept, valeur: 'paiement', droite: function (l) { return l.f.prochain ? 'le ' + dateCourte(l.f.prochain) : ''; } }));
      this.elKpis.appendChild(tuile(argent(somme(contrats, 'encaisse')), 'Encaissé à ce jour', 'intérêt gagné ' + argent(somme(contrats, 'interetGagne')), cleContrats ? { cle: cleContrats } : null, null, { lignes: contrats, valeur: 'encaisse', droite: function (l) { return typeof l.f.interetGagne === 'number' ? 'intérêt ' + argent(l.f.interetGagne) : ''; } }));
    }
    if (this.sources('achats').length) this.elKpis.appendChild(tuile(argent(profit), 'Profit achats / revente', pluriel(achats.length, 'transaction'), cleAchats ? { cle: cleAchats } : null, null, { lignes: achats, valeur: 'profit', droite: function (l) { return typeof l.f.prixVente === 'number' ? 'vendu ' + argent(l.f.prixVente) : ''; } }));

    AMX.vider(this.elCorps);
    var grille = h('div.lmb-grille');
    if ((q && q.trim()) || this.client) grille.appendChild(this.carteResultats());
    grille.appendChild(this.carteAlertes(flotte, contrats));
    grille.appendChild(this.carteNotes(flotte));
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
  /* 29 oct. (Maxime) : la colonne NOTE du classeur des locations, dans le résumé — les véhicules en location d'abord. */
  Lmb.prototype.carteNotes = function (flotte) {
    var self = this, s = this.sources('flotte')[0], avec = flotte.filter(function (l) { return l.f.note; });
    avec.sort(function (a, b) { return (b.f._actif ? 1 : 0) - (a.f._actif ? 1 : 0) || String(a.f.stock || '').localeCompare(String(b.f.stock || ''), 'fr', { numeric: true }); });
    var ul = h('ul.lmb-liste-simple');
    avec.slice(0, 25).forEach(function (l) {
      ul.appendChild(h('li.cliquable', { onclick: function () { self.detail(l._src || s, l); } }, [
        h('div.g', { style: { flex: '1' } }, [h('b', { text: titreLigne(l._src || s, l) || '—' }), h('span', { text: [l.f.loueA, l.f._actif ? (l.f._loc || '') : (l.f._vendu ? 'vendu' : (l.f.retour || l.f.retourTexte ? 'retourné' : ''))].filter(Boolean).join(' · ') }), h('span.lmb-note', { text: l.f.note })])
      ]));
    });
    if (!avec.length) ul.appendChild(h('li', [h('span.doux', { text: s ? 'Aucune note dans la colonne NOTE.' : 'Onglet des locations non connecté.' })]));
    var droite = avec.length && s ? h('button.btn.petit', { type: 'button', text: avec.length > 25 ? 'Les ' + avec.length + ' notes' : 'Voir dans la liste', onclick: function () { self.vue = s.cle; self.filtres = { flotte: 'note' }; self.explicites = { flotte: true }; self.rendre(); } }) : null;
    return carte('Notes des locations' + (avec.length ? ' (' + avec.length + ')' : ''), droite, ul);
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
        h('div.d', [s.erreur ? h('span.puce.alerte', { text: 'À partager', title: s.erreur }) : h('span.puce.ok', { text: pluriel((s.lignes || []).length, 'ligne') }),
          (s.masquees || []).length ? h('span.s', { style: { display: 'block', color: 'var(--encre-3)', fontSize: '12px' }, text: (s.masquees || []).length + ' retirée' + ((s.masquees || []).length > 1 ? 's' : '') + ' du suivi' }) : null])
      ]));
    });
    return carte('Onglets connectés', h('button.btn.petit', { type: 'button', text: 'Gérer', onclick: function () { self.ouvrirSources(); } }), ul, true);
  };

  /* ------------------------------------------------------------------------------- vue d'un onglet */
  var PASTILLES = {
    flotte: [['actifs', 'En location'], ['lease', 'LEASE'], ['rental', 'RENTAL'], ['retour', 'Retournés'], ['vendus', 'Vendus (onglet Vendus)', 1], ['tous', 'Toutes les lignes'], ['al:rdprm', 'RDPRM non noté', 1], ['al:radiation', 'RDPRM pas radié', 1], ['al:fp', 'Floor plan pas payé', 1], ['al:contrat', 'Sans date de contrat', 1], ['note', 'Avec une note', 2]],
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
      if (filtre === 'note') return !!f.note;
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
    var comptes = defs ? defs.map(function (d) { return trouvees.filter(function (l) { return garde(s.type, d[0], l); }).length; }) : [];
    if (defs && !this.explicites[s.type]) {
      var iCour = defs.map(function (d) { return d[0]; }).indexOf(filtre);
      if (iCour < 0 || !comptes[iCour]) { var iPrem = comptes.findIndex(function (n) { return n > 0; }); if (iPrem >= 0) { filtre = defs[iPrem][0]; this.filtres[s.type] = filtre; } }
    }
    if (defs) defs.forEach(function (d, i) {
      var n = comptes[i];
      if (d[2] && !n && filtre !== d[0]) return;
      self.elPastilles.appendChild(h('button' + (filtre === d[0] ? '.actif' : '') + (d[2] === 1 ? '.alerte' : ''), { type: 'button', onclick: function () { self.filtres[s.type] = d[0]; self.explicites[s.type] = true; self.rafraichir(); } }, [d[1] + ' ', h('b', { text: AMX.fmtNombre(n) })]));
    });
    var liste = trouvees.filter(function (l) { return garde(s.type, filtre, l); });
    var libFiltre = defs ? (defs.filter(function (d) { return d[0] === filtre; })[0] || [])[1] : '';
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['ligne', 'lignes'], contexte: s.nom,
      filtres: [defs && filtre !== (s.type === 'flotte' ? 'actifs' : 'tous') ? libFiltre : '', this.client ? 'Client : ' + this.clientNom() : '', this.q.trim() ? '« ' + this.q.trim() + ' »' : ''],
      effacer: function () { self.filtres[s.type] = null; self.explicites[s.type] = false; self.effacerFiltres(); } });
    this.rendreChiffres(s, liste);
    if (s.type === 'achats') { var dbl = trouvees.filter(function (l) { return l.f._doublon; }).length; if (dbl) this.elCorps.appendChild(h('p.doux', { style: { margin: '0 0 8px' }, text: pluriel(dbl, 'véhicule') + ' inscrit' + (dbl > 1 ? 's' : '') + ' dans les deux tableaux de l\'onglet (même NIV) : compté' + (dbl > 1 ? 's' : '') + ' une seule fois.' })); }
    if (this.selection) {
      var nMasq = (s.masquees || []).length;
      this.elCorps.appendChild(h('div.lmb-outils', [this.selection.bouton, h('span.doux', { text: 'Cochez des lignes pour « Ne plus suivre » — rien n\'est effacé du classeur' + (nMasq ? ' · ' + pluriel(nMasq, 'ligne') + ' retirée' + (nMasq > 1 ? 's' : '') + ' du suivi (au bas)' : '') + '.' })]));
    }
    this.elCorps.appendChild(this.tableau(s, liste));
    var masq = this.masqueesTrouvees(s);
    if (masq.length) this.elCorps.appendChild(this.blocMasquees(s, masq));
  };
  Lmb.prototype.masqueesTrouvees = function (s) {
    var q = this.q, cle = this.client, nom = this.clientNom();
    return (s.masquees || []).filter(function (l) {
      if (!AMX.correspond(l.c, q)) return false;
      if (!cle) return true;
      return s.type === 'libre' ? AMX.correspond(l.c, nom) : l.f._clientCle === cle;
    });
  };
  Lmb.prototype.blocMasquees = function (s, masq) {
    var self = this, ul = h('ul.lmb-liste-simple');
    masq.slice(0, 300).forEach(function (l) {
      var m = l.f._masque || {};
      ul.appendChild(h('li', [
        h('div.g', { style: { cursor: 'pointer' }, onclick: function () { self.detail(s, l); } }, [h('b', { text: titreLigne(s, l) || '—' }),
          h('span', { text: [sousLigne(s, l), 'retirée ' + (m.le ? 'le ' + AMX.fmtDateCourte(m.le) : '') + (m.par ? ' par ' + m.par : ''), m.r ? '« ' + m.r + ' »' : ''].filter(Boolean).join(' · ') })]),
        h('div.d', [h('button.btn.petit', { type: 'button', text: 'Reprendre le suivi', onclick: function () { self.masquer([l], false); } })])
      ]));
    });
    var tout = masq.length > 1 ? h('button.btn.petit.fantome', { type: 'button', text: 'Tout reprendre (' + masq.length + ')', onclick: function (e) { e.preventDefault(); AMX.confirmer('Reprendre le suivi', pluriel(masq.length, 'ligne') + ' ' + (masq.length > 1 ? 'reviennent' : 'revient') + ' dans la liste et les chiffres.', { ok: 'Reprendre' }).then(function (oui) { if (oui) self.masquer(masq, false); }); } }) : null;
    return h('details.lmb-masquees', [h('summary', { text: 'Retirés du suivi (' + masq.length + ') — toujours dans le classeur, pas comptés ici' }), h('div', { style: { margin: '8px 0 4px' } }, [tout]), ul]);
  };
  Lmb.prototype.rendreChiffres = function (s, liste) {
    var self = this, k = this.elKpis;
    /* Chaque chiffre est cliquable : il ouvre les lignes qui le composent (d = { lignes, valeur, droite }). */
    var t = function (v, lib, sous, d) { k.appendChild(h('button.kpi', { type: 'button', title: 'Voir le détail', onclick: function () { self.ouvrirDetail(Object.assign({ titre: lib + ' — ' + s.nom, total: v }, d || { lignes: liste })); } }, [h('span.libelle', { text: lib }), h('span.valeur', { text: v }), sous ? h('span.sous', { text: sous }) : null])); };
    var avec = function (champ) { return liste.filter(function (l) { return typeof l.f[champ] === 'number' && l.f[champ] !== 0; }); };
    if (s.type === 'flotte') {
      var cout = avec('cout'), lease = liste.filter(function (l) { return l.f._loc === 'LEASE'; }), rental = liste.filter(function (l) { return l.f._loc === 'RENTAL'; }), alertes = liste.filter(function (l) { return (l.f._alertes || []).length || l.f._vendu; });
      var typeEtCout = function (l) { return l.f._loc + (typeof l.f.cout === 'number' ? ' · ' + argent2(l.f.cout) + ' / mois' : ''); };
      t(AMX.fmtNombre(liste.length), 'Lignes', liste.filter(function (l) { return l.f._actif; }).length + ' en location', { lignes: liste, droite: typeEtCout });
      t(argent(somme(liste, 'cout')), 'Location mensuelle', cout.length ? 'moyenne ' + argent(somme(cout, 'cout') / cout.length) : '', { lignes: cout, valeur: 'cout' });
      t(String(lease.length), 'LEASE', 'baux clients', { lignes: lease, valeur: 'cout' });
      t(String(rental.length), 'RENTAL', 'courtoisie, concessions', { lignes: rental, valeur: 'cout' });
      t(String(alertes.length), 'À surveiller', 'lignes avec une alerte', { lignes: alertes, droite: function (l) { return (l.f._vendu ? ['Vendu'] : []).concat((l.f._alertes || []).map(function (a) { return a[1]; })).join(' · '); } });
    } else if (s.type === 'contrats') {
      t(AMX.fmtNombre(liste.length), 'Contrats', '', { lignes: liste, droite: function (l) { return l.f.statut || ''; } });
      t(argent(somme(liste, 'solde')), 'Solde de la dette', 'intérêt ' + argent2(somme(liste, 'interetJour')) + ' / jour', { lignes: avec('solde'), valeur: 'solde', droite: function (l) { return typeof l.f.interetJour === 'number' ? 'intérêt ' + argent2(l.f.interetJour) + ' / jour' : ''; } });
      t(argent2(somme(liste, 'paiement')), 'Paiements mensuels', 'taxes incluses', { lignes: avec('paiement'), valeur: 'paiement', droite: function (l) { return l.f.jour ? 'le ' + l.f.jour + ' du mois' : ''; } });
      t(argent(somme(liste, 'encaisse')), 'Encaissé à ce jour', 'intérêt gagné ' + argent(somme(liste, 'interetGagne')), { lignes: avec('encaisse'), valeur: 'encaisse', droite: function (l) { return typeof l.f.interetGagne === 'number' ? 'intérêt ' + argent(l.f.interetGagne) : ''; } });
      t(argent(somme(liste, 'residuelle')), 'Valeurs résiduelles', 'rachats en fin de bail', { lignes: avec('residuelle'), valeur: 'residuelle', droite: function (l) { return l.f._fin ? 'fin ' + dateCourte(l.f._fin) : ''; } });
    } else if (s.type === 'achats') {
      var paye = somme(liste, 'prixPaye'), vente = somme(liste, 'prixVente'), profit = somme(liste, 'profit');
      t(AMX.fmtNombre(liste.length), 'Transactions', '', { lignes: liste, valeur: 'profit' });
      t(argent(paye), 'Achats', '', { lignes: avec('prixPaye'), valeur: 'prixPaye', droite: function (l) { return l.f.vendeur || ''; } });
      t(argent(vente), 'Ventes', '', { lignes: avec('prixVente'), valeur: 'prixVente', droite: function (l) { return l.f.acheteur || ''; } });
      t(argent(profit), 'Profit', paye ? (Math.round(1000 * profit / paye) / 10).toString().replace('.', ',') + ' % de l\'achat' : '', { lignes: avec('profit'), valeur: 'profit' });
    } else {
      t(AMX.fmtNombre(liste.length), 'Lignes', s.classeur ? s.classeur : '', { lignes: liste });
    }
  };
  /* Fenêtre « détail d'un chiffre » : les lignes qui le composent, triées par montant, avec le total ; un clic sur une ligne
     ouvre toutes ses colonnes. o = { titre, total, lignes, valeur (champ), droite(l), aller { cle, filtres } }. */
  Lmb.prototype.ouvrirDetail = function (o) {
    var self = this, lignes = (o.lignes || []).slice(), champ = o.valeur;
    if (champ) lignes.sort(function (a, b) { return (b.f[champ] || 0) - (a.f[champ] || 0); });
    var ul = h('ul.lmb-liste-simple'), max = 400;
    lignes.slice(0, max).forEach(function (l) {
      var s = l._src || self.sourceVue() || self.sources()[0];
      var d = o.droite ? o.droite(l) : '';
      ul.appendChild(h('li.cliquable', { onclick: function () { self.detail(s, l); } }, [
        h('div.g', [h('b', { text: titreLigne(s, l) || '—' }), h('span', { text: sousLigne(s, l) })]),
        h('div.d', [champ ? h('b', { text: argent2(l.f[champ]) }) : null, d ? h('span', { style: { display: 'block', color: 'var(--encre-3)', fontSize: '12px' }, text: d }) : null])
      ]));
    });
    if (!lignes.length) ul.appendChild(h('li', [h('span.doux', { text: 'Aucune ligne.' })]));
    var tete = h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', margin: '0 0 8px' } }, [
      h('span.doux', { text: pluriel(lignes.length, 'ligne') + (lignes.length > max ? ' (' + max + ' premières)' : '') + (this.client ? ' · client : ' + this.clientNom() : '') + (this.q.trim() ? ' · « ' + this.q.trim() + ' »' : '') }),
      h('b', { style: { fontSize: '18px' }, text: o.total || '' })
    ]);
    var boutons = [{ texte: 'Fermer' }];
    if (o.aller && o.aller.cle) boutons.push({ texte: 'Voir dans la liste', classe: 'primaire', action: function () { self.vue = o.aller.cle; self.filtres = o.aller.filtres || {}; self.explicites = {}; if (o.aller.filtres) Object.keys(o.aller.filtres).forEach(function (k) { self.explicites[k] = true; }); self.rendre(); return true; } });
    AMX.modale({ titre: o.titre, corps: h('div', [tete, ul]), large: true, proteger: false, boutons: boutons });
  };
  /* Colonnes du tableau par type ; un onglet libre montre ses 8 premières colonnes. */
  function colonnes(s) {
    if (s.type === 'flotte' || s.type === 'vendus') return [
      ['Stock', function (f) { return h('b.mono', { text: f.stock || '—' }); }],
      ['Véhicule', function (f) { return [f.modele || '—', f.vin ? h('span.s.mono', { text: f.vin }) : null]; }],
      ['Plaque', function (f) { return f.plaque || '—'; }],
      ['Loué à', function (f) { return f.loueA || '—'; }],
      ['Type', function (f) { return f._loc === 'Autre' ? (f.type || '—') : h('span.puce' + (f._loc === 'LEASE' ? '.info' : (f._loc === 'RENTAL' ? '.ok' : '.attention')), { text: f._loc }); }],
      ['Contrat', function (f) { var c = f._contratMaitre; return [f.contrat ? dateCourte(f.contrat) : (f.contratTexte || '—'), c ? h('a.lmb-lien-maitre', { href: lienLigne(c.s, c.l), target: '_blank', rel: 'noopener', title: 'Ouvrir le contrat dans le fichier maître de calcul', onclick: function (e) { e.stopPropagation(); } }, ['Fichier maître' + (typeof c.l.f.solde === 'number' ? ' · solde ' + argent(c.l.f.solde) : '') + ' ↗']) : null]; }],
      ['Location / mois', function (f) { return argent2(f.cout); }, 'num'],
      ['Retour', function (f) { return f.retour ? [dateCourte(f.retour), f.kmRetour ? h('span.s', { text: AMX.fmtNombre(f.kmRetour) + ' km' }) : null] : (f.retourTexte || ''); }],
      ['Note', function (f) { return f.note || ''; }, 'note'],
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
      ['Statut', function (f) { return [f.statut ? h('span.puce' + (f._incomplet ? '.alerte' : ''), { text: f.statut }) : '—', f.note ? h('span.lmb-note', { text: f.note }) : null]; }]
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
      corps.appendChild(h('tr.cliquable', { 'data-vin': l.f._cle || '', onclick: function () { self.detail(s, l); } }, tds));
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
    var self = this, lien = s.lien + (s.lien.indexOf('#') >= 0 ? '&' : '#') + 'range=A' + l.r, m = l.f._masque;
    var avis = m ? h('div.lmb-erreur-source', { style: { borderLeftColor: 'var(--ambre)', background: 'var(--ambre-bg)' }, text: 'Retirée du suivi' + (m.le ? ' le ' + AMX.fmtDateCourte(m.le) : '') + (m.par ? ' par ' + m.par : '') + (m.r ? ' — « ' + m.r + ' »' : '') + '. Elle reste dans le classeur.' }) : null;
    var note = l.f.note ? h('div.lmb-note', { style: { margin: '0 0 10px' }, text: 'Note : ' + l.f.note }) : null;
    var c = l.f._contratMaitre, blocC = null;
    if (c) {
      var fc = c.l.f;
      blocC = h('div.lmb-contrat-maitre', [
        h('b', { text: 'Contrat au fichier maître de calcul' + (fc.stock ? ' — ' + fc.stock : '') }),
        h('span', { text: [fc.client, fc.statut, typeof fc.solde === 'number' ? 'solde ' + argent2(fc.solde) : '', typeof fc.paiement === 'number' ? 'paiement ' + argent2(fc.paiement) + ' / mois' : '', fc.prochain ? 'prochain prélèvement ' + dateCourte(fc.prochain) : '', fc._fin ? 'fin ' + dateCourte(fc._fin) : ''].filter(Boolean).join(' · ') }),
        h('a', { href: lienLigne(c.s, c.l), target: '_blank', rel: 'noopener', text: 'Ouvrir le contrat dans le fichier maître ↗' })
      ]);
    }
    var estMaitre = s.type === 'contrats';
    AMX.modale({ titre: titreLigne(s, l) || s.nom, corps: h('div', [h('p.doux', { style: { margin: '0 0 10px' }, text: s.nom + ' · ' + (s.classeur || '') + ' › ' + s.onglet + ', ligne ' + l.r }), avis, note, blocC, dl]), large: true,
      boutons: [{ texte: 'Fermer' },
        { texte: m ? 'Reprendre le suivi' : 'Ne plus suivre', action: function () { if (m) return self.masquer([l], false); self.masquer([l], true); return true; } },
        { texte: estMaitre ? 'Ouvrir dans le fichier maître' : 'Ouvrir la ligne dans Google Sheets', classe: 'primaire', action: function () { window.open(lien, '_blank', 'noopener'); return false; } }] });
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
