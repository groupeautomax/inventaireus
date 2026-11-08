/* =====================================================================================================
   embauches.js — Outils › Ressources humaines › Conditions d'embauche (7 nov. 2026)

   Maxime : « il faut avoir des fichiers vierges que les DG vont avoir accès pour remplir les conditions d'embauche, et y
   avoir accès sur la plateforme ou sur l'app » ; choix : remplir en ligne, envoyé à la RH ; modèles = les lettres d'offre de
   HR4 (Bibliothèque du portail RH, catégorie « lettre »).
   - Le DG (sa concession), la RH et les propriétaires remplissent la fiche : candidat, poste, date d'entrée, rémunération,
     horaire, supérieur, période d'essai, avantages, et la lettre d'offre choisie, complétée dans un petit éditeur.
   - « Envoyer à la RH » : un courriel part aux comptes « Ressources humaines » de la concession (rien au candidat).
   - Maxime (7 nov., suite) : « les directeurs doivent aussi pouvoir remplir l'embauche, mais après ça doit être approuvé par
     le DG ». Un directeur (gestionnaire, direction des ventes ou du service, directeur commercial) envoie sa fiche au DG de
     la concession (« En attente du DG ») ; le DG l'approuve (elle part à la RH) ou la renvoie avec une raison.
   - La RH ouvre la fiche et « Préparer l'envoi » : le Nouvel envoi du portail RH se remplit (AMX.rh.preparerEnvoi) ; après
     l'envoi, la fiche passe « traitée » avec le numéro RH-….
   - Données : GET ?rhEmbauches=1, ?rhEmbauche=CE-101, ?rhEmbaucheModele=DM-… ; POST rhEmbaucheEnregistrer, rhEmbaucheAction
     (Embauches.gs). La rémunération et les coordonnées restent dans un fichier privé, jamais dans une feuille ni dans le
     navigateur (aucune copie locale).
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez la version qui contient Embauches.gs.';
  var CSS = [
    '.cex-vues { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }',
    '.cex-vues button { border: 1px solid var(--ligne); background: var(--carte); border-radius: 999px; padding: 6px 13px; font-size: 13px; font-weight: 600; color: var(--encre-2); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }',
    '.cex-vues button.actif { background: var(--vert-fonce); border-color: var(--vert-fonce); color: #fff; } .cex-vues button .n { font-weight: 700; opacity: .8; }',
    '.cex-filtres { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 8px; } .cex-filtres .saisie.recherche { flex: 1 1 260px; max-width: 480px; }',
    '.cex-cadre { overflow-x: auto; } .cex-table tbody tr { cursor: pointer; } .cex-table tbody tr:hover { background: var(--carte-2); }',
    '.cex-table td { vertical-align: top; } .cex-table td .s { display: block; color: var(--encre-3); font-size: 12px; }',
    '.cex-puce { display: inline-block; border-radius: 999px; padding: 2px 9px; font-size: 12px; font-weight: 700; white-space: nowrap; }',
    '.cex-puce.brouillon { background: var(--gris-bg); color: var(--encre-2); } .cex-puce.envoyee { background: var(--ambre-bg); color: var(--ambre); } .cex-puce.approbation { background: var(--bleu-bg); color: var(--bleu); }',
    '.cex-puce.traitee { background: var(--vert-clair); color: var(--vert-fonce); } .cex-puce.annulee { background: var(--gris-bg); color: var(--encre-3); }',
    '.cex-vide { padding: 28px; text-align: center; color: var(--encre-3); }',
    '.cex-avis { border-left: 4px solid var(--ambre); background: var(--ambre-bg); padding: 10px 12px; border-radius: 8px; margin: 0 0 10px; font-size: 13px; }',
    '.cex-ok { border-left: 4px solid var(--vert); background: var(--vert-clair); padding: 10px 12px; border-radius: 8px; margin: 0 0 10px; font-size: 13px; }',
    '.cex-prive { border-left: 4px solid var(--bleu); background: var(--bleu-bg); padding: 10px 12px; border-radius: 8px; margin: 0 0 10px; font-size: 13px; }',
    '.cex-h { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--encre-2); margin: 16px 0 6px; }',
    '.cex-detail { display: grid; grid-template-columns: minmax(150px, 32%) 1fr; margin: 0 0 8px; }',
    '.cex-detail dt, .cex-detail dd { padding: 6px 8px; border-bottom: 1px solid var(--ligne); margin: 0; font-size: 13px; } .cex-detail dt { color: var(--encre-3); font-weight: 600; } .cex-detail dd { white-space: pre-wrap; word-break: break-word; }',
    '.cex-form .grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; } .cex-form textarea { width: 100%; }',
    '.cex-lettre { border: 1px dashed var(--ligne); border-radius: 10px; padding: 10px 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }',
    '.cex-lettre select { flex: 1 1 260px; max-width: 460px; } .cex-etat { font-size: 12.5px; font-weight: 700; } .cex-etat.ok { color: var(--vert-fonce); } .cex-etat.non { color: var(--ambre); }',
    '.cex-texte { background: #fff; color: #111; border: 1px solid var(--ligne); border-radius: 8px; padding: 14px 18px; line-height: 1.5; font-size: 14px; max-height: 50vh; overflow: auto; }',
    '.cex-texte mark { background: #FFE58F; color: #111; padding: 0 2px; border-radius: 3px; } .cex-texte p { margin: 0 0 8px; }',
    '.cex-journal { font-size: 12px; color: var(--encre-3); list-style: none; margin: 0; padding: 0; } .cex-journal li { padding: 2px 0; }',
    '.cex-prog { font-size: 12.5px; color: var(--encre-3); margin: 6px 0 0; }',
    '@media (max-width: 640px) { .cex-detail { grid-template-columns: 1fr; } .cex-detail dt { border-bottom: none; padding-bottom: 0; } }'
  ].join('\n');
  function css() { if (!document.getElementById('css-embauches')) { var s = document.createElement('style'); s.id = 'css-embauches'; s.textContent = CSS; document.head.appendChild(s); } }

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
    cache.enCours = AMX.get({ rhEmbauches: '1' }, { delai: 60000, secours: false }).then(function (d) {
      cache.enCours = null;
      if (d && d.refuse) throw new Error(d.erreur || 'Réservé aux DG et aux ressources humaines.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!Array.isArray(d.embauches)) throw new Error(SCRIPT_PAS_A_JOUR);
      cache.rep = d; cache.le = Date.now();
      return d;
    }, function (e) { cache.enCours = null; throw e; });
    return cache.enCours;
  }
  function poser(e) {
    if (!e) return;
    if (!cache.rep) { try { document.dispatchEvent(new CustomEvent('amx:embauches')); } catch (er0) {} return; }   /* la page relit la liste */
    var c = {}; ['id', 'compagnie', 'compagnieNom', 'statut', 'statutNom', 'nom', 'poste', 'debut', 'modeleId', 'modeleNom', 'creeLe', 'creePar', 'creeParNom', 'majLe', 'envoyeLe', 'traiteLe', 'traitePar', 'envoiId', 'creeParRole', 'demandeLe', 'approuveLe', 'approuvePar', 'renvoiRaison'].forEach(function (k) { c[k] = e[k]; });
    var i = cache.rep.embauches.findIndex(function (x) { return x.id === e.id; });
    if (i >= 0) cache.rep.embauches[i] = c; else cache.rep.embauches.unshift(c);
    try { document.dispatchEvent(new CustomEvent('amx:embauches')); } catch (er) {}
  }
  function ecrire(corps) {
    return AMX.post(corps, { delai: 120000, secours: false }).then(function (d) {
      if (d && d.vehicules && !d.embauche) throw new Error(SCRIPT_PAS_A_JOUR);
      return AMX.verifier(d);
    });
  }
  function fiche(id) {
    return AMX.get({ rhEmbauche: id }, { delai: 60000, secours: false }).then(function (d) {
      if (d && d.refuse) throw new Error(d.erreur || 'Accès refusé.');
      if (!d || d.ok === false || !d.embauche) throw new Error((d && d.erreur) || (d && d.vehicules ? SCRIPT_PAS_A_JOUR : 'Fiche introuvable.'));
      return d.embauche;
    });
  }
  var modeles = {};
  function modele(id) {
    if (modeles[id]) return Promise.resolve(modeles[id]);
    return AMX.get({ rhEmbaucheModele: id }, { delai: 60000, secours: false }).then(function (d) {
      if (!d || d.ok === false || typeof d.html !== 'string') throw new Error((d && d.erreur) || SCRIPT_PAS_A_JOUR);
      modeles[id] = d.html; return d.html;
    });
  }
  /* Le compteur : à la RH, les fiches reçues à traiter ; au DG, celles à approuver ; au directeur, ses brouillons (renvoyés compris). */
  function compteur() {
    if (!cache.rep) return '';
    var cie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
    var voulu = estRh() ? 'envoyee' : estDg() ? 'approbation' : 'brouillon';
    var n = cache.rep.embauches.filter(function (e) { return (!cie || e.compagnie === cie) && e.statut === voulu; }).length;
    return n || '';
  }

  AMX.section('embauches', {
    titre: 'Conditions d\'embauche', icone: 'achat', ordre: 57,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new VueEmb(conteneur, ctx); }
  });
  AMX.embauches = { charger: charger, enCache: function () { return cache.rep; }, compteur: compteur, peutVoir: peutVoir, vider: function () { cache = { rep: null, le: 0, enCours: null }; modeles = {}; } };

  /* ------------------------------------------------------------------------------- outils */
  var STATUTS = { brouillon: 'Brouillon', approbation: 'En attente du DG', envoyee: 'Envoyée à la RH', traitee: 'Traitée par la RH', annulee: 'Annulée' };
  var TYPES = [['', '—'], ['permanentPlein', 'Permanent, temps plein'], ['permanentPartiel', 'Permanent, temps partiel'], ['temporaire', 'Temporaire'], ['saisonnier', 'Saisonnier'], ['etudiant', 'Étudiant']];
  var VUES = [['encours', 'En cours'], ['traitee', 'Traitées'], ['annulee', 'Annulées'], ['tous', 'Toutes']];
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c || ''; }
  function dateCourte(iso) { if (!iso) return ''; var d = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? String(iso) : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function dateHeure(iso) { return iso ? AMX.fmtDate(iso, true) : ''; }
  function tel(t) { t = String(t || '').replace(/\D/g, ''); return t.length === 10 ? t.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2-$3') : t; }
  function dansVue(e, v) { if (v === 'encours') return e.statut === 'brouillon' || e.statut === 'approbation' || e.statut === 'envoyee'; if (v === 'tous') return true; return e.statut === v; }
  function champ(libelle, el, aide) { return h('div.champ', [h('label', { text: libelle }), el, aide ? h('span.aide', { text: aide }) : null]); }
  function saisie(v, attrs) { return h('input.saisie', Object.assign({ type: 'text', value: v || '', autocomplete: 'off' }, attrs || {})); }
  function zone(v, rows, ph) { var t = h('textarea.saisie', { rows: rows || 3, placeholder: ph || '' }); t.value = v || ''; return t; }
  function choix(valeur, options) { var s = h('select.saisie'); options.forEach(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (o[0] === (valeur || '')) op.selected = true; s.appendChild(op); }); return s; }
  function outils() { return (AMX.rh && AMX.rh.outils) || null; }
  /* Passages encore à compléter dans une lettre ; {{rh}} (la personne des RH) est rempli par la RH à l'envoi. */
  function resteDansLettre(html) {
    var o = outils(), t = String(html || '').replace(/\{\{\s*rh\s*\}\}/gi, '').replace(/<[^>]+>/g, ' ');
    return /\{\{[^{}]{1,40}\}\}/.test(t) || !!(o && o.passages && o.passages.test(t));
  }

  /* ------------------------------------------------------------------------------- page */
  function VueEmb(conteneur, ctx) {
    css();
    var self = this, p = (ctx && ctx.params) || {};
    this.conteneur = conteneur; this.detruit = false;
    this.compagnie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
    this.vue = p.voir || 'encours'; this.q = p.q || ''; this.ouvrirId = p.id || '';
    AMX.vider(conteneur);
    this.btnNouvelle = h('button.btn.primaire', { type: 'button', text: 'Nouvelle fiche', onclick: function () { self.formulaire(null); } });
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    conteneur.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Conditions d\'embauche'), h('p', { text: 'Le DG ou un directeur remplit les conditions et la lettre d\'offre ; le DG approuve celles d\'un directeur ; la RH les reçoit et envoie les documents à signer au candidat.' })]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnNouvelle], [this.btnNouvelle]))
    ]));
    this.elCies = h('div.barre-cies'); conteneur.appendChild(this.elCies);
    this.elVues = h('div.cex-vues'); conteneur.appendChild(this.elVues);
    this.inRecherche = h('input.saisie.recherche', { type: 'search', value: this.q, placeholder: 'Chercher : candidat, poste, CE-101, RH-104…', autocomplete: 'off', 'aria-label': 'Chercher une fiche' });
    conteneur.appendChild(h('div.cex-filtres', [this.inRecherche]));
    this.elPortee = h('div'); conteneur.appendChild(this.elPortee);
    this.elKpis = h('div.kpis'); conteneur.appendChild(this.elKpis);
    this.elCorps = h('div'); conteneur.appendChild(this.elCorps);
    var relancer = AMX.debounce(function () { self.q = self.inRecherche.value; self.rafraichir(); }, 160);
    this.inRecherche.addEventListener('input', relancer);
    this.surCie = function (e) { self.compagnie = (e.detail && e.detail.compagnie) || ''; self.rendre(); };
    this.surMaj = function () { if (!self.detruit) self.charger(true, true); };
    document.addEventListener('amx:compagnie', this.surCie);
    document.addEventListener('amx:embauches', this.surMaj);
    this.elCorps.appendChild(AMX.chargeur('Conditions d\'embauche'));
    this.charger(false);
  }
  VueEmb.prototype.demonter = function () { this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); document.removeEventListener('amx:embauches', this.surMaj); };
  VueEmb.prototype.naviguer = function (ctx) { var p = (ctx && ctx.params) || {}; if (p.id && this.rep) this.ouvrirFiche(p.id); };
  VueEmb.prototype.charger = function (force, silencieux) {
    var self = this;
    charger(force).then(function (d) {
      if (self.detruit) return;
      self.rep = d; self.rendre(); AMX.rafraichirSousBarre && AMX.rafraichirSousBarre();
      if (self.ouvrirId) { var id = self.ouvrirId; self.ouvrirId = ''; self.ouvrirFiche(id); }
      if (force && !silencieux) AMX.toast('Conditions d\'embauche à jour', 'ok');
    }, function (e) { if (self.detruit) return; AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.carte', [h('div.cex-vide', { text: AMX.erreurTexte(e) })])); });
  };
  VueEmb.prototype.filtrer = function (sauf) {
    var self = this;
    return (this.rep ? this.rep.embauches : []).filter(function (e) {
      if (self.compagnie && e.compagnie !== self.compagnie) return false;
      if (sauf !== 'vue' && !dansVue(e, self.vue)) return false;
      if (self.q && !AMX.correspond([e.id, e.nom, e.poste, e.compagnieNom, e.creeParNom, e.envoiId, e.modeleNom, STATUTS[e.statut]], self.q)) return false;
      return true;
    });
  };
  VueEmb.prototype.rendre = function () {
    if (!this.rep || this.detruit) return;
    var self = this, tous = this.rep.embauches;
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
  VueEmb.prototype.rafraichir = function () {
    if (!this.rep) return;
    var self = this, liste = this.filtrer();
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['fiche', 'fiches'], contexte: [this.compagnie ? nomCie(this.compagnie) : 'toutes les concessions', ({ encours: 'en cours', traitee: 'traitées', annulee: 'annulées', tous: 'toutes' })[this.vue]],
      filtres: this.q ? ['« ' + this.q + ' »'] : [], effacer: function () { self.q = ''; self.inRecherche.value = ''; self.rafraichir(); } });
    AMX.vider(this.elKpis);
    var tuile = function (v, lib, sous, cls) { var el = h('div.kpi', [h('div.valeur', { text: String(v) }), h('div.libelle', { text: lib }), sous ? h('div.sous', { text: sous }) : null]); if (cls) el.classList.add(cls); return el; };
    var br = liste.filter(function (e) { return e.statut === 'brouillon'; }).length, env = liste.filter(function (e) { return e.statut === 'envoyee'; }).length, app = liste.filter(function (e) { return e.statut === 'approbation'; }).length;
    var delais = liste.filter(function (e) { return e.traiteLe && e.envoyeLe; }).map(function (e) { return (Date.parse(e.traiteLe) - Date.parse(e.envoyeLe)) / 36e5; }).filter(function (x) { return x >= 0; }).sort(function (a, b) { return a - b; });
    var med = delais.length ? delais[Math.floor(delais.length / 2)] : null;
    this.elKpis.appendChild(tuile(liste.length, 'Fiches', 'dans cette liste', 'neutre'));
    this.elKpis.appendChild(tuile(br, 'Brouillons', 'pas encore envoyés', br ? 'attention' : 'neutre'));
    this.elKpis.appendChild(tuile(app, 'En attente du DG', 'remplies par un directeur', app ? 'attention' : 'neutre'));
    this.elKpis.appendChild(tuile(env, 'À traiter par la RH', 'envoyées, documents pas encore partis', env ? 'attention' : 'neutre'));
    this.elKpis.appendChild(tuile(med === null ? '—' : (med < 48 ? Math.round(med) + ' h' : Math.round(med / 24) + ' j'), 'Délai de la RH', med === null ? 'aucune fiche traitée' : 'médiane, de l\'envoi au traitement', 'neutre'));
    AMX.vider(this.elCorps);
    if (!liste.length) {
      this.elCorps.appendChild(h('div.carte', [h('div.cex-vide', [h('p', { text: this.rep.embauches.length ? 'Aucune fiche avec ces filtres.' : 'Aucune fiche encore. Une nouvelle embauche ? Remplissez les conditions : la RH les recevra.' }),
        h('button.btn.primaire', { type: 'button', text: 'Nouvelle fiche', onclick: function () { self.formulaire(null); } })])]));
      return;
    }
    var corps = h('tbody');
    liste.forEach(function (e) {
      corps.appendChild(h('tr', { onclick: function () { self.ouvrirFiche(e.id); } }, [
        h('td', [h('b', { text: e.nom }), h('span.s', { text: e.id })]),
        h('td', [h('span', { text: e.poste }), h('span.s', { text: e.modeleNom ? 'Lettre : ' + e.modeleNom : 'sans lettre' })]),
        h('td', { text: nomCie(e.compagnie) }),
        h('td', { text: e.debut ? dateCourte(e.debut) : '—' }),
        h('td', [h('span.cex-puce.' + e.statut, { text: STATUTS[e.statut] || e.statut }), h('span.s', { text: e.statut === 'traitee' ? 'le ' + dateCourte(e.traiteLe) + (e.envoiId ? ' · ' + e.envoiId : '') : e.statut === 'approbation' ? 'depuis le ' + dateCourte(e.demandeLe) : e.envoyeLe ? 'envoyée le ' + dateCourte(e.envoyeLe) : e.renvoiRaison ? 'renvoyée par le DG' : 'modifiée le ' + dateCourte(e.majLe || e.creeLe) })]),
        h('td', { text: e.creeParNom || e.creePar || '' })
      ]));
    });
    this.elCorps.appendChild(h('div.carte', [h('div.cex-cadre', [h('table.tableau.cex-table', [h('thead', [h('tr', [h('th', 'Candidat'), h('th', 'Poste'), h('th', 'Concession'), h('th', 'Entrée'), h('th', 'État'), h('th', 'Rempli par')])]), corps])])]));
  };

  /* ------------------------------------------------------------------------------- fiche */
  VueEmb.prototype.ouvrirFiche = function (id) {
    var self = this, corps = h('div', [AMX.chargeur('Fiche ' + id, { compact: true })]), m;
    m = AMX.modale({ titre: 'Conditions d\'embauche — ' + id, corps: corps, large: true, proteger: false, boutons: [{ texte: 'Fermer' }] });
    fiche(id).then(function (e) {
      AMX.vider(corps);
      if (e.statut === 'approbation') corps.appendChild(h('div.cex-avis', { text: 'Remplie par ' + (e.creeParNom || 'un directeur') + ', en attente de l\'approbation du DG depuis le ' + dateHeure(e.demandeLe) + '. ' + (peutApprouver() ? '« Approuver » l\'envoie à la RH ; « Renvoyer au directeur » la lui retourne.' : '') }));
      if (e.statut === 'brouillon' && e.renvoiRaison) corps.appendChild(h('div.cex-avis', { text: 'Renvoyée par le DG : ' + e.renvoiRaison }));
      if (e.approuveLe) corps.appendChild(h('div.cex-ok', { text: 'Approuvée par ' + (e.approuvePar || 'le DG') + ' le ' + dateHeure(e.approuveLe) + '.' }));
      if (e.statut === 'envoyee') corps.appendChild(h('div.cex-avis', { text: 'Envoyée à la RH le ' + dateHeure(e.envoyeLe) + '. ' + (estRh() ? '« Préparer l\'envoi » remplit les documents à signer du candidat.' : 'La RH prépare les documents à signer.') }));
      if (e.statut === 'traitee') corps.appendChild(h('div.cex-ok', { text: 'Traitée le ' + dateHeure(e.traiteLe) + (e.traitePar ? ' par ' + e.traitePar : '') + (e.envoiId ? ' — documents envoyés au candidat (' + e.envoiId + ').' : '.') }));
      if (e.statut === 'annulee') corps.appendChild(h('div.cex-avis', { text: 'Annulée.' }));
      var dl = function (paires) { var out = h('dl.cex-detail'); paires.forEach(function (p) { if (!p[1]) return; out.appendChild(h('dt', { text: p[0] })); out.appendChild(h('dd', { text: p[1] })); }); return out; };
      var c = e.champs || {}, type = (TYPES.filter(function (t) { return t[0] === e.typeEmploi; })[0] || [])[1];
      corps.appendChild(h('div.cex-h', { text: 'Candidat' }));
      corps.appendChild(dl([['Nom', e.nom], ['Courriel', e.courriel], ['Cellulaire', tel(e.telephone)], ['Langue', e.langue === 'en' ? 'Anglais' : 'Français']]));
      corps.appendChild(h('div.cex-h', { text: 'Conditions' }));
      corps.appendChild(dl([['Concession', nomCie(e.compagnie)], ['Poste', e.poste], ['Type d\'emploi', type && type !== '—' ? type : ''], ['Entrée en poste', e.debut ? dateCourte(e.debut) : ''], ['Période d\'essai', e.essai],
        ['Avantages', e.avantages], ['Notes à la RH', e.notes]]));
      /* 8 nov. : la fiche d'embauche, dans l'ordre de la fiche */
      var oo = outils(), lib = function (k) { return oo ? oo.libChamp(k) : k; };
      var ordre = ['tempstravail', 'superieur', 'horaire', 'heures', 'duree', 'fin', 'tauxhoraire', 'salairebase', 'salairehebdo', 'allocationauto', 'programmeboni', 'remuneration', 'remunerationtotale', 'bonismensuels', 'bonistrimestriels', 'avantages', 'reer', 'vacances', 'valeurtotale'];
      var cles = ordre.filter(function (k) { return c[k]; }).concat(Object.keys(c).filter(function (k) { return ordre.indexOf(k) < 0; }));
      if (cles.length) { corps.appendChild(h('div.cex-h', { text: 'Fiche d\'embauche' })); corps.appendChild(dl(cles.map(function (k) { return [lib(k), c[k]]; }))); }
      corps.appendChild(h('div.cex-h', { text: 'Lettre d\'offre' + (e.modeleNom ? ' — ' + e.modeleNom : '') }));
      if (e.texte) { var t = h('div.cex-texte'); var o = outils(); t.innerHTML = o ? o.surligner(e.texte) : e.texte; corps.appendChild(t); }
      else corps.appendChild(h('p.cex-prog', { text: e.modeleId ? 'Lettre choisie, pas encore remplie.' : 'Aucune lettre d\'offre choisie : la RH choisira les documents.' }));
      corps.appendChild(h('div.cex-h', { text: 'Journal' }));
      corps.appendChild(h('ul.cex-journal', (e.journal || []).slice(0, 15).map(function (j) { return h('li', { text: dateHeure(j.le) + ' — ' + (j.qui ? j.qui + ' : ' : '') + j.quoi }); })));
      var boutons = [{ texte: 'Fermer' }];
      var modifiable = e.statut === 'brouillon' || e.statut === 'approbation' || (e.statut === 'envoyee' && !estDirecteur());
      if (modifiable) {
        boutons.push({ texte: 'Annuler la fiche', classe: 'danger', action: function () { return AMX.confirmer('Annuler la fiche ' + e.id + ' ?', 'La fiche reste dans « Annulées ».', { ok: 'Annuler la fiche', danger: true }).then(function (oui) { if (!oui) return false; return ecrire({ action: 'rhEmbaucheAction', id: e.id, op: 'annuler' }).then(function (r) { poser(r.embauche); AMX.toast('Fiche annulée', 'ok'); }); }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); return false; }); } });
        boutons.push({ texte: 'Modifier', action: function (f) { f(); self.formulaire(e); return false; } });
      }
      if (peutApprouver() && e.statut === 'approbation') {
        boutons.push({ texte: 'Renvoyer au directeur…', action: function (f) { f(); self.renvoyer(e); return false; } });
        boutons.push({ texte: 'Approuver et envoyer à la RH', classe: 'primaire', action: function () { return ecrire({ action: 'rhEmbaucheAction', id: e.id, op: 'approuver' }).then(function (r) { poser(r.embauche); AMX.toast('Approuvée et envoyée à la RH', r.avertissement ? 'attention' : 'ok'); if (r.avertissement) AMX.toast(r.avertissement, 'attention', 9000); }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur', 8000); return false; }); } });
      }
      if (estRh() && e.statut === 'envoyee') {
        boutons.push({ texte: 'Marquer traitée', action: function () { return ecrire({ action: 'rhEmbaucheAction', id: e.id, op: 'traitee' }).then(function (r) { poser(r.embauche); AMX.toast('Fiche marquée traitée', 'ok'); }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); return false; }); } });
        if (AMX.rh && AMX.rh.preparerEnvoi) boutons.push({ texte: 'Préparer l\'envoi', classe: 'primaire', action: function (f) { f(); AMX.rh.preparerEnvoi(e); return false; } });
      }
      if (estRh() && (e.statut === 'traitee' || e.statut === 'annulee')) boutons.push({ texte: 'Rouvrir', action: function () { return ecrire({ action: 'rhEmbaucheAction', id: e.id, op: 'rouvrir' }).then(function (r) { poser(r.embauche); AMX.toast('Fiche rouverte', 'ok'); }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); return false; }); } });
      m.boutons(boutons);
    }, function (er) { AMX.vider(corps); corps.appendChild(h('div.cex-avis', { text: AMX.erreurTexte(er) })); });
  };

  VueEmb.prototype.renvoyer = function (e) {
    var inRaison = zone('', 3, 'Ex. le salaire dépasse la grille ; préciser l\'horaire.');
    AMX.modale({ titre: 'Renvoyer au directeur — ' + e.nom, corps: h('div.cex-form', [h('p', { text: 'La fiche revient à ' + (e.creeParNom || 'son auteur') + ' en brouillon, avec votre raison (courriel). Il la corrige et vous la renvoie.' }), champ('Ce qu\'il faut changer', inRaison)]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Renvoyer', classe: 'primaire', action: function () {
        if (inRaison.value.trim().length < 3) { AMX.toast('Dites ce qu\'il faut changer.', 'attention'); return false; }
        return ecrire({ action: 'rhEmbaucheAction', id: e.id, op: 'renvoyer', raison: inRaison.value }).then(function (r) { poser(r.embauche); AMX.toast('Renvoyée au directeur', 'ok'); }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur', 8000); return false; });
      } }] });
  };

  /* ------------------------------------------------------------------------------- formulaire */
  VueEmb.prototype.formulaire = function (e) {
    var self = this, rep = this.rep || {}, nouveau = !e;
    e = e || { compagnie: this.compagnie, langue: 'fr', champs: {} };
    var c0 = e.champs || {};
    var codes = AMX.codesPour ? AMX.codesPour('inventaire') : '*';
    codes = codes === '*' || !Array.isArray(codes) ? Object.keys(AMX.COMPAGNIES_TOUTES || {}) : codes;
    var selCie = choix(e.compagnie || (codes.length === 1 ? codes[0] : ''), [['', '— choisir —']].concat(codes.map(function (c) { return [c, nomCie(c)]; })));
    var inNom = saisie(e.nom, { placeholder: 'Prénom Nom' }), inCourriel = saisie(e.courriel, { type: 'email', placeholder: 'nom@exemple.com' }), inTel = saisie(tel(e.telephone), { inputmode: 'tel', placeholder: '514 555-0101' });
    var selLangue = choix(e.langue || 'fr', [['fr', 'Français'], ['en', 'Anglais']]);
    var inPoste = outils().choixOuAutre(outils().POSTES, e.poste || '', { ph: 'Le titre du poste' }), selType = choix(e.typeEmploi || '', TYPES), inDebut = saisie(e.debut, { type: 'date' }), inEssai = choix(e.essai || '', [['', '— choisir —'], ['aucune', 'Aucune'], ['1 mois', '1 mois'], ['2 mois', '2 mois'], ['3 mois', '3 mois'], ['6 mois', '6 mois']].concat(e.essai && ['', 'aucune', '1 mois', '2 mois', '3 mois', '6 mois'].indexOf(e.essai) < 0 ? [[e.essai, e.essai]] : []));
    /* 8 nov. (Maxime : « faire remplir une fiche qui va envoyer les données dans les politiques et les fichiers d'embauche, et
       non l'inverse ») : la fiche d'embauche de rh.js — la lettre d'offre et les documents de la RH s'y remplissent. */
    var fe = outils().ficheEmbauche(c0, { compagnie: function () { return selCie.value; } });
    var inAvantages = zone(e.avantages, 2, 'Assurance collective après 3 mois, véhicule de démonstration…'), inNotes = zone(e.notes, 2, 'Ce que la RH doit savoir.');
    var texte = e.texte || '';
    var selModele = h('select.saisie'), etat = h('span.cex-etat'), btnRemplir = h('button.btn.petit', { type: 'button', text: 'Remplir la lettre' });
    var modelesPour = function () { var c = selCie.value; return (rep.modeles || []).filter(function (m) { return !m.compagnie || !c || m.compagnie === c; }); };
    var dessinerModeles = function () {
      var garde = selModele.value || e.modeleId || '';
      AMX.vider(selModele);
      var l = modelesPour();
      selModele.appendChild(h('option', { value: '', text: l.length ? 'Aucune lettre (la RH choisira)' : 'Aucune lettre d\'offre dans la bibliothèque de la RH' }));
      l.forEach(function (m) { selModele.appendChild(h('option', { value: m.id, text: m.nom + (m.compagnie ? '' : ' (tout le groupe)'), selected: m.id === garde })); });
      majEtat();
    };
    var majEtat = function () {
      btnRemplir.hidden = !selModele.value;
      if (!selModele.value) { etat.textContent = ''; etat.className = 'cex-etat'; return; }
      var ok = texte && !resteDansLettre(texte);
      etat.textContent = !texte ? 'Pas encore remplie' : ok ? 'Lettre remplie ✓' : 'Des passages restent à compléter';
      etat.className = 'cex-etat ' + (ok ? 'ok' : 'non');
    };
    var valeurs = function () {
      var o = outils(), en = selLangue.value === 'en', nom = inNom.value.trim();
      var v = { nom: nom, prenom: nom.split(/\s+/)[0] || '', poste: inPoste.value.trim(), debut: o ? o.dateLongue(inDebut.value, en) : inDebut.value, concession: selCie.value ? nomCie(selCie.value) : '',
        date: o ? o.dateLongue(new Date().toISOString().slice(0, 10), en) : '' };
      var f = fe.valeurs(); Object.keys(f).forEach(function (k) { v[k] = f[k]; });
      return v;
    };
    var remplir = function () {
      var o = outils(); if (!o) { AMX.toast('L\'éditeur de lettre n\'est pas chargé : rechargez la page.', 'erreur'); return; }
      modele(selModele.value).then(function (html) {
        fe.besoin(o.champsDe(html));
        var vv = valeurs(), base = texte || o.surligner(o.remplirTexte(o.sansAucun ? o.sansAucun(html, vv) : html, vv));   /* « aucun » retire sa phrase */
        var ed = o.editeurTexte(base, { contexte: function () { return { nom: selModele.selectedOptions && selModele.selectedOptions[0] ? selModele.selectedOptions[0].textContent : 'Lettre d\'offre', categorie: 'lettre' }; } });   /* 8 nov. : Einstein AI dans l'éditeur */
        AMX.modale({ titre: 'Remplir la lettre', large: true, corps: h('div.cex-form', [
          h('p.cex-prog', { text: 'La lettre est remplie avec la fiche. Ce qui est surligné manque dans la fiche (ou reste à compléter) ; la signature de la RH ({{rh}}) se remplit à l\'envoi.' }),
          ed.el
        ]), boutons: [
          texte ? { texte: 'Repartir du modèle', action: function () { texte = ''; majEtat(); } } : null,
          { texte: 'Annuler' },
          { texte: 'Garder ce texte', classe: 'primaire', action: function () { texte = o.remplirTexte(ed.valeur(), valeurs()); majEtat(); } }
        ].filter(Boolean) });
      }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); });
    };
    btnRemplir.addEventListener('click', remplir);
    /* La lettre choisie dit ce qu'elle attend de la fiche (encadré en rouge tant que c'est vide). */
    var besoinsLettre = function () { var o = outils(); if (!selModele.value || !o) { fe.besoin([]); return; } modele(selModele.value).then(function (html) { fe.besoin(o.champsDe(html)); }, function () {}); };
    selModele.addEventListener('change', function () { texte = ''; majEtat(); besoinsLettre(); });
    selCie.addEventListener('change', function () { dessinerModeles(); fe.majConcession(); });
    dessinerModeles(); besoinsLettre();
    var corps = h('div.cex-form', [
      h('div.cex-prive', { text: 'La rémunération et les coordonnées du candidat restent dans un fichier privé : seuls la RH, les propriétaires et le DG de la concession les voient.' }),
      h('div.cex-h', { text: 'Candidat' }),
      h('div.grille', [champ('Nom complet', inNom), champ('Courriel', inCourriel, 'La RH lui enverra ses documents à signer.'), champ('Cellulaire (facultatif)', inTel), champ('Langue', selLangue)]),
      h('div.cex-h', { text: 'Conditions' }),
      h('div.grille', [champ('Concession', selCie), champ('Poste', inPoste.el), champ('Type d\'emploi', selType), champ('Entrée en poste', inDebut), champ('Période d\'essai', inEssai)]),
      champ('Avantages (facultatif)', inAvantages),
      h('div.cex-h', { text: 'Lettre d\'offre (modèles de la RH)' }),
      h('div.cex-lettre', [selModele, btnRemplir, etat]),
      h('div.cex-h', { text: 'Fiche d\'embauche' }),
      h('p.cex-prog', { text: 'Ces renseignements se placent tout seuls dans la lettre d\'offre et les documents que la RH enverra. Laissez vide ce qui ne s\'applique pas.' }),
      fe.el,
      h('div.cex-h', { text: 'Notes à la RH (facultatif)' }), inNotes
    ]);
    var lire = function () {
      var champs = fe.valeurs();
      return { id: e.id || '', compagnie: selCie.value, nom: inNom.value, courriel: inCourriel.value, telephone: inTel.value, langue: selLangue.value, poste: inPoste.value, typeEmploi: selType.value,
        debut: inDebut.value, essai: inEssai.value, modeleId: selModele.value, champs: champs, texte: selModele.value ? texte : '', avantages: inAvantages.value, notes: inNotes.value, trousse: e.trousse || '' };
    };
    var envoyer = function (versRh) {
      var x = lire();
      if (versRh && !x.champs.remuneration) { AMX.toast('Inscrivez le taux horaire, le salaire ou la rémunération dans la fiche d\'embauche.', 'attention', 7000); return Promise.reject(new Error('lettre')); }
      if (versRh && x.modeleId && (!texte || resteDansLettre(texte))) { AMX.toast(!texte ? 'Remplissez la lettre d\'offre (ou choisissez « Aucune lettre »).' : 'Des passages de la lettre restent à compléter (surlignés).', 'attention', 7000); return Promise.reject(new Error('lettre')); }
      return ecrire({ action: 'rhEmbaucheEnregistrer', embauche: x, envoyer: !!versRh }).then(function (r) {
        poser(r.embauche);
        var ou = r.embauche && r.embauche.statut === 'approbation' ? 'Envoyée au DG pour approbation' : 'Envoyée à la RH';
        AMX.toast(versRh ? ou + (r.avises ? ' (' + r.avises + ' personne' + (r.avises > 1 ? 's' : '') + ' prévenue' + (r.avises > 1 ? 's' : '') + ')' : '') : 'Brouillon enregistré', r.avertissement ? 'attention' : 'ok');
        if (r.avertissement) AMX.toast(r.avertissement, 'attention', 9000);
      }).catch(function (er) { if (er && er.message === 'lettre') throw er; AMX.toast(AMX.erreurTexte(er), 'erreur', 8000); throw er; });
    };
    /* Un directeur envoie au DG ; le DG (ou la RH) envoie à la RH, et approuve du même geste une fiche de directeur. */
    var libelleEnvoyer = estDirecteur() ? (e.statut === 'approbation' ? 'Enregistrer (reste au DG)' : 'Envoyer au DG pour approbation')
      : e.statut === 'envoyee' ? 'Enregistrer les changements' : e.statut === 'approbation' ? 'Approuver et envoyer à la RH' : 'Envoyer à la RH';
    AMX.modale({ titre: nouveau ? 'Nouvelles conditions d\'embauche' : 'Modifier — ' + e.id, corps: corps, large: true, boutons: [
      { texte: 'Annuler' },
      { texte: 'Enregistrer le brouillon', action: function () { return envoyer(false); } },
      { texte: libelleEnvoyer, classe: 'primaire', action: function () { return envoyer(true); } }
    ] });
  };
})();
