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

   Circuit du directeur (2 nov.) — Maxime : « le mécanisme d'évaluation qui débute par un représentant doit après être
   approuvé par un directeur, après il doit être envoyé aux évaluateurs (par texto), l'évaluation va ensuite au directeur
   qui confirme le montant et après c'est envoyé au représentant ; la demande d'évaluation doit être séparée du module
   d'évaluation car le représentant ne doit pas voir l'analyse ». Deux états de plus : « approbation » (la direction
   approuve et choisit l'évaluateur, ou refuse) et « aconfirmer » (la direction confirme ou ajuste le montant, ou renvoie
   l'évaluation à l'évaluateur). Vue « Direction » (À approuver / À confirmer) pour le DG et la direction des ventes
   (moi.diriger). Le représentant a son portail, Vente › Évaluations demandées (section evalPortail, même code en mode
   portail) : ses demandes seulement, sans lien vers l'évaluation, le montant une fois confirmé.

   Plusieurs évaluateurs (4 nov.) — Maxime : « on doit pouvoir envoyer à plus d'une personne » ; « le premier qui le
   prend » ; « le directeur ou les évaluateurs peuvent transférer l'évaluation même s'ils l'ont prise » ; la direction des
   ventes approuve et confirme sans évaluer. choixEvaluateurs() (Premier disponible, Tous les présents, ou une ou plusieurs
   personnes) sert à l'envoi par la direction, à l'approbation et au transfert (op transferer { evaluateurs }). Une demande
   prise par quelqu'un d'autre montre « Prise par … » et ne s'évalue plus ici : on la transfère.
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
    if (!force && cache.rep && Date.now() - cache.quand < AMX.dureeCopie(30000)) return Promise.resolve(cache.rep);
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
    return d.demandes.filter(function (x) { return x.deMoi && x.etat === 'faite' && !x.issue && (!cie || x.compagnie === cie) && new Date(x.confirmeLe || x.faiteLe || x.creeLe).getTime() > depuis; });
  }
  function questionsPourMoi(cie) { var d = cache.rep; if (!d) return null; return d.demandes.filter(function (x) { return x.deMoi && x.infoDemandee && (!cie || x.compagnie === cie); }); }
  /* 2 nov. : ce qui attend la direction (DG, direction des ventes) */
  function aApprouver(cie) { var d = cache.rep; if (!d || !(d.moi || {}).diriger) return []; return d.demandes.filter(function (x) { return x.etat === 'approbation' && (!cie || x.compagnie === cie); }); }
  function aConfirmer(cie) { var d = cache.rep; if (!d || !(d.moi || {}).diriger) return []; return d.demandes.filter(function (x) { return x.etat === 'aconfirmer' && (!cie || x.compagnie === cie); }); }
  /* 10 nov. (Maxime) : une demande venue de Traction reste en rouge tant que la valeur n'est pas donnée (à approuver,
     à prendre ou en évaluation). Une fois la valeur donnée, montant à confirmer compris, elle reprend ses couleurs. */
  function tractionATraiter(x) { return !!x && x.source === 'traction' && (x.etat === 'approbation' || x.etat === 'afaire' || x.etat === 'encours'); }
  function tractionsATraiter(cie) { var d = cache.rep; if (!d) return null; return d.demandes.filter(function (x) { return tractionATraiter(x) && (!cie || x.compagnie === cie); }); }

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

  /* 2 nov. (Maxime : « le vendeur remplit le détail de l'évaluation, les photos et tout ») : le représentant inscrit le client et
     l'état du véhicule dans sa demande — mêmes listes et mêmes clés que les cartes « Client et suivi » et « État du véhicule »
     de l'évaluation (AMX.evalListes, evaluation.js), qui s'en remplissent à l'ouverture. Rien sur le prix. */
  function listesEval() { return AMX.evalListes || null; }
  function libelleDe(liste, code) {
    var o = (liste || []).filter(function (x) { return (Array.isArray(x) ? x[0] : x) === code; })[0];
    return o === undefined ? String(code) : (Array.isArray(o) ? o[1] : o);
  }
  function resumeDetail(d) {
    var L = listesEval(); if (!d || !L) return '';
    var s = d.suivi || {}, e = d.etatVehicule || {}, out = [];
    if (s.transaction) out.push(libelleDe(L.transactions, s.transaction).replace(/ \(.*\)$/, ''));
    if (s.cherche) out.push('cherche : ' + s.cherche);
    if (e.general) out.push('état ' + libelleDe(L.etatGeneral, e.general).toLowerCase());
    var pn = [e.pneusEte ? 'été ' + e.pneusEte.toLowerCase() : '', e.pneusHiver ? 'hiver ' + e.pneusHiver.toLowerCase() : ''].filter(Boolean).join(', ');
    if (pn) out.push('pneus ' + pn);
    if (e.pareBrise) out.push('pare-brise ' + e.pareBrise.toLowerCase());
    if (e.accident === 'oui') out.push('accident déclaré' + (e.accidentMontant ? ' (' + argent(e.accidentMontant) + ')' : ''));
    if (e.accident === 'non') out.push('aucun accident');
    if (e.cles) out.push(libelleDe(L.cles, e.cles) + ' clé' + (e.cles === '1' || e.cles === '0' ? '' : 's'));
    if (e.financement) out.push(libelleDe(L.financement, e.financement).toLowerCase() + (e.soldePret ? ' (solde ' + argent(e.soldePret) + ')' : ''));
    if (e.carrosserie) out.push('carrosserie : ' + e.carrosserie);
    (e.constats || []).forEach(function (c) { out.push(libelleDe(L.constats, c).toLowerCase()); });
    if ((e.options || []).length) out.push(pluriel(e.options.length, 'option'));
    return out.join(' · ');
  }
  function formDetail(prefill) {
    var L = listesEval(); if (!L) return null;
    var p = prefill || {}, ps = p.suivi || {}, pe = p.etatVehicule || {};
    var choix = function (libelle, options, v) {
      var sel = h('select.saisie', [h('option', { value: '', text: '—' })].concat(options.map(function (o) { var c = Array.isArray(o) ? o[0] : o; return h('option', { value: c, text: Array.isArray(o) ? o[1] : o, selected: c === v }); })));
      return { el: h('label.champ', [h('span', libelle), sel]), input: sel };
    };
    var texte = function (libelle, v, opts) {
      var i = h('input.saisie', Object.assign({ type: 'text', value: v || '' }, opts || {}));
      return { el: h('label.champ', [h('span', libelle), i]), input: i };
    };
    var puces = function (libelle, options, ton, v) {
      var choisis = Array.isArray(v) ? v.slice() : [];
      var boutons = options.map(function (o) {
        var b = h('button.de-chip', { type: 'button', 'data-code': o[0], text: o[1], onclick: function () {
          var i = choisis.indexOf(o[0]); if (i < 0) choisis.push(o[0]); else choisis.splice(i, 1); maj();
        } });
        return b;
      });
      function maj() { boutons.forEach(function (b) { var on = choisis.indexOf(b.getAttribute('data-code')) >= 0; b.classList.toggle('actif', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
      maj();
      return { el: h('div.champ.large.de-chips.' + ton, [h('span', libelle), h('div.de-chips-l', boutons)]), get: function () { return options.map(function (o) { return o[0]; }).filter(function (c) { return choisis.indexOf(c) >= 0; }); } };
    };
    var c = {
      courriel: texte('Courriel du client', ps.courriel, { type: 'email', autocomplete: 'off' }),
      typeClient: choix('Type de client', L.typesClient, ps.typeClient), langue: choix('Langue', L.langues, ps.langue),
      origine: choix('Origine', L.origines, ps.origine), transaction: choix('Transaction', L.transactions, ps.transaction),
      cherche: texte('Ce que le client cherche', ps.cherche, { placeholder: 'VUS 2025, 450 $ / mois…' }),
      general: choix('État général', L.etatGeneral, pe.general), cles: choix('Clés', L.cles, pe.cles),
      couleurExt: texte('Couleur ext.', pe.couleurExt, { placeholder: 'Blanc' }), couleurInt: texte('Couleur int.', pe.couleurInt, { placeholder: 'Noir' }),
      pneusEte: choix('Pneus d\'été', L.pneus, pe.pneusEte), pneusHiver: choix('Pneus d\'hiver', L.pneus, pe.pneusHiver),
      pneusDim: texte('Dimension pneus', pe.pneusDim, { placeholder: '235/55R19' }), pareBrise: choix('Pare-brise', L.pareBrise, pe.pareBrise),
      accident: choix('Accident déclaré', L.accident, pe.accident), accidentMontant: texte('Montant de l\'accident ($)', pe.accidentMontant, { inputmode: 'numeric' }),
      financement: choix('Financement', L.financement, pe.financement), soldePret: texte('Solde de prêt ($)', pe.soldePret, { inputmode: 'numeric' }),
      carrosserie: texte('Carrosserie', pe.carrosserie, { placeholder: 'Égratignures, bosses…' }), voyants: texte('Voyants allumés', pe.voyants, { placeholder: 'Pression des pneus…' })
    };
    var constats = puces('Constats', L.constats, 'rouge', pe.constats), garanties = puces('Garanties', L.garanties, 'bleu', pe.garanties), options = puces('Options', L.options, 'vert', pe.options);
    var majAccident = function () { c.accidentMontant.el.style.display = c.accident.input.value === 'oui' || c.accidentMontant.input.value ? '' : 'none'; };
    c.accident.input.addEventListener('change', majAccident); majAccident();
    /* 12 nov. : repliés, ouverts seulement s'ils ont déjà quelque chose (Modifier) */
    var aDu = function (o) { return Object.keys(o || {}).some(function (k) { var v = o[k]; return Array.isArray(v) ? v.length : (v !== '' && v !== null && v !== undefined); }); };
    var el = h('div.large.de-detail-form', [
      h('details.de-detail-bloc', { open: aDu(ps) }, [h('summary', 'Le client'), h('div.de-grille', [c.courriel.el, c.typeClient.el, c.langue.el, c.origine.el, c.transaction.el, c.cherche.el])]),
      h('details.de-detail-bloc', { open: aDu(pe) }, [h('summary', 'État du véhicule'), h('div.de-grille.trois', [c.general.el, c.cles.el, c.couleurExt.el, c.couleurInt.el, c.pneusEte.el, c.pneusHiver.el, c.pneusDim.el, c.pareBrise.el,
        c.accident.el, c.accidentMontant.el, c.financement.el, c.soldePret.el, c.carrosserie.el, c.voyants.el]), constats.el, garanties.el, options.el])
    ]);
    return {
      el: el,
      get: function () {
        var v = function (k) { return String(c[k].input.value || '').trim(); };
        return { suivi: { courriel: v('courriel'), typeClient: v('typeClient'), langue: v('langue'), origine: v('origine'), transaction: v('transaction'), cherche: v('cherche') },
          etatVehicule: { general: v('general'), cles: v('cles'), couleurExt: v('couleurExt'), couleurInt: v('couleurInt'), pneusEte: v('pneusEte'), pneusHiver: v('pneusHiver'),
            pneusDim: v('pneusDim'), pareBrise: v('pareBrise'), accident: v('accident'), accidentMontant: v('accident') === 'oui' ? v('accidentMontant') : '', financement: v('financement'),
            soldePret: v('soldePret'), carrosserie: v('carrosserie'), voyants: v('voyants'), constats: constats.get(), garanties: garanties.get(), options: options.get() } };
      }
    };
  }
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
    if (x.etat === 'refusee') return 'refusee';
    if (x.etat === 'faite') return x.issue === 'achetee' ? 'achetee' : (x.issue === 'perdue' ? 'perdue' : (x.expiree ? 'echue' : 'faite'));
    return x.etat;
  }
  var PHASES = { approbation: ['À approuver', 'violet'], afaire: ['À prendre', 'rouge'], encours: ['En évaluation', 'ambre'], aconfirmer: ['Montant à confirmer', 'bleu'], faite: ['Valeur donnée', 'vert'], achetee: ['Achetée', 'vert'], perdue: ['Perdue', 'gris'], echue: ['Valeur échue', 'gris'], annulee: ['Annulée', 'gris'], refusee: ['Refusée', 'gris'] };
  /* 2 nov. : ce que lit le représentant dans son portail */
  var PHASES_PORTAIL = { approbation: 'En attente de la direction', afaire: 'Chez l\'évaluateur', encours: 'En évaluation', aconfirmer: 'À confirmer par la direction', faite: 'Valeur confirmée', refusee: 'Refusée par la direction' };
  function libellePhase(x, portail) {
    var ph = phase(x);
    if (portail && PHASES_PORTAIL[ph]) return ph === 'faite' && x.circuit !== 'directeur' ? 'Valeur donnée' : PHASES_PORTAIL[ph];
    if (ph === 'faite' && x.circuit === 'directeur') return 'Valeur confirmée';
    return PHASES[ph][0];
  }
  /* Ouverte du point de vue du représentant : tant que la valeur n'est pas donnée (direction comprise). */
  function enCours(x) { return x.etat === 'approbation' || x.etat === 'afaire' || x.etat === 'encours' || x.etat === 'aconfirmer'; }
  function attendDirection(x) { return x.etat === 'approbation' || x.etat === 'aconfirmer'; }
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
    var R = reglages(d), moiF = d.moi || {};
    /* 2 nov. : un représentant ne reçoit pas la liste des évaluateurs — la direction choisit en approuvant. */
    var sansChoix = !!moiF.representant;
    var codes = Object.keys(d.evaluateurs || {});
    if (!codes.length) codes = AMX.codesPour ? AMX.codesPour('evaluations') : Object.keys(AMX.COMPAGNIES || {});
    var cie = prefill.compagnie && codes.indexOf(prefill.compagnie) >= 0 ? prefill.compagnie : (AMX.compagnieChoisie('evaluations') || (AMX.maConcession && AMX.maConcession()) || '');
    if (codes.indexOf(cie) < 0) cie = codes.length === 1 ? codes[0] : '';
    var memoChoix = String(AMX.memo.lire('evalDemande_evaluateur', 'disponible') || 'disponible').split(',').filter(Boolean), picker = null;
    var selCie = h('select.saisie', [h('option', { value: '', text: 'Choisir la concession' })].concat(codes.map(function (c) { return h('option', { value: c, text: nomCie(c), selected: c === cie }); })));
    var inVin = h('input.saisie.mono', { type: 'text', maxlength: '17', autocomplete: 'off', spellcheck: 'false', placeholder: 'NIV (17 caractères)', value: prefill.vin || '', style: { textTransform: 'uppercase' } });
    var elVeh = h('div.mini.de-veh', { text: prefill.vehicule || '' });
    var inKm = h('input.saisie', { type: 'text', inputmode: 'numeric', placeholder: 'Kilométrage', value: prefill.km || '' });
    var inClient = h('input.saisie', { type: 'text', placeholder: 'Nom du client', value: prefill.client || '' });
    var inTel = h('input.saisie', { type: 'tel', placeholder: 'Téléphone (facultatif)', value: prefill.telephone || '' });
    var inNote = h('textarea.saisie', { rows: '2', placeholder: 'Note pour l\'évaluateur (facultatif) : options, dommages, ce que le client espère…' });
    inNote.value = prefill.note || '';
    var inPhotos = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });
    var elPhotos = h('span.mini', { text: 'aucune photo' });
    var btnPhotos = h('button.btn.de-photos-btn', { type: 'button', html: I.photo + '<span>Prendre ou ajouter des photos</span>', onclick: function () { inPhotos.click(); } });
    var detail = formDetail(prefill.detail);
    inPhotos.onchange = function () { var n = inPhotos.files.length; elPhotos.textContent = n ? n + ' photo' + (n > 1 ? 's' : '') + ' prête' + (n > 1 ? 's' : '') : 'aucune photo'; };
    var elEval = h('div.de-evaluateurs'), elAvis = h('div.mini.de-avis-eval'), elChoixRes = null;
    var resumeChoix = function () {
      if (!elChoixRes) return;
      var v = picker ? picker.valeur() : ['disponible'], liste = d.evaluateurs[selCie.value] || [];
      elChoixRes.textContent = v[0] === 'disponible' ? 'premier disponible' : liste.filter(function (e) { return v.indexOf(e.courriel) >= 0; }).map(function (e) { return e.nom; }).join(', ');
    };
    var dessinerEvaluateurs = function () {
      AMX.vider(elEval); elAvis.textContent = ''; picker = null;
      if (sansChoix) return;
      var liste = (d.evaluateurs[selCie.value] || []);
      if (!selCie.value) { elEval.appendChild(h('span.mini', 'Choisissez d\'abord la concession.')); return; }
      if (!liste.length) { elEval.appendChild(h('span.mini', { style: { color: 'var(--rouge)' }, text: 'Aucun évaluateur pour cette concession : la direction coche le droit « Évaluateur » dans Admin.' })); return; }
      /* 4 nov. : une ou plusieurs personnes — le premier qui la prend la fait */
      picker = choixEvaluateurs(liste, memoChoix, { maxOuvertes: R.maxOuvertes, surChange: resumeChoix });
      elEval.appendChild(picker.el);
      resumeChoix();
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
    /* 12 nov. (Maxime : « le processus d'évaluation est compliqué… Torque est plus simple ; ça doit être facile de faire la
       demande ») : quatre choses à l'écran — le NIV, le km, les photos, le client. Le reste (note, client en détail, état du
       véhicule, options) est replié sous « Ajouter des détails » ; l'évaluateur est « Premier disponible » sauf si la
       direction l'ouvre. Aucune phrase d'explication. */
    var elDetails = h('details.de-plus', [h('summary', 'Ajouter des détails (facultatif)'), h('div.de-grille', [h('label.champ.large', [h('span', 'Note pour l\'évaluateur'), inNote]), detail ? detail.el : null])]);
    if (prefill.note || (prefill.detail && resumeDetail(prefill.detail))) elDetails.open = true;
    var elChoix = sansChoix ? null : h('details.de-plus', [h('summary', [h('span', 'Évaluateur : '), elChoixRes = h('b', { text: 'premier disponible' })]), h('div', [elEval, elAvis])]);
    corps.appendChild(h('div.de-grille.de-court', [
      codes.length > 1 && !cie ? h('label.champ.large', [h('span', 'Concession'), selCie]) : null,
      h('label.champ', [h('span', 'NIV'), inVin, elVeh]),
      h('label.champ', [h('span', 'Kilométrage'), inKm]),
      h('div.champ.large', [h('span', 'Photos'), h('div.de-photos-ligne', [btnPhotos, elPhotos, inPhotos])]),
      h('label.champ', [h('span', 'Client'), inClient]),
      h('label.champ', [h('span', 'Téléphone'), inTel]),
      h('div.large', [elDetails, elChoix])
    ]));
    if (codes.length > 1 && cie) corps.insertBefore(h('p.de-cie-ligne', [h('span', { text: nomCie(cie) }), h('button.lien', { type: 'button', text: 'changer', onclick: function (e) { e.target.parentNode.replaceWith(h('label.champ', [h('span', 'Concession'), selCie])); } })]), corps.firstChild);
    dessinerEvaluateurs();
    var envoyer = function () {
      var vin = inVin.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (!selCie.value) { AMX.toast('Choisissez la concession.', 'attention'); return false; }
      if (!vinValide(vin)) { AMX.toast('NIV invalide : 17 caractères (sans I, O ni Q).', 'attention'); inVin.focus(); return false; }
      if (!sansChoix && !(d.evaluateurs[selCie.value] || []).length) { AMX.toast('Aucun évaluateur pour cette concession.', 'erreur'); return false; }
      var fichiers = [].slice.call(inPhotos.files || []);
      var choisis = picker ? picker.valeur() : ['disponible'];
      if (!sansChoix) AMX.memo.ecrire('evalDemande_evaluateur', choisis.join(','));
      return AMX.post({ action: 'evalDemander', compagnie: selCie.value, vin: vin, km: inKm.value, client: inClient.value, telephone: inTel.value, note: inNote.value, photos: fichiers.length,
        annee: elVeh.dataset.annee || '', marque: elVeh.dataset.marque || '', modele: elVeh.dataset.modele || '', evaluateur: sansChoix ? 'disponible' : choisis.join(','), evaluateurs: sansChoix ? [] : choisis,
        detail: detail ? detail.get() : null }, { secours: false, delai: 60000 }).then(function (x) {
        if (!x || x.refuse || x.ok === false) throw new Error((x && x.erreur) || 'Refusé');
        if (!x.demande) throw new Error(SCRIPT_PAS_A_JOUR);
        poser(x.demande);
        AMX.toast(x.message || 'Demande envoyée', x.deja || /absent/.test(x.message || '') ? 'attention' : 'ok', 6000);
        if (fichiers.length && !x.deja) envoyerPhotos(vin, fichiers);
        if (prefill.apres) prefill.apres(x.demande);
      }).catch(function (e) { erreur(e); return false; });
    };
    if (m.boutons) m.boutons([{ texte: 'Annuler' }, { texte: 'Envoyer la demande', classe: 'primaire', action: function () { return envoyer(); } }]);
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
  function droits(x, d, portail) {
    var moi = (d && d.moi) || {}, ouverte = estOuverte(x);
    return {
      /* 4 nov. : la direction des ventes n'évalue pas (droit « Évaluateur » seulement) ; une demande prise par quelqu'un
         d'autre ne s'évalue pas ici (on la transfère) */
      evaluer: !portail && ouverte && !priseParAutre(x) && (x.pourMoi || (moi.evaluateur && !x.deMoi)),
      prendre: !portail && x.etat === 'afaire' && !x.pourMoi && !x.deMoi && !priseParAutre(x) && !!moi.evaluateur,
      piloter: enCours(x) && (x.deMoi || moi.direction),
      transferer: !portail && (ouverte || (x.etat === 'approbation' && !!moi.diriger)) && (moi.direction || moi.evaluateur || x.pourMoi),
      resultat: x.etat === 'faite' && (x.deMoi || x.pourMoi || moi.direction),
      reevaluer: (x.etat === 'faite' || x.etat === 'annulee' || x.etat === 'refusee') && !x.remplaceePar && (x.deMoi || moi.direction),
      ecrire: x.deMoi || x.pourMoi || moi.direction || moi.evaluateur,
      question: !portail && ouverte && !x.deMoi && (x.pourMoi || moi.evaluateur || moi.direction),
      /* 2 nov. : le circuit du directeur */
      approuver: !portail && x.etat === 'approbation' && !!moi.diriger,
      confirmer: !portail && x.etat === 'aconfirmer' && !!moi.diriger,
      voirEvaluation: !portail && !!x.lien && (x.etat === 'faite' || x.etat === 'aconfirmer'),
      /* 12 nov. (suggestion S8DC45A94DF) : rouvrir sa demande pour la corriger (km, note, client, état, photos) */
      modifier: x.etat !== 'annulee' && x.etat !== 'refusee' && (x.deMoi || !!moi.direction),
      /* 12 nov. (Maxime) : corriger le montant déjà donné en cliquant sur l'évaluation — la direction ; l'évaluateur quand la
         demande n'a pas de circuit */
      modifierValeur: !portail && x.etat === 'faite' && (!!moi.diriger || (x.circuit !== 'directeur' && (x.pourMoi || !!moi.evaluateur)))
    };
  }
  function priseParAutre(x) { return !!x.prise && !x.pourMoi; }
  /* « Claude, Tristan (le premier qui la prend) » ; « Tristan (l'a prise) » ; un seul : son nom. */
  function texteEvaluateurs(x) {
    var dest = x.destinataires || [];
    if (x.prise) return (x.prisParNom || x.evaluateurNom || '—') + ' (l\'a prise)';
    if (dest.length > 1) return dest.map(function (e) { return e.nom; }).join(', ') + ' (le premier qui la prend)';
    return x.evaluateurNom || (dest[0] && dest[0].nom) || '—';
  }
  /* 12 nov. (Maxime : « ça doit être facile de faire la demande, la consulter, l'envoyer, la recevoir ») : chaque demande a
     au plus UN geste pour la personne qui la regarde — le gros bouton de sa ligne et de sa fiche. Tout le reste est dans
     « Actions ». null = rien à faire pour moi. */
  function monAction(x, d, portail) {
    var dr = droits(x, d, portail);
    if (dr.approuver) return { texte: 'Approuver', faire: function () { approuver(x, d); } };
    if (dr.confirmer) return { texte: 'Confirmer le montant', faire: function () { confirmerMontant(x); } };
    if (dr.evaluer) return { texte: x.etat === 'afaire' ? 'Prendre et évaluer' : 'Évaluer', faire: function () { evaluer(x); } };
    if (x.deMoi && x.infoDemandee) return { texte: 'Répondre', faire: function () { ficheDemande(x, { fil: true, portail: portail }); } };
    if (dr.resultat && x.deMoi && !x.issue && !x.expiree) return { texte: 'Indiquer le résultat', faire: function () { ficheDemande(x, { portail: portail }); } };
    return null;
  }
  /* La ligne d'avancement d'une demande (même dessin que le Suivi service) */
  function pasDe(x) {
    var circuit = x.circuit === 'directeur', evaluee = x.etat === 'faite' || x.etat === 'aconfirmer', ouverte = x.etat === 'afaire' || x.etat === 'encours';
    var pas = [{ court: 'Demandée', titre: 'Demandée ' + quand(x.creeLe) + (x.demandeParNom ? ' par ' + x.demandeParNom : ''), etat: 'fait' }];
    if (circuit) pas.push({ court: x.etat === 'refusee' ? 'Refusée' : 'Approuvée', titre: x.approuveLe ? 'Approuvée ' + quand(x.approuveLe) + (x.approuveParNom ? ' par ' + x.approuveParNom : '') : 'Approbation de la direction',
      etat: x.etat === 'refusee' ? 'refuse' : (x.approuveLe || ouverte || evaluee ? 'fait' : (x.etat === 'approbation' ? 'encours' : 'afaire')) });
    pas.push({ court: 'Évaluée', titre: x.faiteLe ? 'Évaluée ' + quand(x.faiteLe) + (x.faitePar ? ' par ' + x.faitePar : '') : 'Évaluation', etat: evaluee ? 'fait' : (ouverte ? 'encours' : 'afaire') });
    if (circuit) pas.push({ court: 'Confirmée', titre: x.confirmeLe ? 'Montant confirmé ' + quand(x.confirmeLe) + (x.confirmeParNom ? ' par ' + x.confirmeParNom : '') : 'Confirmation du montant', etat: x.etat === 'faite' ? 'fait' : (x.etat === 'aconfirmer' ? 'encours' : 'afaire') });
    pas.push({ court: x.issue ? ISSUES[x.issue] : 'Résultat', titre: x.issue ? ISSUES[x.issue] : 'Achetée ou perdue', etat: x.issue ? (x.issue === 'perdue' ? 'refuse' : 'fait') : (x.etat === 'faite' ? 'encours' : 'afaire') });
    if (x.etat === 'annulee') pas.forEach(function (p) { if (p.etat !== 'fait') p.etat = 'saute'; });
    var cour = pas.filter(function (p) { return p.etat === 'encours'; })[0]; if (cour) cour.courante = true;
    return pas;
  }
  function evaluer(x) {
    var aller = function () { AMX.aller('outils', 'evaluation', { vin: x.vin, demande: x.id }); };
    /* 4 nov. : le premier qui la prend la fait — arrivé deuxième, on ne va pas plus loin */
    if (x.etat === 'afaire') action(x.id, 'prendre').then(aller).catch(function (e) { erreur(e); if (!/Déjà prise/.test((e && e.message) || '')) aller(); else charger(true); });
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
  /* 12 nov. (suggestion S8DC45A94DF, Gabriel, BMW : « pouvoir réouvrir les évaluations une fois envoyées pour modifier ou corriger —
     ajouter des photos, une mention, ajuster le kilométrage ») : la même fenêtre que la demande, remplie. Rien n'est envoyé :
     le changement s'écrit dans le fil de la demande, que l'évaluateur voit ; les photos vont au NIV. */
  function modifier(x) {
    injecterCss();
    var inKm = h('input.saisie', { type: 'text', inputmode: 'numeric', placeholder: 'Kilométrage', value: x.km || '' });
    var inClient = h('input.saisie', { type: 'text', placeholder: 'Nom du client', value: x.client || '' });
    var inTel = h('input.saisie', { type: 'tel', placeholder: 'Téléphone (facultatif)', value: x.telephone || '' });
    var inNote = h('textarea.saisie', { rows: '3', placeholder: 'Note pour l\'évaluateur : options, dommages, ce que le client espère…' });
    inNote.value = x.note || '';
    var inPhotos = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });
    var elPhotos = h('span.mini', { text: x.photos ? x.photos + ' photo' + (x.photos > 1 ? 's' : '') + ' déjà jointe' + (x.photos > 1 ? 's' : '') : 'aucune photo' });
    inPhotos.onchange = function () { var n = inPhotos.files.length; elPhotos.textContent = n ? n + ' photo' + (n > 1 ? 's' : '') + ' à ajouter' : (x.photos ? x.photos + ' déjà jointe(s)' : 'aucune photo'); };
    var detail = formDetail(x.detail);
    var valeurDonnee = x.etat === 'faite' || x.etat === 'aconfirmer';
    AMX.modale({ titre: 'Modifier la demande — ' + (x.vehicule || x.vin), large: true, corps: h('div.de-demande', [
      h('p.mini', { text: valeurDonnee ? 'La valeur est déjà donnée : ce que vous changez s\'ajoute à la demande, la valeur reste la même. Si le kilométrage ou l\'état change beaucoup, demandez plutôt une réévaluation.'
        : 'Ce que vous changez s\'ajoute au fil de la demande : l\'évaluateur le voit. Rien n\'est envoyé par texto.' }),
      h('div.de-grille', [
        h('label.champ', [h('span', 'Kilométrage'), inKm]),
        h('label.champ', [h('span', 'Client'), inClient]),
        h('label.champ', [h('span', 'Téléphone du client'), inTel]),
        detail ? detail.el : null,
        h('div.champ.large', [h('span', 'Ajouter des photos'), h('div.actions-ligne', { style: { alignItems: 'center', gap: '10px' } }, [
          h('button.btn.petit', { type: 'button', html: I.photo + '<span>Choisir des photos</span>', onclick: function () { inPhotos.click(); } }), elPhotos, inPhotos])]),
        h('label.champ.large', [h('span', 'Note pour l\'évaluateur'), inNote])])]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer les changements', classe: 'primaire', action: function () {
        var fichiers = [].slice.call(inPhotos.files || []);
        var corps = { km: inKm.value, client: inClient.value, telephone: inTel.value, note: inNote.value, photosAjoutees: fichiers.length };
        if (detail) corps.detail = detail.get();
        return action(x.id, 'modifier', corps).then(function (r) {
          AMX.toast(r.message || 'Demande modifiée', r.kmApresValeur ? 'attention' : 'ok', r.kmApresValeur ? 9000 : 5000);
          if (fichiers.length) envoyerPhotos(x.vin, fichiers);
        }).catch(function (e) { erreur(e); return false; });
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
  /* 4 nov. (Maxime) : « le directeur ou les évaluateurs peuvent transférer l'évaluation même s'ils l'ont prise » — à une ou
     plusieurs personnes ; la demande repart (texto aux nouveaux), le premier qui la prend la fait. */
  function transferer(x, d) {
    var moiC = String(((d && d.moi) || {}).courriel || '').toLowerCase();
    var liste = (((d && d.evaluateurs) || {})[x.compagnie] || []).filter(function (e) { return e.courriel !== moiC && !(x.prise && e.courriel === x.evaluateur); });
    if (!liste.length) { AMX.toast('Aucun autre évaluateur pour cette concession.', 'attention'); return; }
    var avant = x.etat === 'approbation';
    var picker = choixEvaluateurs(liste, avant ? (x.destinataires || []).map(function (e) { return e.courriel; }) : [], {});
    AMX.modale({ titre: (avant ? 'Évaluateurs proposés — ' : 'Transférer ') + (x.vehicule || x.id), corps: h('div', [
      h('p.mini', { text: avant ? 'La demande attend toujours votre approbation : rien ne part tout de suite.'
        : (x.prise ? (x.prisParNom || 'L\'évaluateur') + ' l\'a prise ; ' : '') + 'les personnes choisies reçoivent un texto (ou un courriel) ; la première qui la prend la fait.' }),
      picker.el]),
      boutons: [{ texte: 'Annuler' }, { texte: avant ? 'Enregistrer' : 'Transférer', classe: 'primaire', action: function () {
        var v = picker.valeur();
        return action(x.id, 'transferer', { evaluateurs: v, evaluateur: v.join(',') }).then(function (r) { AMX.toast(r.message, 'ok', 6000); }).catch(function (e) { erreur(e); return false; });
      } }] });
  }
  /* 4 nov. : choisir un ou plusieurs évaluateurs. « Premier disponible » est seul ; sinon on coche une ou plusieurs
     personnes (« Tous les présents » d'un clic). Renvoie { el, valeur() } : ['disponible'] ou les courriels choisis. */
  function choixEvaluateurs(liste, depart, opts) {
    opts = opts || {};
    var choisis = (depart || []).filter(function (c) { return c === 'disponible' || liste.some(function (e) { return e.courriel === c; }); });
    if (!choisis.length || choisis.indexOf('disponible') >= 0) choisis = ['disponible'];
    var presents = liste.filter(function (e) { return !e.groupe && e.presence !== 'absent'; });
    var grille = h('div.de-evaluateurs'), avis = h('div.mini.de-avis-eval'), el = h('div', [grille, avis]);
    var basculer = function (val) {
      if (val === 'disponible') choisis = ['disponible'];
      else if (val === 'tous') choisis = presents.map(function (e) { return e.courriel; });
      else {
        if (choisis[0] === 'disponible') choisis = [];
        var i = choisis.indexOf(val); if (i >= 0) choisis.splice(i, 1); else choisis.push(val);
        if (!choisis.length) choisis = ['disponible'];
      }
      dessiner();
      if (opts.surChange) opts.surChange();
    };
    var dessiner = function () {
      AMX.vider(grille);
      var dispo = choisis[0] === 'disponible';
      var tous = presents.length > 1 && choisis.length === presents.length && presents.every(function (e) { return choisis.indexOf(e.courriel) >= 0; });
      var bouton = function (val, titre, sous, ton, on, attenue) {
        return h('button.de-eval' + (on ? '.choisi' : '') + (attenue ? '.attenue' : ''), { type: 'button', 'aria-pressed': String(on), onclick: function () { basculer(val); } }, [h('b', [ton ? h('i.de-point.' + ton) : null, titre]), h('span', { text: sous })]);
      };
      grille.appendChild(bouton('disponible', 'Premier disponible', presents.length ? 'saute les absents, le moins occupé' : 'personne n\'est disponible : le moins chargé', presents.length ? 'vert' : 'gris', dispo));
      if (presents.length > 1) grille.appendChild(bouton('tous', 'Tous les présents (' + presents.length + ')', 'le premier qui la prend la fait', null, tous));
      liste.forEach(function (e) {
        var sous = [textePresence(e), e.ouvertes ? e.ouvertes + ' en cours' : 'libre', e.groupe ? 'groupe' : ''].filter(Boolean).join(' · ');
        grille.appendChild(bouton(e.courriel, e.nom, sous, TON_PRESENCE[e.presence || 'disponible'], !dispo && choisis.indexOf(e.courriel) >= 0, e.presence === 'absent'));
      });
      var noms = liste.filter(function (e) { return choisis.indexOf(e.courriel) >= 0; });
      var absents = noms.filter(function (e) { return e.presence === 'absent'; }).map(function (e) { return e.nom; });
      var pleins = noms.filter(function (e) { return opts.maxOuvertes && e.ouvertes >= opts.maxOuvertes; }).map(function (e) { return e.nom; });
      avis.textContent = noms.length > 1 ? noms.length + ' évaluateurs reçoivent le texto : le premier qui la prend la fait.' + (absents.length ? ' (' + absents.join(', ') + ' : absent)' : '')
        : (absents.length ? absents[0] + ' est indiqué absent : la demande partira quand même, mais elle risque d\'attendre.' : (pleins.length ? pleins[0] + ' a déjà plusieurs demandes en cours.' : ''));
    };
    dessiner();
    return { el: el, valeur: function () { return choisis.slice(); } };
  }
  function message(id, texte, info) { return action(id, 'message', { texte: texte, info: !!info }); }

  /* ------------------------------ Circuit du directeur (2 nov.) ------------------------------ */
  function approuver(x, d) {
    /* 4 nov. : un ou plusieurs évaluateurs (le premier qui la prend la fait) ; par défaut ceux proposés à l'envoi. */
    var liste = ((d && d.evaluateurs) || {})[x.compagnie] || [];
    var proposes = (x.destinataires || []).map(function (e) { return e.courriel; }).filter(Boolean);
    var picker = choixEvaluateurs(liste, proposes.length ? proposes : ['disponible'], { maxOuvertes: reglages(d).maxOuvertes });
    AMX.modale({ titre: 'Approuver la demande', corps: h('div', [
      h('p', [h('b', { text: x.vehicule || x.vin }), h('span.mini', { text: (x.vehicule ? ' · ' + x.vin : '') + (x.km ? ' · ' + AMX.fmtNombre(Number(x.km)) + ' km' : '') })]),
      h('p.mini', { text: 'Demandée par ' + (x.demandeParNom || '—') + (x.client ? ' pour ' + x.client : '') + ' · ' + quand(x.creeLe) }),
      x.note ? h('div.de-note', { text: x.note }) : null,
      h('p.mini', { style: { marginTop: '10px' }, text: 'Vous approuvez sans évaluer. Choisissez un ou plusieurs évaluateurs : chacun reçoit un texto (ou un courriel) ; le premier qui la prend la fait, puis le montant vous revient pour confirmation.' }),
      picker.el]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Approuver et envoyer', classe: 'primaire', action: function () {
        var v = picker.valeur();
        return action(x.id, 'approuver', { evaluateurs: v, evaluateur: v.join(',') }).then(function (r) { AMX.toast(r.message || 'Approuvée', /absent/.test(r.message || '') ? 'attention' : 'ok', 6000); }).catch(function (e) { erreur(e); return false; });
      } }] });
  }
  function refuser(x) {
    var inRaison = h('textarea.saisie', { rows: '2', placeholder: 'Pourquoi ? (visible par le représentant — facultatif)', maxlength: '200' });
    AMX.modale({ titre: 'Refuser la demande', corps: h('div.de-grille', [h('p.mini.large', { text: (x.vehicule || x.vin) + ' — demandée par ' + (x.demandeParNom || '—') + '. Le représentant voit le refus dans ses demandes (aucun texto).' }), h('label.champ.large', [h('span', 'Raison'), inRaison])]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Refuser la demande', classe: 'danger', action: function () {
        return action(x.id, 'refuser', { raison: inRaison.value }).then(function (r) { AMX.toast(r.message || 'Refusée', 'ok'); }).catch(function (e) { erreur(e); return false; });
      } }] });
  }
  function confirmerMontant(x) {
    var valEv = Number(x.valeurEvaluateur) || 0;
    var inVal = h('input.saisie', { type: 'text', inputmode: 'numeric', value: valEv ? String(valEv) : '', placeholder: 'Montant ($)' });
    var inNote = h('input.saisie', { type: 'text', maxlength: '300', placeholder: 'Note au représentant (facultatif) : ce qui a fait baisser la valeur, conditions…' });
    var elEcart = h('p.mini');
    var majEcart = function () {
      var v = Math.round(parseFloat(String(inVal.value).replace(/[^\d.,]/g, '').replace(',', '.')) || 0);
      /* 4 nov. (Maxime) : une hausse part d'office par texto à Marc-André Mongeon */
      elEcart.textContent = valEv && v && v !== valEv ? 'Ajusté : ' + (v > valEv ? '+' : '−') + argent(Math.abs(v - valEv)) + ' par rapport à l\'évaluateur.' + (v > valEv ? ' Une hausse envoie un texto à Marc-André Mongeon.' : '') : '';
      elEcart.classList.toggle('de-hausse', !!(valEv && v > valEv));
    };
    inVal.addEventListener('input', majEcart);
    AMX.modale({ titre: 'Confirmer le montant', corps: h('div.de-grille', [
      h('div.large', [h('b', { text: x.vehicule || x.vin }), h('span.mini', { text: (x.vehicule ? ' · ' + x.vin : '') + (x.client ? ' · ' + x.client : '') })]),
      h('p.mini.large', { text: 'Évaluée par ' + (x.faitePar || x.evaluateurNom || '—') + (valEv ? ' : ' + argent(valEv) : '') + '. Une fois confirmé, le montant part à ' + (x.demandeParNom || 'le représentant') + ' par texto (courriel s\'il n\'a pas de cellulaire) ; il vaut ' + reglages().validite + ' jours.' }),
      h('label.champ', [h('span', 'Montant confirmé'), inVal]), h('div.champ', [h('span', '\u00a0'), elEcart]),
      h('label.champ.large', [h('span', 'Note'), inNote])]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Confirmer et envoyer', classe: 'primaire', action: function () {
        var v = Math.round(parseFloat(String(inVal.value).replace(/[^\d.,]/g, '').replace(',', '.')) || 0);
        if (!v) { AMX.toast('Indiquez le montant.', 'attention'); inVal.focus(); return false; }
        return montantPlausible(v, valEv).then(function (oui) {
          if (!oui) { inVal.focus(); inVal.select(); return false; }
          return action(x.id, 'confirmer', { valeur: v, note: inNote.value }).then(function (r) { AMX.toast(r.message || 'Montant confirmé', 'ok', 6000); }).catch(function (e) { erreur(e); return false; });
        });
      } }] });
    setTimeout(function () { inVal.focus(); inVal.select(); }, 60);
  }
  /* 12 nov. (DE-117 : 1 $ confirmé pour une évaluation de 33 000 $) : sous 100 $, refusé ; sous la moitié de la valeur de
     l'évaluateur, on demande de confirmer le montant tapé. Renvoie une promesse : vrai = on envoie. */
  var MONTANT_MIN = 100;
  function montantPlausible(v, valEv) {
    if (v < MONTANT_MIN) { AMX.toast('Montant trop bas (' + argent(v) + ') : vérifiez le montant.', 'erreur', 6000); return Promise.resolve(false); }
    if (valEv && v < valEv / 2 && AMX.confirmer) return AMX.confirmer('Montant beaucoup plus bas', 'Vous inscrivez ' + argent(v) + ' alors que l\'évaluation est à ' + argent(valEv) + '. C\'est bien le montant voulu ?', { ok: 'Oui, ' + argent(v) });
    return Promise.resolve(true);
  }
  /* 12 nov. (Maxime) : « on doit pouvoir modifier le prix donné quand on clique directement sur l'évaluation » */
  function modifierMontant(x) {
    var actuel = Number(x.valeur) || 0, valEv = Number(x.valeurEvaluateur) || 0, circuit = x.circuit === 'directeur';
    var inVal = h('input.saisie', { type: 'text', inputmode: 'numeric', value: actuel ? String(actuel) : '', placeholder: 'Montant ($)' });
    var inNote = h('input.saisie', { type: 'text', maxlength: '300', placeholder: 'Pourquoi (facultatif) : le représentant le voit' });
    var caseAviser = h('input', { type: 'checkbox', checked: true });
    var lignes = [
      h('div.large', [h('b', { text: x.vehicule || x.vin }), h('span.mini', { text: (x.vehicule ? ' · ' + x.vin : '') + (x.client ? ' · ' + x.client : '') })]),
      h('p.mini.large', { text: 'Montant donné : ' + (actuel ? argent(actuel) : '—') + (valEv && valEv !== actuel ? ' · évaluateur : ' + argent(valEv) : '') + '.' }),
      h('label.champ', [h('span', 'Nouveau montant'), inVal]),
      h('label.champ.large', [h('span', 'Note'), inNote])
    ];
    if (circuit && x.demandeParNom) lignes.push(h('label.case.large', [caseAviser, h('span', { text: 'Envoyer le nouveau montant à ' + x.demandeParNom + ' (texto, sinon courriel)' })]));
    AMX.modale({ titre: 'Modifier le montant', corps: h('div.de-grille', lignes),
      boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer le montant', classe: 'primaire', action: function () {
        var v = Math.round(parseFloat(String(inVal.value).replace(/[^\d.,]/g, '').replace(',', '.')) || 0);
        if (!v) { AMX.toast('Indiquez le nouveau montant.', 'attention'); inVal.focus(); return false; }
        return montantPlausible(v, valEv || actuel).then(function (oui) {
          if (!oui) { inVal.focus(); inVal.select(); return false; }
          return action(x.id, 'valeur', { valeur: v, note: inNote.value, aviser: !!(circuit && caseAviser.checked) })
            .then(function (r) { AMX.toast(r.message || 'Montant modifié', 'ok', 7000); })
            .catch(function (e) { erreur(e); return false; });
        });
      } }] });
    setTimeout(function () { inVal.focus(); inVal.select(); }, 60);
  }
  function renvoyer(x) {
    var inRaison = h('textarea.saisie', { rows: '2', placeholder: 'Ce qu\'il faut revoir (l\'évaluateur le reçoit par texto)', maxlength: '300' });
    AMX.modale({ titre: 'Renvoyer à l\'évaluateur', corps: h('div.de-grille', [h('p.mini.large', { text: (x.vehicule || x.vin) + ' — l\'évaluation repart chez ' + (x.evaluateurNom || 'l\'évaluateur') + ', qui devra l\'enregistrer de nouveau.' }), h('label.champ.large', [h('span', 'Raison'), inRaison])]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Renvoyer', classe: 'primaire', action: function () {
        if (!inRaison.value.trim()) { AMX.toast('Dites à l\'évaluateur ce qu\'il faut revoir.', 'attention'); inRaison.focus(); return false; }
        return action(x.id, 'renvoyer', { raison: inRaison.value }).then(function (r) { AMX.toast(r.message || 'Renvoyée', 'ok'); }).catch(function (e) { erreur(e); return false; });
      } }] });
  }


  /* ------------------------------ Fiche simple ------------------------------
     7 nov. (Marc-André Mongeon, S975B1EEB6A) : « le visuel des évaluations par courriel / texto : beaucoup trop de contenu,
     difficile à lire ; avec Torque il y a seulement le nécessaire, pas tout le contenu des coûts ». Le lien d'un courriel
     ou d'un texto (?id=) ouvre maintenant cette fiche : photos, véhicule, la valeur, l'état, le client, et les gestes de la
     direction. Pas de comparables ni d'analyses : « Évaluation complète » ouvre la page entière. Jamais pour un
     représentant (il n'a que son portail) : l'évaluation n'est lue que si le compte voit les évaluations. */
  function libListe(liste, code) {
    var x = (liste || []).filter(function (e) { return (Array.isArray(e) ? e[0] : e) === code; })[0];
    return x ? (Array.isArray(x) ? x[1] : x) : (code || '');
  }
  function ficheChamp(nom, valeur, ton) {
    if (valeur === '' || valeur === null || valeur === undefined) return null;
    return h('div.fe-champ' + (ton ? '.' + ton : ''), [h('span', { text: nom }), h('b', { text: String(valeur) })]);
  }
  function fichePastilles(titre, codes, liste) {
    codes = (codes || []).filter(Boolean);
    if (!codes.length) return null;
    return h('div.fe-ligne', [h('span.fe-l', { text: titre }), h('div.fe-puces', codes.map(function (c) { return h('span.puce', { text: libListe(liste, c) }); }))]);
  }
  function fichePhotos(el, x) {
    var vin = x.vin, liste = [];
    ((x.crm && x.crm.photos) || []).forEach(function (u) { if (/^https:/.test(String(u))) liste.push({ url: String(u), petit: String(u) }); });
    var montrer = function () {
      AMX.vider(el);
      if (!liste.length) { el.appendChild(h('div.fe-sans-photo', { text: x.photos ? x.photos + ' photo(s) prise(s) — chargement…' : 'Aucune photo pour ce NIV' })); return; }
      var grand = h('img.fe-grande', { src: liste[0].grand || liste[0].url, alt: 'Photo du véhicule' });
      var lienGrand = h('a.fe-grande-lien', { href: liste[0].url, target: '_blank', rel: 'noopener', title: 'Ouvrir la photo' }, [grand]);
      el.appendChild(lienGrand);
      if (liste.length > 1) el.appendChild(h('div.fe-bande', liste.slice(0, 12).map(function (ph, i) {
        return h('button.fe-vignette' + (i === 0 ? '.actif' : ''), { type: 'button', 'aria-label': 'Photo ' + (i + 1), onclick: function (e) {
          grand.src = ph.grand || ph.url; lienGrand.href = ph.url;
          [].forEach.call(el.querySelectorAll('.fe-vignette'), function (b) { b.classList.remove('actif'); }); e.currentTarget.classList.add('actif');
        } }, [h('img', { src: ph.petit || ph.url, alt: '', loading: 'lazy' })]);
      })));
    };
    montrer();
    if (typeof AMX.photosDe === 'function' && vin) AMX.photosDe(vin).then(function (p) {
      (p || []).forEach(function (q) { var u = typeof q === 'string' ? q : (q && q.url) || ''; if (!u) return; liste.push({ url: u, grand: AMX.vignetteDrive ? AMX.vignetteDrive(u, 1000) : u, petit: AMX.vignetteDrive ? AMX.vignetteDrive(u, 200) : u }); });
      if (!liste.length) x = Object.assign({}, x, { photos: 0 });
      montrer();
    }).catch(function () { x = Object.assign({}, x, { photos: 0 }); montrer(); });
  }
  function ficheEtat(ev, detail) {
    var e = Object.assign({}, (detail && detail.etatVehicule) || {}, (ev && ev.etatVehicule) || {});
    var L = AMX.evalListes || {};
    var acc = e.accident ? libListe(L.accident, e.accident) + (e.accident === 'oui' && e.accidentMontant ? ' (' + argent(e.accidentMontant) + ')' : '') : '';
    var champs = [
      ficheChamp('État général', e.general ? libListe(L.etatGeneral, e.general) : (ev && ev.etat) || ''),
      ficheChamp('Pneus d\'été', e.pneusEte), ficheChamp('Pneus d\'hiver', e.pneusHiver),
      ficheChamp('Pare-brise', e.pareBrise || (ev && ev.pareBrise) || ''),
      ficheChamp('Accident', acc || (ev && ev.accident) || '', e.accident === 'oui' ? 'rouge' : ''),
      ficheChamp('Clés', e.cles ? libListe(L.cles, e.cles) : ''),
      ficheChamp('Couleur', [e.couleurExt, e.couleurInt].filter(Boolean).join(' / ')),
      ficheChamp('Financement', e.financement ? libListe(L.financement, e.financement) + (e.soldePret ? ' · solde ' + argent(e.soldePret) : '') : '')
    ].filter(Boolean);
    var lignes = [
      e.carrosserie ? h('div.fe-ligne', [h('span.fe-l', { text: 'Carrosserie' }), h('span', { text: e.carrosserie })]) : null,
      e.voyants ? h('div.fe-ligne', [h('span.fe-l', { text: 'Voyants' }), h('span', { text: e.voyants })]) : null,
      fichePastilles('À noter', e.constats, L.constats),
      fichePastilles('Options', e.options, L.options),
      fichePastilles('Garanties', e.garanties, L.garanties),
      e.notes ? h('div.fe-ligne', [h('span.fe-l', { text: 'Notes' }), h('span', { text: e.notes })]) : null
    ].filter(Boolean);
    if (!champs.length && !lignes.length) return h('p.mini', { text: 'Rien d\'inscrit sur l\'état du véhicule.' });
    return h('div', [champs.length ? h('div.fe-champs', champs) : null].concat(lignes));
  }
  function ficheDemande(x, opts) {
    opts = opts || {};
    injecterCss();
    var portail = !!opts.portail || !!(AMX.representantEval && AMX.representantEval());
    var d = cache.rep || {}, dr = droits(x, d, portail), R = reglages(d);
    var elPhotos = h('div.fe-photos');
    var elValeur = h('div.fe-valeur'), elEtat = h('div.fe-bloc'), elClient = h('div.fe-bloc'), hEtat = null, hClient = null;
    var titreVeh = x.vehicule || [x.annee, x.marque, x.modele].filter(Boolean).join(' ') || 'Véhicule';
    var sousVeh = h('div.fe-sous', [x.km ? h('span', { text: AMX.fmtNombre(x.km) + ' km' }) : null, h('span.mono', { text: x.vin }), h('span', { text: (AMX.COMPAGNIES_TOUTES || {})[x.compagnie] || x.compagnie || '' }),
      AMX.cfxPastilles ? AMX.cfxPastilles.puce(x.vin) : null]);
    var fermerFiche = function () {};
    var voit = !portail;
    /* 12 nov. : les gestes secondaires dans « Actions » ; un seul gros bouton en bas (monAction) */
    var autres = [];
    if (dr.modifierValeur) autres.push({ texte: 'Modifier le montant', action: function () { fermerFiche(); modifierMontant(x); } });
    if (dr.modifier) autres.push({ texte: 'Modifier la demande', action: function () { fermerFiche(); modifier(x); } });
    autres.push({ texte: (x.messages || []).length ? 'Messages (' + x.messages.length + ')' : 'Écrire un message', action: function () { fermerFiche(); ouvrirFil(x.id); } });
    if (dr.transferer) autres.push({ texte: x.etat === 'approbation' ? 'Changer les évaluateurs proposés' : 'Transférer à un autre évaluateur', action: function () { fermerFiche(); transferer(x, d); } });
    if (dr.approuver) autres.push({ texte: 'Refuser la demande', action: function () { fermerFiche(); refuser(x); } });
    if (dr.confirmer) autres.push({ texte: 'Renvoyer à l\'évaluateur', action: function () { fermerFiche(); renvoyer(x); } });
    if (dr.piloter) {
      autres.push({ texte: attendDirection(x) ? 'Relancer la direction (texto)' : 'Relancer l\'évaluateur', action: function () { action(x.id, 'relancer').then(function (r) { AMX.toast(r.message, 'ok'); }).catch(erreur); } });
      autres.push({ texte: 'Annuler la demande', action: function () { AMX.confirmer('Annuler la demande ?', titreVeh + ' · ' + x.vin, { ok: 'Annuler la demande', danger: true }).then(function (ok) { if (ok) { fermerFiche(); action(x.id, 'annuler', { raison: '' }).then(function (r) { AMX.toast(r.message, 'ok'); }).catch(erreur); } }); } });
    }
    if (dr.reevaluer) autres.push({ texte: 'Réévaluer', action: function () { fermerFiche(); reevaluer(x); } });
    if (voit && x.lien && (x.etat === 'faite' || x.etat === 'aconfirmer' || x.etat === 'encours')) autres.push({ texte: 'Évaluation complète', action: function () { fermerFiche(); AMX.aller('outils', 'evaluation', x.etat === 'aconfirmer' ? { vin: x.vin, demande: x.id } : { vin: x.vin }); } });
    if (x.issue === 'achetee') autres.push({ texte: 'Fiche d\'achat', action: function () { fermerFiche(); AMX.aller('achat', '', { vin: x.vin }); } });
    var entete = h('div.fe-entete', [h('div', [h('div.fe-titre', { text: titreVeh }), sousVeh]), autres.length && AMX.menuActions ? AMX.menuActions(autres, { petit: true }) : null]);
    var qui = h('div.fe-qui', [
      ficheChamp('Représentant', x.demandeParNom), ficheChamp('Évaluateur', x.faitePar || x.prisParNom || (x.prise || x.etat === 'faite' ? x.evaluateurNom : '')),
      ficheChamp('Demandée le', AMX.fmtDate(x.creeLe, true)), x.faiteLe ? ficheChamp('Évaluée le', AMX.fmtDate(x.faiteLe, true)) : null
    ].filter(Boolean));
    var resultat = null;
    if (dr.resultat) resultat = h('div.de-resultat', [h('b', 'Résultat :')].concat(['presentee', 'achetee', 'perdue'].map(function (k) {
      return h('button.btn' + (x.issue === k ? '.actif.' + k : ''), { type: 'button', 'aria-pressed': String(x.issue === k), onclick: function () { fermerFiche(); choisirIssue(x, k); } }, [k === 'perdue' ? 'Perdue…' : ISSUES[k]]);
    })));
    var info = null;
    if (x.infoDemandee) { var qq = (x.messages || []).filter(function (mm) { return mm.info; }).pop(); info = h('div.de-info', [h('b', { text: (qq ? qq.nom : 'L\'évaluateur') + ' demande : ' }), h('span', { text: '« ' + (qq ? qq.texte : '') + ' »' })]); }
    var fil = opts.fil || (x.infoDemandee && x.deMoi) ? blocFil(x, d, {}) : null;
    var corps = h('div.fe-fiche', [entete, AMX.ligneAvancement ? AMX.ligneAvancement(pasDe(x)) : null, info, fil, elValeur, resultat, elPhotos, hEtat = h('h3.fe-h', { text: 'État du véhicule' }), elEtat, hClient = h('h3.fe-h', { text: 'Client' }), elClient, qui]);
    fichePhotos(elPhotos, x);

    var boutons = [{ texte: 'Fermer', classe: 'fantome' }];
    var geste = monAction(x, d, portail);
    if (geste && geste.texte !== 'Répondre' && geste.texte !== 'Indiquer le résultat') boutons.push({ texte: geste.texte, classe: 'primaire', action: function (fermer) { fermer(); geste.faire(); } });
    var mf = AMX.modale({ titre: titreVeh, corps: corps, large: true, classe: 'fe-voile', proteger: false, boutons: boutons });
    fermerFiche = mf.fermer;

    var dessinerValeur = function (ev) {
      AMX.vider(elValeur);
      var valEv = Number(x.valeurEvaluateur || x.valeur) || Number(ev && ev.suivi && ev.suivi.valeurClient) || Number(ev && ev.prixAchat) || 0;
      if (x.etat === 'faite' && x.valeur) {
        var modif = dr.modifierValeur ? function () { fermerFiche(); modifierMontant(x); } : null;
        elValeur.appendChild(h('div.fe-montant' + (modif ? '.cliquable' : ''), modif ? { role: 'button', tabindex: '0', title: 'Modifier le montant', onclick: modif, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); modif(); } } } : {}, [
          h('span', { text: x.circuit === 'directeur' ? 'Valeur confirmée' : 'Valeur donnée' }), h('b', { text: argent(x.valeur) }), x.valideJusqu ? h('small', { text: 'valide jusqu\'au ' + AMX.fmtDate(x.valideJusqu) }) : null,
          modif ? h('span.fe-modifier', { text: 'Modifier' }) : null]));
        if (x.valeurEvaluateur && Number(x.valeurEvaluateur) !== Number(x.valeur) && !portail) elValeur.appendChild(h('p.mini', { text: 'Évaluateur : ' + argent(x.valeurEvaluateur) + (x.faitePar ? ' (' + x.faitePar + ')' : '') }));
        if (x.noteDirecteur) elValeur.appendChild(h('p.fe-note', [h('b', { text: 'Note de la direction : ' }), x.noteDirecteur]));
      } else if (valEv) {
        elValeur.appendChild(h('div.fe-montant', [h('span', { text: x.etat === 'aconfirmer' ? 'Valeur de l\'évaluateur — à confirmer' : 'Valeur de l\'évaluateur' }), h('b', { text: argent(valEv) })]));
      } else {
        elValeur.appendChild(h('div.fe-montant.sans', [h('span', { text: x.etat === 'approbation' ? 'À approuver' : (x.etat === 'refusee' ? 'Refusée' : (x.etat === 'annulee' ? 'Annulée' : 'Pas encore évaluée')) })]));
      }
      if (!ev) return;
      var m = ev.marche || {}, pctM = Number(m.marchePct);
      var repere = [
        ficheChamp('Prix de vente visé', ev.prixVente ? argent(ev.prixVente) : ''),
        ficheChamp('Recon estimé', ev.recon ? argent(ev.recon) : ''),
        ficheChamp('% du marché', m.standard ? (pctM ? Math.round(pctM) + ' % (' + argent(m.standard) + ')' : argent(m.standard)) : '')
      ].filter(Boolean);
      if (repere.length) elValeur.appendChild(h('div.fe-reperes', repere));
      if (ev.prixNote) elValeur.appendChild(h('p.fe-note', [h('b', { text: 'Note de l\'évaluateur : ' }), ev.prixNote]));
      var nv = ev.etatVehicule && ev.etatVehicule.notes;
      if (nv && nv !== x.note) elValeur.appendChild(h('p.fe-note', [h('b', { text: 'Notes sur le véhicule : ' }), nv]));
    };
    var dessinerClient = function (ev) {
      AMX.vider(elClient);
      var s = Object.assign({}, (x.detail && x.detail.suivi) || {}, (ev && ev.suivi) || {}), L = AMX.evalListes || {};
      var champs = [
        ficheChamp('Client', s.client || x.client), ficheChamp('Type', s.typeClient ? libListe(L.typesClient, s.typeClient) : ''),
        ficheChamp('Transaction', s.transaction ? libListe(L.transactions, s.transaction) : ''), ficheChamp('Ce qu\'il cherche', s.cherche)
      ].filter(Boolean);
      if (champs.length) elClient.appendChild(h('div.fe-champs', champs));
      if (x.note) elClient.appendChild(h('p.fe-note', [h('b', { text: 'Note du représentant : ' }), x.note]));
      if (x.renvoiRaison && x.etat !== 'faite') elClient.appendChild(h('p.fe-note', [h('b', { text: 'Renvoyée à l\'évaluateur : ' }), x.renvoiRaison]));
      if (x.refusRaison && x.etat === 'refusee') elClient.appendChild(h('p.fe-note', [h('b', { text: 'Refusée : ' }), x.refusRaison]));
    };
    /* 12 nov. : une section vide ne paraît pas (ni son titre) */
    var tout = function (ev) { dessinerValeur(ev); AMX.vider(elEtat); var et = ficheEtat(ev, x.detail); if (et.tagName !== 'P') elEtat.appendChild(et); hEtat.style.display = elEtat.childNodes.length ? '' : 'none'; dessinerClient(ev); hClient.style.display = elClient.childNodes.length ? '' : 'none'; };
    tout(null);
    if (voit && x.vin && /^[A-HJ-NPR-Z0-9]{17}$/.test(x.vin) && x.etat !== 'approbation') {
      AMX.get('evalVin=' + encodeURIComponent(x.vin), { discret: true }).then(function (r) { if (r && r.trouve && r.donnees) tout(r.donnees); }).catch(function () {});
    }
  }

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

  /* ------------------------------ Page ------------------------------
     12 nov. (Maxime : « les gens disent que le processus d'évaluation est compliqué, Torque est plus simple ; il y a plein
     d'écrits partout ; ça doit être facile de faire la demande, la consulter, l'envoyer, la recevoir ; pas besoin de
     toujours répéter les menus ») : un seul écran « Évaluations » pour tout le monde — un gros bouton « Nouvelle
     évaluation », une recherche, En cours / Terminées, et une liste où ce qui attend MON geste vient en premier avec son
     bouton. Plus de vues Direction / À évaluer / Mes demandes, plus de tuiles de chiffres ni de phrases d'explication :
     le Tableau, les Statistiques, la disponibilité, le Registre, l'Archive Torque et l'évaluation sans demande sont dans
     « Actions ». Le circuit (direction → évaluateur → direction → représentant) ne change pas. */
  AMX.section('demandesEval', {
    titre: 'Évaluations', icone: 'outils', ordre: 23,
    visible: function () { return (AMX.perm('consulter') || AMX.estAdmin()) && (!AMX.voitEvaluations || AMX.voitEvaluations()); },
    onglets: [{ id: '', titre: 'Évaluations', compteur: function () { var c = AMX.compagnieChoisie('evaluations'); var l = aFaireTout(c); return l ? String(l) : ''; } }],
    monter: function (conteneur, ctx) { return new Vue(conteneur, ctx); }
  });
  /* Le représentant (vendeur, BDC) : le même écran, ses demandes seulement, jamais l'analyse ; le montant une fois confirmé. */
  AMX.section('evalPortail', {
    titre: 'Évaluations', icone: 'outils', ordre: 24,
    visible: function () { return AMX.perm('consulter') || AMX.estAdmin(); },
    onglets: [{ id: '', titre: 'Évaluations', compteur: function () { var c = AMX.compagnieChoisie('evaluations'); var l = (pretesPourMoi(c) || []).length + (questionsPourMoi(c) || []).length; return l ? String(l) : ''; } }],
    monter: function (conteneur, ctx) { return new Vue(conteneur, ctx, { portail: true }); }
  });
  /* Ce qui attend mon geste (compteur de l'onglet) */
  function aFaireTout(cie) {
    var d = cache.rep; if (!d) return 0;
    return d.demandes.filter(function (x) { return (!cie || x.compagnie === cie) && !!monAction(x, d, false) && (x.etat !== 'faite'); }).length;
  }
  /* Une demande terminée pour la personne qui regarde : annulée, refusée, ou valeur donnée sans plus rien à faire pour elle */
  function terminee(x, d, portail) {
    if (x.etat === 'annulee' || x.etat === 'refusee') return true;
    if (enCours(x)) return false;
    return !monAction(x, d, portail);
  }

  function Vue(conteneur, ctx, opts) {
    injecterCss();
    var self = this;
    this.el = conteneur; this.detruit = false;
    this.portail = !!(opts && opts.portail);
    this.vue = 'liste';                 /* liste | tableau | stats (les deux derniers par « Actions ») */
    this.groupe = 'encours';            /* encours | terminees */
    this.periode = AMX.memo.lire('evalDemandes_periode', '30');
    this.nTerminees = 60;
    this.construire();
    this.charger(false);
    this.surMaj = function () { if (!self.detruit) self.rendre(); };
    this.surCie = function () { if (!self.detruit) { self.rendre(); if (AMX.gesteMenuRecent()) self.charger(false, true); } };
    document.addEventListener('amx:evalDemandes', this.surMaj);
    document.addEventListener('amx:compagnie', this.surCie);
    this.minuterie = setInterval(function () { if (!self.detruit && !document.hidden) self.charger(true, true); }, 60000);
    this.horloge = setInterval(function () { if (!self.detruit && !document.hidden && self.vue !== 'stats') self.rendre(); }, 30000);   /* chronomètres */
    this.surPleinEcran = function () {};
    document.addEventListener('fullscreenchange', this.surPleinEcran);
    this.appliquerParams(ctx);
  }
  Vue.prototype.demonter = function () { this.detruit = true; clearInterval(this.minuterie); clearInterval(this.horloge); document.removeEventListener('amx:evalDemandes', this.surMaj); document.removeEventListener('amx:compagnie', this.surCie); document.removeEventListener('fullscreenchange', this.surPleinEcran); };
  Vue.prototype.naviguer = function (ctx) { this.appliquerParams(ctx); };
  Vue.prototype.appliquerParams = function (ctx) {
    var p = (ctx && ctx.params) || {};
    if (p.nouvelle) setTimeout(function () { demander({ vin: p.vin || '' }); }, 100);
    var voir = p.voir || '';   /* « vue » est pris par la tuile ; les anciens liens disaient voir=direction | pourMoi | deMoi */
    if (voir === 'tableau' || voir === 'stats') this.vue = voir; else if (voir) this.vue = 'liste';
    if (p.id) { this.cible = p.id; if (p.fiche !== '0') this.ficheDemandee = p.id; }
    if (cache.rep && (p.id || voir)) this.rendre();
  };
  Vue.prototype.construire = function () {
    var self = this;
    this.btnDemander = h('button.btn.primaire.de-nouvelle', { type: 'button', html: I.plus + '<span>Nouvelle évaluation</span>', onclick: function () { demander({ compagnie: AMX.compagnieChoisie('evaluations') }); } });
    this.elMenu = h('span');
    this.elDispo = h('span');
    this.el.appendChild(h('div.de-page' + (this.portail ? '.de-portail' : ''), [
      h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('div.de-titre', [h('h1', 'Évaluations'), this.elDispo])]), h('div.actions', [this.elMenu, this.btnDemander])]),
      this.elRetour = h('div'),
      this.elCies = h('div'),
      this.elFiltres = h('div.de-filtres', [
        this.segGroupe = h('div.segment.de-groupes'),
        h('div.recherche', [h('span', { html: I.recherche }), this.inputQ = h('input.saisie', { type: 'search', placeholder: 'Chercher : NIV, véhicule, client, nom', oninput: function () { self.rendre(); } })])
      ]),
      this.elEtats = h('div.inv2-statuts.de-etats'),
      this.elPortee = h('div'),
      this.elTuiles = h('div.kpis.de-tuiles'),
      this.elListe = h('div.de-liste')
    ]));
  };
  /* Le menu « Actions » : ce qui n'est pas la tâche du moment */
  Vue.prototype.rendreMenu = function (d) {
    var self = this, moi = d.moi || {}, items = [];
    AMX.vider(this.elMenu);
    var voitEval = !this.portail && AMX.voitEvaluations && AMX.voitEvaluations();
    if (voitEval) {
      items.push({ texte: 'Évaluer un véhicule (sans demande)', action: function () { AMX.aller('inventaire', 'evaluations', { vue: 'evaluation' }); } });
      items.push({ texte: 'Registre des évaluations', action: function () { AMX.aller('inventaire', 'evaluations', { vue: 'evaluations' }); } });
      items.push({ texte: 'Archive Torque', action: function () { AMX.aller('inventaire', 'evaluations', { vue: 'torque' }); } });
    }
    if (!this.portail && (moi.evaluateur || moi.direction)) {
      items.push({ texte: 'Tableau (écran du bureau)', action: function () { self.vue = 'tableau'; self.rendre(); } });
      items.push({ texte: 'Statistiques', action: function () { self.vue = 'stats'; self.rendre(); } });
    }
    if (!this.portail && moi.evaluateur) items.push({ texte: 'Ma disponibilité…', action: function () { modalePresence({ nom: moi.nom || 'Moi', courriel: moi.courriel, presence: moi.presence, presenceJusqu: moi.presenceJusqu }); } });
    if (!this.portail && moi.direction) items.push({ texte: 'Disponibilité des évaluateurs…', action: function () { self.modaleEquipe(d); } });
    items.push({ texte: 'Rafraîchir', action: function () { self.charger(true); } });
    if (AMX.menuActions) this.elMenu.appendChild(AMX.menuActions(items));
    /* l'évaluateur voit d'un coup d'œil s'il est « occupé » ou « absent » (sinon rien) */
    AMX.vider(this.elDispo);
    if (!this.portail && moi.evaluateur && moi.presence && moi.presence !== 'disponible')
      this.elDispo.appendChild(h('button.de-dispo.' + TON_PRESENCE[moi.presence], { type: 'button', title: 'Changer ma disponibilité', onclick: function () { modalePresence({ nom: moi.nom || 'Moi', courriel: moi.courriel, presence: moi.presence, presenceJusqu: moi.presenceJusqu }); } },
        [h('i.de-point.' + TON_PRESENCE[moi.presence]), textePresence(moi)]));
  };
  Vue.prototype.modaleEquipe = function (d) {
    var cie = AMX.compagnieChoisie('evaluations'), codes = cie ? [cie] : Object.keys(d.evaluateurs || {}), corps = h('div');
    codes.forEach(function (c) {
      var liste = (d.evaluateurs[c] || []).filter(function (e) { return !e.groupe; });
      corps.appendChild(h('h3.fe-h', { text: nomCie(c) }));
      corps.appendChild(liste.length ? h('div.de-evaluateurs', liste.map(function (e) {
        return h('button.de-eval' + (e.presence === 'absent' ? '.attenue' : ''), { type: 'button', onclick: function () { m.fermer(); modalePresence(e); } },
          [h('b', [h('i.de-point.' + TON_PRESENCE[e.presence || 'disponible']), e.nom]), h('span', { text: textePresence(e) + (e.ouvertes ? ' · ' + e.ouvertes + ' en cours' : '') })]);
      })) : h('p.mini', { text: 'Aucun évaluateur : cochez le droit « Évaluateur » dans Admin.' }));
    });
    var m = AMX.modale({ titre: 'Disponibilité des évaluateurs', corps: corps, boutons: [{ texte: 'Fermer' }] });
  };
  Vue.prototype.charger = function (force, silencieux) {
    var self = this;
    if (!cache.rep) { AMX.vider(this.elListe); this.elListe.appendChild(AMX.chargeur ? AMX.chargeur('Évaluations') : h('p.doux', 'Lecture…')); }
    charger(force).then(function () { if (!self.detruit) self.rendre(); }).catch(function (e) {
      if (self.detruit) return;
      if (!cache.rep) { AMX.vider(self.elListe); self.elListe.appendChild(h('div.carte', [h('div.carte-corps', [h('p', { style: { color: 'var(--rouge)' }, text: AMX.erreurTexte(e) })])])); }
      if (!silencieux) erreur(e);
    });
  };
  Vue.prototype.rendre = function () {
    var self = this, d = cache.rep; if (!d) return;
    var cie = AMX.compagnieChoisie('evaluations');
    AMX.barreConcessions(this.elCies, { domaine: 'evaluations', valeur: cie, onchange: function (c) { AMX.choisirCompagnie(c); } });
    this.rendreMenu(d);
    var base = d.demandes.filter(function (x) { return (!cie || x.compagnie === cie) && (!self.portail || x.deMoi); });
    var q = this.inputQ.value, mots = AMX.motsCherches(q);
    var cherche = function (x) { return !mots.length || AMX.correspond([x.vin, x.vehicule, x.client, x.telephone, x.demandeParNom, x.evaluateurNom, x.prisParNom, x.id, x.note], mots); };
    var liste = base.filter(cherche);
    AMX.vider(this.elRetour);
    if (this.vue === 'tableau' || this.vue === 'stats') {
      this.elRetour.appendChild(AMX.retourSujets ? AMX.retourSujets('Retour à la liste', function () { self.vue = 'liste'; self.rendre(); }) : h('button.btn', { type: 'button', text: '‹ Retour à la liste', onclick: function () { self.vue = 'liste'; self.rendre(); } }));
      this.segGroupe.style.display = 'none';
      if (this.vue === 'tableau') this.rendreTableau(d, liste, cie, q); else this.rendreStats(d, liste, cie, q);
    } else {
      this.segGroupe.style.display = '';
      AMX.vider(this.elEtats); AMX.vider(this.elPortee); AMX.vider(this.elTuiles);
      this.rendreListe(d, liste, cie);
    }
    if (this.cible) { var c = this.el.querySelector('[data-id="' + this.cible + '"]'); if (c) { c.scrollIntoView({ block: 'center' }); c.classList.add('de-cible'); this.cible = ''; } }
    /* le lien d'un courriel ou d'un texto ouvre la fiche de la demande (une fois) */
    if (this.ficheDemandee) { var vf = d.demandes.filter(function (x) { return x.id === self.ficheDemandee; })[0]; this.ficheDemandee = ''; if (vf) setTimeout(function () { if (!self.detruit) ficheDemande(vf, { portail: self.portail }); }, 60); }
  };

  /* La liste : En cours (ce qui attend mon geste d'abord) ou Terminées */
  Vue.prototype.rendreListe = function (d, liste, cie) {
    var self = this, portail = this.portail;
    var enCoursL = liste.filter(function (x) { return !terminee(x, d, portail); });
    var finies = liste.filter(function (x) { return terminee(x, d, portail); });
    AMX.vider(this.segGroupe);
    [['encours', 'En cours', enCoursL.length], ['terminees', 'Terminées', finies.length]].forEach(function (g) {
      self.segGroupe.appendChild(h('button' + (self.groupe === g[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': String(self.groupe === g[0]), onclick: function () { self.groupe = g[0]; self.rendre(); } }, [g[1], h('span.n', { text: String(g[2]) })]));
    });
    AMX.vider(this.elListe);
    if (this.groupe === 'terminees') {
      var tri = finies.slice().sort(function (a, b) { return String(b.issueLe || b.confirmeLe || b.faiteLe || b.creeLe || '').localeCompare(String(a.issueLe || a.confirmeLe || a.faiteLe || a.creeLe || '')); });
      if (!tri.length) { this.elListe.appendChild(h('p.de-vide', { text: 'Aucune évaluation terminée.' })); return; }
      tri.slice(0, this.nTerminees).forEach(function (x) { self.elListe.appendChild(self.ligne(x, d)); });
      if (tri.length > this.nTerminees) this.elListe.appendChild(h('button.btn.de-plus-btn', { type: 'button', text: 'Voir ' + Math.min(60, tri.length - this.nTerminees) + ' de plus', onclick: function () { self.nTerminees += 60; self.rendre(); } }));
      return;
    }
    var aMoi = [], autres = [];
    enCoursL.forEach(function (x) { (monAction(x, d, portail) ? aMoi : autres).push(x); });
    var RANG = { approbation: 0, aconfirmer: 1, afaire: 2, encours: 3, faite: 4 };
    var urgence = function (a, b) {
      return ((tractionATraiter(b) ? 1 : 0) - (tractionATraiter(a) ? 1 : 0)) || ((b.infoDemandee && b.deMoi ? 1 : 0) - (a.infoDemandee && a.deMoi ? 1 : 0)) || ((RANG[a.etat] || 0) - (RANG[b.etat] || 0)) || String(a.creeLe || '').localeCompare(String(b.creeLe || ''));
    };
    aMoi.sort(urgence); autres.sort(urgence);
    if (!aMoi.length && !autres.length) {
      this.elListe.appendChild(h('div.de-vide-grand', [h('p', { text: 'Rien en cours.' }), h('button.btn.primaire', { type: 'button', html: I.plus + '<span>Nouvelle évaluation</span>', onclick: function () { demander({ compagnie: cie }); } })]));
      return;
    }
    if (aMoi.length) {
      this.elListe.appendChild(h('h2.de-groupe', [h('span', 'À vous'), h('b', { text: String(aMoi.length) })]));
      aMoi.forEach(function (x) { self.elListe.appendChild(self.ligne(x, d)); });
    }
    if (autres.length) {
      this.elListe.appendChild(h('h2.de-groupe.doux', [h('span', aMoi.length ? 'Les autres en cours' : 'En cours'), h('b', { text: String(autres.length) })]));
      autres.forEach(function (x) { self.elListe.appendChild(self.ligne(x, d)); });
    }
  };

  /* Une ligne : le véhicule, où elle en est, la valeur, et mon bouton s'il y en a un. Un clic ouvre la fiche. */
  Vue.prototype.ligne = function (x, d) {
    var self = this, R = reglages(d), ph = phase(x), c = chrono(x, R), geste = monAction(x, d, this.portail);
    var titre = x.vehicule || [x.annee, x.marque, x.modele].filter(Boolean).join(' ') || x.vin;
    var qui = this.portail ? (x.evaluateurNom && x.prise ? 'évaluée par ' + x.evaluateurNom : '') : (x.demandeParNom || '');
    var sous = [x.km ? AMX.fmtNombre(Number(x.km)) + ' km' : '', x.client || '', qui].filter(Boolean).join(' · ');
    var valeur = null;
    if (x.etat === 'faite' && x.valeur) valeur = h('div.de-l-valeur', [h('b', { text: argent(x.valeur) }), x.expiree ? h('span.rouge', { text: 'échue' }) : (x.issue ? h('span', { text: ISSUES[x.issue] }) : null)]);
    else if (x.etat === 'aconfirmer' && x.valeurEvaluateur && !this.portail) valeur = h('div.de-l-valeur.attente', [h('b', { text: argent(x.valeurEvaluateur) }), h('span', { text: 'à confirmer' })]);
    var badges = [];
    if (x.source === 'traction') badges.push(h('span.badge.sans-point.' + (tractionATraiter(x) ? 'rouge' : 'bleu'), { text: 'Traction' }));
    if (x.infoDemandee) badges.push(h('span.badge.sans-point.ambre', { text: 'Question' }));
    if (priseParAutre(x) && !this.portail && estOuverte(x)) badges.push(h('span.badge.sans-point.gris', { text: 'Prise par ' + (x.prisParNom || x.evaluateurNom || '—') }));
    var btn = geste ? h('button.btn.primaire.de-l-btn', { type: 'button', text: geste.texte, onclick: function (e) { e.stopPropagation(); geste.faire(); } }) : null;
    var ligne = h('div.de-l.' + ph + (geste ? '.a-moi' : '') + (c && c.ton === 'rouge' ? '.retard' : '') + (tractionATraiter(x) ? '.trx-rouge' : ''), { 'data-id': x.id, role: 'button', tabindex: '0',
      onclick: function () { ficheDemande(x, { portail: self.portail }); }, onkeydown: function (e) { if (e.key === 'Enter') ficheDemande(x, { portail: self.portail }); } }, [
      h('div.de-l-haut', [
        h('span.badge.sans-point.' + PHASES[ph][1], { text: libellePhase(x, this.portail) }),
        h('b.de-l-titre', { text: titre }),
        badges.length ? h('span.de-l-badges', badges) : null,
        c ? h('span.de-chrono.' + c.ton, { text: duree(c.min) }) : h('span.de-l-quand', { text: quand(x.confirmeLe || x.faiteLe || x.creeLe) })
      ]),
      h('div.de-l-bas', [h('span.de-l-sous', { text: sous }), AMX.ligneAvancement ? AMX.ligneAvancement(pasDe(x), { compact: true }) : null]),
      valeur, btn
    ]);
    return ligne;
  };

  /* --- Tableau (colonnes) --- */
  Vue.prototype.rendreTableau = function (d, base, cie, q) {
    var self = this, R = reglages(d);
    this.elEtats.style.display = 'none'; AMX.vider(this.elEtats);
    var semaine = Date.now() - 7 * 86400000;
    var avecDirection = base.some(function (x) { return x.circuit === 'directeur'; });   /* 2 nov. : les colonnes de la direction, dès qu'une demande suit le circuit */
    var cols = (avecDirection ? [['approbation', 'À approuver', function (x) { return x.etat === 'approbation'; }]] : []).concat([
      ['afaire', 'À prendre', function (x) { return x.etat === 'afaire'; }],
      ['encours', 'En évaluation', function (x) { return x.etat === 'encours'; }]]).concat(avecDirection ? [['aconfirmer', 'À confirmer', function (x) { return x.etat === 'aconfirmer'; }]] : []).concat([
      ['faite', 'Valeur donnée', function (x) { return x.etat === 'faite' && x.issue !== 'achetee' && x.issue !== 'perdue' && !x.remplaceePar && new Date(x.faiteLe || x.creeLe).getTime() > Date.now() - (R.validite + 3) * 86400000; }],
      ['conclues', 'Conclues (7 jours)', function (x) { return (x.issue === 'achetee' || x.issue === 'perdue') && new Date(x.issueLe || x.faiteLe || x.creeLe).getTime() > semaine; }]
    ]);
    var iFaite = cols.map(function (c) { return c[0]; }).indexOf('faite');
    var ancien = function (a, b) { return String(a.creeLe).localeCompare(String(b.creeLe)); };   /* ouvertes : la plus vieille en haut */
    var recent = function (a, b) { return String(b.issueLe || b.faiteLe || b.creeLe).localeCompare(String(a.issueLe || a.faiteLe || a.creeLe)); };
    var parCol = cols.map(function (c, i) { return base.filter(c[2]).sort(i < iFaite ? ancien : recent); });
    var colDe = function (id) { var i = cols.map(function (c) { return c[0]; }).indexOf(id); return i >= 0 ? parCol[i] : []; };
    var n = parCol.reduce(function (s, l) { return s + l.length; }, 0);
    AMX.porteeChiffres(this.elPortee, { n: n, unite: ['demande', 'demandes'], contexte: [cie ? nomCie(cie) : 'Toutes les concessions', 'Tableau'], filtres: [q ? '« ' + q + ' »' : ''], effacer: function () { self.inputQ.value = ''; self.rendre(); } });
    AMX.vider(this.elTuiles);
    var tuile = function (t, v, sous, ton) { return h('div.kpi.neutre' + (ton ? '.' + ton : ''), [h('div.libelle', { text: t }), h('div.valeur', { text: v }), sous ? h('div.sous', { text: sous }) : null]); };
    var ouv = colDe('afaire').concat(colDe('encours')), rouges = ouv.filter(function (x) { var c = chrono(x, R); return c && c.ton === 'rouge'; }).length;
    var plusVieille = ouv.reduce(function (m, x) { return Math.max(m, depuis(x.creeLe)); }, 0);
    var aujour = new Date().toDateString(), faitesJ = base.filter(function (x) { return x.etat === 'faite' && new Date(x.faiteLe).toDateString() === aujour; });
    var medJ = mediane(faitesJ.filter(function (x) { return x.minutesReponse !== null && x.minutesReponse !== undefined; }).map(function (x) { return x.minutesReponse; }));
    this.elTuiles.appendChild(tuile('Ouvertes', String(ouv.length), ouv.length ? 'la plus vieille : ' + duree(plusVieille) : 'rien en attente', ouv.length ? 'attention' : 'ok'));
    this.elTuiles.appendChild(tuile('En retard', String(rouges), 'plus de ' + R.delai + ' minutes', rouges ? 'alerte' : ''));
    this.elTuiles.appendChild(tuile('Faites aujourd\'hui', String(faitesJ.length), medJ === null ? '' : 'délai médian ' + duree(medJ), faitesJ.length ? 'ok' : ''));
    if (avecDirection) this.elTuiles.appendChild(tuile('Chez la direction', String(colDe('approbation').length + colDe('aconfirmer').length), colDe('approbation').length + ' à approuver · ' + colDe('aconfirmer').length + ' à confirmer', colDe('approbation').length + colDe('aconfirmer').length ? 'attention' : ''));
    this.elTuiles.appendChild(tuile('À présenter', String(colDe('faite').filter(function (x) { return !x.issue; }).length), 'valeur donnée, sans résultat', ''));
    AMX.vider(this.elListe);
    var grille = h('div.de-kanban' + (cols.length > 4 ? '.large' : ''));
    cols.forEach(function (c, i) {
      grille.appendChild(h('div.de-col.' + c[0], [h('div.de-col-tete', [h('b', { text: c[1] }), h('span.compteur', { text: String(parCol[i].length) })]),
        h('div.de-col-corps', parCol[i].length ? parCol[i].map(function (x) { return self.carteCompacte(x, d); }) : [h('p.mini', { text: '—' })])]));
    });
    this.elListe.appendChild(grille);
  };
  Vue.prototype.carteCompacte = function (x, d) {
    var self = this, R = reglages(d), c = chrono(x, R), ph = phase(x);
    var bas = c ? h('span.de-chrono.' + c.ton, { text: '⏱ ' + duree(c.min) + (x.etat === 'afaire' && c.min >= R.prise ? ' · pas prise' : '') }) :
      (x.etat === 'faite' ? h('b.de-mini-valeur', { text: (x.valeur ? argent(x.valeur) : 'valeur') + (x.issue ? ' · ' + ISSUES[x.issue] : (x.expiree ? ' · échue' : '')) }) :
        (x.etat === 'approbation' ? h('span.mini', { text: 'depuis ' + duree(depuis(x.creeLe)) }) : (x.etat === 'aconfirmer' ? h('b.de-mini-valeur.attente', { text: (x.valeurEvaluateur ? argent(x.valeurEvaluateur) + ' · ' : '') + 'à confirmer' }) : null)));
    return h('button.de-compact.' + ph + (c ? '.t-' + c.ton : '') + (tractionATraiter(x) ? '.trx-rouge' : ''), { type: 'button', 'data-id': x.id, onclick: function () { self.ouvrirDetail(x.id); } }, [
      h('b', { text: x.vehicule || x.vin }),
      h('span.mini', { text: [x.client, x.km ? AMX.fmtNombre(Number(x.km)) + ' km' : ''].filter(Boolean).join(' · ') }),
      h('span.mini', { text: (x.demandeParNom || '—') + ' → ' + texteEvaluateurs(x) }),
      x.source === 'traction' ? (tractionATraiter(x) ? h('span.badge.rouge.sans-point', { text: 'Traction · valeur à donner' }) : h('span.badge.bleu.sans-point', { text: 'Traction' })) : null,
      x.infoDemandee ? h('span.badge.ambre.sans-point', { text: 'Question en attente' }) : null,
      bas
    ]);
  };
  Vue.prototype.ouvrirDetail = function (id) { var x = AMX.evalDemandes.une(id); if (x) ficheDemande(x, { portail: this.portail }); };

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
    aFairePourMoi: aFairePourMoi, pretesPourMoi: pretesPourMoi, questionsPourMoi: questionsPourMoi, aApprouver: aApprouver, aConfirmer: aConfirmer,
    tractionsATraiter: tractionsATraiter, tractionATraiter: tractionATraiter,
    /* 2 nov. : la page d'évaluation propose « Confirmer le montant » au directeur, juste après l'enregistrement. */
    confirmer: function (id) { var x = AMX.evalDemandes.une(id); if (x) { injecterCss(); confirmerMontant(x); } },
    modifierMontant: function (id) { var x = AMX.evalDemandes.une(id); if (x) { injecterCss(); modifierMontant(x); } },
    approuver: function (id) { var x = AMX.evalDemandes.une(id); if (x) { injecterCss(); approuver(x, cache.rep); } },
    refuser: function (id) { var x = AMX.evalDemandes.une(id); if (x) { injecterCss(); refuser(x); } },
    renvoyer: function (id) { var x = AMX.evalDemandes.une(id); if (x) { injecterCss(); renvoyer(x); } },
    /* 7 nov. : la fiche simple d'une demande (photos, valeur, état, client) */
    fiche: function (id) { var x = AMX.evalDemandes.une(id); if (x) ficheDemande(x); return !!x; },
    une: function (id) { var d = cache.rep; return d ? d.demandes.filter(function (x) { return x.id === id; })[0] || null : null; },
    prendre: function (id) { return action(id, 'prendre'); },
    transferer: function (id) { var x = AMX.evalDemandes.une(id); if (x) { injecterCss(); transferer(x, cache.rep); } },
    faite: function (id) { return action(id, 'faite'); },
    message: message, ouvrirFil: ouvrirFil, reglages: reglages, phase: phase,
    vider: function () { cache = { rep: null, quand: 0, promesse: null }; }
  };

  function injecterCss() {
    if (document.getElementById('css-demandes-eval')) return;
    var s = document.createElement('style'); s.id = 'css-demandes-eval';
    s.textContent = [
      '.de-page .mini, .de-demande .mini { font-size: 12px; color: var(--encre-3); } .de-page .mini.rouge { color: var(--rouge); font-weight: 600; }',
      /* 12 nov. : un seul écran, une ligne par demande */
      '.de-titre { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }',
      '.de-dispo { display: inline-flex; align-items: center; border: 1px solid var(--ligne); background: var(--carte); border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 13px; color: var(--encre-2); cursor: pointer; }',
      '.de-nouvelle { min-height: 44px; font-size: 15px; padding: 0 18px; }',
      '.de-groupes button { display: inline-flex; align-items: center; gap: 6px; } .de-groupes .n { font-weight: 700; opacity: .7; }',
      '.de-liste { gap: 8px; } .de-groupe { display: flex; gap: 8px; align-items: center; margin: 14px 0 2px; font-size: 13px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--encre-2); }',
      '.de-groupe b { background: var(--rouge); color: #fff; border-radius: 9px; padding: 0 8px; font-size: 12px; } .de-groupe.doux b { background: var(--gris-bg, #EEF1F4); color: var(--encre-2); }',
      '.de-l { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "haut valeur btn" "bas valeur btn"; gap: 6px 16px; align-items: center; padding: 12px 14px;',
      '  border: 1px solid var(--ligne, #E3E7EB); border-left: 6px solid #9AA5AE; border-radius: 12px; background: var(--carte, #fff); cursor: pointer; }',
      '.de-l:hover { border-color: var(--encre-4); } .de-l:focus-visible { outline: 3px solid var(--vert); outline-offset: 2px; }',
      '.de-l.approbation { border-left-color: var(--violet, #6D4FC7); } .de-l.afaire { border-left-color: #D64545; } .de-l.encours { border-left-color: #C98A1A; } .de-l.aconfirmer { border-left-color: var(--bleu, #1A64BF); }',
      '.de-l.faite, .de-l.achetee { border-left-color: #1E8E4A; }',
      '.de-l.a-moi.approbation { background: var(--violet-bg, #F1EDFC); } .de-l.a-moi.afaire { background: #FDECEC; } .de-l.a-moi.encours { background: #FFF4DE; } .de-l.a-moi.aconfirmer { background: #E8F0FB; } .de-l.a-moi.faite { background: #E8F6EC; }',
      '.de-l.retard { box-shadow: 0 0 0 2px #D64545 inset; } .de-l.trx-rouge { background: #FDECEC; border-left-color: #B42318; }',
      '.de-l-haut { grid-area: haut; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; min-width: 0; }',
      '.de-l-titre { font-size: 16px; color: var(--encre); } .de-l-badges { display: inline-flex; gap: 6px; flex-wrap: wrap; }',
      '.de-l-quand { font-size: 13px; color: var(--encre-3); }',
      '.de-l-bas { grid-area: bas; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; min-width: 0; }',
      '.de-l-sous { font-size: 14px; color: var(--encre-2); } .de-l-bas .amx-avancement { width: 150px; flex: none; }',
      '.de-l-valeur { grid-area: valeur; text-align: right; display: grid; } .de-l-valeur b { font-size: 20px; color: #1E6B3A; font-variant-numeric: tabular-nums; } .de-l-valeur span { font-size: 13px; color: var(--encre-3); }',
      '.de-l-valeur.attente b { color: var(--bleu, #1A64BF); } .de-l-valeur .rouge { color: var(--rouge); font-weight: 600; }',
      '.de-l-btn { grid-area: btn; min-height: 40px; }',
      '.de-vide { color: var(--encre-3); padding: 18px 2px; font-size: 15px; } .de-vide-grand { text-align: center; padding: 40px 0; } .de-vide-grand p { font-size: 18px; color: var(--encre-2); margin: 0 0 14px; }',
      '.de-plus-btn { margin: 10px auto 0; display: block; }',
      '@media (max-width: 640px) { .de-l { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "haut haut" "bas bas" "valeur btn"; } .de-l-valeur { text-align: left; } .de-l-bas .amx-avancement { width: 100%; } }',
      /* le formulaire court */
      '.de-court input.saisie, .de-court select { min-height: 42px; font-size: 16px; } .de-court .champ > span { font-size: 13px; font-weight: 600; color: var(--encre-2); }',
      '.de-photos-ligne { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; } .de-photos-btn { min-height: 48px; font-size: 15px; }',
      '.de-plus { border: 1px solid var(--ligne, #E3E7EB); border-radius: 10px; padding: 8px 12px; margin-top: 8px; } .de-plus > summary { cursor: pointer; font-weight: 600; color: var(--encre-2); padding: 2px 0; }',
      '.de-plus[open] > summary { margin-bottom: 8px; } .de-cie-ligne { margin: 0 0 12px; font-weight: 700; display: flex; gap: 10px; align-items: baseline; }',
      'button.lien { background: none; border: 0; padding: 0; color: var(--vert-fonce, #0E5E31); text-decoration: underline; cursor: pointer; font: inherit; font-weight: 500; }',
      '.fe-fiche .amx-avancement { margin: 2px 0 4px; } .fe-fiche .de-resultat { padding: 10px 12px; border-radius: 10px; background: var(--fond); }',
      '.de-page { background: var(--fond); } .de-page:fullscreen { padding: 18px 22px; overflow: auto; }',
      /* 7 nov. : fiche simple (façon Torque) */
      '.fe-fiche { display: grid; gap: 12px; } .fe-entete { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }',
      '.fe-titre { font-size: 18px; font-weight: 700; color: var(--encre); } .fe-sous { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; font-size: 13px; color: var(--encre-3); margin-top: 2px; }',
      '.fe-sous .mono { font-family: var(--police-mono, ui-monospace, Menlo, monospace); letter-spacing: .04em; }',
      '.fe-photos { display: grid; gap: 6px; } .fe-grande-lien { display: block; } .fe-grande { width: 100%; max-height: 340px; object-fit: cover; border-radius: 10px; background: var(--fond); display: block; }',
      '.fe-bande { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; } .fe-vignette { flex: none; padding: 0; border: 2px solid transparent; border-radius: 8px; background: none; cursor: pointer; }',
      '.fe-vignette.actif { border-color: var(--vert); } .fe-vignette img { width: 72px; height: 54px; object-fit: cover; border-radius: 6px; display: block; }',
      '.fe-sans-photo { padding: 18px; text-align: center; border: 1px dashed var(--ligne); border-radius: 10px; color: var(--encre-3); font-size: 13px; }',
      '.fe-valeur { display: grid; gap: 8px; } .fe-montant { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding: 12px 14px; border-radius: 10px; background: var(--vert-clair, #E8F5EE); }',
      '.fe-montant span { font-size: 13px; color: var(--vert-fonce, #0E5E31); font-weight: 600; } .fe-montant b { font-size: 26px; color: var(--vert-fonce, #0E5E31); } .fe-montant small { font-size: 12px; color: var(--encre-3); }',
      '.fe-montant.sans { background: var(--fond); } .fe-montant.sans span { color: var(--encre-3); }',
      '.fe-montant.cliquable { cursor: pointer; } .fe-montant.cliquable:hover, .fe-montant.cliquable:focus-visible { box-shadow: 0 0 0 2px var(--vert, #008840) inset; } .fe-modifier { margin-left: auto; font-size: 13px; font-weight: 700; color: var(--vert-fonce, #0E5E31); text-decoration: underline; }',
      '.fe-reperes, .fe-champs, .fe-qui { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px 14px; }',
      '.fe-champ { display: grid; gap: 1px; } .fe-champ span { font-size: 12px; color: var(--encre-3); } .fe-champ b { font-size: 14px; font-weight: 600; color: var(--encre); }',
      '.fe-champ.rouge b { color: var(--rouge); } .fe-qui { padding-top: 8px; border-top: 1px solid var(--ligne); }',
      '.fe-h { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin: 4px 0 -4px; font-weight: 700; }',
      '.fe-ligne { display: flex; gap: 10px; align-items: baseline; font-size: 14px; margin-top: 6px; } .fe-l { flex: none; width: 92px; font-size: 12px; color: var(--encre-3); }',
      '.fe-puces { display: flex; flex-wrap: wrap; gap: 4px; } .fe-note { margin: 0; font-size: 14px; }',
      '@media (max-width: 560px) { .fe-grande { max-height: 220px; } .fe-montant b { font-size: 22px; } .fe-l { width: 76px; } .fe-reperes, .fe-champs, .fe-qui { grid-template-columns: 1fr 1fr; } }',
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
      '.de-carte.perdue, .de-carte.echue, .de-carte.annulee, .de-carte.refusee { background: var(--fond-2, #F3F5F7); border-left-color: #9AA5AE; } .de-carte.annulee { opacity: .8; }',
      '.de-carte.approbation { background: var(--violet-bg, #F1EDFC); border-left-color: var(--violet, #6D4FC7); } .de-carte.aconfirmer { background: #E8F0FB; border-left-color: var(--bleu, #1A64BF); }',
      '.de-refus { margin-top: 4px; font-size: 13px; color: #7A2E2E; } .de-refus.renvoi { color: #955F10; } .de-note.direction { margin-top: 8px; background: #E8F0FB; }',
      '.de-valeur.attente b, .de-mini-valeur.attente { color: var(--bleu, #1A64BF); } .de-valeur b.attente { font-size: 18px; }',
      '.de-etapes.circuit { grid-template-columns: repeat(6, 1fr); } .de-circuit { margin: 0; padding: 8px 10px; border-radius: 8px; background: var(--violet-bg, #F1EDFC); color: var(--encre-2); }',
      '.de-kanban.large { grid-template-columns: repeat(6, minmax(190px, 1fr)); } .de-col.approbation .de-col-tete b { color: var(--violet, #6D4FC7); } .de-col.aconfirmer .de-col-tete b { color: var(--bleu, #1A64BF); }',
      '.de-compact.approbation { border-left-color: var(--violet, #6D4FC7); } .de-compact.aconfirmer { border-left-color: var(--bleu, #1A64BF); } .de-compact.refusee { border-left-color: #9AA5AE; }',
      '.de-carte.t-rouge { box-shadow: 0 0 0 2px #D64545 inset; } .de-cible { outline: 3px solid var(--vert); outline-offset: 2px; }',
      /* 10 nov. : demande de Traction pas encore évaluée — rouge, quelle que soit l'étape */
      '.de-carte.trx-rouge, .de-compact.trx-rouge { background: #FDECEC; border-left-color: #B42318; box-shadow: 0 0 0 2px #D64545 inset; }',
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
      '.de-page:fullscreen .de-kanban { grid-template-columns: repeat(4, 1fr); } .de-page:fullscreen .de-kanban.large { grid-template-columns: repeat(6, 1fr); } .de-page:fullscreen .de-compact b { font-size: 16px; } .de-page:fullscreen .de-compact .mini { font-size: 14px; }',
      '.de-stats td, .de-stats th { white-space: nowrap; }',
      '.de-raison { display: grid; grid-template-columns: minmax(160px, 1fr) 2fr 40px; gap: 10px; align-items: center; padding: 4px 0; font-size: 13px; } .de-raison i { height: 8px; background: var(--fond-2, #F3F5F7); border-radius: 4px; overflow: hidden; } .de-raison i b { display: block; height: 100%; background: #9AA5AE; }',
      '.de-grille { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; } .de-grille .champ { display: grid; gap: 4px; } .de-grille .champ > span { font-size: 12px; color: var(--encre-3); } .de-grille .large { grid-column: 1 / -1; }',
      '.de-veh { min-height: 16px; } .de-avis-eval { color: #955F10; margin-top: 4px; min-height: 0; }',
      '.de-prise { color: #955F10; font-weight: 600; } .de-page .mini.de-hausse, .mini.de-hausse { color: #955F10; font-weight: 600; }',
      '.de-grille.trois { grid-template-columns: repeat(3, minmax(0, 1fr)); } .de-detail-form { display: grid; gap: 10px; }',
      '.de-detail-bloc { border: 1px solid var(--ligne, #E3E7EB); border-radius: 10px; padding: 8px 12px 12px; } .de-detail-bloc > summary { cursor: pointer; font-weight: 700; padding: 4px 0 8px; }',
      '.de-chips { margin-top: 8px; } .de-chips-l { display: flex; flex-wrap: wrap; gap: 6px; }',
      '.de-chip { border: 1px solid var(--ligne, #E3E7EB); background: var(--carte, #fff); color: var(--encre-2); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 12.5px; cursor: pointer; }',
      '.de-chips.rouge .de-chip.actif { background: #FDECEC; border-color: #D64545; color: #B83232; font-weight: 600; } .de-chips.bleu .de-chip.actif { background: #E8F0FB; border-color: #1A64BF; color: #1A64BF; font-weight: 600; } .de-chips.vert .de-chip.actif { background: var(--vert-clair, #E6F3EC); border-color: var(--vert, #008840); color: var(--vert-fonce, #006B33); font-weight: 600; }',
      '.de-detail { margin-top: 2px; } @media (max-width: 640px) { .de-grille.trois { grid-template-columns: repeat(2, minmax(0, 1fr)); } }',
      '.de-evaluateurs, .de-raisons { display: flex; flex-wrap: wrap; gap: 8px; }',
      '.de-eval { display: grid; text-align: left; gap: 2px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--ligne, #E3E7EB); background: var(--carte, #fff); cursor: pointer; min-width: 150px; font: inherit; }',
      '.de-eval b { display: flex; align-items: center; } .de-eval span { font-size: 12px; color: var(--encre-3); } .de-eval.choisi { border-color: var(--vert); box-shadow: 0 0 0 2px var(--vert) inset; background: var(--vert-clair, #E8F6EC); }',
      '.eval-demande { padding: 10px 14px; border-radius: 10px; margin: 0 0 12px; border-left: 5px solid #D64545; background: #FDECEC; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }',
      '.eval-demande.encours { border-left-color: #C98A1A; background: #FFF4DE; } .eval-demande.faite { border-left-color: #1E8E4A; background: #E8F6EC; }',
      '.eval-demande.approbation { border-left-color: var(--violet, #6D4FC7); background: var(--violet-bg, #F1EDFC); } .eval-demande.aconfirmer { border-left-color: var(--bleu, #1A64BF); background: #E8F0FB; } .eval-demande.refusee, .eval-demande.annulee { border-left-color: #9AA5AE; background: var(--fond-2, #F3F5F7); }',
      '.eval-demande .eval-demande-boutons { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }',
      '.eval-demande-txt { font-weight: 600; color: var(--encre); } .eval-demande-note { font-style: italic; color: var(--encre-2); } .eval-demande .eval-demande-boutons { align-items: center; }',
      '@media (max-width: 900px) { .de-kanban { grid-template-columns: repeat(4, 240px); } .de-kanban.large { grid-template-columns: repeat(6, 230px); } .de-etapes.circuit { grid-template-columns: repeat(3, 1fr); } }',
      '@media (max-width: 640px) { .de-grille { grid-template-columns: 1fr; } .de-corps { display: block; } .de-valeur { text-align: left; margin-top: 6px; } .de-etapes, .de-etapes.circuit { grid-template-columns: 1fr 1fr; } .de-tete .de-chrono { margin-left: 0; } }'
    ].join('\n');
    document.head.appendChild(s);
  }
  injecterCss();
})();
