/* Accueil (9 octobre 2026) — la première page du site.

   Maxime : « la page d'accueil du site ne devrait pas être par défaut l'inventaire
   US ; je ferais une belle page d'accueil et laisserais le choix aux utilisateurs
   de choisir où ils commencent » ; puis « inspire-toi des plus belles pages de
   sites similaires et refais la page ».

   - Bandeau sombre : bonjour, date, concession, grande recherche de véhicule,
     actions rapides (évaluer, fiche d'achat, suivi service, valeurs OpenLane).
   - Chiffres clés : véhicules actifs par registre, valeur des inventaires, au
     service, demandes de travaux, valeurs OpenLane — chargés quand ils arrivent.
   - Sections : une carte par section visible (icône colorée, résumé, onglets avec
     compteurs, étoile = page de départ).
   - Nouveautés et page de départ en bas.
   - Page de départ : AMX.memo 'accueil_depart' = { section, onglet } ('' = Accueil),
     par appareil ; le routeur (app.js) l'applique quand l'adresse est vide ; le logo
     ramène toujours ici. AMX.accueil.depart() / choisirDepart(section, onglet). */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var CLE_DEPART = 'accueil_depart';

  var RESUMES = {
    inventaire: 'Les registres É.-U., Canada et Detail, et le suivi des neufs.',
    service: 'Reconditionnement au détail : autorisation, bons de travail, livraison.',
    offres: 'Véhicules en vente, offres reçues, acheteurs externes, leads.',
    achat: 'La fiche d\'achat d\'un véhicule : prix, km, dommages, rapports.',
    outils: 'Évaluation marché, registre, Torque, fiches eBlock, valeurs OpenLane.',
    avis: 'Les avis Google des concessions et les sondages aux clients.',
    resultat: 'Profits et résultats par période, concession et acheteur.',
    admin: 'Comptes, droits, concessions et réglages du site.',
    aide: 'Guide de toutes les fonctions, nouveautés, suggestions.'
  };
  var COULEURS = { inventaire: 'vert', service: 'sarcelle', offres: 'bleu', achat: 'violet', outils: 'gris', avis: 'ambre', resultat: 'prune', admin: 'noir', aide: 'bleu' };

  function injecterCss() {
    if (document.getElementById('css-accueil')) return;
    var s = document.createElement('style');
    s.id = 'css-accueil';
    s.textContent = [
      '.acc-page { max-width: 1180px; padding-top: 16px; }',
      /* bandeau */
      '.acc-hero { position: relative; border-radius: 16px; background: radial-gradient(900px 420px at 85% -20%, rgba(45,184,98,.32), transparent 60%), radial-gradient(600px 300px at 0% 120%, rgba(29,111,209,.22), transparent 60%), linear-gradient(135deg, var(--noir) 0%, var(--noir-2) 60%, #243039 100%); color: #fff; padding: 30px 32px 28px; box-shadow: 0 14px 40px rgba(16,24,40,.22); }',
      '.acc-hero::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 28px 28px; mask-image: linear-gradient(180deg, rgba(0,0,0,.6), transparent 85%); pointer-events: none; }',
      '.acc-hero > * { position: relative; z-index: 1; } .acc-hero .acc-recherche { z-index: 5; }',
      '.acc-hero .sur { font-size: 11.5px; letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.62); font-weight: 600; }',
      '.acc-hero h1 { font-size: 32px; line-height: 1.1; margin: 8px 0 6px; font-weight: 800; letter-spacing: -.01em; }',
      '.acc-hero .sous { color: rgba(255,255,255,.72); font-size: 14px; }',
      '.acc-hero .sous b { color: #fff; font-weight: 600; }',
      '.acc-recherche { position: relative; margin-top: 20px; display: flex; align-items: center; gap: 10px; background: #fff; border-radius: 14px; padding: 11px 14px 11px 16px; max-width: 680px; box-shadow: 0 10px 30px rgba(0,0,0,.25); }',
      '.acc-recherche svg { width: 20px; height: 20px; color: var(--encre-3); flex: none; } .acc-recherche input { flex: 1; border: 0; background: transparent; font: inherit; font-size: 15.5px; color: var(--encre); outline: none; min-width: 0; } .acc-recherche input::placeholder { color: var(--encre-4); }',
      '.acc-recherche kbd { font: 600 11px var(--mono); color: var(--encre-3); background: var(--gris-bg); border: 1px solid var(--ligne-forte); border-radius: 6px; padding: 2px 6px; }',
      '.acc-recherche .carte { color: var(--encre); }',
      '.acc-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }',
      '.acc-actions a { display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; border-radius: 999px; background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.18); color: #fff; font-size: 13px; font-weight: 600; text-decoration: none; backdrop-filter: blur(6px); transition: background .12s, transform .12s; }',
      '.acc-actions a:hover { background: rgba(255,255,255,.2); text-decoration: none; transform: translateY(-1px); } .acc-actions a svg { width: 15px; height: 15px; } .acc-actions a.primaire { background: var(--vert); border-color: var(--vert); } .acc-actions a.primaire:hover { background: var(--vert-vif); }',
      /* chiffres clés */
      '.acc-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin: -22px 18px 0; position: relative; z-index: 2; }',
      '.acc-kpi { background: var(--carte); border: 1px solid var(--ligne); border-radius: 14px; padding: 14px 16px 12px; box-shadow: var(--ombre-2); text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 4px; min-width: 0; transition: transform .12s; }',
      '.acc-kpi:hover { text-decoration: none; transform: translateY(-2px); }',
      '.acc-kpi .l { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); font-weight: 600; display: flex; align-items: center; gap: 6px; } .acc-kpi .l i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; background: var(--encre-4); }',
      '.acc-kpi .v { font-size: 26px; font-weight: 800; letter-spacing: -.01em; line-height: 1.15; } .acc-kpi .v.attente { color: var(--encre-4); font-weight: 500; }',
      '.acc-kpi .m { font-size: 12px; color: var(--encre-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .acc-kpi .m b { color: var(--encre-2); font-weight: 600; }',
      '.acc-kpi.vert .l i { background: var(--vert); } .acc-kpi.bleu .l i { background: var(--bleu); } .acc-kpi.sarcelle .l i { background: var(--sarcelle); } .acc-kpi.ambre .l i { background: var(--ambre); } .acc-kpi.violet .l i { background: var(--violet); } .acc-kpi.rouge .l i { background: var(--rouge); }',
      '.acc-kpi .alerte { color: var(--rouge); font-weight: 600; }',
      /* sections */
      '.acc-titre { display: flex; align-items: baseline; justify-content: space-between; margin: 26px 0 10px; } .acc-titre h2 { font-size: 15px; margin: 0; letter-spacing: .02em; } .acc-titre span { font-size: 12px; color: var(--encre-3); }',
      '.acc-tuiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }',
      '.acc-tuile { position: relative; display: flex; flex-direction: column; gap: 9px; background: var(--carte); border: 1px solid var(--ligne); border-radius: 14px; padding: 16px 16px 14px; box-shadow: var(--ombre); color: inherit; text-decoration: none; transition: transform .14s, box-shadow .14s, border-color .14s; overflow: hidden; }',
      '.acc-tuile::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--acc, var(--ligne-forte)); opacity: 0; transition: opacity .14s; }',
      '.acc-tuile:hover { text-decoration: none; transform: translateY(-2px); box-shadow: 0 10px 26px rgba(16,24,40,.10); border-color: var(--ligne-forte); } .acc-tuile:hover::before { opacity: 1; }',
      '.acc-tuile .haut { display: flex; align-items: center; gap: 12px; padding-right: 34px; } .acc-tuile .ic { width: 42px; height: 42px; border-radius: 12px; background: var(--acc-bg, var(--gris-bg)); color: var(--acc, var(--encre)); display: flex; align-items: center; justify-content: center; flex: none; } .acc-tuile .ic svg { width: 21px; height: 21px; }',
      '.acc-tuile h2 { font-size: 16.5px; margin: 0; font-weight: 700; } .acc-tuile .resume { color: var(--encre-3); font-size: 12.5px; line-height: 1.45; min-height: 36px; }',
      '.acc-tuile .onglets { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; } .acc-tuile .onglets a { font-size: 12px; padding: 4px 10px; border-radius: 999px; background: var(--carte-2); border: 1px solid var(--ligne); color: var(--encre-2); text-decoration: none; display: inline-flex; gap: 6px; align-items: center; transition: background .12s, border-color .12s; } .acc-tuile .onglets a:hover { background: var(--gris-bg); border-color: var(--ligne-forte); color: var(--encre); } .acc-tuile .onglets a b { font-weight: 700; color: var(--acc, var(--encre)); }',
      '.acc-tuile .depart { position: absolute; top: 12px; right: 12px; border: 0; background: transparent; color: var(--encre-4); cursor: pointer; padding: 5px; border-radius: 8px; line-height: 0; transition: background .12s, color .12s; } .acc-tuile .depart:hover { background: var(--gris-bg); color: var(--encre); } .acc-tuile .depart.actif { color: var(--ambre); } .acc-tuile .depart svg { width: 18px; height: 18px; }',
      '.acc-tuile.depart-actif { border-color: var(--ambre-bord); box-shadow: 0 0 0 3px var(--ambre-bg); } .acc-tuile.depart-actif::before { opacity: 1; background: var(--ambre); }',
      '.acc-tuile.vert { --acc: var(--vert); --acc-bg: var(--vert-clair); } .acc-tuile.sarcelle { --acc: var(--sarcelle); --acc-bg: var(--sarcelle-bg); } .acc-tuile.bleu { --acc: var(--bleu); --acc-bg: var(--bleu-bg); } .acc-tuile.violet { --acc: var(--violet); --acc-bg: var(--violet-bg); } .acc-tuile.gris { --acc: var(--gris); --acc-bg: var(--gris-bg); } .acc-tuile.ambre { --acc: var(--ambre); --acc-bg: var(--ambre-bg); } .acc-tuile.prune { --acc: var(--prune); --acc-bg: var(--prune-bg); } .acc-tuile.noir { --acc: var(--noir-3); --acc-bg: var(--gris-bg); }',
      /* bas */
      '.acc-bas { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; } @media (max-width: 820px) { .acc-bas { grid-template-columns: 1fr; } }',
      '.acc-bas .carte { border-radius: 14px; } .acc-bas .section-titre { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); font-weight: 600; }',
      '.acc-depart-ligne { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; } .acc-depart-ligne select { max-width: 100%; }',
      '.acc-nouveaute .item + .item { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--ligne); } .acc-nouveaute .date { color: var(--encre-3); font-size: 11.5px; } .acc-nouveaute .titre { font-weight: 600; margin: 2px 0 4px; font-size: 13.5px; } .acc-nouveaute p { margin: 0; color: var(--encre-2); font-size: 12.5px; line-height: 1.45; }',
      '@media (max-width: 700px) { .acc-hero { padding: 22px 18px 22px; border-radius: 12px; } .acc-hero h1 { font-size: 24px; } .acc-kpis { margin: -14px 8px 0; grid-template-columns: 1fr 1fr; gap: 8px; } .acc-kpi .v { font-size: 20px; } .acc-tuiles { grid-template-columns: 1fr; } .acc-recherche { padding: 9px 12px; } .acc-recherche kbd { display: none; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ Départ ------------------------------- */
  function departLu() {
    var d = AMX.memo.lire(CLE_DEPART, null);
    if (!d || typeof d !== 'object' || !d.section) return null;
    var sec = AMX.sections[d.section];
    if (!sec || (sec.visible && !sec.visible())) return null;
    var onglets = (sec.onglets || []).filter(function (o) { return !o.visible || o.visible(); });
    var ong = onglets.filter(function (o) { return o.id === d.onglet; })[0] || onglets[0] || null;
    return { section: d.section, onglet: ong ? ong.id : '' };
  }
  function departTexte(d) {
    if (!d) return 'Accueil';
    var sec = AMX.sections[d.section]; if (!sec) return 'Accueil';
    var ong = (sec.onglets || []).filter(function (o) { return o.id === d.onglet; })[0];
    return sec.titre + (ong && (sec.onglets || []).length > 1 ? ' › ' + ong.titre : '');
  }
  AMX.accueil = {
    /** { section, onglet } choisi par l'utilisateur, ou null = Accueil. */
    depart: departLu,
    departTexte: function () { return departTexte(departLu()); },
    choisirDepart: function (section, onglet) {
      if (!section || section === 'accueil') AMX.memo.ecrire(CLE_DEPART, '');
      else AMX.memo.ecrire(CLE_DEPART, { section: section, onglet: onglet || '' });
      document.dispatchEvent(new CustomEvent('amx:accueil-depart'));
      AMX.toast('Le site s\'ouvrira sur ' + departTexte(departLu()) + '.', 'ok');
    }
  };

  /* ------------------------------- La vue -------------------------------- */
  var EVENEMENTS = ['amx:profil', 'amx:accueil-depart', 'amx:eblock', 'amx:openlane', 'amx:demandes', 'amx:suggestions', 'amx:service', 'amx:inventaire'];
  function Accueil(conteneur, ctx) {
    injecterCss();
    var self = this;
    this.conteneur = conteneur;
    this.el = h('div.page.acc-page');
    conteneur.appendChild(this.el);
    this.rendre();
    this.sur = AMX.debounce(function () { if (self.el.isConnected) self.rendre(); }, 60);
    EVENEMENTS.forEach(function (ev) { document.addEventListener(ev, self.sur); });
    // Les chiffres arrivent après le premier rendu : inventaire, service, demandes, valeurs OpenLane.
    var relancer = function () { self.sur(); };
    if (AMX.inventaire && AMX.inventaire.tout) AMX.inventaire.tout().then(relancer, function () {});
    if (AMX.service && AMX.service.charger) AMX.service.charger().then(relancer, function () {});
    if (AMX.demandes && AMX.demandes.charger) AMX.demandes.charger().then(relancer, function () {});
    if (AMX.openlane && AMX.openlane.charger) AMX.openlane.charger().then(relancer, function () {});
    if (AMX.suggestions && AMX.suggestions.charger) AMX.suggestions.charger().then(relancer, function () {});
  }
  Accueil.prototype.demonter = function () { var self = this; EVENEMENTS.forEach(function (ev) { document.removeEventListener(ev, self.sur); }); };
  Accueil.prototype.naviguer = function () { this.rendre(); };

  var ROLES = { proprietaire: 'Propriétaire', admin: 'Administrateur', gestionnaire: 'Gestionnaire', utilisateur: 'Utilisateur', service: 'Service', marketing: 'Marketing', comptabilite: 'Comptabilité', ventes: 'Ventes', direction: 'Direction', direction_ventes: 'Direction des ventes', direction_service: 'Direction du service', vendeur: 'Vendeur', bdc: 'BDC' };
  function prenom() { var n = String(AMX.session.nom || '').trim(); return n ? n.split(/\s+/)[0] : ''; }
  function salutation() { var hr = new Date().getHours(); return hr < 5 ? 'Bonne nuit' : (hr < 12 ? 'Bonjour' : (hr < 18 ? 'Bon après-midi' : 'Bonsoir')); }
  function dateLongue() { try { var t = new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); } catch (e) { return ''; } }
  function roleTexte() { var r = String(AMX.session.role || ''); return ROLES[r] || (r ? r.charAt(0).toUpperCase() + r.slice(1) : ''); }
  function fmtN(n) { return AMX.fmtNombre(n); }

  /* Chiffres clés : chacun renvoie null tant que ses données ne sont pas là (la tuile montre « … »). */
  function chiffres() {
    var out = [];
    var regs = (AMX.inventaire && AMX.inventaire.valeurRegistres) ? AMX.inventaire.valeurRegistres('') : [];
    var charges = regs.filter(function (r) { return r.charge; });
    var nActifs = charges.reduce(function (t, r) { return t + r.n; }, 0), total = charges.reduce(function (t, r) { return t + r.total; }, 0);
    out.push({ cls: 'vert', libelle: 'Véhicules actifs', valeur: charges.length ? fmtN(nActifs) : null, detail: charges.length ? charges.map(function (r) { return r.titre + ' ' + fmtN(r.n); }).join(' · ') : 'Chargement…', lien: AMX.lien('inventaire', 'us') });
    out.push({ cls: 'bleu', libelle: 'Valeur des inventaires', valeur: charges.length ? AMX.fmtArgent(total, 0) : null, detail: charges.length ? (charges.length < regs.length ? 'partiel · ' : '') + 'coût des véhicules actifs' : 'Chargement…', lien: AMX.lien('inventaire', 'detail') });
    if (AMX.sections.service && (!AMX.sections.service.visible || AMX.sections.service.visible())) {
      var svc = AMX.service && AMX.service.enCache ? AMX.service.enCache() : null;
      var enCours = svc ? svc.filter(function (s) { return s.statut === 'encours'; }).length : null;
      var direction = svc ? svc.filter(function (s) { return s.statut === 'encours' && (s.etapeCourante === 'verification' || s.etapeCourante === 'autorisation'); }).length : 0;
      out.push({ cls: 'sarcelle', libelle: 'Au service', valeur: enCours === null ? null : fmtN(enCours), detail: svc ? (direction ? direction + ' en attente de la direction' : 'rien en attente de la direction') : 'Chargement…', alerte: direction > 0, lien: AMX.lien('service', direction ? 'autoriser' : 'encours') });
      var dem = AMX.demandes && AMX.demandes.enCache ? AMX.demandes.enCache() : null;
      if (dem) { var ouvertes = dem.filter(function (d) { return d.etat === 'envoyee'; }).length, retournees = dem.filter(function (d) { return d.etat === 'retournee'; }).length; out.push({ cls: 'ambre', libelle: 'Demandes de travaux', valeur: fmtN(ouvertes), detail: retournees ? retournees + ' retournée' + (retournees > 1 ? 's' : '') + ' par le service' : 'en attente du service', alerte: retournees > 0, lien: AMX.lien('service', 'encours') }); }
    }
    var ol = AMX.openlane && AMX.openlane.enCache ? AMX.openlane.enCache() : null;
    if (ol && AMX.sections.outils) { var vals = Object.keys(ol).map(function (k) { return ol[k]; }); var prev = vals.filter(function (r) { return r.luLe && typeof r.prevision === 'number'; }); var somme = prev.reduce(function (t, r) { return t + r.prevision; }, 0); if (vals.length) out.push({ cls: 'violet', libelle: 'Valeurs OpenLane', valeur: fmtN(prev.length), detail: prev.length ? AMX.fmtArgent(somme, 0) + ' de prévisions' : 'aucune prévision lue', lien: AMX.lien('outils', 'openlane') }); }
    if (AMX.suggestions && AMX.suggestions.aTraiter && AMX.estAdmin && AMX.estAdmin()) { var n = AMX.suggestions.aTraiter(); if (n) out.push({ cls: 'rouge', libelle: 'Suggestions à traiter', valeur: fmtN(n), detail: 'en rouge jusqu\'au traitement', alerte: true, lien: AMX.lien('aide', 'suggestions') }); }
    return out.slice(0, 6);
  }

  Accueil.prototype.rendre = function () {
    var self = this;
    var ancienneValeur = this.inputRecherche ? this.inputRecherche.value : '';
    AMX.vider(this.el);
    var p = AMX.session.perms || {};

    /* ---- bandeau ---- */
    var input = h('input', { type: 'search', id: 'accueil-recherche', placeholder: 'Trouver un véhicule : NIV, # stock, modèle…', autocomplete: 'off', value: ancienneValeur });
    this.inputRecherche = input;
    var recherche = h('div.acc-recherche', [h('span', { html: I.recherche }), input, h('kbd', '/')]);
    var actions = [];
    var ajouterAction = function (sec, onglet, texte, icone, cls) { var s = AMX.sections[sec]; if (!s || (s.visible && !s.visible())) return; actions.push(h('a' + (cls ? '.' + cls : ''), { href: AMX.lien(sec, onglet), html: (I[icone] || '') + '<span>' + texte + '</span>' })); };
    ajouterAction('outils', 'evaluation', 'Évaluer un véhicule', 'scan', 'primaire');
    ajouterAction('achat', '', 'Nouvelle fiche d\'achat', 'achat');
    ajouterAction('service', 'encours', 'Suivi service', 'service');
    ajouterAction('outils', 'openlane', 'Valeurs OpenLane', 'outils');
    ajouterAction('avis', 'avis', 'Avis Google', 'avis');
    this.el.appendChild(h('div.acc-hero', [
      h('div.sur', { text: [p.nomConcession || 'Groupe Automax', dateLongue()].filter(Boolean).join(' · ') }),
      h('h1', { text: salutation() + (prenom() ? ', ' + prenom() : '') }),
      h('div.sous', [roleTexte() ? h('b', { text: roleTexte() }) : null, roleTexte() ? ' · ' : '', 'Où voulez-vous commencer aujourd\'hui ?']),
      recherche,
      actions.length ? h('div.acc-actions', actions) : null
    ]));
    if (AMX.brancherRecherche) AMX.brancherRecherche(input);

    /* ---- chiffres clés ---- */
    var kpis = chiffres();
    this.el.appendChild(h('div.acc-kpis', kpis.map(function (k) {
      return h('a.acc-kpi.' + k.cls, { href: k.lien }, [
        h('div.l', [h('i'), k.libelle]),
        h('div.v' + (k.valeur === null ? '.attente' : '.num'), { text: k.valeur === null ? '…' : k.valeur }),
        h('div.m' + (k.alerte ? '.alerte' : ''), { text: k.detail || '' })
      ]);
    })));

    /* ---- sections ---- */
    var depart = departLu();
    this.el.appendChild(h('div.acc-titre', [h('h2', 'Sections'), h('span', 'L\'étoile fixe la page de départ')]));
    var tuiles = h('div.acc-tuiles');
    AMX.listeSections().filter(function (s) { return s.id !== 'accueil'; }).forEach(function (s) {
      var onglets = (s.onglets || []).filter(function (o) { return !o.visible || o.visible(); });
      var premier = onglets[0] ? onglets[0].id : '';
      var estDepart = !!depart && depart.section === s.id;
      var btnDepart = h('button.depart' + (estDepart ? '.actif' : ''), { type: 'button', title: estDepart ? 'Le site s\'ouvre ici — cliquez pour revenir à l\'Accueil' : 'Ouvrir le site ici par défaut', 'aria-label': 'Page de départ', html: estDepart ? ETOILE_PLEINE : ETOILE, onclick: function (e) { e.preventDefault(); e.stopPropagation(); AMX.accueil.choisirDepart(estDepart ? '' : s.id, premier); } });
      var tuile = h('a.acc-tuile.' + (COULEURS[s.id] || 'gris') + (estDepart ? '.depart-actif' : ''), { href: AMX.lien(s.id, premier), 'data-section': s.id }, [
        h('div.haut', [h('span.ic', { html: I[s.icone] || I.inventaire }), h('h2', { text: s.titre })]),
        h('div.resume', { text: RESUMES[s.id] || '' }),
        onglets.length > 1 ? h('div.onglets', onglets.map(function (o) {
          var c = o.compteur ? o.compteur() : null;
          return h('a', { href: AMX.lien(s.id, o.id), onclick: function (e) { e.stopPropagation(); } }, [o.titre, (c !== null && c !== undefined && c !== '') ? h('b', { text: String(c) }) : null]);
        })) : null,
        btnDepart
      ]);
      tuiles.appendChild(tuile);
    });
    this.el.appendChild(tuiles);

    /* ---- bas : page de départ + nouveautés ---- */
    var options = [{ v: '', t: 'Accueil (cette page)' }];
    AMX.listeSections().filter(function (s) { return s.id !== 'accueil'; }).forEach(function (s) {
      var onglets = (s.onglets || []).filter(function (o) { return !o.visible || o.visible(); });
      if (onglets.length > 1) onglets.forEach(function (o) { options.push({ v: s.id + '/' + o.id, t: s.titre + ' › ' + o.titre }); });
      else options.push({ v: s.id + '/' + (onglets[0] ? onglets[0].id : ''), t: s.titre });
    });
    var actuel = depart ? depart.section + '/' + depart.onglet : '';
    var sel = h('select.saisie#accueil-depart', options.map(function (o) { return h('option', { value: o.v, selected: o.v === actuel ? true : undefined, text: o.t }); }));
    sel.addEventListener('change', function () { var v = sel.value.split('/'); AMX.accueil.choisirDepart(v[0] || '', v[1] || ''); });
    var carteDepart = h('div.carte', [h('div.carte-corps', [
      h('div.section-titre', { style: { marginBottom: '8px' } }, 'Page de départ'),
      h('div.acc-depart-ligne', [h('span.doux', 'À la connexion, le site s\'ouvre sur'), sel]),
      h('div.mini.doux', { style: { marginTop: '8px' } }, 'Choix gardé sur cet appareil. Le logo Groupe Automax ramène toujours ici.')
    ])]);
    var nouveautes = (AMX.AIDE_CONTENU && AMX.AIDE_CONTENU.nouveautes) ? AMX.AIDE_CONTENU.nouveautes.slice(0, 2) : [];
    var carteNouv = h('div.carte.acc-nouveaute', [h('div.carte-corps', [
      h('div.section-titre', { style: { marginBottom: '8px' } }, 'Nouveautés'),
      nouveautes.length ? h('div', nouveautes.map(function (n, i) { return h('div.item', [h('div.date', { text: n.date }), h('div.titre', { text: n.titre }), h('p', { text: String(n.texte || '').slice(0, i ? 150 : 240) + (String(n.texte || '').length > (i ? 150 : 240) ? '…' : '') })]); })) : h('p.doux', 'Rien de neuf.'),
      AMX.sections.aide ? h('div', { style: { marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [h('a.btn.petit', { href: AMX.lien('aide', 'nouveautes'), text: 'Toutes les nouveautés' }), h('a.btn.petit.fantome', { href: AMX.lien('aide', 'questions'), text: 'Guide et aide' })]) : null
    ])]);
    this.el.appendChild(h('div.acc-bas', [carteDepart, carteNouv]));
  };
  var ETOILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/></svg>';
  var ETOILE_PLEINE = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/></svg>';

  AMX.section('accueil', {
    titre: 'Accueil', icone: 'accueil', ordre: 1,
    monter: function (conteneur, ctx) { return new Accueil(conteneur, ctx); }
  });
})();
