/* =====================================================================================================
   departs.js — Ressources humaines › Départs (8 nov. 2026)

   Maxime : « le processus de terminaison est aussi en fonction ? Le directeur commence la démarche » → « Oui, construis-le ».
   Même circuit que les Conditions d'embauche (embauches.js) :
   - Le directeur (gestionnaire, direction des ventes ou du service, directeur commercial) remplit la fiche de départ d'un
     employé de sa concession, avec des choix : l'employé (pris dans les Dossiers des employés), le dernier jour, le type de
     départ, le préavis, la raison, la réembauche possible, le matériel à récupérer. Il l'envoie au DG.
   - Le DG approuve (la fiche part à la RH) ou la renvoie au directeur. Le DG, la RH et les propriétaires peuvent aussi
     commencer une fiche ; elle part alors directement à la RH.
   - La RH coche sa liste (dernière paie, vacances, relevé d'emploi, assurances, matériel, accès, compte ScanAutomax) puis
     « Marquer traité » : l'employé passe à « Parti » dans son dossier.
   - Données : GET ?rhDeparts=1, ?rhDepart=DP-101 ; POST rhDepartEnregistrer, rhDepartAction, rhDepartTache (Departs.gs). La
     raison, le préavis et les notes restent dans un fichier privé ; rien n'est gardé dans le navigateur.
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez la version qui contient Departs.gs.';
  var CSS = [
    '.dpx-taches { list-style: none; margin: 0; padding: 0; border: 1px solid var(--ligne); border-radius: 12px; overflow: hidden; }',
    '.dpx-taches li { display: flex; gap: 10px; align-items: center; padding: 9px 12px; border-bottom: 1px solid var(--ligne); font-size: 13.5px; }',
    '.dpx-taches li:last-child { border-bottom: none; } .dpx-taches li.fait { background: var(--vert-clair); }',
    '.dpx-taches input[type=checkbox] { width: 20px; height: 20px; margin: 0; flex: 0 0 auto; } .dpx-taches .q { margin-left: auto; font-size: 12px; color: var(--encre-3); white-space: nowrap; }',
    '.dpx-materiel { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px; }',
    '.dpx-materiel label { display: flex; gap: 8px; align-items: center; border: 1px solid var(--ligne); border-radius: 10px; padding: 8px 10px; font-size: 13.5px; cursor: pointer; }',
    '.dpx-materiel label.choisi { border-color: var(--vert-fonce); background: var(--vert-clair); } .dpx-materiel input { width: 18px; height: 18px; margin: 0; }',
    '.dpx-compte { border-left: 4px solid var(--rouge); background: var(--rouge-bg); padding: 10px 12px; border-radius: 8px; margin: 10px 0; font-size: 13px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }',
    '.dpx-compte.ok { border-left-color: var(--vert); background: var(--vert-clair); }'
  ].join('\n');
  function css() { if (AMX.embauches && AMX.embauches.css) AMX.embauches.css(); if (!document.getElementById('css-departs')) { var s = document.createElement('style'); s.id = 'css-departs'; s.textContent = CSS; document.head.appendChild(s); } }

  function perms() { return (AMX.session && AMX.session.perms) || {}; }
  function role() { var p = perms(); return p.role || (AMX.session && AMX.session.role) || ''; }
  var ROLES_DIRECTEUR = ['gestionnaire', 'direction_ventes', 'direction_service', 'directeur_commercial'];
  function estRh() { return perms().rh === true || role() === 'proprietaire'; }
  function estDg() { return role() === 'admin'; }
  function estDirecteur() { return !estRh() && ROLES_DIRECTEUR.indexOf(role()) >= 0; }
  function peutApprouver() { return estRh() || estDg(); }
  function peutVoir() { return estRh() || estDg() || estDirecteur(); }

  var cache = { rep: null, le: 0, enCours: null };
  function charger(force) {
    if (cache.enCours && !force) return cache.enCours;
    if (!force && cache.rep && Date.now() - cache.le < AMX.dureeCopie(60000)) return Promise.resolve(cache.rep);
    cache.enCours = AMX.get({ rhDeparts: '1' }, { delai: 60000, secours: false }).then(function (d) {
      cache.enCours = null;
      if (d && d.refuse) throw new Error(d.erreur || 'Réservé aux DG, aux directeurs et aux ressources humaines.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!Array.isArray(d.departs)) throw new Error(SCRIPT_PAS_A_JOUR);
      cache.rep = d; cache.le = Date.now();
      return d;
    }, function (e) { cache.enCours = null; throw e; });
    return cache.enCours;
  }
  function poser(e) {
    if (!e) return;
    if (cache.rep) {
      var i = cache.rep.departs.findIndex(function (x) { return x.id === e.id; });
      if (i >= 0) cache.rep.departs[i] = e; else cache.rep.departs.unshift(e);
    }
    try { document.dispatchEvent(new CustomEvent('amx:departs')); } catch (er) {}
  }
  function ecrire(corps) {
    return AMX.post(corps, { delai: 120000, secours: false }).then(function (d) {
      if (d && d.vehicules && !d.depart) throw new Error(SCRIPT_PAS_A_JOUR);
      return AMX.verifier(d);
    });
  }
  function fiche(id) {
    return AMX.get({ rhDepart: id }, { delai: 60000, secours: false }).then(function (d) {
      if (d && d.refuse) throw new Error(d.erreur || 'Accès refusé.');
      if (!d || d.ok === false || !d.depart) throw new Error((d && d.erreur) || (d && d.vehicules ? SCRIPT_PAS_A_JOUR : 'Fiche introuvable.'));
      return d.depart;
    });
  }
  /* Le compteur : à la RH, les fiches reçues à traiter ; au DG, celles à approuver ; au directeur, ses brouillons. */
  function compteur() {
    if (!cache.rep) return '';
    var cie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
    var voulu = estRh() ? 'envoyee' : estDg() ? 'approbation' : 'brouillon';
    var n = cache.rep.departs.filter(function (e) { return (!cie || e.compagnie === cie) && e.statut === voulu; }).length;
    return n || '';
  }
  AMX.departs = { charger: charger, enCache: function () { return cache.rep; }, compteur: compteur, peutVoir: peutVoir, vider: function () { cache = { rep: null, le: 0, enCours: null }; } };

  /* ------------------------------------------------------------------------------- outils */
  var STATUTS = { brouillon: 'Brouillon', approbation: 'En attente du DG', envoyee: 'À la RH', traitee: 'Traité par la RH', annulee: 'Annulé' };
  var VUES = [['encours', 'En cours'], ['traitee', 'Traités'], ['annulee', 'Annulés'], ['tous', 'Tous']];
  var TYPES = [['demission', 'Démission'], ['finContrat', 'Fin de contrat'], ['congediement', 'Congédiement'], ['miseAPied', 'Mise à pied'], ['retraite', 'Retraite'], ['abandon', 'Abandon de poste']];
  var PREAVIS = [['employeRespecte', 'Préavis de l\'employé respecté'], ['employeNonRespecte', 'Préavis de l\'employé non respecté'], ['employeur', 'Préavis donné par l\'employeur'],
    ['indemnite', 'Indemnité tenant lieu de préavis'], ['aucun', 'Aucun préavis']];
  var REEMBAUCHE = [['oui', 'Oui'], ['non', 'Non'], ['aDiscuter', 'À discuter']];
  var RAISONS = [
    { g: 'L\'employé part', l: ['Nouvel emploi', 'Retour aux études', 'Déménagement', 'Raisons personnelles ou familiales', 'Conditions de travail', 'Santé'] },
    { g: 'L\'employeur met fin à l\'emploi', l: ['Rendement insuffisant', 'Absences ou retards', 'Manquement aux politiques', 'Fin de la période d\'essai', 'Restructuration ou manque de travail', 'Fin du contrat ou de la saison'] }
  ];
  var MATERIEL = [['cles', 'Clés'], ['carte', 'Carte d\'accès ou télécommande'], ['demo', 'Véhicule démonstrateur'], ['telephone', 'Téléphone cellulaire'], ['ordinateur', 'Ordinateur ou tablette'],
    ['outils', 'Outils de l\'entreprise'], ['uniforme', 'Uniforme'], ['carteCredit', 'Carte de crédit ou carte d\'essence']];
  function libelle(liste, v) { var x = liste.filter(function (o) { return o[0] === v; })[0]; return x ? x[1] : ''; }
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c || ''; }
  function dateCourte(iso) { if (!iso) return ''; var d = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? String(iso) : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function dateHeure(iso) { return iso ? AMX.fmtDate(iso, true) : ''; }
  function dansVue(e, v) { if (v === 'encours') return e.statut === 'brouillon' || e.statut === 'approbation' || e.statut === 'envoyee'; if (v === 'tous') return true; return e.statut === v; }
  function champ(libelleTxt, el, aide) { return h('div.champ', [h('label', { text: libelleTxt }), el, aide ? h('span.aide', { text: aide }) : null]); }
  function choix(valeur, options, vide) { var s = h('select.saisie'); s.appendChild(h('option', { value: '', text: vide || '— choisir —' })); options.forEach(function (o) { s.appendChild(h('option', { value: o[0], text: o[1], selected: o[0] === (valeur || '') })); }); return s; }
  function outils() { return (AMX.rh && AMX.rh.outils) || null; }

  /* ------------------------------------------------------------------------------- page */
  function VueDep(conteneur, ctx) {
    css();
    var self = this, p = (ctx && ctx.params) || {};
    this.conteneur = conteneur; this.detruit = false;
    this.compagnie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
    this.vue = p.voir || 'encours'; this.q = p.q || ''; this.ouvrirId = p.id || ''; this.nouveauPour = p.nouveau || '';
    AMX.vider(conteneur);
    this.btnNouvelle = h('button.btn.primaire', { type: 'button', text: '+ Fiche de départ', onclick: function () { self.formulaire(null); } });
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    conteneur.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Départs'), h('p', { text: 'Le directeur commence la fiche de départ, le DG l\'approuve, la RH la traite : dernière paie, relevé d\'emploi, matériel, accès. L\'employé passe ensuite à « Parti » dans son dossier.' })]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnNouvelle], [this.btnNouvelle]))
    ]));
    this.elCies = h('div.barre-cies'); conteneur.appendChild(this.elCies);
    this.elVues = h('div.cex-vues'); conteneur.appendChild(this.elVues);
    this.inRecherche = h('input.saisie.recherche', { type: 'search', value: this.q, placeholder: 'Chercher : employé, poste, DP-101…', autocomplete: 'off', 'aria-label': 'Chercher une fiche' });
    conteneur.appendChild(h('div.cex-filtres', [this.inRecherche]));
    this.elPortee = h('div'); conteneur.appendChild(this.elPortee);
    this.elKpis = h('div.kpis'); conteneur.appendChild(this.elKpis);
    this.elCorps = h('div'); conteneur.appendChild(this.elCorps);
    var relancer = AMX.debounce(function () { self.q = self.inRecherche.value; self.rafraichir(); }, 160);
    this.inRecherche.addEventListener('input', relancer);
    this.surCie = function (e) { self.compagnie = (e.detail && e.detail.compagnie) || ''; self.rendre(); };
    this.surMaj = function () { if (self.detruit) return; if (cache.rep) self.rep = cache.rep; self.rendre(); };
    document.addEventListener('amx:compagnie', this.surCie);
    document.addEventListener('amx:departs', this.surMaj);
    this.elCorps.appendChild(AMX.chargeur('Départs'));
    this.charger(false);
  }
  VueDep.prototype.demonter = function () { this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); document.removeEventListener('amx:departs', this.surMaj); };
  VueDep.prototype.naviguer = function (ctx) { var p = (ctx && ctx.params) || {}; if (p.id && this.rep) this.ouvrirFiche(p.id); if (p.nouveau && this.rep) this.formulaire(null, p.nouveau); };
  VueDep.prototype.charger = function (force, silencieux) {
    var self = this;
    charger(force).then(function (d) {
      if (self.detruit) return;
      self.rep = d; self.rendre(); AMX.rafraichirSousBarre && AMX.rafraichirSousBarre();
      if (self.ouvrirId) { var id = self.ouvrirId; self.ouvrirId = ''; self.ouvrirFiche(id); }
      if (self.nouveauPour) { var em = self.nouveauPour; self.nouveauPour = ''; self.formulaire(null, em); }
      if (force && !silencieux) AMX.toast('Départs à jour', 'ok');
    }, function (e) { if (self.detruit) return; AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.carte', [h('div.cex-vide', { text: AMX.erreurTexte(e) })])); });
  };
  VueDep.prototype.filtrer = function (sauf) {
    var self = this;
    return (this.rep ? this.rep.departs : []).filter(function (e) {
      if (self.compagnie && e.compagnie !== self.compagnie) return false;
      if (sauf !== 'vue' && !dansVue(e, self.vue)) return false;
      if (self.q && !AMX.correspond([e.id, e.nom, e.poste, e.compagnieNom, e.creeParNom, e.typeNom, STATUTS[e.statut]], self.q)) return false;
      return true;
    });
  };
  VueDep.prototype.rendre = function () {
    if (!this.rep || this.detruit) return;
    var self = this, tous = this.rep.departs;
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.compagnie,
      compte: function (c) { return tous.filter(function (e) { return (!c || e.compagnie === c) && dansVue(e, 'encours'); }).length; },
      onchange: function (c) { self.compagnie = c; self.rendre(); } });
    var pourVue = this.filtrer('vue');
    AMX.vider(this.elVues);
    VUES.forEach(function (v) {
      var n = pourVue.filter(function (e) { return dansVue(e, v[0]); }).length;
      self.elVues.appendChild(h('button' + (self.vue === v[0] ? '.actif' : ''), { type: 'button', onclick: function () { self.vue = v[0]; self.rendre(); } }, [v[1], h('span.n', { text: String(n) })]));
    });
    this.rafraichir();
  };
  VueDep.prototype.rafraichir = function () {
    if (!this.rep) return;
    var self = this, liste = this.filtrer();
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['fiche', 'fiches'], contexte: [this.compagnie ? nomCie(this.compagnie) : 'toutes les concessions', ({ encours: 'en cours', traitee: 'traités', annulee: 'annulés', tous: 'tous' })[this.vue]],
      filtres: this.q ? ['« ' + this.q + ' »'] : [], effacer: function () { self.q = ''; self.inRecherche.value = ''; self.rafraichir(); } });
    AMX.vider(this.elKpis);
    var tuile = function (v, lib, sous, cls) { var el = h('div.kpi', [h('div.valeur', { text: String(v) }), h('div.libelle', { text: lib }), sous ? h('div.sous', { text: sous }) : null]); if (cls) el.classList.add(cls); return el; };
    var br = liste.filter(function (e) { return e.statut === 'brouillon'; }).length, app = liste.filter(function (e) { return e.statut === 'approbation'; }).length, env = liste.filter(function (e) { return e.statut === 'envoyee'; }).length;
    var ajd = new Date().toISOString().slice(0, 10);
    var passes = liste.filter(function (e) { return e.statut !== 'traitee' && e.statut !== 'annulee' && e.dernierJour && e.dernierJour < ajd; }).length;
    this.elKpis.appendChild(tuile(liste.length, 'Fiches', 'dans cette liste', 'neutre'));
    this.elKpis.appendChild(tuile(br, 'Brouillons', 'pas encore envoyés', br ? 'attention' : 'neutre'));
    this.elKpis.appendChild(tuile(app, 'En attente du DG', 'commencées par un directeur', app ? 'attention' : 'neutre'));
    this.elKpis.appendChild(tuile(env, 'À traiter par la RH', 'paie, relevé d\'emploi, accès', env ? 'attention' : 'neutre'));
    this.elKpis.appendChild(tuile(passes, 'Dernier jour passé', 'pas encore traités', passes ? 'alerte' : 'neutre'));
    AMX.vider(this.elCorps);
    if (!liste.length) {
      this.elCorps.appendChild(h('div.carte', [h('div.cex-vide', [h('p', { text: this.rep.departs.length ? 'Aucune fiche avec ces filtres.' : 'Aucune fiche de départ. Un employé quitte ? Commencez la fiche : le DG l\'approuve, la RH la traite.' }),
        h('button.btn.primaire', { type: 'button', text: '+ Fiche de départ', onclick: function () { self.formulaire(null); } })])]));
      return;
    }
    var corps = h('tbody');
    liste.forEach(function (e) {
      corps.appendChild(h('tr', { onclick: function () { self.ouvrirFiche(e.id); } }, [
        h('td', [h('b', { text: e.nom }), h('span.s', { text: e.id })]),
        h('td', [h('span', { text: e.poste || '—' }), h('span.s', { text: e.typeNom || '' })]),
        h('td', { text: nomCie(e.compagnie) }),
        h('td', { text: e.dernierJour ? dateCourte(e.dernierJour) : '—' }),
        h('td', [h('span.cex-puce.' + e.statut, { text: STATUTS[e.statut] || e.statut }), h('span.s', { text: e.statut === 'envoyee' ? e.tachesFaites + ' / ' + e.taches.length + ' tâches' : e.statut === 'approbation' ? 'depuis le ' + dateCourte(e.demandeLe) : e.statut === 'traitee' ? 'le ' + dateCourte(e.traiteLe) : e.renvoiRaison ? 'renvoyée par le DG' : 'modifiée le ' + dateCourte(e.majLe || e.creeLe) })]),
        h('td', { text: e.creeParNom || '' })
      ]));
    });
    this.elCorps.appendChild(h('div.carte', [h('div.cex-cadre', [h('table.tableau.cex-table', [h('thead', [h('tr', [h('th', 'Employé'), h('th', 'Poste'), h('th', 'Concession'), h('th', 'Dernier jour'), h('th', 'État'), h('th', 'Commencée par')])]), corps])])]));
  };

  /* ------------------------------------------------------------------------------- fiche */
  VueDep.prototype.ouvrirFiche = function (id) {
    var self = this, corps = h('div', [AMX.chargeur('Fiche ' + id, { compact: true })]), m;
    m = AMX.modale({ titre: 'Départ — ' + id, corps: corps, large: true, proteger: false, boutons: [{ texte: 'Fermer' }] });
    fiche(id).then(function (e) {
      var dessiner = function () {
        AMX.vider(corps);
        if (e.statut === 'approbation') corps.appendChild(h('div.cex-avis', { text: 'Commencée par ' + (e.creeParNom || 'un directeur') + ', en attente de l\'approbation du DG depuis le ' + dateHeure(e.demandeLe) + '.' }));
        if (e.statut === 'brouillon' && e.renvoiRaison) corps.appendChild(h('div.cex-avis', { text: 'Renvoyée par le DG : ' + e.renvoiRaison }));
        if (e.approuveLe) corps.appendChild(h('div.cex-ok', { text: 'Approuvée par ' + (e.approuvePar || 'le DG') + ' le ' + dateHeure(e.approuveLe) + '.' }));
        if (e.statut === 'envoyee') corps.appendChild(h('div.cex-avis', { text: 'À la RH depuis le ' + dateHeure(e.envoyeLe) + ' — ' + e.tachesFaites + ' tâche' + (e.tachesFaites > 1 ? 's' : '') + ' sur ' + e.taches.length + ' faite' + (e.tachesFaites > 1 ? 's' : '') + '.' }));
        if (e.statut === 'traitee') corps.appendChild(h('div.cex-ok', { text: 'Traité le ' + dateHeure(e.traiteLe) + (e.traitePar ? ' par ' + e.traitePar : '') + (e.dossierMaj ? ' — l\'employé est « Parti » dans son dossier.' : '.') }));
        if (e.statut === 'annulee') corps.appendChild(h('div.cex-avis', { text: 'Annulé.' }));
        var dl = function (paires) { var out = h('dl.cex-detail'); paires.forEach(function (p) { if (!p[1]) return; out.appendChild(h('dt', { text: p[0] })); out.appendChild(h('dd', { text: p[1] })); }); return out; };
        corps.appendChild(h('div.cex-h', { text: 'Le départ' }));
        corps.appendChild(dl([['Employé', e.nom + (e.employeId ? '' : ' (pas dans les Dossiers des employés)')], ['Poste', e.poste], ['Concession', nomCie(e.compagnie)],
          ['Dernier jour de travail', e.dernierJour ? dateCourte(e.dernierJour) : ''], ['Type de départ', e.typeNom], ['Préavis', e.preavisNom], ['Raison', e.raison],
          ['Réembauche possible', e.reembaucheNom], ['Matériel à récupérer', (e.materiel || []).map(function (c) { return libelle(MATERIEL, c); }).filter(Boolean).join(', ')], ['Notes à la RH', e.notes]]));
        /* La RH : la liste à cocher, et l'état du compte ScanAutomax. */
        if (e.statut === 'envoyee' || e.statut === 'traitee') {
          corps.appendChild(h('div.cex-h', { text: 'Liste de la RH' }));
          var ul = h('ul.dpx-taches');
          (e.taches || []).forEach(function (t) {
            var c = h('input', { type: 'checkbox', checked: t.fait, disabled: !estRh() || e.statut === 'traitee' });
            c.addEventListener('change', function () {
              c.disabled = true;
              ecrire({ action: 'rhDepartTache', id: e.id, tache: t.cle, fait: c.checked }).then(function (r) { var j = e.journal; e = Object.assign(e, r.depart); e.journal = j; poser(r.depart); dessiner(); })
                .catch(function (er) { c.checked = !c.checked; c.disabled = false; AMX.toast(AMX.erreurTexte(er), 'erreur'); });
            });
            ul.appendChild(h('li' + (t.fait ? '.fait' : ''), [c, h('span', { text: t.libelle }), t.fait ? h('span.q', { text: (t.par ? t.par + ', ' : '') + dateCourte(t.le) }) : null]));
          });
          corps.appendChild(ul);
          if (e.compte) {
            var gerer = !!(perms().gererUtilisateurs || role() === 'proprietaire');
            corps.appendChild(h('div.dpx-compte' + (e.compte.actif ? '' : '.ok'), [h('span', { text: !e.compte.existe ? 'Aucun compte ScanAutomax pour ' + e.compte.courriel + '.'
              : e.compte.actif ? 'Le compte ScanAutomax de ' + e.compte.courriel + ' est encore actif : un administrateur le désactive dans Admin.' : 'Le compte ScanAutomax de ' + e.compte.courriel + ' est désactivé.' }),
              e.compte.actif && gerer ? h('button.btn.petit', { type: 'button', text: 'Ouvrir Comptes et droits', onclick: function () { m.fermer(); AMX.aller('outils', 'admin'); } }) : null]));
          }
        }
        if (e.journal && e.journal.length) {
          corps.appendChild(h('div.cex-h', { text: 'Journal' }));
          corps.appendChild(h('ul.cex-journal', e.journal.slice(0, 15).map(function (j) { return h('li', { text: dateHeure(j.le) + ' — ' + (j.qui ? j.qui + ' : ' : '') + j.quoi }); })));
        }
        m.boutons(boutons());
      };
      var boutons = function () {
        var b = [{ texte: 'Fermer' }];
        var ouvert = e.statut === 'brouillon' || e.statut === 'approbation' || (e.statut === 'envoyee' && !estDirecteur());
        if (ouvert) {
          b.push({ texte: 'Annuler la fiche', classe: 'danger', action: function () { return AMX.confirmer('Annuler la fiche ' + e.id + ' ?', 'La fiche reste dans « Annulés ». L\'employé reste actif.', { ok: 'Annuler la fiche', danger: true }).then(function (oui) { if (!oui) return false; return ecrire({ action: 'rhDepartAction', id: e.id, op: 'annuler' }).then(function (r) { poser(r.depart); AMX.toast('Fiche annulée', 'ok'); }); }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); return false; }); } });
          if (e.statut !== 'envoyee' || estRh() || estDg()) b.push({ texte: 'Modifier', action: function (f) { f(); self.formulaire(e); return false; } });
        }
        if (e.statut === 'approbation' && peutApprouver()) {
          b.push({ texte: 'Renvoyer au directeur…', action: function (f) { f(); self.renvoyer(e); return false; } });
          b.push({ texte: 'Approuver et envoyer à la RH', classe: 'primaire', action: function () { return ecrire({ action: 'rhDepartAction', id: e.id, op: 'approuver' }).then(function (r) { poser(r.depart); AMX.toast('Approuvé et envoyé à la RH', r.avertissement ? 'attention' : 'ok'); if (r.avertissement) AMX.toast(r.avertissement, 'attention', 9000); }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur', 8000); return false; }); } });
        }
        if (e.statut === 'envoyee' && estRh()) {
          b.push({ texte: 'Marquer traité', classe: 'primaire', action: function () {
            var reste = (e.taches || []).filter(function (t) { return !t.fait; }).length;
            var oui = reste ? AMX.confirmer('Marquer traité ?', reste + ' tâche' + (reste > 1 ? 's' : '') + ' de la liste ne ' + (reste > 1 ? 'sont' : 'est') + ' pas cochée' + (reste > 1 ? 's' : '') + '. L\'employé passera à « Parti » dans son dossier.', { ok: 'Marquer traité' }) : Promise.resolve(true);
            return oui.then(function (ok) {
              if (!ok) return false;
              return ecrire({ action: 'rhDepartAction', id: e.id, op: 'traite' }).then(function (r) { poser(r.depart); AMX.toast(r.dossier ? 'Traité : l\'employé est « Parti » dans son dossier' : 'Traité', r.avertissement ? 'attention' : 'ok'); if (r.avertissement) AMX.toast(r.avertissement, 'attention', 9000); try { if (AMX.employes && AMX.employes.vider) AMX.employes.vider(); } catch (e5) {} });
            }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur', 8000); return false; });
          } });
        }
        if (estRh() && (e.statut === 'traitee' || e.statut === 'annulee')) b.push({ texte: 'Rouvrir', action: function () { return ecrire({ action: 'rhDepartAction', id: e.id, op: 'rouvrir' }).then(function (r) { poser(r.depart); AMX.toast('Fiche rouverte', 'ok'); }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); return false; }); } });
        return b;
      };
      dessiner();
    }, function (er) { AMX.vider(corps); corps.appendChild(h('div.cex-avis', { text: AMX.erreurTexte(er) })); });
  };
  VueDep.prototype.renvoyer = function (e) {
    var inRaison = h('textarea.saisie', { rows: 3, placeholder: 'Ex. mettre la date du dernier quart ; préciser le matériel.' });
    AMX.modale({ titre: 'Renvoyer au directeur — ' + e.id, corps: h('div.cex-form', [h('p', { text: 'Dites au directeur ce qu\'il faut changer. Il reçoit un courriel et la fiche redevient un brouillon.' }), inRaison]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Renvoyer', classe: 'primaire', action: function () {
        if (inRaison.value.trim().length < 3) { AMX.toast('Écrivez ce qu\'il faut changer.', 'attention'); return false; }
        return ecrire({ action: 'rhDepartAction', id: e.id, op: 'renvoyer', raison: inRaison.value }).then(function (r) { poser(r.depart); AMX.toast('Renvoyée au directeur', 'ok'); }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur', 8000); return false; });
      } }] });
  };

  /* ------------------------------------------------------------------------------- formulaire : des choix partout */
  VueDep.prototype.formulaire = function (e, employeId) {
    var self = this;
    /* La liste des employés arrive avec les fiches : un clic avant la fin du chargement attend les données (sinon la liste
       des employés serait vide). */
    if (!this.rep) {
      AMX.toast('Chargement des employés…', 'info', 2500);
      charger(false).then(function (d) { if (self.detruit) return; self.rep = d; self.formulaire(e, employeId); }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur', 8000); });
      return;
    }
    var rep = this.rep, nouveau = !e;
    e = e || { compagnie: this.compagnie, materiel: [] };
    var o = outils();
    var codes = AMX.codesPour ? AMX.codesPour('inventaire') : '*';
    codes = codes === '*' || !Array.isArray(codes) ? Object.keys(AMX.COMPAGNIES_TOUTES || {}) : codes;
    var empDemande = employeId ? (rep.employes || []).filter(function (x) { return x.id === employeId; })[0] : null;
    if (empDemande) e.compagnie = empDemande.compagnie;
    var selCie = choix(e.compagnie || (codes.length === 1 ? codes[0] : ''), codes.map(function (c) { return [c, nomCie(c)]; }));
    var selEmp = h('select.saisie'), AUTRE = '__autre__';
    var inNom = h('input.saisie', { type: 'text', autocomplete: 'off', placeholder: 'Prénom Nom', value: e.employeId ? '' : (e.nom || '') });
    var inPoste = o ? o.choixOuAutre(o.POSTES, e.employeId ? '' : (e.poste || ''), { ph: 'Le titre du poste' }) : { el: h('input.saisie', { type: 'text', value: e.poste || '' }), value: e.poste || '' };
    var blocAutre = h('div.grille', { style: { display: 'none', marginTop: '10px' } }, [champ('Nom de l\'employé', inNom), champ('Poste', inPoste.el)]);
    var montrerAutre = function () { blocAutre.style.display = selEmp.value === AUTRE ? '' : 'none'; };
    var dessinerEmployes = function () {
      var garde = selEmp.value || (empDemande ? empDemande.id : e.employeId) || (e.nom && !e.employeId ? AUTRE : '');
      AMX.vider(selEmp);
      var l = (rep.employes || []).filter(function (x) { return x.compagnie === selCie.value; });
      selEmp.appendChild(h('option', { value: '', text: selCie.value ? (l.length ? '— choisir l\'employé —' : 'Aucun employé aux dossiers de cette concession') : 'Choisissez d\'abord la concession' }));
      l.forEach(function (x) { selEmp.appendChild(h('option', { value: x.id, text: x.nom + (x.poste ? ' — ' + x.poste : '') })); });
      selEmp.appendChild(h('option', { value: AUTRE, text: 'Pas dans la liste… (l\'écrire)' }));
      selEmp.value = l.some(function (x) { return x.id === garde; }) || garde === AUTRE ? garde : (l.length ? '' : (selCie.value ? AUTRE : ''));
      montrerAutre();
    };
    selCie.addEventListener('change', dessinerEmployes);
    selEmp.addEventListener('change', montrerAutre);
    dessinerEmployes();
    var inDernier = h('input.saisie', { type: 'date', value: e.dernierJour || '' });
    var selType = choix(e.type, TYPES), selPreavis = choix(e.preavis, PREAVIS), selReemb = choix(e.reembauche, REEMBAUCHE);
    var raison = o ? o.choixOuAutre(RAISONS, e.raison || '', { ph: 'La raison, en quelques mots' }) : { el: h('input.saisie', { type: 'text', value: e.raison || '' }), value: e.raison || '' };
    var mat = {}; (e.materiel || []).forEach(function (c) { mat[c] = true; });
    var grilleMat = h('div.dpx-materiel', MATERIEL.map(function (x) {
      var c = h('input', { type: 'checkbox', checked: !!mat[x[0]] });
      var lab = h('label' + (mat[x[0]] ? '.choisi' : ''), [c, x[1]]);
      c.addEventListener('change', function () { if (c.checked) mat[x[0]] = true; else delete mat[x[0]]; lab.classList.toggle('choisi', c.checked); });
      return lab;
    }));
    var inNotes = h('textarea.saisie', { rows: 2, placeholder: 'Facultatif : ce que la RH doit savoir.' }); inNotes.value = e.notes || '';
    var corps = h('div.cex-form', [
      h('div.cex-prive', { text: 'La raison, le préavis et les notes restent dans un fichier privé : seuls la personne qui remplit, le DG de la concession et la RH les voient. Aucun courriel ne les contient.' }),
      h('div.cex-h', { text: 'L\'employé' }),
      h('div.grille', [champ('Concession', selCie), champ('Employé', selEmp, 'Pris dans les Dossiers des employés.')]), blocAutre,
      h('div.cex-h', { text: 'Le départ' }),
      h('div.grille', [champ('Dernier jour de travail', inDernier), champ('Type de départ', selType), champ('Préavis', selPreavis), champ('Réembauche possible', selReemb)]),
      h('div.grille', { style: { marginTop: '10px' } }, [h('div.champ', { style: { gridColumn: '1 / -1' } }, [h('label', { text: 'Raison' }), raison.el])]),
      h('div.cex-h', { text: 'Matériel à récupérer' }), grilleMat,
      h('div.cex-h', { text: 'Notes à la RH (facultatif)' }), inNotes
    ]);
    var lire = function () {
      var autre = selEmp.value === AUTRE;
      return { id: e.id || '', compagnie: selCie.value, employeId: autre ? '' : selEmp.value, nom: autre ? inNom.value : '', poste: autre ? inPoste.value : '', dernierJour: inDernier.value,
        type: selType.value, preavis: selPreavis.value, raison: raison.value, reembauche: selReemb.value, materiel: Object.keys(mat), notes: inNotes.value };
    };
    var envoyer = function (versLaSuite) {
      var x = lire();
      if (!x.compagnie) { AMX.toast('Choisissez la concession.', 'attention'); return Promise.reject(new Error('champ')); }
      if (!x.employeId && x.nom.trim().length < 3) { AMX.toast('Choisissez l\'employé.', 'attention'); return Promise.reject(new Error('champ')); }
      if (versLaSuite && (!x.dernierJour || !x.type)) { AMX.toast('Choisissez le dernier jour et le type de départ.', 'attention', 6000); return Promise.reject(new Error('champ')); }
      return ecrire({ action: 'rhDepartEnregistrer', depart: x, envoyer: !!versLaSuite }).then(function (r) {
        poser(r.depart);
        var ou = r.depart && r.depart.statut === 'approbation' ? 'Envoyée au DG pour approbation' : 'Envoyée à la RH';
        AMX.toast(versLaSuite ? ou + (r.avises ? ' (' + r.avises + ' personne' + (r.avises > 1 ? 's' : '') + ' prévenue' + (r.avises > 1 ? 's' : '') + ')' : '') : 'Brouillon enregistré', r.avertissement ? 'attention' : 'ok');
        if (r.avertissement) AMX.toast(r.avertissement, 'attention', 9000);
      }).catch(function (er) { if (er && er.message === 'champ') throw er; AMX.toast(AMX.erreurTexte(er), 'erreur', 8000); throw er; });
    };
    var libelleEnvoyer = estDirecteur() ? (e.statut === 'approbation' ? 'Enregistrer (reste au DG)' : 'Envoyer au DG pour approbation')
      : e.statut === 'envoyee' ? 'Enregistrer les changements' : e.statut === 'approbation' ? 'Approuver et envoyer à la RH' : 'Envoyer à la RH';
    AMX.modale({ titre: nouveau ? 'Nouvelle fiche de départ' : 'Modifier — ' + e.id, corps: corps, large: true, boutons: [
      { texte: 'Annuler' },
      { texte: 'Enregistrer le brouillon', action: function () { return envoyer(false); } },
      { texte: libelleEnvoyer, classe: 'primaire', action: function () { return envoyer(true); } }
    ] });
  };

  AMX.section('departs', {
    titre: 'Départs', icone: 'admin', ordre: 57,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new VueDep(conteneur, ctx); }
  });
})();
