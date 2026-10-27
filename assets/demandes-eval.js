/* =========================================================================
   Inventaire › Évaluations › Demandes — le représentant demande, l'évaluateur évalue (27 octobre 2026)

   Maxime : « l'envoi des évaluations à des évaluateurs par des représentants doit être simple et chacun doit avoir son
   propre board d'évaluation pour ne pas se perdre dans toutes les évaluations ; une évaluation non faite pourrait être
   rouge pâle et quand c'est fait, vert ». Choix du 27 oct. : le représentant choisit l'évaluateur (ou « Premier
   disponible ») ; courriel et texto à l'évaluateur à l'envoi ; courriel au représentant quand la valeur est donnée ;
   photos facultatives (elles vont au NIV, comme celles de l'évaluation).

   Serveur : DemandesEval.gs — GET ?evalDemandes=1, POST evalDemander / evalDemandeAction. L'état se lit dans les
   évaluations : faite = évaluation ENREGISTRÉE après l'envoi (vert) ; en cours = prise ou analysée (ambre pâle) ;
   à faire = rien encore (rouge pâle) ; en retard au-delà du délai visé (15 min).

   AMX.evalDemandes : charger, enCache, demander(prefill) — la fenêtre « Demander une évaluation » (Accueil, Livre des
   ventes, palette, page) —, aFairePourMoi(cie), pretesPourMoi(cie), prendre(id), faite(id). La page d'évaluation lit
   ?demande= (evaluation.js) : bandeau, km et client préremplis, « prise » à l'ouverture, « faite » après l'enregistrement.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var ETATS = { afaire: 'À faire', encours: 'En cours', faite: 'Faite', annulee: 'Annulée' };
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez une nouvelle version (DemandesEval.gs).';

  /* ------------------------------ Données ------------------------------ */
  var cache = { rep: null, quand: 0, promesse: null };
  function charger(force) {
    if (!force && cache.rep && Date.now() - cache.quand < 30000) return Promise.resolve(cache.rep);
    if (cache.promesse) return cache.promesse;
    cache.promesse = AMX.get({ evalDemandes: 1 }, { secours: false }).then(function (d) {
      cache.promesse = null;
      if (!d || !Array.isArray(d.demandes)) throw new Error((d && d.erreur) || SCRIPT_PAS_A_JOUR);
      cache.rep = d; cache.quand = Date.now();
      try { document.dispatchEvent(new CustomEvent('amx:evalDemandes')); } catch (e) {}
      if (AMX.rafraichirSousBarre) AMX.rafraichirSousBarre();
      return d;
    }, function (e) { cache.promesse = null; throw e; });
    return cache.promesse;
  }
  function poser(demande) {
    if (!cache.rep || !demande) return;
    var i = cache.rep.demandes.map(function (x) { return x.id; }).indexOf(demande.id);
    if (i >= 0) cache.rep.demandes[i] = demande; else cache.rep.demandes.unshift(demande);
    try { document.dispatchEvent(new CustomEvent('amx:evalDemandes')); } catch (e) {}
  }
  function action(id, op, extra) {
    return AMX.post(Object.assign({ action: 'evalDemandeAction', id: id, op: op }, extra || {}), { secours: false }).then(function (x) {
      if (!x || x.refuse || x.ok === false) throw new Error((x && x.erreur) || 'Refusé');
      if (!x.demande) throw new Error(SCRIPT_PAS_A_JOUR);
      poser(x.demande); return x;
    });
  }
  function ouvertes(liste) { return liste.filter(function (d) { return d.etat === 'afaire' || d.etat === 'encours'; }); }
  function aFairePourMoi(cie) { var d = cache.rep; if (!d) return null; return ouvertes(d.demandes).filter(function (x) { return x.pourMoi && (!cie || x.compagnie === cie); }); }
  function pretesPourMoi(cie) {
    var d = cache.rep; if (!d) return null;
    var depuis = Date.now() - 2 * 86400000;
    return d.demandes.filter(function (x) { return x.deMoi && x.etat === 'faite' && (!cie || x.compagnie === cie) && new Date(x.faiteLe || x.creeLe).getTime() > depuis; });
  }
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c; }
  function duree(min) { if (min === null || min === undefined) return ''; if (min < 60) return min + ' min'; var hres = Math.floor(min / 60); if (hres < 48) return hres + ' h' + (min % 60 ? ' ' + (min % 60) : ''); return Math.round(hres / 24) + ' j'; }
  function argent(x) { return x === '' || x === null || x === undefined ? '' : AMX.fmtArgent(x); }
  function vinValide(v) { return /^[A-HJ-NPR-Z0-9]{17}$/.test(String(v || '').toUpperCase()); }
  function reduirePhoto(fichier) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(fichier), img = new Image();
      img.onload = function () {
        try {
          var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
          c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          res(c.toDataURL('image/jpeg', 0.82).replace(/^data:image\/jpeg;base64,/, ''));
        } catch (e) { rej(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Image illisible')); };
      img.src = url;
    });
  }

  /* ------------------------------ Fenêtre « Demander une évaluation » ------------------------------ */
  function demander(prefill) {
    prefill = prefill || {};
    injecterCss();
    var corps = h('div.de-demande', [h('p.doux', 'Lecture des évaluateurs…')]);
    var m = AMX.modale({ titre: 'Demander une évaluation', corps: corps, boutons: [{ texte: 'Annuler', action: function (f) { f(); } }] });
    charger(false).then(function (d) { construireFormulaire(d, prefill, corps, m); }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('p', { style: { color: 'var(--rouge)' }, text: AMX.erreurTexte(e) })); });
    return m;
  }
  function construireFormulaire(d, prefill, corps, m) {
    AMX.vider(corps);
    var codes = Object.keys(d.evaluateurs || {});
    var cie = prefill.compagnie && codes.indexOf(prefill.compagnie) >= 0 ? prefill.compagnie : (AMX.compagnieChoisie('evaluations') || (AMX.maConcession && AMX.maConcession()) || '');
    if (codes.indexOf(cie) < 0) cie = codes.length === 1 ? codes[0] : '';
    var choix = AMX.memo.lire('evalDemande_evaluateur', 'disponible');
    var selCie = h('select.saisie', [h('option', { value: '', text: 'Choisir la concession' })].concat(codes.map(function (c) { return h('option', { value: c, text: nomCie(c), selected: c === cie }); })));
    var inVin = h('input.saisie.mono', { type: 'text', maxlength: '17', autocomplete: 'off', spellcheck: 'false', placeholder: 'NIV (17 caractères)', value: prefill.vin || '', style: { textTransform: 'uppercase' } });
    var elVeh = h('div.mini.de-veh', { text: prefill.vehicule || '' });
    var inKm = h('input.saisie', { type: 'text', inputmode: 'numeric', placeholder: 'Kilométrage', value: prefill.km || '' });
    var inClient = h('input.saisie', { type: 'text', placeholder: 'Nom du client', value: prefill.client || '' });
    var inTel = h('input.saisie', { type: 'tel', placeholder: 'Téléphone (facultatif)', value: prefill.telephone || '' });
    var inNote = h('textarea.saisie', { rows: '2', placeholder: 'Note pour l\'évaluateur (facultatif) : options, dommages, ce que le client espère…' });
    inNote.value = prefill.note || '';
    var inPhotos = h('input', { type: 'file', accept: 'image/*', multiple: true, capture: 'environment', style: { display: 'none' } });
    var elPhotos = h('span.mini', { text: 'aucune photo' });
    var btnPhotos = h('button.btn.petit', { type: 'button', html: I.photo + '<span>Photos (facultatif)</span>', onclick: function () { inPhotos.click(); } });
    inPhotos.onchange = function () { var n = inPhotos.files.length; elPhotos.textContent = n ? n + ' photo' + (n > 1 ? 's' : '') + ' prête' + (n > 1 ? 's' : '') : 'aucune photo'; };
    var elEval = h('div.de-evaluateurs');
    var dessinerEvaluateurs = function () {
      AMX.vider(elEval);
      var liste = (d.evaluateurs[selCie.value] || []);
      if (!selCie.value) { elEval.appendChild(h('span.mini', 'Choisissez d\'abord la concession.')); return; }
      if (!liste.length) { elEval.appendChild(h('span.mini', { style: { color: 'var(--rouge)' }, text: 'Aucun évaluateur pour cette concession (directeur des ventes, gestionnaire ou administrateur).' })); return; }
      if (choix !== 'disponible' && !liste.some(function (x) { return x.courriel === choix; })) choix = 'disponible';
      var bouton = function (val, titre, sous) {
        return h('button.de-eval' + (choix === val ? '.choisi' : ''), { type: 'button', 'aria-pressed': String(choix === val), onclick: function () { choix = val; dessinerEvaluateurs(); } }, [h('b', { text: titre }), h('span', { text: sous })]);
      };
      elEval.appendChild(bouton('disponible', 'Premier disponible', 'le moins de demandes en cours'));
      liste.forEach(function (x) { elEval.appendChild(bouton(x.courriel, x.nom, x.ouvertes ? x.ouvertes + ' en cours' : 'libre')); });
    };
    selCie.onchange = dessinerEvaluateurs;
    var decoder = function () {
      var v = inVin.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); inVin.value = v;
      if (!vinValide(v)) { elVeh.textContent = v.length ? v.length + ' / 17 caractères' : ''; return; }
      elVeh.textContent = 'Décodage…';
      AMX.get({ decoder: v }, { essais: 1 }).then(function (x) { if (inVin.value !== v) return; elVeh.textContent = x && x.ok && x.marque ? [x.annee, x.marque, x.modele, x.version].filter(Boolean).join(' ') : 'NIV valide'; elVeh.dataset.annee = (x && x.annee) || ''; elVeh.dataset.marque = (x && x.marque) || ''; elVeh.dataset.modele = (x && x.modele) || ''; }).catch(function () { elVeh.textContent = 'NIV valide'; });
    };
    inVin.addEventListener('input', function () { if (inVin.value.replace(/[^A-Za-z0-9]/g, '').length === 17) decoder(); else elVeh.textContent = ''; });
    if (prefill.vin) decoder();
    corps.appendChild(h('div.de-grille', [
      codes.length > 1 ? h('label.champ', [h('span', 'Concession'), selCie]) : null,
      h('label.champ', [h('span', 'NIV'), inVin, elVeh]),
      h('label.champ', [h('span', 'Kilométrage'), inKm]),
      h('label.champ', [h('span', 'Client'), inClient]),
      h('label.champ', [h('span', 'Téléphone du client'), inTel]),
      h('label.champ.large', [h('span', 'Note'), inNote]),
      h('div.champ.large', [h('span', 'Photos'), h('div.actions-ligne', { style: { alignItems: 'center', gap: '10px' } }, [btnPhotos, elPhotos, inPhotos])]),
      h('div.champ.large', [h('span', 'Évaluateur'), elEval])
    ]));
    dessinerEvaluateurs();
    var btnEnvoyer = h('button.btn.primaire', { type: 'button', html: I.courriel + '<span>Envoyer la demande</span>' });
    corps.appendChild(h('div.actions-ligne', { style: { justifyContent: 'flex-end', marginTop: '12px' } }, [btnEnvoyer]));
    btnEnvoyer.onclick = function () {
      var vin = inVin.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (!selCie.value) { AMX.toast('Choisissez la concession.', 'attention'); return; }
      if (!vinValide(vin)) { AMX.toast('NIV invalide : 17 caractères (sans I, O ni Q).', 'attention'); inVin.focus(); return; }
      if (!(d.evaluateurs[selCie.value] || []).length) { AMX.toast('Aucun évaluateur pour cette concession.', 'erreur'); return; }
      var fichiers = [].slice.call(inPhotos.files || []);
      btnEnvoyer.classList.add('occupe');
      AMX.memo.ecrire('evalDemande_evaluateur', choix);
      AMX.post({ action: 'evalDemander', compagnie: selCie.value, vin: vin, km: inKm.value, client: inClient.value, telephone: inTel.value, note: inNote.value, photos: fichiers.length,
        annee: elVeh.dataset.annee || '', marque: elVeh.dataset.marque || '', modele: elVeh.dataset.modele || '', evaluateur: choix }, { secours: false, delai: 60000 }).then(function (x) {
        if (!x || x.refuse || x.ok === false) throw new Error((x && x.erreur) || 'Refusé');
        if (!x.demande) throw new Error(SCRIPT_PAS_A_JOUR);
        poser(x.demande);
        AMX.toast(x.message || 'Demande envoyée', x.deja ? 'attention' : 'ok', 6000);
        m.fermer();
        if (fichiers.length && !x.deja) envoyerPhotos(vin, fichiers);
        if (prefill.apres) prefill.apres(x.demande);
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 8000); }).then(function () { btnEnvoyer.classList.remove('occupe'); });
    };
    setTimeout(function () { (prefill.vin ? inKm : inVin).focus(); }, 50);
  }
  function envoyerPhotos(vin, fichiers) {
    var n = 0, suite = Promise.resolve();
    fichiers.forEach(function (f, i) {
      suite = suite.then(function () {
        AMX.toast('Envoi de la photo ' + (i + 1) + ' / ' + fichiers.length + '…', 'info', 1500);
        return reduirePhoto(f).then(function (b64) { return AMX.post({ action: 'uploadPhoto', vin: vin, angle: '', description: 'Évaluation', montant: '', imageBase64: b64, mimeType: 'image/jpeg' }, { delai: 120000 }); })
          .then(function (r) { if (!r || r.ok === false || r.refuse) throw new Error((r && (r.erreur || r.message)) || 'refusée'); n++; });
      });
    });
    suite.catch(function (e) { AMX.toast('Photo non envoyée — ' + AMX.erreurTexte(e), 'erreur'); }).then(function () { if (n) AMX.toast(n + ' photo' + (n > 1 ? 's' : '') + ' jointe' + (n > 1 ? 's' : '') + ' au NIV', 'ok'); if (AMX.photosOublier) AMX.photosOublier(vin); });
  }

  /* ------------------------------ Page ------------------------------ */
  AMX.section('demandesEval', {
    titre: 'Demandes d\'évaluation', icone: 'outils', ordre: 23,
    visible: function () { return AMX.perm('consulter') || AMX.estAdmin(); },
    onglets: [{ id: '', titre: 'Demandes', compteur: function () { var l = aFairePourMoi(AMX.compagnieChoisie('evaluations')); return l && l.length ? String(l.length) : ''; } }],
    monter: function (conteneur, ctx) { return new Vue(conteneur, ctx); }
  });

  function Vue(conteneur, ctx) {
    injecterCss();
    var self = this;
    this.el = conteneur; this.detruit = false;
    this.portee = AMX.memo.lire('evalDemandes_portee', '');
    this.etat = 'ouvertes'; this.etatChoisi = false;   /* sans choix : « À faire et en cours » pour l'évaluateur, « Toutes » pour ses propres demandes (les vertes se voient) */
    this.construire();
    this.charger(false);
    this.surMaj = function () { if (!self.detruit) self.rendre(); };
    this.surCie = function () { if (!self.detruit) self.rendre(); };
    document.addEventListener('amx:evalDemandes', this.surMaj);
    document.addEventListener('amx:compagnie', this.surCie);
    this.minuterie = setInterval(function () { if (!self.detruit && !document.hidden) self.charger(true, true); }, 60000);
    if (ctx && ctx.params && ctx.params.nouvelle) setTimeout(function () { demander({ vin: ctx.params.vin || '' }); }, 100);
  }
  Vue.prototype.demonter = function () { this.detruit = true; clearInterval(this.minuterie); document.removeEventListener('amx:evalDemandes', this.surMaj); document.removeEventListener('amx:compagnie', this.surCie); };
  Vue.prototype.naviguer = function (ctx) { if (ctx && ctx.params && ctx.params.nouvelle) demander({ vin: ctx.params.vin || '' }); };
  Vue.prototype.construire = function () {
    var self = this;
    this.btnDemander = h('button.btn.primaire', { type: 'button', html: I.plus + '<span>Demander une évaluation</span>', onclick: function () { demander({ compagnie: AMX.compagnieChoisie('evaluations') }); } });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.elSous = h('p.sous-titre');
    var actions = AMX.actionsEntete ? AMX.actionsEntete([this.btnRafraichir, this.btnDemander], [this.btnDemander]) : [this.btnRafraichir, this.btnDemander];
    this.elCies = h('div');
    this.segPortee = h('div.segment');
    this.inputQ = h('input.saisie', { type: 'search', placeholder: 'NIV, véhicule, client, représentant', oninput: function () { self.rendre(); } });
    this.elEtats = h('div.inv2-statuts.de-etats');
    this.elPortee = h('div');
    this.elTuiles = h('div.de-tuiles');
    this.elListe = h('div.de-liste');
    this.el.appendChild(h('div.de-page', [h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', 'Demandes d\'évaluation'), this.elSous]), h('div.actions', actions)]), this.elCies,
      h('div.de-filtres', [this.segPortee, h('div.recherche', [h('span', { html: I.recherche }), this.inputQ])]), this.elEtats, this.elPortee, this.elTuiles, this.elListe]));
  };
  Vue.prototype.charger = function (force, silencieux) {
    var self = this;
    if (!cache.rep) { AMX.vider(this.elListe); this.elListe.appendChild(AMX.chargeur ? AMX.chargeur('Demandes d\'évaluation') : h('p.doux', 'Lecture…')); }
    charger(force).then(function () { if (!self.detruit) self.rendre(); }).catch(function (e) {
      if (self.detruit) return;
      if (!cache.rep) { AMX.vider(self.elListe); self.elListe.appendChild(h('div.carte', [h('div.carte-corps', [h('p', { style: { color: 'var(--rouge)' }, text: AMX.erreurTexte(e) })])])); }
      if (!silencieux) AMX.toast(AMX.erreurTexte(e), 'erreur', 8000);
    });
  };
  Vue.prototype.rendre = function () {
    var self = this, d = cache.rep; if (!d) return;
    var cie = AMX.compagnieChoisie('evaluations');
    AMX.barreConcessions(this.elCies, { domaine: 'evaluations', valeur: cie, onchange: function (c) { AMX.choisirCompagnie(c); } });
    var base = d.demandes.filter(function (x) { return !cie || x.compagnie === cie; });
    var moi = d.moi || {};
    var portees = [['pourMoi', 'À évaluer (moi)', function (x) { return x.pourMoi; }], ['deMoi', 'Mes demandes', function (x) { return x.deMoi; }], ['toutes', 'Toutes', function () { return true; }]];
    if (!moi.evaluateur && !moi.direction) portees = portees.filter(function (p) { return p[0] !== 'pourMoi'; });
    if (!portees.some(function (p) { return p[0] === self.portee; })) this.portee = moi.evaluateur ? 'pourMoi' : (base.some(function (x) { return x.deMoi; }) || !moi.direction ? 'deMoi' : 'toutes');
    var etatDefaut = this.portee === 'deMoi' ? 'toutes' : 'ouvertes';
    if (!this.etatChoisi) this.etat = etatDefaut;
    AMX.vider(this.segPortee);
    portees.forEach(function (p) {
      var n = ouvertes(base.filter(p[2])).length;
      self.segPortee.appendChild(h('button', { type: 'button', 'aria-pressed': String(self.portee === p[0]), onclick: function () { self.portee = p[0]; self.etatChoisi = false; AMX.memo.ecrire('evalDemandes_portee', p[0]); self.rendre(); } }, [p[1], n ? h('span.compteur', { text: String(n) }) : null]));
    });
    var filtrePortee = portees.filter(function (p) { return p[0] === self.portee; })[0][2];
    var q = this.inputQ.value, mots = AMX.motsCherches(q);
    var parPortee = base.filter(filtrePortee).filter(function (x) { return !mots.length || AMX.correspond([x.vin, x.vehicule, x.client, x.demandeParNom, x.evaluateurNom, x.id], mots); });
    var etats = [['ouvertes', 'À faire et en cours', function (x) { return x.etat === 'afaire' || x.etat === 'encours'; }, 'rouge'], ['afaire', 'À faire', function (x) { return x.etat === 'afaire'; }, 'rouge'], ['encours', 'En cours', function (x) { return x.etat === 'encours'; }, 'ambre'], ['faite', 'Faites', function (x) { return x.etat === 'faite'; }, 'vert'], ['annulee', 'Annulées', function (x) { return x.etat === 'annulee'; }, 'gris'], ['toutes', 'Toutes', function () { return true; }, '']];
    AMX.vider(this.elEtats);
    etats.forEach(function (e) {
      var n = parPortee.filter(e[2]).length;
      self.elEtats.appendChild(h('button.inv2-pastille' + (self.etat === e[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': String(self.etat === e[0]), onclick: function () { self.etat = e[0]; self.etatChoisi = true; self.rendre(); } }, [e[3] ? h('i', { style: { background: 'var(--' + e[3] + ')' } }) : null, e[1], h('b', { text: String(n) })]));
    });
    var liste = parPortee.filter(etats.filter(function (e) { return e[0] === self.etat; })[0][2]);
    var RANG_ETAT = { afaire: 0, encours: 1, faite: 2, annulee: 3 };   /* ouvertes d'abord, puis les faites, chaque groupe du plus récent au plus ancien */
    liste = liste.slice().sort(function (a, b) { return ((RANG_ETAT[a.etat] || 0) - (RANG_ETAT[b.etat] || 0)) || String(b.creeLe || '').localeCompare(String(a.creeLe || '')); });
    var libPortee = portees.filter(function (p) { return p[0] === self.portee; })[0][1];
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['demande', 'demandes'], contexte: [cie ? nomCie(cie) : 'Toutes les concessions', libPortee], filtres: [self.etat !== etatDefaut ? etats.filter(function (e) { return e[0] === self.etat; })[0][1] : '', q ? '« ' + q + ' »' : ''], effacer: function () { self.etatChoisi = false; self.inputQ.value = ''; self.rendre(); } });
    /* Chiffres sur la liste de la portée (pas seulement l'état choisi) */
    var faites = parPortee.filter(function (x) { return x.etat === 'faite' && x.minutesReponse !== null && x.minutesReponse !== undefined; });
    var delais = faites.map(function (x) { return x.minutesReponse; }).sort(function (a, b) { return a - b; });
    var mediane = delais.length ? delais[Math.floor(delais.length / 2)] : null;
    var aujour = new Date().toISOString().slice(0, 10);
    AMX.vider(this.elTuiles);
    var tuile = function (t, v, bas, c) { return h('div.kpi' + (c ? '.' + c : ''), [h('div.titre', { text: t }), h('div.valeur', { text: v }), bas ? h('div.bas', { text: bas }) : null]); };
    var nAf = parPortee.filter(function (x) { return x.etat === 'afaire'; }).length, nEc = parPortee.filter(function (x) { return x.etat === 'encours'; }).length, nRet = parPortee.filter(function (x) { return x.enRetard; }).length;
    this.elTuiles.appendChild(tuile('À faire', String(nAf), nAf ? 'pas encore commencées' : 'rien en attente', nAf ? 'rouge' : 'vert'));
    this.elTuiles.appendChild(tuile('En cours', String(nEc), '', nEc ? 'ambre' : ''));
    this.elTuiles.appendChild(tuile('En retard', String(nRet), 'plus de ' + (d.delaiMin || 15) + ' minutes', nRet ? 'rouge' : ''));
    this.elTuiles.appendChild(tuile('Faites aujourd\'hui', String(parPortee.filter(function (x) { return x.etat === 'faite' && String(x.faiteLe || '').slice(0, 10) === aujour; }).length), '', 'vert'));
    this.elTuiles.appendChild(tuile('Délai de réponse', mediane === null ? '—' : duree(mediane), mediane === null ? 'aucune évaluation faite' : 'médiane, ' + delais.length + ' faite' + (delais.length > 1 ? 's' : '') + ' (30 jours)', mediane !== null && mediane <= (d.delaiMin || 15) ? 'vert' : ''));
    this.elSous.textContent = (moi.evaluateur ? 'Vous êtes évaluateur' : 'Vos demandes et leurs réponses') + ' · délai visé ' + (d.delaiMin || 15) + ' minutes · rouge pâle = à faire, vert = faite';
    AMX.vider(this.elListe);
    if (!liste.length) { this.elListe.appendChild(h('div.carte', [h('div.carte-corps', [h('p.doux', { text: self.portee === 'pourMoi' && self.etat === 'ouvertes' ? 'Rien à évaluer pour vous. 🎉' : 'Aucune demande ici.' }), h('button.btn.primaire', { type: 'button', html: I.plus + '<span>Demander une évaluation</span>', onclick: function () { demander({ compagnie: cie }); } })])])); return; }
    liste.forEach(function (x) { self.elListe.appendChild(carte(x, d, function () { self.rendre(); })); });
  };

  function carte(x, d, apres) {
    var moi = d.moi || {};
    var peutEvaluer = (x.pourMoi || moi.evaluateur || moi.direction) && (x.etat === 'afaire' || x.etat === 'encours');
    var boutons = [];
    var evaluer = function () {
      var aller = function () { AMX.aller('outils', 'evaluation', { vin: x.vin, demande: x.id }); };
      if (x.etat === 'afaire') action(x.id, 'prendre').then(aller).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); aller(); });
      else aller();
    };
    if (peutEvaluer) boutons.push(h('button.btn.primaire.petit', { type: 'button', html: I.ok + '<span>Évaluer</span>', onclick: evaluer }));
    if (peutEvaluer && !x.pourMoi && x.etat === 'afaire') boutons.push(h('button.btn.petit', { type: 'button', text: 'Je la prends', onclick: function () { action(x.id, 'prendre').then(function (r) { AMX.toast(r.message, 'ok'); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }); } }));
    if (x.etat === 'faite') boutons.push(h('button.btn.petit', { type: 'button', text: 'Voir l\'évaluation', onclick: function () { AMX.aller('outils', 'evaluation', { vin: x.vin }); } }));
    var actions = [];
    if ((x.deMoi || moi.direction) && (x.etat === 'afaire' || x.etat === 'encours')) {
      actions.push({ texte: 'Relancer l\'évaluateur', action: function () { action(x.id, 'relancer').then(function (r) { AMX.toast(r.message, 'ok'); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }); } });
      actions.push({ texte: 'Annuler la demande', action: function () { AMX.confirmer('Annuler la demande ?', (x.vehicule || 'Véhicule') + ' · ' + x.vin, { ok: 'Annuler la demande', danger: true }).then(function (ok) { if (ok) action(x.id, 'annuler', { raison: '' }).then(function (r) { AMX.toast(r.message, 'ok'); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }); }); } });
    }
    if ((x.deMoi || x.pourMoi || moi.direction) && (x.etat === 'afaire' || x.etat === 'encours')) actions.push({ texte: 'Réassigner…', action: function () { reassigner(x, d); } });
    if (actions.length && AMX.menuActions) boutons.push(AMX.menuActions(actions, { petit: true }));
    var minutes = x.etat === 'faite' ? (x.minutesReponse !== null && x.minutesReponse !== undefined ? 'en ' + duree(x.minutesReponse) : '') : 'il y a ' + duree(x.minutes);
    return h('div.de-carte.' + x.etat + (x.enRetard ? '.retard' : ''), [
      h('div.de-tete', [
        h('span.badge.sans-point.' + ({ afaire: 'rouge', encours: 'ambre', faite: 'vert', annulee: 'gris' }[x.etat]), { text: ETATS[x.etat] + (x.enRetard ? ' · en retard' : '') }),
        h('b.de-veh', { text: x.vehicule || 'Véhicule' }), h('span.mono.mini', { text: x.vin }), x.km ? h('span.mini', { text: AMX.fmtNombre(Number(x.km)) + ' km' }) : null,
        h('span.mini.de-quand', { text: minutes })
      ]),
      h('div.de-corps', [
        h('div', [x.client ? h('div', [h('span.mini', 'Client : '), h('b', { text: x.client }), x.telephone ? h('span.mini', { text: ' · ' + x.telephone }) : null]) : null,
          h('div.mini', { text: 'De ' + (x.demandeParNom || '—') + ' → ' + (x.evaluateurNom || '—') + (x.mode === 'disponible' ? ' (premier disponible)' : '') + ' · ' + nomCie(x.compagnie) + ' · ' + x.id + (x.photos ? ' · ' + x.photos + ' photo' + (x.photos > 1 ? 's' : '') : '') }),
          x.note ? h('div.de-note', { text: x.note }) : null,
          x.etat === 'annulee' && x.annuleRaison ? h('div.mini', { text: 'Annulée : ' + x.annuleRaison }) : null]),
        x.etat === 'faite' ? h('div.de-valeur', [h('span.mini', 'Valeur'), h('b', { text: x.valeur ? argent(x.valeur) : 'voir l\'évaluation' }), h('span.mini', { text: 'par ' + (x.faitePar || x.evaluateurNom || '—') })]) : null
      ]),
      boutons.length ? h('div.de-actions', boutons) : null
    ]);
  }
  function reassigner(x, d) {
    var liste = (d.evaluateurs[x.compagnie] || []).filter(function (e) { return e.courriel !== x.evaluateur; });
    if (!liste.length) { AMX.toast('Aucun autre évaluateur pour cette concession.', 'attention'); return; }
    var m = AMX.modale({ titre: 'Réassigner ' + x.id, corps: h('div.de-evaluateurs', [h('button.de-eval', { type: 'button', onclick: function () { go('disponible'); } }, [h('b', 'Premier disponible'), h('span', 'le moins de demandes en cours')])].concat(liste.map(function (e) { return h('button.de-eval', { type: 'button', onclick: function () { go(e.courriel); } }, [h('b', { text: e.nom }), h('span', { text: e.ouvertes ? e.ouvertes + ' en cours' : 'libre' })]); }))), boutons: [{ texte: 'Annuler', action: function (f) { f(); } }] });
    function go(c) { m.fermer(); action(x.id, 'reassigner', { evaluateur: c }).then(function (r) { AMX.toast(r.message, 'ok'); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }); }
  }

  AMX.evalDemandes = {
    charger: charger, enCache: function () { return cache.rep; }, demander: demander, poser: poser,
    aFairePourMoi: aFairePourMoi, pretesPourMoi: pretesPourMoi,
    une: function (id) { var d = cache.rep; return d ? d.demandes.filter(function (x) { return x.id === id; })[0] || null : null; },
    prendre: function (id) { return action(id, 'prendre'); },
    faite: function (id) { return action(id, 'faite'); },
    vider: function () { cache = { rep: null, quand: 0, promesse: null }; }
  };

  function injecterCss() {
    if (document.getElementById('css-demandes-eval')) return;
    var s = document.createElement('style'); s.id = 'css-demandes-eval';
    s.textContent = [
      '.de-page .mini, .de-demande .mini { font-size: 12px; color: var(--encre-3); }',
      '.de-filtres { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 0 0 8px; } .de-filtres .recherche { flex: 1 1 220px; max-width: 380px; }',
      '.de-filtres .segment .compteur { margin-left: 6px; background: var(--rouge); color: #fff; border-radius: 9px; padding: 0 6px; font-size: 12px; }',
      '.de-etats { margin: 0 0 8px; }',
      '.de-tuiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 0 0 14px; } .de-tuiles .kpi .bas { font-size: 12px; color: var(--encre-3); }',
      '.de-liste { display: grid; gap: 10px; }',
      '.de-carte { border-radius: 12px; padding: 12px 14px; border: 1px solid var(--trait, #E3E7EB); border-left-width: 5px; background: var(--fond-carte, #fff); }',
      '.de-carte.afaire { background: #FDECEC; border-left-color: #D64545; }',
      '.de-carte.encours { background: #FFF4DE; border-left-color: #C98A1A; }',
      '.de-carte.faite { background: #E8F6EC; border-left-color: #1E8E4A; }',
      '.de-carte.annulee { background: var(--fond-2, #F3F5F7); border-left-color: #9AA5AE; opacity: .8; }',
      '.de-carte.retard { box-shadow: 0 0 0 2px #D64545 inset; }',
      '.de-tete { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; } .de-tete .de-quand { margin-left: auto; }',
      '.de-corps { display: flex; gap: 14px; align-items: flex-start; justify-content: space-between; margin-top: 6px; flex-wrap: wrap; }',
      '.de-note { margin-top: 4px; padding: 6px 8px; background: rgba(255,255,255,.6); border-radius: 8px; font-size: 13px; }',
      '.de-valeur { display: grid; text-align: right; } .de-valeur b { font-size: 22px; color: #1E6B3A; }',
      '.de-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; align-items: center; }',
      '.de-grille { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; } .de-grille .champ { display: grid; gap: 4px; } .de-grille .champ > span { font-size: 12px; color: var(--encre-3); } .de-grille .large { grid-column: 1 / -1; }',
      '.de-veh { min-height: 16px; }',
      '.de-evaluateurs { display: flex; flex-wrap: wrap; gap: 8px; }',
      '.de-eval { display: grid; text-align: left; gap: 2px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--trait, #E3E7EB); background: var(--fond-carte, #fff); cursor: pointer; min-width: 150px; font: inherit; }',
      '.de-eval span { font-size: 12px; color: var(--encre-3); } .de-eval.choisi { border-color: var(--vert); box-shadow: 0 0 0 2px var(--vert) inset; background: var(--vert-clair, #E8F6EC); }',
      '.eval-demande { padding: 10px 14px; border-radius: 10px; margin: 0 0 12px; border-left: 5px solid #D64545; background: #FDECEC; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }',
      '.eval-demande.encours { border-left-color: #C98A1A; background: #FFF4DE; } .eval-demande.faite { border-left-color: #1E8E4A; background: #E8F6EC; }',
      '@media (max-width: 640px) { .de-grille { grid-template-columns: 1fr; } .de-corps { display: block; } .de-valeur { text-align: left; margin-top: 6px; } }'
    ].join('\n');
    document.head.appendChild(s);
  }
  injecterCss();
})();
