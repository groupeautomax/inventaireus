/* =========================================================================
   Inventaire › Évaluations › Demandes — le représentant demande, l'évaluateur évalue (27 octobre 2026)

   Maxime : « l'envoi des évaluations à des évaluateurs par des représentants doit être simple et chacun doit avoir son
   propre board d'évaluation pour ne pas se perdre dans toutes les évaluations ; une évaluation non faite pourrait être
   rouge pâle et quand c'est fait, vert ». Choix du 27 oct. : le représentant choisit l'évaluateur (ou « Premier
   disponible ») ; courriel et texto à l'évaluateur à l'envoi ; courriel au représentant quand la valeur est donnée ;
   photos facultatives (elles vont au NIV, comme celles de l'évaluation).

   Suivi refait le même jour (« va voir ce qui existe sur le web, c'est pas super ») — repris d'ACV Max, vAuto Appraisal
   Workflow, Lotlinx, TradePending, MAX Digital :
     - quatre vues : À évaluer (l'évaluateur), Mes demandes (le représentant), Tableau (colonnes À prendre → En
       évaluation → Valeur donnée → Conclues, plein écran pour un écran au bureau) et Statistiques (délais, % sous
       15 minutes, taux d'achat par évaluateur et par représentant, raisons de perte) ;
     - un chronomètre sur chaque demande ouverte : à prendre dans les 3 minutes, ambre à 10, rouge à 15 ;
     - la disponibilité des évaluateurs (disponible / occupé / absent) — « Premier disponible » saute les absents ;
     - la valeur vaut 7 jours (ensuite « échue », réévaluer) ;
     - le résultat : présentée, achetée, perdue (avec la raison) — pris d'office du suivi de l'évaluation ;
     - un fil de messages et « info demandée » (l'évaluateur pose une question) : dans ScanAutomax seulement, aucun
       courriel ni texto de plus ;
     - réévaluer = une nouvelle demande liée à l'ancienne.

   Serveur : DemandesEval.gs — GET ?evalDemandes=1, POST evalDemander / evalDemandeAction (op : prendre, reassigner,
   relancer, annuler, faite, issue, message, reevaluer, presence). L'état se lit dans les évaluations : faite =
   évaluation ENREGISTRÉE après l'envoi ; en cours = prise ou analysée ; à faire = rien encore.

   AMX.evalDemandes : charger, enCache, demander(prefill), aFairePourMoi(cie), pretesPourMoi(cie),
   questionsPourMoi(cie), prendre(id), faite(id), message(id, texte, info), ouvrirFil(id). La page d'évaluation lit
   ?demande= (evaluation.js) : bandeau, km et client préremplis, « prise » à l'ouverture, « faite » après l'enregistrement.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez une nouvelle version (DemandesEval.gs).';
  var PRESENCES = { disponible: 'Disponible', occupe: 'Occupé', absent: 'Absent' };
  var TON_PRESENCE = { disponible: 'vert', occupe: 'ambre', absent: 'gris' };
  var ISSUES = { presentee: 'Présentée au client', achetee: 'Achetée', perdue: 'Perdue' };
  var RAISONS_DEFAUT = ['Écart de prix avec le client', 'Le client garde son véhicule', 'Vendu ailleurs (privé ou autre concession)', 'Pas de vente chez nous', 'Véhicule en trop mauvais état', 'Autre'];

  /* ------------------------------ Données ------------------------------ */
  var cache = { rep: null, quand: 0, promesse: null };
  function annoncer() {
    try { document.dispatchEvent(new CustomEvent('amx:evalDemandes')); } catch (e) {}
    if (AMX.rafraichirSousBarre) AMX.rafraichirSousBarre();
  }
  function charger(force) {
    if (!force && cache.rep && Date.now() - cache.quand < 30000) return Promise.resolve(cache.rep);
    if (cache.promesse) return cache.promesse;
    cache.promesse = AMX.get({ evalDemandes: 1 }, { secours: false }).then(function (d) {
      cache.promesse = null;
      if (!d || !Array.isArray(d.demandes)) throw new Error((d && d.erreur) || SCRIPT_PAS_A_JOUR);
      cache.rep = d; cache.quand = Date.now();
      annoncer();
      return d;
    }, function (e) { cache.promesse = null; throw e; });
    return cache.promesse;
  }
  function poser(demande, silencieux) {
    if (!cache.rep || !demande) return;
    var i = cache.rep.demandes.map(function (x) { return x.id; }).indexOf(demande.id);
    if (i >= 0) cache.rep.demandes[i] = demande; else cache.rep.demandes.unshift(demande);
    if (!silencieux) annoncer();
  }
  function action(id, op, extra) {
    return AMX.post(Object.assign({ action: 'evalDemandeAction', id: id, op: op }, extra || {}), { secours: false }).then(function (x) {
      if (!x || x.refuse || x.ok === false) throw new Error((x && x.erreur) || 'Refusé');
      if (!x.demande) throw new Error(SCRIPT_PAS_A_JOUR);
      if (x.ancienne) poser(x.ancienne, true);
      poser(x.demande); return x;
    });
  }
  function reglages(d) {
    d = d || cache.rep || {};
    return { delai: d.delaiMin || 15, prise: d.priseMin || 3, alerte: d.alerteMin || 10, validite: d.validiteJ || 7, maxOuvertes: d.maxOuvertes || 3,
      raisons: (d.raisonsPerte && d.raisonsPerte.length) ? d.raisonsPerte : RAISONS_DEFAUT };
  }
  function estOuverte(x) { return x.etat === 'afaire' || x.etat === 'encours'; }
  function ouvertes(liste) { return liste.filter(estOuverte); }
  function aFairePourMoi(cie) { var d = cache.rep; if (!d) return null; return ouvertes(d.demandes).filter(function (x) { return x.pourMoi && (!cie || x.compagnie === cie); }); }
  function pretesPourMoi(cie) {
    var d = cache.rep; if (!d) return null;
    var depuis = Date.now() - 2 * 86400000;
    return d.demandes.filter(function (x) { return x.deMoi && x.etat === 'faite' && !x.issue && (!cie || x.compagnie === cie) && new Date(x.faiteLe || x.creeLe).getTime() > depuis; });
  }
  function questionsPourMoi(cie) { var d = cache.rep; if (!d) return null; return d.demandes.filter(function (x) { return x.deMoi && x.infoDemandee && (!cie || x.compagnie === cie); }); }

  /* ------------------------------ Petits outils ------------------------------ */
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c; }
  function duree(min) { if (min === null || min === undefined || min === '') return ''; min = Math.max(0, Math.round(min)); if (min < 60) return min + ' min'; var hres = Math.floor(min / 60); if (hres < 48) return hres + ' h' + (min % 60 ? ' ' + (min % 60 < 10 ? '0' : '') + (min % 60) : ''); return Math.round(hres / 24) + ' j'; }
  function argent(x) { return x === '' || x === null || x === undefined ? '' : AMX.fmtArgent(x); }
  function vinValide(v) { return /^[A-HJ-NPR-Z0-9]{17}$/.test(String(v || '').toUpperCase()); }
  function depuis(iso) { var t = new Date(iso).getTime(); return isFinite(t) ? Math.max(0, (Date.now() - t) / 60000) : 0; }
  function heure(iso) { var d = new Date(iso); if (!isFinite(d.getTime())) return ''; return d.getHours() + ' h ' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }
  function jour(iso) { var d = new Date(iso); if (!isFinite(d.getTime())) return ''; return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }); }
  function quand(iso) { var d = new Date(iso); if (!isFinite(d.getTime())) return ''; return d.toDateString() === new Date().toDateString() ? heure(iso) : jour(iso) + ' ' + heure(iso); }
  function finDuJour() { var d = new Date(); d.setHours(23, 59, 0, 0); return d.toISOString(); }
  function mediane(l) { if (!l.length) return null; var s = l.slice().sort(function (a, b) { return a - b; }); return s[Math.floor(s.length / 2)]; }
  function pct(n, total) { return total ? Math.round(100 * n / total) + ' %' : '—'; }
  function pluriel(n, un, plus) { return n + ' ' + (n > 1 ? (plus || un + 's') : un); }
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
  function erreur(e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 8000); }

  /* Où en est une demande : la couleur de sa carte, son libellé, son chronomètre. */
  function phase(x) {
    if (x.etat === 'annulee') return 'annulee';
    if (x.etat === 'faite') return x.issue === 'achetee' ? 'achetee' : (x.issue === 'perdue' ? 'perdue' : (x.expiree ? 'echue' : 'faite'));
    return x.etat;
  }
  var PHASES = { afaire: ['À prendre', 'rouge'], encours: ['En évaluation', 'ambre'], faite: ['Valeur donnée', 'vert'], achetee: ['Achetée', 'vert'], perdue: ['Perdue', 'gris'], echue: ['Valeur échue', 'gris'], annulee: ['Annulée', 'gris'] };
  function chrono(x, R) {
    if (!estOuverte(x)) return null;
    var min = depuis(x.creeLe), ton, texte;
    if (x.etat === 'afaire') {
      ton = min < R.prise ? 'vert' : (min < R.delai ? 'ambre' : 'rouge');
      texte = (min < 1 ? 'à l\'instant' : 'il y a ' + duree(min)) + (min >= R.prise ? ' · pas encore prise' : '');
    } else {
      ton = min < R.alerte ? 'vert' : (min < R.delai ? 'ambre' : 'rouge');
      texte = duree(min) + ' depuis l\'envoi' + (x.minutesPrise !== undefined && x.minutesPrise !== null ? ' · prise en ' + duree(x.minutesPrise) : '');
    }
    return { min: min, ton: ton, texte: texte, part: Math.min(1, min / R.delai) };
  }

  /* ------------------------------ Disponibilité ------------------------------ */
  function poserPresence(etat, courriel) {
    var jusqu = etat === 'occupe' ? new Date(Date.now() + 60 * 60000).toISOString() : (etat === 'absent' ? finDuJour() : '');
    return AMX.post({ action: 'evalDemandeAction', op: 'presence', etat: etat, jusqu: jusqu, courriel: courriel || '' }, { secours: false }).then(function (x) {
      if (!x || x.refuse || x.ok === false) throw new Error((x && x.erreur) || 'Refusé');
      if (x.presence === undefined) throw new Error(SCRIPT_PAS_A_JOUR);
      var d = cache.rep;
      if (d) {
        if (d.moi && x.courriel === d.moi.courriel) { d.moi.presence = x.presence; d.moi.presenceJusqu = x.presenceJusqu; }
        Object.keys(d.evaluateurs || {}).forEach(function (c) { d.evaluateurs[c].forEach(function (e) { if (e.courriel === x.courriel) { e.presence = x.presence; e.presenceJusqu = x.presenceJusqu; } }); });
        annoncer();
      }
      AMX.toast(x.message || 'Disponibilité changée', 'ok');
      return x;
    });
  }
  function textePresence(e) {
    var p = e.presence || 'disponible';
    if (p === 'disponible') return 'disponible';
    return PRESENCES[p].toLowerCase() + (e.presenceJusqu ? ' jusqu\'à ' + quand(e.presenceJusqu) : '');
  }
  function modalePresence(e) {
    var m = AMX.modale({ titre: e.nom + ' — disponibilité', corps: h('div.de-evaluateurs', ['disponible', 'occupe', 'absent'].map(function (p) {
      return h('button.de-eval' + ((e.presence || 'disponible') === p ? '.choisi' : ''), { type: 'button', onclick: function () { m.fermer(); poserPresence(p, e.courriel).catch(erreur); } },
        [h('b', [h('i.de-point.' + TON_PRESENCE[p]), PRESENCES[p]]), h('span', { text: p === 'occupe' ? 'pendant 1 heure' : (p === 'absent' ? 'jusqu\'à la fin de la journée' : 'reçoit les demandes') })]);
    })), boutons: [{ texte: 'Annuler' }] });
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
    var R = reglages(d);
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
    var elEval = h('div.de-evaluateurs'), elAvis = h('div.mini.de-avis-eval');
    var dessinerEvaluateurs = function () {
      AMX.vider(elEval); elAvis.textContent = '';
      var liste = (d.evaluateurs[selCie.value] || []);
      if (!selCie.value) { elEval.appendChild(h('span.mini', 'Choisissez d\'abord la concession.')); return; }
      if (!liste.length) { elEval.appendChild(h('span.mini', { style: { color: 'var(--rouge)' }, text: 'Aucun évaluateur pour cette concession : la direction coche le droit « Évaluateur » dans Admin.' })); return; }
      if (choix !== 'disponible' && !liste.some(function (x) { return x.courriel === choix; })) choix = 'disponible';
      var presents = liste.filter(function (x) { return !x.groupe && x.presence !== 'absent'; }).length;
      var bouton = function (val, titre, sous, ton, attenue) {
        return h('button.de-eval' + (choix === val ? '.choisi' : '') + (attenue ? '.attenue' : ''), { type: 'button', 'aria-pressed': String(choix === val), onclick: function () { choix = val; dessinerEvaluateurs(); } },
          [h('b', [ton ? h('i.de-point.' + ton) : null, titre]), h('span', { text: sous })]);
      };
      elEval.appendChild(bouton('disponible', 'Premier disponible', presents ? 'saute les absents, le moins occupé' : 'personne n\'est disponible : le moins chargé', presents ? 'vert' : 'gris'));
      liste.forEach(function (x) {
        var sous = [textePresence(x), x.ouvertes ? x.ouvertes + ' en cours' : 'libre', x.groupe ? 'groupe' : ''].filter(Boolean).join(' · ');
        elEval.appendChild(bouton(x.courriel, x.nom, sous, TON_PRESENCE[x.presence || 'disponible'], x.presence === 'absent'));
      });
      var choisi = liste.filter(function (x) { return x.courriel === choix; })[0];
      if (choisi && choisi.presence === 'absent') elAvis.textContent = choisi.nom + ' est indiqué absent : la demande partira quand même, mais elle risque d\'attendre.';
      else if (choisi && choisi.ouvertes >= R.maxOuvertes) elAvis.textContent = choisi.nom + ' a déjà ' + choisi.ouvertes + ' demandes en cours.';
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
      h('div.champ.large', [h('span', 'Évaluateur'), elEval, elAvis])
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
        AMX.toast(x.message || 'Demande envoyée', x.deja || /absent/.test(x.message || '') ? 'attention' : 'ok', 6000);
        m.fermer();
        if (fichiers.length && !x.deja) envoyerPhotos(vin, fichiers);
        if (prefill.apres) prefill.apres(x.demande);
      }).catch(erreur).then(function () { btnEnvoyer.classList.remove('occupe'); });
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

  /* ------------------------------ Gestes sur une demande ------------------------------ */
  function droits(x, d) {
    var moi = (d && d.moi) || {}, ouverte = estOuverte(x);
    return {
      evaluer: ouverte && (x.pourMoi || ((moi.evaluateur || moi.direction) && !x.deMoi)),
      prendre: x.etat === 'afaire' && !x.pourMoi && !x.deMoi && (moi.evaluateur || moi.direction),
      piloter: ouverte && (x.deMoi || moi.direction),
      reassigner: ouverte && (x.deMoi || x.pourMoi || moi.direction),
      resultat: x.etat === 'faite' && (x.deMoi || x.pourMoi || moi.direction),
      reevaluer: (x.etat === 'faite' || x.etat === 'annulee') && !x.remplaceePar && (x.deMoi || moi.direction),
      ecrire: x.deMoi || x.pourMoi || moi.direction || moi.evaluateur,
      question: ouverte && !x.deMoi && (x.pourMoi || moi.evaluateur || moi.direction)
    };
  }
  function evaluer(x) {
    var aller = function () { AMX.aller('outils', 'evaluation', { vin: x.vin, demande: x.id }); };
    if (x.etat === 'afaire') action(x.id, 'prendre').then(aller).catch(function (e) { erreur(e); aller(); });
    else aller();
  }
  function choisirIssue(x, issue) {
    if (issue !== 'perdue') return action(x.id, 'issue', { issue: x.issue === issue && x.issueSource !== 'suivi' ? '' : issue }).then(function (r) { AMX.toast(r.message, 'ok'); }).catch(erreur);
    var R = reglages(), choix = '', inAutre = h('input.saisie', { type: 'text', placeholder: 'Précisez (facultatif)', maxlength: '160' });
    var elChoix = h('div.de-raisons', R.raisons.map(function (r) {
      var b = h('button.de-eval', { type: 'button', onclick: function () { choix = r; [].forEach.call(elChoix.children, function (c) { c.classList.toggle('choisi', c === b); }); } }, [h('b', { text: r })]);
      return b;
    }));
    AMX.modale({ titre: 'Pourquoi le client n\'a pas conclu ?', corps: h('div', [h('p.mini', { text: (x.vehicule || x.vin) + (x.client ? ' — ' + x.client : '') + (x.valeur ? ' · valeur ' + argent(x.valeur) : '') }), elChoix, h('label.champ', { style: { marginTop: '10px', display: 'grid', gap: '4px' } }, [h('span.mini', 'Détail'), inAutre])]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Marquer perdue', classe: 'primaire', action: function () {
        if (!choix) { AMX.toast('Choisissez une raison.', 'attention'); return false; }
        var raison = choix + (inAutre.value.trim() ? ' — ' + inAutre.value.trim() : '');
        return action(x.id, 'issue', { issue: 'perdue', raison: raison }).then(function (r) { AMX.toast(r.message, 'ok'); }).catch(function (e) { erreur(e); return false; });
      } }] });
  }
  function reevaluer(x) {
    var inKm = h('input.saisie', { type: 'text', inputmode: 'numeric', value: x.km || '', placeholder: 'Kilométrage' });
    var inNote = h('textarea.saisie', { rows: '2', placeholder: 'Pourquoi ? (client revenu, km changé, dommage trouvé…)' });
    AMX.modale({ titre: 'Réévaluer ' + (x.vehicule || x.vin), corps: h('div.de-grille', [
      h('p.mini.large', { text: 'Une nouvelle demande, liée à ' + x.id + (x.valeur ? ' (valeur donnée : ' + argent(x.valeur) + ')' : '') + ', part à ' + (x.evaluateurNom || 'l\'évaluateur') + ' s\'il est disponible, sinon au premier disponible.' }),
      h('label.champ', [h('span', 'Kilométrage'), inKm]), h('label.champ.large', [h('span', 'Note'), inNote])]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Demander la réévaluation', classe: 'primaire', action: function () {
        return action(x.id, 'reevaluer', { km: inKm.value, note: inNote.value }).then(function (r) { AMX.toast(r.message, r.deja ? 'attention' : 'ok', 6000); }).catch(function (e) { erreur(e); return false; });
      } }] });
  }
  function reassigner(x, d) {
    var liste = (d.evaluateurs[x.compagnie] || []).filter(function (e) { return e.courriel !== x.evaluateur; });
    if (!liste.length) { AMX.toast('Aucun autre évaluateur pour cette concession.', 'attention'); return; }
    var m = AMX.modale({ titre: 'Réassigner ' + x.id, corps: h('div.de-evaluateurs', [h('button.de-eval', { type: 'button', onclick: function () { go('disponible'); } }, [h('b', [h('i.de-point.vert'), 'Premier disponible']), h('span', 'saute les absents')])].concat(liste.map(function (e) {
      return h('button.de-eval' + (e.presence === 'absent' ? '.attenue' : ''), { type: 'button', onclick: function () { go(e.courriel); } }, [h('b', [h('i.de-point.' + TON_PRESENCE[e.presence || 'disponible']), e.nom]), h('span', { text: textePresence(e) + ' · ' + (e.ouvertes ? e.ouvertes + ' en cours' : 'libre') })]);
    }))), boutons: [{ texte: 'Annuler', action: function (f) { f(); } }] });
    function go(c) { m.fermer(); action(x.id, 'reassigner', { evaluateur: c }).then(function (r) { AMX.toast(r.message, 'ok'); }).catch(erreur); }
  }
  function message(id, texte, info) { return action(id, 'message', { texte: texte, info: !!info }); }

  /* Fil de messages d'une demande (dans la carte, ou dans une fenêtre depuis la page d'évaluation). */
  function blocFil(x, d, brouillons) {
    var dr = droits(x, d);
    var fil = h('div.de-fil');
    var msgs = x.messages || [];
    if (!msgs.length) fil.appendChild(h('p.mini', { text: 'Aucun message. Une question sur le véhicule ? Écrivez-la ici.' }));
    msgs.forEach(function (mm) {
      fil.appendChild(h('div.de-msg.' + (mm.cote || 'direction') + (mm.info ? '.info' : ''), [
        h('div.de-msg-tete', [h('b', { text: mm.nom || '—' }), mm.info ? h('span.badge.ambre.sans-point', { text: 'Question' }) : null, h('span.mini', { text: quand(mm.le) })]),
        h('div', { text: mm.texte })]));
    });
    if (dr.ecrire) {
      var ta = h('textarea.saisie', { rows: '2', placeholder: x.infoDemandee && x.deMoi ? 'Votre réponse…' : 'Écrire un message…', 'data-brouillon': x.id });
      ta.value = (brouillons && brouillons[x.id]) || '';
      ta.addEventListener('input', function () { if (brouillons) brouillons[x.id] = ta.value; });
      var envoyer = function (info, btn) {
        var t = ta.value.trim(); if (!t) { AMX.toast('Message vide.', 'attention'); ta.focus(); return; }
        btn.classList.add('occupe');
        message(x.id, t, info).then(function (r) { if (brouillons) delete brouillons[x.id]; ta.value = ''; AMX.toast(r.message, 'ok'); }).catch(erreur).then(function () { btn.classList.remove('occupe'); });
      };
      var bEnv = h('button.btn.petit.primaire', { type: 'button', text: 'Envoyer', onclick: function () { envoyer(false, bEnv); } });
      var bInfo = dr.question ? h('button.btn.petit', { type: 'button', text: 'Poser une question au représentant', onclick: function () { envoyer(true, bInfo); } }) : null;
      ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); envoyer(false, bEnv); } });
      fil.appendChild(ta);
      fil.appendChild(h('div.de-fil-pied', [bEnv, bInfo, h('span.mini', { text: 'Visible ici et dans l\'app, sans courriel.' })]));
    }
    return fil;
  }
  function ouvrirFil(id) {
    injecterCss();
    var x = AMX.evalDemandes.une(id), d = cache.rep;
    if (!x || !d) { AMX.toast('Demande introuvable.', 'attention'); return; }
    var corps = h('div'), brouillons = {};
    var dessiner = function () { var y = AMX.evalDemandes.une(id) || x; AMX.vider(corps); corps.appendChild(blocFil(y, d, brouillons)); };
    var surMaj = function () { var ta = corps.querySelector('textarea'); if (ta && document.activeElement === ta) return; dessiner(); };
    document.addEventListener('amx:evalDemandes', surMaj);
    AMX.modale({ titre: 'Messages — ' + (x.vehicule || x.vin), corps: corps, large: true, proteger: false, onFermer: function () { document.removeEventListener('amx:evalDemandes', surMaj); } });
    dessiner();
  }

  /* ------------------------------ Page ------------------------------ */
  AMX.section('demandesEval', {
    titre: 'Demandes d\'évaluation', icone: 'outils', ordre: 23,
    visible: function () { return AMX.perm('consulter') || AMX.estAdmin(); },
    onglets: [{ id: '', titre: 'Demandes', compteur: function () { var c = AMX.compagnieChoisie('evaluations'); var l = (aFairePourMoi(c) || []).length + (questionsPourMoi(c) || []).length; return l ? String(l) : ''; } }],
    monter: function (conteneur, ctx) { return new Vue(conteneur, ctx); }
  });

  function Vue(conteneur, ctx) {
    injecterCss();
    var self = this;
    this.el = conteneur; this.detruit = false;
    this.vue = AMX.memo.lire('evalDemandes_vue2', '');
    this.etat = ''; this.etatChoisi = false;
    this.periode = AMX.memo.lire('evalDemandes_periode', '30');
    this.brouillons = {}; this.filsOuverts = {};
    this.construire();
    this.charger(false);
    this.surMaj = function () { if (!self.detruit) self.rendre(); };
    this.surCie = function () { if (!self.detruit) self.rendre(); };
    document.addEventListener('amx:evalDemandes', this.surMaj);
    document.addEventListener('amx:compagnie', this.surCie);
    this.minuterie = setInterval(function () { if (!self.detruit && !document.hidden) self.charger(true, true); }, 60000);
    this.horloge = setInterval(function () { if (!self.detruit && !document.hidden && self.vue !== 'stats') self.rendre(); }, 30000);   /* chronomètres */
    this.surPleinEcran = function () { if (self.btnPlein) self.btnPlein.querySelector('span').textContent = document.fullscreenElement === self.el.firstChild ? 'Quitter le plein écran' : 'Plein écran'; };
    document.addEventListener('fullscreenchange', this.surPleinEcran);
    this.appliquerParams(ctx);
  }
  Vue.prototype.demonter = function () { this.detruit = true; clearInterval(this.minuterie); clearInterval(this.horloge); document.removeEventListener('amx:evalDemandes', this.surMaj); document.removeEventListener('amx:compagnie', this.surCie); document.removeEventListener('fullscreenchange', this.surPleinEcran); };
  Vue.prototype.naviguer = function (ctx) { this.appliquerParams(ctx); };
  Vue.prototype.appliquerParams = function (ctx) {
    var p = (ctx && ctx.params) || {};
    if (p.nouvelle) setTimeout(function () { demander({ vin: p.vin || '' }); }, 100);
    if (p.vue && ['pourMoi', 'deMoi', 'tableau', 'stats'].indexOf(p.vue) >= 0) { this.vue = p.vue; this.etatChoisi = false; if (cache.rep) this.rendre(); }
    if (p.id) { this.filsOuverts[p.id] = true; this.cible = p.id; }
  };
  Vue.prototype.construire = function () {
    var self = this;
    this.btnDemander = h('button.btn.primaire', { type: 'button', html: I.plus + '<span>Demander une évaluation</span>', onclick: function () { demander({ compagnie: AMX.compagnieChoisie('evaluations') }); } });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnPlein = h('button.btn', { type: 'button', html: I.externe + '<span>Plein écran</span>', onclick: function () { self.pleinEcran(); } });
    this.elSous = h('p.sous-titre');
    var actions = AMX.actionsEntete ? AMX.actionsEntete([this.btnRafraichir, this.btnPlein, this.btnDemander], [this.btnDemander]) : [this.btnRafraichir, this.btnPlein, this.btnDemander];
    this.elCies = h('div');
    this.elEquipe = h('div.de-equipe');
    this.segVue = h('div.segment.de-vues');
    this.inputQ = h('input.saisie', { type: 'search', placeholder: 'NIV, véhicule, client, représentant, évaluateur', oninput: function () { self.rendre(); } });
    this.elEtats = h('div.inv2-statuts.de-etats');
    this.elPortee = h('div');
    this.elTuiles = h('div.kpis.de-tuiles');
    this.elListe = h('div.de-liste');
    this.el.appendChild(h('div.de-page', [h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', 'Demandes d\'évaluation'), this.elSous]), h('div.actions', actions)]), this.elCies, this.elEquipe,
      h('div.de-filtres', [this.segVue, h('div.recherche', [h('span', { html: I.recherche }), this.inputQ])]), this.elEtats, this.elPortee, this.elTuiles, this.elListe]));
  };
  Vue.prototype.pleinEcran = function () {
    var cible = this.el.firstChild;
    try {
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      if (this.vue !== 'tableau' && cache.rep && (cache.rep.moi || {}).direction) { this.vue = 'tableau'; this.rendre(); }
      if (cible.requestFullscreen) cible.requestFullscreen().catch(function () {});
    } catch (e) {}
  };
  Vue.prototype.charger = function (force, silencieux) {
    var self = this;
    if (!cache.rep) { AMX.vider(this.elListe); this.elListe.appendChild(AMX.chargeur ? AMX.chargeur('Demandes d\'évaluation') : h('p.doux', 'Lecture…')); }
    charger(force).then(function () { if (!self.detruit) self.rendre(); }).catch(function (e) {
      if (self.detruit) return;
      if (!cache.rep) { AMX.vider(self.elListe); self.elListe.appendChild(h('div.carte', [h('div.carte-corps', [h('p', { style: { color: 'var(--rouge)' }, text: AMX.erreurTexte(e) })])])); }
      if (!silencieux) erreur(e);
    });
  };
  Vue.prototype.vues = function (moi) {
    var v = [];
    if (moi.evaluateur || moi.direction) v.push(['pourMoi', 'À évaluer']);
    v.push(['deMoi', 'Mes demandes']);
    if (moi.evaluateur || moi.direction) { v.push(['tableau', 'Tableau']); v.push(['stats', 'Statistiques']); }
    return v;
  };
  Vue.prototype.rendre = function () {
    var self = this, d = cache.rep; if (!d) return;
    /* Ne pas perdre ce qu'on tape dans un fil quand la liste se redessine (chronomètres, relecture) */
    var actif = document.activeElement, focusId = actif && actif.dataset ? actif.dataset.brouillon : '', curseur = focusId ? actif.selectionStart : 0;
    var moi = d.moi || {}, R = reglages(d);
    var cie = AMX.compagnieChoisie('evaluations');
    AMX.barreConcessions(this.elCies, { domaine: 'evaluations', valeur: cie, onchange: function (c) { AMX.choisirCompagnie(c); } });
    var base = d.demandes.filter(function (x) { return !cie || x.compagnie === cie; });
    var vues = this.vues(moi);
    if (!vues.some(function (v) { return v[0] === self.vue; })) this.vue = moi.evaluateur ? 'pourMoi' : (base.some(function (x) { return x.deMoi; }) || !moi.direction ? 'deMoi' : 'tableau');
    this.btnPlein.style.display = moi.evaluateur || moi.direction ? '' : 'none';
    AMX.vider(this.segVue);
    vues.forEach(function (v) {
      var n = v[0] === 'pourMoi' ? ouvertes(base.filter(function (x) { return x.pourMoi; })).length : (v[0] === 'deMoi' ? base.filter(function (x) { return x.deMoi && (estOuverte(x) || x.infoDemandee); }).length : 0);
      self.segVue.appendChild(h('button' + (self.vue === v[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': String(self.vue === v[0]), onclick: function () { self.vue = v[0]; self.etatChoisi = false; AMX.memo.ecrire('evalDemandes_vue2', v[0]); self.rendre(); } }, [v[1], n ? h('span.compteur', { text: String(n) }) : null]));
    });
    this.rendreEquipe(d, cie);
    var q = this.inputQ.value, mots = AMX.motsCherches(q);
    var cherche = function (x) { return !mots.length || AMX.correspond([x.vin, x.vehicule, x.client, x.demandeParNom, x.evaluateurNom, x.id, x.note], mots); };
    this.elSous.textContent = (moi.evaluateur ? 'Vous êtes évaluateur' : 'Vos demandes et leurs valeurs') + ' · prise visée en ' + R.prise + ' min, valeur en ' + R.delai + ' min · la valeur vaut ' + R.validite + ' jours';
    if (this.vue === 'tableau') this.rendreTableau(d, base.filter(cherche), cie, q);
    else if (this.vue === 'stats') this.rendreStats(d, base.filter(cherche), cie, q);
    else this.rendreListe(d, base.filter(cherche), cie, q);
    if (focusId) { var ta = this.el.querySelector('textarea[data-brouillon="' + focusId + '"]'); if (ta) { ta.focus(); try { ta.setSelectionRange(curseur, curseur); } catch (e) {} } }
    if (this.cible) { var c = this.el.querySelector('[data-id="' + this.cible + '"]'); if (c) { c.scrollIntoView({ block: 'center' }); c.classList.add('de-cible'); this.cible = ''; } }
  };

  /* Disponibilité : la mienne (évaluateur) et celle de l'équipe de la concession choisie */
  Vue.prototype.rendreEquipe = function (d, cie) {
    var self = this, moi = d.moi || {};
    AMX.vider(this.elEquipe);
    if (moi.evaluateur) {
      var p = moi.presence || 'disponible';
      var seg = h('div.segment', ['disponible', 'occupe', 'absent'].map(function (k) {
        return h('button' + (p === k ? '.actif' : ''), { type: 'button', 'aria-pressed': String(p === k), title: k === 'occupe' ? 'Pendant 1 heure' : (k === 'absent' ? 'Jusqu\'à la fin de la journée' : ''), onclick: function () { if (k !== p) poserPresence(k).catch(erreur); } },
          [h('i.de-point.' + TON_PRESENCE[k]), k === 'occupe' ? 'Occupé 1 h' : (k === 'absent' ? 'Absent aujourd\'hui' : PRESENCES[k])]);
      }));
      this.elEquipe.appendChild(h('div.de-ma-dispo', [h('span.mini', 'Ma disponibilité'), seg, p !== 'disponible' && moi.presenceJusqu ? h('span.mini', { text: 'jusqu\'à ' + quand(moi.presenceJusqu) + ', puis disponible tout seul' }) : null]));
    }
    var codes = cie ? [cie] : Object.keys(d.evaluateurs || {});
    if (codes.length > 2) return;   /* toutes les concessions : la bande d'équipe serait trop longue */
    codes.forEach(function (c) {
      var liste = (d.evaluateurs[c] || []).filter(function (e) { return !e.groupe; });
      if (!liste.length) { self.elEquipe.appendChild(h('div.de-bande', [h('span.mini', { text: 'Évaluateurs · ' + nomCie(c) + ' : aucun — cochez le droit « Évaluateur » dans Admin' })])); return; }
      self.elEquipe.appendChild(h('div.de-bande', [h('span.mini', { text: 'Évaluateurs' + (codes.length > 1 || !cie ? ' · ' + nomCie(c) : '') })].concat(liste.map(function (e) {
        var txt = e.nom + (e.ouvertes ? ' · ' + e.ouvertes + ' en cours' : '') + (e.presence && e.presence !== 'disponible' ? ' · ' + PRESENCES[e.presence].toLowerCase() : '');
        var change = moi.direction && e.courriel !== moi.courriel;
        var attrs = { type: 'button', title: textePresence(e) + (change ? ' — cliquez pour changer' : '') };
        if (change) attrs.onclick = function () { modalePresence(e); }; else attrs.disabled = true;
        return h('button.de-puce-eval' + (e.presence === 'absent' ? '.attenue' : ''), attrs, [h('i.de-point.' + TON_PRESENCE[e.presence || 'disponible']), txt]);
      }))));
    });
  };

  /* --- Vues À évaluer / Mes demandes --- */
  Vue.prototype.rendreListe = function (d, base, cie, q) {
    var self = this, moi = d.moi || {}, R = reglages(d);
    var parVue = base.filter(this.vue === 'pourMoi' ? function (x) { return x.pourMoi; } : function (x) { return x.deMoi; });
    var etats = [
      ['ouvertes', 'Ouvertes', function (x) { return estOuverte(x); }, 'rouge'],
      ['info', 'Question en attente', function (x) { return x.infoDemandee; }, 'ambre'],
      ['valeur', 'Valeur donnée', function (x) { return phase(x) === 'faite'; }, 'vert'],
      ['conclues', 'Achetées / perdues', function (x) { return x.issue === 'achetee' || x.issue === 'perdue'; }, 'bleu'],
      ['echues', 'Échues', function (x) { return phase(x) === 'echue'; }, 'gris'],
      ['annulee', 'Annulées', function (x) { return x.etat === 'annulee'; }, 'gris'],
      ['toutes', 'Toutes', function () { return true; }, '']];
    var etatDefaut = this.vue === 'pourMoi' ? 'ouvertes' : 'toutes';
    if (!this.etatChoisi || !etats.some(function (e) { return e[0] === self.etat; })) this.etat = etatDefaut;
    AMX.vider(this.elEtats); this.elEtats.style.display = '';
    etats.forEach(function (e) {
      var n = parVue.filter(e[2]).length;
      if (!n && e[0] !== self.etat && (e[0] === 'info' || e[0] === 'echues' || e[0] === 'annulee')) return;
      self.elEtats.appendChild(h('button.inv2-pastille' + (self.etat === e[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': String(self.etat === e[0]), onclick: function () { self.etat = e[0]; self.etatChoisi = true; self.rendre(); } }, [e[3] ? h('i', { style: { background: 'var(--' + e[3] + ')' } }) : null, e[1], h('b', { text: String(n) })]));
    });
    var filtre = etats.filter(function (e) { return e[0] === self.etat; })[0][2];
    var liste = parVue.filter(filtre);
    var RANG = { afaire: 0, encours: 1, faite: 2, echue: 3, achetee: 4, perdue: 5, annulee: 6 };
    /* question en attente d'abord, puis par étape ; les ouvertes de la plus vieille à la plus récente (la plus urgente en haut), les autres de la plus récente à la plus vieille */
    liste = liste.slice().sort(function (a, b) {
      var r = ((b.infoDemandee ? 1 : 0) - (a.infoDemandee ? 1 : 0)) || ((RANG[phase(a)] || 0) - (RANG[phase(b)] || 0));
      if (r) return r;
      return estOuverte(a) ? String(a.creeLe || '').localeCompare(String(b.creeLe || '')) : String(b.creeLe || '').localeCompare(String(a.creeLe || ''));
    });
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['demande', 'demandes'], contexte: [cie ? nomCie(cie) : 'Toutes les concessions', this.vue === 'pourMoi' ? 'À évaluer' : 'Mes demandes'],
      filtres: [self.etat !== etatDefaut ? etats.filter(function (e) { return e[0] === self.etat; })[0][1] : '', q ? '« ' + q + ' »' : ''], effacer: function () { self.etatChoisi = false; self.inputQ.value = ''; self.rendre(); } });
    /* Chiffres sur la liste filtrée */
    AMX.vider(this.elTuiles);
    var tuile = function (t, v, sous, ton) { return h('div.kpi.neutre' + (ton ? '.' + ton : ''), [h('div.libelle', { text: t }), h('div.valeur', { text: v }), sous ? h('div.sous', { text: sous }) : null]); };
    var faites = liste.filter(function (x) { return x.etat === 'faite' && x.minutesReponse !== null && x.minutesReponse !== undefined; });
    var med = mediane(faites.map(function (x) { return x.minutesReponse; }));
    var sous15 = faites.filter(function (x) { return x.minutesReponse <= R.delai; }).length;
    if (this.vue === 'pourMoi') {
      var nAf = liste.filter(function (x) { return x.etat === 'afaire'; }).length, nEc = liste.filter(function (x) { return x.etat === 'encours'; }).length;
      var nRet = liste.filter(function (x) { var c = chrono(x, R); return c && c.ton === 'rouge'; }).length;
      this.elTuiles.appendChild(tuile('À prendre', String(nAf), nAf ? 'pas encore commencées' : 'rien en attente', nAf ? 'alerte' : 'ok'));
      this.elTuiles.appendChild(tuile('En évaluation', String(nEc), '', nEc ? 'attention' : ''));
      this.elTuiles.appendChild(tuile('En retard', String(nRet), 'plus de ' + R.delai + ' minutes', nRet ? 'alerte' : ''));
      this.elTuiles.appendChild(tuile('Délai de réponse', med === null ? '—' : duree(med), med === null ? 'aucune valeur donnée ici' : 'médiane · ' + pct(sous15, faites.length) + ' sous ' + R.delai + ' min', med !== null && med <= R.delai ? 'ok' : ''));
    } else {
      var nOuv = liste.filter(estOuverte).length, nInfo = liste.filter(function (x) { return x.infoDemandee; }).length;
      var donnees = liste.filter(function (x) { return x.etat === 'faite'; }), ach = donnees.filter(function (x) { return x.issue === 'achetee'; }).length;
      var aPresenter = donnees.filter(function (x) { return !x.issue && !x.expiree; }).length;
      this.elTuiles.appendChild(tuile('Ouvertes', String(nOuv), nOuv ? 'chez l\'évaluateur' : 'rien en attente', nOuv ? 'attention' : ''));
      this.elTuiles.appendChild(tuile('Questions', String(nInfo), nInfo ? 'l\'évaluateur attend votre réponse' : 'aucune', nInfo ? 'alerte' : ''));
      this.elTuiles.appendChild(tuile('Valeurs à présenter', String(aPresenter), 'valeur donnée, pas encore de résultat', aPresenter ? 'ok' : ''));
      this.elTuiles.appendChild(tuile('Taux d\'achat', donnees.length ? pct(ach, donnees.length) : '—', pluriel(ach, 'achetée') + ' sur ' + pluriel(donnees.length, 'valeur') + ' données', ''));
      this.elTuiles.appendChild(tuile('Délai de réponse', med === null ? '—' : duree(med), med === null ? '' : 'médiane, ' + pluriel(faites.length, 'demande'), med !== null && med <= R.delai ? 'ok' : ''));
    }
    AMX.vider(this.elListe);
    if (!liste.length) {
      this.elListe.appendChild(h('div.carte', [h('div.carte-corps', [h('p.doux', { text: self.vue === 'pourMoi' && self.etat === 'ouvertes' ? 'Rien à évaluer pour vous. 🎉' : 'Aucune demande ici.' }), h('button.btn.primaire', { type: 'button', html: I.plus + '<span>Demander une évaluation</span>', onclick: function () { demander({ compagnie: cie }); } })])]));
      return;
    }
    liste.forEach(function (x) { self.elListe.appendChild(self.carte(x, d)); });
  };

  /* Une carte complète */
  Vue.prototype.carte = function (x, d) {
    var self = this, R = reglages(d), dr = droits(x, d), ph = phase(x), c = chrono(x, R);
    var boutons = [];
    if (dr.evaluer) boutons.push(h('button.btn.primaire.petit', { type: 'button', html: I.ok + '<span>' + (x.etat === 'afaire' ? 'Prendre et évaluer' : 'Évaluer') + '</span>', onclick: function () { evaluer(x); } }));
    if (dr.prendre && !dr.evaluer) boutons.push(h('button.btn.petit', { type: 'button', text: 'Je la prends', onclick: function () { action(x.id, 'prendre').then(function (r) { AMX.toast(r.message, 'ok'); }).catch(erreur); } }));
    if (x.etat === 'faite') boutons.push(h('button.btn.petit', { type: 'button', text: 'Voir l\'évaluation', onclick: function () { AMX.aller('outils', 'evaluation', { vin: x.vin }); } }));
    if (x.issue === 'achetee') boutons.push(h('button.btn.petit', { type: 'button', text: 'Fiche d\'achat', onclick: function () { AMX.aller('achat', '', { vin: x.vin }); } }));
    if (dr.reevaluer) boutons.push(h('button.btn.petit', { type: 'button', text: 'Réévaluer', onclick: function () { reevaluer(x); } }));
    var nMsg = (x.messages || []).length, ouvert = !!this.filsOuverts[x.id] || (x.infoDemandee && x.deMoi);
    boutons.push(h('button.btn.petit' + (ouvert ? '.actif' : ''), { type: 'button', text: nMsg ? 'Messages (' + nMsg + ')' : 'Message', onclick: function () { self.filsOuverts[x.id] = !ouvert; self.rendre(); } }));
    var menu = [];
    if (dr.piloter) {
      menu.push({ texte: 'Relancer l\'évaluateur (courriel + texto)', action: function () { action(x.id, 'relancer').then(function (r) { AMX.toast(r.message, 'ok'); }).catch(erreur); } });
      menu.push({ texte: 'Annuler la demande', action: function () { AMX.confirmer('Annuler la demande ?', (x.vehicule || 'Véhicule') + ' · ' + x.vin, { ok: 'Annuler la demande', danger: true }).then(function (ok) { if (ok) action(x.id, 'annuler', { raison: '' }).then(function (r) { AMX.toast(r.message, 'ok'); }).catch(erreur); }); } });
    }
    if (dr.reassigner) menu.push({ texte: 'Réassigner…', action: function () { reassigner(x, d); } });
    if (menu.length && AMX.menuActions) boutons.push(AMX.menuActions(menu, { petit: true }));

    var tete = h('div.de-tete', [
      h('span.badge.sans-point.' + PHASES[ph][1], { text: PHASES[ph][0] }),
      h('b.de-veh', { text: x.vehicule || 'Véhicule' }), h('span.mono.mini', { text: x.vin }), x.km ? h('span.mini', { text: AMX.fmtNombre(Number(x.km)) + ' km' }) : null,
      c ? h('span.de-chrono.' + c.ton, { text: '⏱ ' + c.texte }) : h('span.mini.de-quand', { text: quand(x.creeLe) })
    ]);
    var etapes = h('div.de-etapes', [
      etape('Envoyée', true, quand(x.creeLe)),
      etape('Prise', !!x.prisLe || x.etat === 'faite', x.prisLe ? quand(x.prisLe) + (x.minutesPrise !== undefined ? ' · en ' + duree(x.minutesPrise) : '') : ''),
      etape('Valeur', x.etat === 'faite', x.etat === 'faite' && x.faiteLe ? quand(x.faiteLe) + (x.minutesReponse !== null && x.minutesReponse !== undefined ? ' · en ' + duree(x.minutesReponse) : '') : ''),
      etape('Résultat', !!x.issue, x.issue ? ISSUES[x.issue] : '')
    ]);
    function etape(t, fait, sous) { return h('div.de-etape' + (fait ? '.fait' : ''), [h('i'), h('b', { text: t }), sous ? h('span', { text: sous }) : null]); }
    var gauche = h('div', [
      x.client ? h('div', [h('span.mini', 'Client : '), h('b', { text: x.client }), x.telephone ? h('span.mini', { text: ' · ' + x.telephone }) : null]) : null,
      h('div.mini', { text: 'De ' + (x.demandeParNom || '—') + ' → ' + (x.evaluateurNom || '—') + (x.mode === 'disponible' ? ' (premier disponible)' : '') + ' · ' + nomCie(x.compagnie) + ' · ' + x.id + (x.photos ? ' · ' + pluriel(x.photos, 'photo') : '') }),
      x.reprendDe ? h('div.mini', { text: 'Réévaluation de ' + x.reprendDe }) : null,
      x.remplaceePar ? h('div.mini', { text: 'Réévaluée : voir ' + x.remplaceePar }) : null,
      x.note ? h('div.de-note', { text: x.note }) : null,
      x.etat === 'annulee' && x.annuleRaison ? h('div.mini', { text: 'Annulée : ' + x.annuleRaison }) : null
    ]);
    var valeur = null;
    if (x.etat === 'faite') {
      var vj = x.valideJusqu ? (x.expiree ? 'échue depuis le ' + jour(x.valideJusqu) : 'vaut jusqu\'au ' + jour(x.valideJusqu)) : '';
      valeur = h('div.de-valeur', [h('span.mini', 'Valeur'), h('b', { text: x.valeur ? argent(x.valeur) : 'voir l\'évaluation' }), h('span.mini', { text: 'par ' + (x.faitePar || x.evaluateurNom || '—') }), vj ? h('span.mini' + (x.expiree ? '.rouge' : ''), { text: vj }) : null]);
    }
    var info = null;
    if (x.infoDemandee) {
      var q = (x.messages || []).filter(function (m) { return m.info; }).pop();
      info = h('div.de-info', [h('b', { text: (q ? q.nom : 'L\'évaluateur') + ' demande : ' }), h('span', { text: '« ' + (q ? q.texte : '') + ' »' })]);
    }
    var resultat = null;
    if (dr.resultat) {
      resultat = h('div.de-resultat', [h('span.mini', 'Résultat :')].concat(['presentee', 'achetee', 'perdue'].map(function (k) {
        return h('button.btn.petit' + (x.issue === k ? '.actif.' + k : ''), { type: 'button', 'aria-pressed': String(x.issue === k), onclick: function () { choisirIssue(x, k); } }, [k === 'perdue' ? 'Perdue…' : ISSUES[k]]);
      })).concat([x.issue === 'perdue' && x.issueRaison ? h('span.mini', { text: x.issueRaison }) : null, x.issueSource === 'suivi' ? h('span.mini', { text: 'd\'après le suivi de l\'évaluation' }) : null]));
    } else if (x.issue) resultat = h('div.de-resultat', [h('span.mini', { text: 'Résultat : ' + ISSUES[x.issue] + (x.issueRaison ? ' — ' + x.issueRaison : '') })]);
    var carte = h('div.de-carte.' + ph + (c ? '.t-' + c.ton : ''), { 'data-id': x.id }, [
      tete,
      c ? h('div.de-progres', [h('i.' + c.ton, { style: { width: Math.round(c.part * 100) + '%' } })]) : null,
      etapes,
      info,
      h('div.de-corps', [gauche, valeur]),
      resultat,
      ouvert ? blocFil(x, d, this.brouillons) : null,
      h('div.de-actions', boutons)
    ]);
    return carte;
  };

  /* --- Tableau (colonnes) --- */
  Vue.prototype.rendreTableau = function (d, base, cie, q) {
    var self = this, R = reglages(d);
    this.elEtats.style.display = 'none'; AMX.vider(this.elEtats);
    var semaine = Date.now() - 7 * 86400000;
    var cols = [
      ['afaire', 'À prendre', function (x) { return x.etat === 'afaire'; }],
      ['encours', 'En évaluation', function (x) { return x.etat === 'encours'; }],
      ['faite', 'Valeur donnée', function (x) { return x.etat === 'faite' && x.issue !== 'achetee' && x.issue !== 'perdue' && !x.remplaceePar && new Date(x.faiteLe || x.creeLe).getTime() > Date.now() - (R.validite + 3) * 86400000; }],
      ['conclues', 'Conclues (7 jours)', function (x) { return (x.issue === 'achetee' || x.issue === 'perdue') && new Date(x.issueLe || x.faiteLe || x.creeLe).getTime() > semaine; }]
    ];
    var ancien = function (a, b) { return String(a.creeLe).localeCompare(String(b.creeLe)); };   /* ouvertes : la plus vieille en haut */
    var recent = function (a, b) { return String(b.issueLe || b.faiteLe || b.creeLe).localeCompare(String(a.issueLe || a.faiteLe || a.creeLe)); };
    var parCol = cols.map(function (c, i) { return base.filter(c[2]).sort(i < 2 ? ancien : recent); });
    var n = parCol.reduce(function (s, l) { return s + l.length; }, 0);
    AMX.porteeChiffres(this.elPortee, { n: n, unite: ['demande', 'demandes'], contexte: [cie ? nomCie(cie) : 'Toutes les concessions', 'Tableau'], filtres: [q ? '« ' + q + ' »' : ''], effacer: function () { self.inputQ.value = ''; self.rendre(); } });
    AMX.vider(this.elTuiles);
    var tuile = function (t, v, sous, ton) { return h('div.kpi.neutre' + (ton ? '.' + ton : ''), [h('div.libelle', { text: t }), h('div.valeur', { text: v }), sous ? h('div.sous', { text: sous }) : null]); };
    var ouv = parCol[0].concat(parCol[1]), rouges = ouv.filter(function (x) { var c = chrono(x, R); return c && c.ton === 'rouge'; }).length;
    var plusVieille = ouv.reduce(function (m, x) { return Math.max(m, depuis(x.creeLe)); }, 0);
    var aujour = new Date().toDateString(), faitesJ = base.filter(function (x) { return x.etat === 'faite' && new Date(x.faiteLe).toDateString() === aujour; });
    var medJ = mediane(faitesJ.filter(function (x) { return x.minutesReponse !== null && x.minutesReponse !== undefined; }).map(function (x) { return x.minutesReponse; }));
    this.elTuiles.appendChild(tuile('Ouvertes', String(ouv.length), ouv.length ? 'la plus vieille : ' + duree(plusVieille) : 'rien en attente', ouv.length ? 'attention' : 'ok'));
    this.elTuiles.appendChild(tuile('En retard', String(rouges), 'plus de ' + R.delai + ' minutes', rouges ? 'alerte' : ''));
    this.elTuiles.appendChild(tuile('Faites aujourd\'hui', String(faitesJ.length), medJ === null ? '' : 'délai médian ' + duree(medJ), faitesJ.length ? 'ok' : ''));
    this.elTuiles.appendChild(tuile('À présenter', String(parCol[2].filter(function (x) { return !x.issue; }).length), 'valeur donnée, sans résultat', ''));
    AMX.vider(this.elListe);
    var grille = h('div.de-kanban');
    cols.forEach(function (c, i) {
      grille.appendChild(h('div.de-col.' + c[0], [h('div.de-col-tete', [h('b', { text: c[1] }), h('span.compteur', { text: String(parCol[i].length) })]),
        h('div.de-col-corps', parCol[i].length ? parCol[i].map(function (x) { return self.carteCompacte(x, d); }) : [h('p.mini', { text: '—' })])]));
    });
    this.elListe.appendChild(grille);
  };
  Vue.prototype.carteCompacte = function (x, d) {
    var self = this, R = reglages(d), c = chrono(x, R), ph = phase(x);
    var bas = c ? h('span.de-chrono.' + c.ton, { text: '⏱ ' + duree(c.min) + (x.etat === 'afaire' && c.min >= R.prise ? ' · pas prise' : '') }) :
      (x.etat === 'faite' ? h('b.de-mini-valeur', { text: (x.valeur ? argent(x.valeur) : 'valeur') + (x.issue ? ' · ' + ISSUES[x.issue] : (x.expiree ? ' · échue' : '')) }) : null);
    return h('button.de-compact.' + ph + (c ? '.t-' + c.ton : ''), { type: 'button', 'data-id': x.id, onclick: function () { self.ouvrirDetail(x.id); } }, [
      h('b', { text: x.vehicule || x.vin }),
      h('span.mini', { text: [x.client, x.km ? AMX.fmtNombre(Number(x.km)) + ' km' : ''].filter(Boolean).join(' · ') }),
      h('span.mini', { text: (x.demandeParNom || '—') + ' → ' + (x.evaluateurNom || '—') }),
      x.infoDemandee ? h('span.badge.ambre.sans-point', { text: 'Question en attente' }) : null,
      bas
    ]);
  };
  Vue.prototype.ouvrirDetail = function (id) {
    var self = this, corps = h('div');
    var dessiner = function () { var x = AMX.evalDemandes.une(id); AMX.vider(corps); if (x) corps.appendChild(self.carte(x, cache.rep)); };
    var surMaj = function () { var ta = corps.querySelector('textarea'); if (ta && document.activeElement === ta) return; dessiner(); };
    document.addEventListener('amx:evalDemandes', surMaj);
    this.filsOuverts[id] = true;
    AMX.modale({ titre: id, corps: corps, large: true, proteger: false, onFermer: function () { document.removeEventListener('amx:evalDemandes', surMaj); } });
    dessiner();
  };

  /* --- Statistiques --- */
  Vue.prototype.rendreStats = function (d, base, cie, q) {
    var self = this, R = reglages(d);
    AMX.vider(this.elEtats); this.elEtats.style.display = '';
    [['7', '7 jours'], ['30', '30 jours']].forEach(function (p) {
      self.elEtats.appendChild(h('button.inv2-pastille' + (self.periode === p[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': String(self.periode === p[0]), onclick: function () { self.periode = p[0]; AMX.memo.ecrire('evalDemandes_periode', p[0]); self.rendre(); } }, [p[1]]));
    });
    var limite = Date.now() - Number(this.periode) * 86400000;
    var liste = base.filter(function (x) { return x.etat !== 'annulee' && new Date(x.creeLe).getTime() > limite; });
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['demande', 'demandes'], contexte: [cie ? nomCie(cie) : 'Toutes les concessions', this.periode + ' derniers jours'], filtres: [q ? '« ' + q + ' »' : ''], effacer: function () { self.inputQ.value = ''; self.rendre(); } });
    var faites = liste.filter(function (x) { return x.etat === 'faite'; });
    var rep = faites.filter(function (x) { return x.minutesReponse !== null && x.minutesReponse !== undefined; });
    var prises = liste.filter(function (x) { return x.minutesPrise !== null && x.minutesPrise !== undefined; });
    var ach = faites.filter(function (x) { return x.issue === 'achetee'; }).length, per = faites.filter(function (x) { return x.issue === 'perdue'; }).length;
    AMX.vider(this.elTuiles);
    var tuile = function (t, v, sous, ton) { return h('div.kpi.neutre' + (ton ? '.' + ton : ''), [h('div.libelle', { text: t }), h('div.valeur', { text: v }), sous ? h('div.sous', { text: sous }) : null]); };
    var medP = mediane(prises.map(function (x) { return x.minutesPrise; })), medR = mediane(rep.map(function (x) { return x.minutesReponse; }));
    var sous = rep.filter(function (x) { return x.minutesReponse <= R.delai; }).length;
    this.elTuiles.appendChild(tuile('Demandes', String(liste.length), pluriel(faites.length, 'valeur') + ' données', ''));
    this.elTuiles.appendChild(tuile('Prise', medP === null ? '—' : duree(medP), 'médiane · visée ' + R.prise + ' min', medP !== null && medP <= R.prise ? 'ok' : (medP !== null ? 'attention' : '')));
    this.elTuiles.appendChild(tuile('Valeur donnée', medR === null ? '—' : duree(medR), 'médiane · ' + pct(sous, rep.length) + ' sous ' + R.delai + ' min', medR !== null && medR <= R.delai ? 'ok' : (medR !== null ? 'attention' : '')));
    this.elTuiles.appendChild(tuile('Taux d\'achat', faites.length ? pct(ach, faites.length) : '—', pluriel(ach, 'achetée') + ' · ' + pluriel(per, 'perdue'), ''));
    this.elTuiles.appendChild(tuile('Sans résultat', String(faites.filter(function (x) { return !x.issue; }).length), 'à indiquer par les représentants', ''));
    AMX.vider(this.elListe);
    var groupe = function (cle) {
      var g = {};
      liste.forEach(function (x) { var k = x[cle] || '—'; (g[k] = g[k] || []).push(x); });
      return Object.keys(g).map(function (k) { return { nom: k, l: g[k] }; }).sort(function (a, b) { return b.l.length - a.l.length; });
    };
    var ligneStats = function (gr, evaluateur) {
      var f = gr.l.filter(function (x) { return x.etat === 'faite'; }), r = f.filter(function (x) { return x.minutesReponse !== null && x.minutesReponse !== undefined; });
      var p = gr.l.filter(function (x) { return x.minutesPrise !== null && x.minutesPrise !== undefined; });
      var a = f.filter(function (x) { return x.issue === 'achetee'; }).length, pe = f.filter(function (x) { return x.issue === 'perdue'; }).length;
      var mp = mediane(p.map(function (x) { return x.minutesPrise; })), mr = mediane(r.map(function (x) { return x.minutesReponse; }));
      return h('tr', [h('td', { text: gr.nom }), h('td.num', { text: String(gr.l.length) }), h('td.num', { text: String(f.length) }),
        evaluateur ? h('td.num', { text: mp === null ? '—' : duree(mp) }) : h('td.num', { text: String(f.filter(function (x) { return x.issue === 'presentee'; }).length) }),
        evaluateur ? h('td.num', { text: mr === null ? '—' : duree(mr) }) : h('td.num', { text: String(f.filter(function (x) { return !x.issue; }).length) }),
        evaluateur ? h('td.num', { text: pct(r.filter(function (x) { return x.minutesReponse <= R.delai; }).length, r.length) }) : h('td.num', { text: String(pe) }),
        h('td.num', { text: String(a) }), h('td.num', [h('b', { text: f.length ? pct(a, f.length) : '—' })])]);
    };
    var table = function (titre, cle, evaluateur) {
      var tetes = evaluateur ? ['Évaluateur', 'Reçues', 'Faites', 'Prise', 'Valeur', 'Sous ' + R.delai + ' min', 'Achetées', 'Taux d\'achat'] : ['Représentant', 'Demandes', 'Valeurs', 'Présentées', 'Sans résultat', 'Perdues', 'Achetées', 'Taux d\'achat'];
      return h('div.carte', [h('div.carte-entete', [h('h3', { text: titre })]), h('div.carte-corps', { style: { overflowX: 'auto' } }, [h('table.tableau.de-stats', [h('thead', [h('tr', tetes.map(function (t, i) { return h(i ? 'th.num' : 'th', { text: t }); }))]), h('tbody', groupe(cle).map(function (gr) { return ligneStats(gr, evaluateur); }))])])]);
    };
    if (!liste.length) { this.elListe.appendChild(h('div.carte', [h('div.carte-corps', [h('p.doux', 'Aucune demande dans cette période.')])])); return; }
    this.elListe.appendChild(table('Par évaluateur', 'evaluateurNom', true));
    this.elListe.appendChild(table('Par représentant', 'demandeParNom', false));
    var raisons = {}; faites.forEach(function (x) { if (x.issue === 'perdue') { var r = String(x.issueRaison || 'Sans raison').split(' — ')[0]; raisons[r] = (raisons[r] || 0) + 1; } });
    var cles = Object.keys(raisons).sort(function (a, b) { return raisons[b] - raisons[a]; });
    this.elListe.appendChild(h('div.carte', [h('div.carte-entete', [h('h3', 'Pourquoi les clients n\'ont pas conclu')]), h('div.carte-corps', cles.length ? cles.map(function (r) {
      return h('div.de-raison', [h('span', { text: r }), h('i', [h('b', { style: { width: Math.round(100 * raisons[r] / per) + '%' } })]), h('b', { text: String(raisons[r]) })]);
    }) : [h('p.mini', 'Aucune demande perdue dans cette période.')])]));
    this.elListe.appendChild(h('p.mini', { text: 'Taux d\'achat = achetées ÷ valeurs données. Une demande est achetée quand le représentant l\'indique, ou quand le suivi de l\'évaluation dit « Repris ». Les demandes annulées ne comptent pas.' }));
  };

  AMX.evalDemandes = {
    charger: charger, enCache: function () { return cache.rep; }, demander: demander, poser: poser,
    aFairePourMoi: aFairePourMoi, pretesPourMoi: pretesPourMoi, questionsPourMoi: questionsPourMoi,
    une: function (id) { var d = cache.rep; return d ? d.demandes.filter(function (x) { return x.id === id; })[0] || null : null; },
    prendre: function (id) { return action(id, 'prendre'); },
    faite: function (id) { return action(id, 'faite'); },
    message: message, ouvrirFil: ouvrirFil, reglages: reglages, phase: phase,
    vider: function () { cache = { rep: null, quand: 0, promesse: null }; }
  };

  function injecterCss() {
    if (document.getElementById('css-demandes-eval')) return;
    var s = document.createElement('style'); s.id = 'css-demandes-eval';
    s.textContent = [
      '.de-page .mini, .de-demande .mini { font-size: 12px; color: var(--encre-3); } .de-page .mini.rouge { color: var(--rouge); font-weight: 600; }',
      '.de-page { background: var(--fond); } .de-page:fullscreen { padding: 18px 22px; overflow: auto; }',
      '.de-equipe { display: grid; gap: 8px; margin: 0 0 10px; } .de-equipe:empty { display: none; }',
      '.de-ma-dispo, .de-bande { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }',
      '.de-ma-dispo .segment button { display: inline-flex; align-items: center; gap: 6px; }',
      '.de-point { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: middle; background: var(--gris, #9AA5AE); flex: none; }',
      '.de-point.vert { background: #1E8E4A; } .de-point.ambre { background: #C98A1A; } .de-point.gris { background: #9AA5AE; }',
      '.de-puce-eval { display: inline-flex; align-items: center; border: 1px solid var(--ligne, #E3E7EB); background: var(--carte, #fff); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 13px; color: var(--encre); cursor: pointer; }',
      '.de-puce-eval:disabled { cursor: default; opacity: 1; } .de-puce-eval.attenue, .de-eval.attenue { opacity: .6; }',
      '.de-filtres { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 0 0 8px; } .de-filtres .recherche { flex: 1 1 220px; max-width: 380px; }',
      '.de-vues .compteur { margin-left: 6px; background: var(--rouge); color: #fff; border-radius: 9px; padding: 0 6px; font-size: 12px; }',
      '.de-etats { margin: 0 0 8px; }',
      '.de-tuiles .kpi.ok .valeur { color: var(--vert-fonce, #1E6B3A); }',
      '.de-liste { display: grid; gap: 10px; }',
      '.de-carte { border-radius: 12px; padding: 12px 14px; border: 1px solid var(--ligne, #E3E7EB); border-left-width: 6px; background: var(--carte, #fff); }',
      '.de-carte.afaire { background: #FDECEC; border-left-color: #D64545; } .de-carte.encours { background: #FFF4DE; border-left-color: #C98A1A; }',
      '.de-carte.faite { background: #E8F6EC; border-left-color: #1E8E4A; } .de-carte.achetee { background: #E3F2E8; border-left-color: #145C33; }',
      '.de-carte.perdue, .de-carte.echue, .de-carte.annulee { background: var(--fond-2, #F3F5F7); border-left-color: #9AA5AE; } .de-carte.annulee { opacity: .8; }',
      '.de-carte.t-rouge { box-shadow: 0 0 0 2px #D64545 inset; } .de-cible { outline: 3px solid var(--vert); outline-offset: 2px; }',
      '.de-tete { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; } .de-tete .de-quand, .de-tete .de-chrono { margin-left: auto; }',
      '.de-chrono { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; } .de-chrono.vert { color: #1E6B3A; } .de-chrono.ambre { color: #955F10; } .de-chrono.rouge { color: #B42318; }',
      '.de-progres { height: 4px; border-radius: 3px; background: rgba(0,0,0,.07); margin: 8px 0 2px; overflow: hidden; } .de-progres i { display: block; height: 100%; border-radius: 3px; }',
      '.de-progres i.vert { background: #1E8E4A; } .de-progres i.ambre { background: #C98A1A; } .de-progres i.rouge { background: #D64545; }',
      '.de-etapes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 8px 0 4px; }',
      '.de-etape { display: grid; grid-template-columns: 14px 1fr; column-gap: 6px; align-items: center; font-size: 12px; color: var(--encre-4); }',
      '.de-etape i { width: 10px; height: 10px; border-radius: 50%; border: 2px solid #B8C0C7; grid-row: span 2; } .de-etape b { font-weight: 600; } .de-etape span { grid-column: 2; font-size: 12px; }',
      '.de-etape.fait { color: var(--encre); } .de-etape.fait i { background: #1E8E4A; border-color: #1E8E4A; }',
      '.de-corps { display: flex; gap: 14px; align-items: flex-start; justify-content: space-between; margin-top: 6px; flex-wrap: wrap; }',
      '.de-note { margin-top: 4px; padding: 6px 8px; background: rgba(255,255,255,.65); border-radius: 8px; font-size: 13px; }',
      '.de-valeur { display: grid; text-align: right; } .de-valeur b { font-size: 24px; color: #1E6B3A; font-variant-numeric: tabular-nums; }',
      '.de-info { margin: 8px 0 0; padding: 8px 10px; border-radius: 8px; background: #FFF1CF; border: 1px solid #F1C66B; font-size: 13px; }',
      '.de-resultat { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 8px; }',
      '.de-resultat .btn.actif.achetee { background: #1E8E4A; border-color: #1E8E4A; color: #fff; } .de-resultat .btn.actif.perdue { background: #6B7280; border-color: #6B7280; color: #fff; } .de-resultat .btn.actif.presentee { background: var(--bleu, #1A64BF); border-color: var(--bleu, #1A64BF); color: #fff; }',
      '.de-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; align-items: center; } .de-actions .btn.actif { box-shadow: inset 0 -2px 0 var(--vert); }',
      '.de-fil { margin-top: 10px; padding: 10px; border-radius: 10px; background: rgba(255,255,255,.75); display: grid; gap: 8px; }',
      '.de-msg { padding: 6px 10px; border-radius: 10px; background: #F3F5F7; font-size: 13px; max-width: 85%; } .de-msg.representant { justify-self: end; background: #E6F0FB; } .de-msg.info { background: #FFF1CF; }',
      '.de-msg-tete { display: flex; gap: 8px; align-items: center; margin-bottom: 2px; } .de-fil-pied { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }',
      '.de-kanban { display: grid; grid-template-columns: repeat(4, minmax(200px, 1fr)); gap: 12px; align-items: start; overflow-x: auto; }',
      '.de-col { background: var(--fond-2, #F3F5F7); border-radius: 12px; padding: 10px; min-height: 120px; } .de-col-tete { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }',
      '.de-col-tete .compteur { background: var(--carte, #fff); border-radius: 9px; padding: 1px 8px; font-size: 12px; font-weight: 700; }',
      '.de-col.afaire .de-col-tete b { color: #B42318; } .de-col.encours .de-col-tete b { color: #955F10; } .de-col.faite .de-col-tete b, .de-col.conclues .de-col-tete b { color: #1E6B3A; }',
      '.de-col-corps { display: grid; gap: 8px; }',
      '.de-compact { display: grid; gap: 3px; text-align: left; width: 100%; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--ligne, #E3E7EB); border-left-width: 5px; background: var(--carte, #fff); font: inherit; cursor: pointer; }',
      '.de-compact.afaire { border-left-color: #D64545; } .de-compact.encours { border-left-color: #C98A1A; } .de-compact.faite, .de-compact.achetee { border-left-color: #1E8E4A; } .de-compact.perdue, .de-compact.echue { border-left-color: #9AA5AE; }',
      '.de-compact.t-rouge { box-shadow: 0 0 0 2px #D64545 inset; } .de-compact .de-chrono, .de-mini-valeur { font-size: 13px; } .de-mini-valeur { color: #1E6B3A; }',
      '.de-page:fullscreen .de-kanban { grid-template-columns: repeat(4, 1fr); } .de-page:fullscreen .de-compact b { font-size: 16px; } .de-page:fullscreen .de-compact .mini { font-size: 14px; }',
      '.de-stats td, .de-stats th { white-space: nowrap; }',
      '.de-raison { display: grid; grid-template-columns: minmax(160px, 1fr) 2fr 40px; gap: 10px; align-items: center; padding: 4px 0; font-size: 13px; } .de-raison i { height: 8px; background: var(--fond-2, #F3F5F7); border-radius: 4px; overflow: hidden; } .de-raison i b { display: block; height: 100%; background: #9AA5AE; }',
      '.de-grille { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; } .de-grille .champ { display: grid; gap: 4px; } .de-grille .champ > span { font-size: 12px; color: var(--encre-3); } .de-grille .large { grid-column: 1 / -1; }',
      '.de-veh { min-height: 16px; } .de-avis-eval { color: #955F10; margin-top: 4px; min-height: 0; }',
      '.de-evaluateurs, .de-raisons { display: flex; flex-wrap: wrap; gap: 8px; }',
      '.de-eval { display: grid; text-align: left; gap: 2px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--ligne, #E3E7EB); background: var(--carte, #fff); cursor: pointer; min-width: 150px; font: inherit; }',
      '.de-eval b { display: flex; align-items: center; } .de-eval span { font-size: 12px; color: var(--encre-3); } .de-eval.choisi { border-color: var(--vert); box-shadow: 0 0 0 2px var(--vert) inset; background: var(--vert-clair, #E8F6EC); }',
      '.eval-demande { padding: 10px 14px; border-radius: 10px; margin: 0 0 12px; border-left: 5px solid #D64545; background: #FDECEC; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }',
      '.eval-demande.encours { border-left-color: #C98A1A; background: #FFF4DE; } .eval-demande.faite { border-left-color: #1E8E4A; background: #E8F6EC; }',
      '@media (max-width: 900px) { .de-kanban { grid-template-columns: repeat(4, 240px); } }',
      '@media (max-width: 640px) { .de-grille { grid-template-columns: 1fr; } .de-corps { display: block; } .de-valeur { text-align: left; margin-top: 6px; } .de-etapes { grid-template-columns: 1fr 1fr; } .de-tete .de-chrono { margin-left: 0; } }'
    ].join('\n');
    document.head.appendChild(s);
  }
  injecterCss();
})();
