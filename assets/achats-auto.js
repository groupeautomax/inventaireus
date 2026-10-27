/* =========================================================================
   achats-auto.js — achats entrés automatiquement au registre (26 oct. 2026)

   AchatsAuto.gs entre tout seul, au statut « Acheté », les achats lus sur les portails (favori DealerSource sur
   « Mes transactions », achats Manheim de BMW Financial Services). Maxime : « il faut qu'il soit une autre couleur ou
   inscrit d'une manière distinctive ». Tant que personne ne l'a confirmé, un tel véhicule est en VIOLET dans Occasion :
   ligne bordée de violet, puce « Auto · GMF », chiffre « Entrés automatiquement » (filtre ?alerte=auto) et, dans le
   panneau, un bloc qui dit d'où il vient avec le bouton « Confirmer ». L'Accueil compte ceux qui restent à confirmer.

   AMX.achatsAuto : charger(force) · enCache() · entree(vin) (non confirmée, sinon null) · compte(compagnie) ·
   puce(vin) · bloc(vin) · confirmer(vins) · lireOpenlane(compagnie) · peutLire() · vider(). Événement « amx:achatsAuto ».
   OPENLANE n'a pas de favori : le serveur lit ses achats tout seul aux 2 heures (AchatsAuto.gs, ACHA_tic) ;
   lireOpenlane() le fait tout de suite (menu « … » d'Occasion).

   Contrats d'achat reçus par courriel (AchatsCourriel.gs, 26 oct.) : on transfère le contrat (PDF, photo, ou la
   confirmation dans le texte) à l'adresse dédiée ; Einstein AI le lit et le véhicule entre au registre en violet, ou
   reste « À vérifier » avec la raison. AMX.achatsAuto.contrats : charger(force) · enCache() · aVerifier(compagnie) ·
   ouvrir({ apres }) (fenêtre « Contrats d'achat reçus », Occasion › « … » et Accueil) · document(id). Événement « amx:contrats ».
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones || {};
  var DUREE_MS = 60000;
  var cache = { d: null, le: 0, promesse: null, index: {} };

  function vinDe(x) { return String(x || '').trim().toUpperCase(); }
  function indexer(d) {
    var ix = {};
    ((d && d.achats) || []).forEach(function (a) { var v = vinDe(a.vin); if (v && !ix[v]) ix[v] = a; });
    cache.index = ix;
  }
  function annoncer() { try { document.dispatchEvent(new CustomEvent('amx:achatsAuto')); } catch (e) {} }
  function argent(n) { return (n === null || n === undefined || isNaN(Number(n))) ? '' : AMX.fmtArgent(Number(n), 0); }
  function jour(x) { return x ? (AMX.fmtDateCourte ? AMX.fmtDateCourte(x) : AMX.fmtDate(x)) : ''; }
  function nomRegistre(r) { return { DETAIL: 'Detail', CAN: 'Canada', US: 'É.-U.' }[r] || r || ''; }

  var A = AMX.achatsAuto = {
    charger: function (force) {
      if (!force && cache.d && Date.now() - cache.le < DUREE_MS) return Promise.resolve(cache.d);
      if (cache.promesse) return cache.promesse;
      cache.promesse = AMX.get({ achatsAuto: 1 }, { secours: false, delai: 45000 }).then(function (d) {
        cache.promesse = null;
        if (!d || !Array.isArray(d.achats)) throw new Error('Le script n\'est pas à jour (AchatsAuto.gs) : il faut le déployer.');
        cache.d = d; cache.le = Date.now(); indexer(d); annoncer();
        return d;
      }, function (e) { cache.promesse = null; throw e; });
      return cache.promesse;
    },
    enCache: function () { return cache.d; },
    vider: function () { cache.d = null; cache.le = 0; cache.index = {}; },
    /** L'entrée automatique non confirmée de ce NIV, sinon null. */
    entree: function (vin) { var a = cache.index[vinDe(vin)]; return a && !a.confirme ? a : null; },
    /** Nombre d'entrées à confirmer (une concession, ou toutes). */
    compte: function (cie) { return ((cache.d && cache.d.achats) || []).filter(function (a) { return !a.confirme && (!cie || a.compagnie === cie); }).length; },
    /** { registre: n } des entrées à confirmer, pour aller au bon registre. */
    parRegistre: function (cie) { var o = {}; ((cache.d && cache.d.achats) || []).forEach(function (a) { if (!a.confirme && (!cie || a.compagnie === cie)) o[a.registre] = (o[a.registre] || 0) + 1; }); return o; },
    puce: function (vin) {
      var a = A.entree(vin); if (!a) return null;
      return h('span.puce.auto', { text: 'Auto · ' + (a.sourceCourt || a.source), title: 'Entré automatiquement le ' + jour(a.le) + ' depuis ' + (a.sourceNom || a.source) + ' — à confirmer' });
    },
    confirmer: function (vins) {
      vins = (Array.isArray(vins) ? vins : [vins]).map(vinDe).filter(Boolean);
      return AMX.post({ action: 'achatAutoConfirmer', vins: vins }, { rejouer: true }).then(function (r) {
        AMX.verifier(r, 'Confirmation refusée');
        if (r.confirmes === undefined) throw new Error('Le script n\'est pas à jour (AchatsAuto.gs) : il faut le déployer.');
        var maintenant = new Date().toISOString();
        ((cache.d && cache.d.achats) || []).forEach(function (a) { if (vins.indexOf(vinDe(a.vin)) >= 0) { a.confirme = true; a.confirmeLe = maintenant; a.confirmePar = (AMX.session && AMX.session.courriel) || ''; } });
        if (cache.d) cache.d.aConfirmer = A.compte('');
        annoncer();
        return r;
      });
    },
    /** Ceux qui peuvent entrer des achats (mêmes droits que le serveur). */
    peutLire: function () { return !!(AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.perm('ajouterVehicule') || AMX.estAdmin()); },
    /** « Lire les achats OPENLANE » : le serveur lit OPENLANE tout de suite et entre les achats récents. */
    lireOpenlane: function (cie) {
      AMX.toast('Lecture des achats OPENLANE…', 'info');
      return AMX.post({ action: 'achatsOpenlane', compagnie: cie || '' }, { delai: 150000 }).then(function (r) {
        if (r && r.vehicules && !r.concessions) throw new Error('Le script n\'est pas à jour (AchatsAuto.gs) : il faut le déployer.');
        AMX.verifier(r, 'Lecture OPENLANE refusée');
        var n = (r.ajoutes || []).length, lus = r.lus || 0;
        var txt = n ? n + ' achat' + (n > 1 ? 's' : '') + ' OPENLANE entré' + (n > 1 ? 's' : '') + ' au registre (en violet)' : 'OPENLANE : ' + lus + ' achat' + (lus > 1 ? 's' : '') + ' lu' + (lus > 1 ? 's' : '') + ', rien de nouveau à entrer';
        if ((r.erreurs || []).length) txt += ' — ' + r.erreurs.join(' · ');
        AMX.toast(txt, n ? 'ok' : 'info');
        return A.charger(true).then(function () { return r; });
      }).catch(function (e) { AMX.toast(e.message || String(e), 'erreur'); throw e; });
    },
    /** Bloc violet du panneau Occasion : d'où vient l'entrée, le prix, et « Confirmer ». */
    bloc: function (vin) {
      var a = A.entree(vin); if (!a) return null;
      var details = [
        a.acheteLe ? 'acheté le ' + jour(a.acheteLe) : '',
        a.prix ? argent(a.prix) + (a.frais ? ' + ' + argent(a.frais) + ' de frais' : '') : '',
        a.paye ? 'payé' + (/^\d{4}-/.test(a.paye) ? ' le ' + jour(a.paye) : '') : 'pas encore payé',
        a.vendeur || ''
      ].filter(Boolean).join(' · ');
      var etat = h('span.doux.petit');
      var b = h('div.bloc.achat-auto-bloc', [
        h('h3', 'Entré automatiquement'),
        h('p', { text: 'Ce véhicule est entré tout seul au registre ' + nomRegistre(a.registre) + ', au statut « Acheté », le ' + jour(a.le) + ' depuis ' + (a.sourceNom || a.source) + '.' }),
        details ? h('p.doux.petit', { text: details }) : null,
        h('p.doux.petit', { text: 'Vérifiez le registre et la fiche d\'achat, puis confirmez : le violet disparaît.' }),
        h('div.actions-ligne', [
          (cache.d && cache.d.peutConfirmer) ? h('button.btn.primaire', { type: 'button', html: (I.ok || '') + '<span>Confirmer l\'achat</span>', onclick: function () {
            etat.textContent = 'Confirmation…';
            A.confirmer([vin]).then(function () { AMX.toast('Achat confirmé', 'ok'); }).catch(function (e) { etat.textContent = ''; AMX.toast(e.message || String(e), 'erreur'); });
          } }) : null,
          h('a.btn', { href: AMX.lien('achat', '', { vin: vin }), html: (I.achat || '') + '<span>Fiche d\'achat</span>' }),
          (a.source === 'courriel' && /^AC-\d+$/.test(a.ref || '')) ? h('button.btn', { type: 'button', html: (I.externe || '') + '<span>Voir le contrat</span>', onclick: function () { C.document(a.ref); } }) : null,
          etat
        ])
      ]);
      return b;
    }
  };

  /* ------------------------ Contrats d'achat reçus par courriel ------------------------ */
  var PAS_A_JOUR = 'Le script n\'est pas à jour (AchatsCourriel.gs) : il faut le déployer.';
  var cacheC = { d: null, le: 0, promesse: null };
  var TONS = { a_valider: 'ambre', erreur: 'rouge', entre: 'violet', deja: 'vert', pas_contrat: 'gris', ignore: 'gris' };
  var LIBELLES = { a_valider: 'À vérifier', erreur: 'Erreur de lecture', entre: 'Entré au registre', deja: 'Déjà au registre', pas_contrat: 'Pas un contrat', ignore: 'Ignoré' };
  function annoncerC() { try { document.dispatchEvent(new CustomEvent('amx:contrats')); } catch (e) {} }
  function aVoir(c) { return c.statut === 'a_valider' || c.statut === 'erreur'; }
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES || {})[c] || c || ''; }
  function heure(x) { try { return AMX.fmtDate(x, true); } catch (e) { return x || ''; } }

  var C = A.contrats = {
    charger: function (force) {
      if (!force && cacheC.d && Date.now() - cacheC.le < DUREE_MS) return Promise.resolve(cacheC.d);
      if (cacheC.promesse) return cacheC.promesse;
      cacheC.promesse = AMX.get({ achatsCourriels: 1 }, { secours: false, delai: 45000 }).then(function (d) {
        cacheC.promesse = null;
        if (!d || !Array.isArray(d.contrats)) throw new Error(PAS_A_JOUR);
        cacheC.d = d; cacheC.le = Date.now(); annoncerC();
        return d;
      }, function (e) { cacheC.promesse = null; throw e; });
      return cacheC.promesse;
    },
    enCache: function () { return cacheC.d; },
    vider: function () { cacheC.d = null; cacheC.le = 0; },
    /** Contrats à vérifier (une concession ; sans concession choisie, tous ceux que la personne voit). */
    aVerifier: function (cie) { return ((cacheC.d && cacheC.d.contrats) || []).filter(function (c) { return aVoir(c) && (!cie || c.compagnie === cie); }); },
    /** Le fichier reçu (PDF ou photo), ouvert dans un onglet — jamais un lien public. */
    document: function (id) {
      var w = window.open('', '_blank');
      if (w) { try { w.document.title = 'Contrat d\'achat'; w.document.body.style.font = '14px system-ui'; w.document.body.textContent = 'Téléchargement du contrat…'; } catch (e0) {} }
      return AMX.get({ achatCourrielDoc: 1, id: id }, { secours: false, delai: 60000 }).then(function (r) {
        if (r && r.vehicules && r.ok !== false && !r.base64) throw new Error(PAS_A_JOUR);
        if (!r || !r.ok || !r.base64) throw new Error((r && r.erreur) || 'Document indisponible');
        var bin = atob(r.base64), oct = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) oct[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([oct], { type: r.mime || 'application/pdf' }));
        if (w) w.location = url; else { var l = h('a', { href: url, download: r.nom || 'contrat.pdf' }); document.body.appendChild(l); l.click(); l.remove(); }
        setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
      }).catch(function (e) { if (w) w.close(); AMX.toast('Contrat : ' + AMX.erreurTexte(e), 'erreur'); });
    },
    ouvrir: function (opts) { return ouvrirContrats(opts || {}); }
  };

  function ouvrirContrats(opts) {
    var filtre = 'verifier';
    var elEtat = h('div.contrats-etat'), elFiltres = h('div.segment.contrats-filtres', { 'aria-label': 'Contrats' }), elListe = h('div.contrats-liste', [AMX.chargeur ? AMX.chargeur('Contrats d\'achat reçus', { compact: true }) : h('p.doux', { text: 'Chargement…' })]);
    var m = AMX.modale({ titre: 'Contrats d\'achat reçus', large: true, classe: 'contrats-modale', proteger: false, corps: h('div', [elEtat, elFiltres, elListe]), boutons: [{ texte: 'Fermer' }], onFermer: opts.onFermer });
    var apres = function () { A.charger(true).catch(function () {}); if (opts.apres) { try { opts.apres(); } catch (e) {} } };

    function dessinerEtat(d) {
      AMX.vider(elEtat);
      var adresses = (d.reglages && d.reglages.adresses) || [];
      var e = d.etat || {};
      elEtat.appendChild(h('div.contrats-adresse', [
        h('div', [
          h('strong', 'Transférez les contrats d\'achat à '),
          adresses.length ? h('span', adresses.map(function (x, i) { return h('span', [i ? ' ou ' : '', h('button.lien-copier', { type: 'button', title: 'Copier l\'adresse', text: x, onclick: function () { AMX.copier(x, 'Adresse copiée'); } })]); })) : null
        ]),
        h('p.doux.petit', { text: 'PDF, photo JPEG / PNG, ou la confirmation de l\'encan dans le texte du courriel. Einstein AI lit le contrat aux 10 minutes : le véhicule entre au registre en violet, ou reste « À vérifier » avec la raison. Aucun courriel ni texto n\'est envoyé.' }),
        (d.ia && d.ia.present === false) ? h('p.contrats-avis', { text: 'Einstein AI n\'a pas de clé (Admin › Einstein AI) : les contrats arrivent « À vérifier » et se remplissent à la main.' }) : null,
        (d.reglages && d.reglages.auto === false) ? h('p.contrats-avis', { text: 'Entrée automatique désactivée : chaque contrat attend une vérification.' }) : null,
        h('div.actions-ligne', [
          h('span.doux.petit', { text: e.le ? 'Dernière lecture : ' + heure(e.le) + (e.erreur ? ' — ' + e.erreur : '') : 'Pas encore de lecture.' }),
          d.peutValider ? h('button.btn.petit', { type: 'button', html: (I.rafraichir || '') + '<span>Lire les courriels maintenant</span>', onclick: function (ev) { lireMaintenant(ev.currentTarget); } }) : null,
          d.peutRegler ? h('button.btn.petit.fantome', { type: 'button', text: 'Réglages', onclick: function () { reglages(d); } }) : null
        ])
      ]));
    }
    function dessinerFiltres(d) {
      AMX.vider(elFiltres);
      var liste = d.contrats || [];
      [['verifier', 'À vérifier', liste.filter(aVoir).length], ['entres', 'Entrés', liste.filter(function (c) { return c.statut === 'entre' || c.statut === 'deja'; }).length], ['tous', 'Tous', liste.length]].forEach(function (f) {
        elFiltres.appendChild(h('button' + (filtre === f[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': filtre === f[0] ? 'true' : 'false', text: f[1] + ' · ' + f[2], onclick: function () { filtre = f[0]; dessiner(d); } }));
      });
    }
    function ligneVehicule(c) {
      var v = c.vehicule || {};
      return [c.modele || [v.annee, v.marque, v.modele, v.version].filter(Boolean).join(' '), c.vin ? 'NIV ' + c.vin : '', c.prix ? argent(c.prix) : '', c.acheteLe ? 'acheté le ' + jour(c.acheteLe) : '', c.compagnie ? nomCie(c.compagnie) : 'concession à choisir'].filter(Boolean).join(' · ');
    }
    function carte(c, d) {
      var ton = TONS[c.statut] || 'gris', btns = [];
      if (c.aDocument) btns.push(h('button.btn.petit', { type: 'button', html: (I.externe || '') + '<span>Voir le document</span>', onclick: function () { C.document(c.id); } }));
      if (d.peutValider && aVoir(c)) {
        btns.push(h('button.btn.petit.primaire', { type: 'button', text: 'Vérifier et entrer au registre', onclick: function () { formulaire(c, d); } }));
        btns.push(h('button.btn.petit', { type: 'button', text: 'Relire avec Einstein AI', onclick: function (ev) { relire(c, ev.currentTarget); } }));
      }
      if (d.peutValider && (aVoir(c) || c.statut === 'pas_contrat')) btns.push(h('button.btn.petit.fantome', { type: 'button', text: 'Ignorer', onclick: function () { ignorer(c); } }));
      if ((c.statut === 'entre' || c.statut === 'deja') && c.vin) btns.push(h('a.btn.petit', { href: AMX.lien('inventaire', 'usage', { vin: c.vin }), text: 'Ouvrir dans Occasion', onclick: function () { m.fermer(); } }));
      return h('div.contrat-carte.' + ton, { 'data-id': c.id }, [
        h('div.contrat-tete', [
          h('span.badge.' + ton, { text: LIBELLES[c.statut] || c.statutLibelle || c.statut }),
          h('strong', { text: ligneVehicule(c) || c.fichier || c.sujet || c.id }),
          h('span.doux.petit', { text: c.id })
        ]),
        c.raison ? h('p.contrat-raison', { text: c.raison }) : null,
        h('p.doux.petit', { text: ['reçu ' + heure(c.recuLe), c.de ? 'de ' + c.de : '', c.sujet ? '« ' + c.sujet + ' »' : '', c.fichier].filter(Boolean).join(' · ') }),
        (c.lecture && c.lecture.resume) ? h('p.doux.petit', { text: 'Einstein AI : ' + c.lecture.resume + (c.lecture.vendeur ? ' — vendeur : ' + c.lecture.vendeur + (c.lecture.vendeurParticulier ? ' (particulier)' : '') : '') }) : null,
        btns.length ? h('div.actions-ligne', btns) : null
      ]);
    }
    function dessiner(d) {
      dessinerEtat(d); dessinerFiltres(d); AMX.vider(elListe);
      var liste = (d.contrats || []).filter(function (c) { return filtre === 'tous' ? true : (filtre === 'entres' ? (c.statut === 'entre' || c.statut === 'deja') : aVoir(c)); });
      if (!liste.length) { elListe.appendChild(h('p.doux', { text: filtre === 'verifier' ? 'Rien à vérifier.' : 'Aucun contrat reçu dans les 90 derniers jours.' })); return; }
      liste.forEach(function (c) { elListe.appendChild(carte(c, d)); });
    }
    function recharger() {
      return C.charger(true).then(dessiner).catch(function (e) { AMX.vider(elListe); elListe.appendChild(h('p.erreur', { text: AMX.erreurTexte(e) })); });
    }
    function lireMaintenant(btn) {
      if (btn) btn.classList.add('occupe');
      AMX.toast('Lecture des courriels…', 'info');
      return AMX.post({ action: 'achatsCourrielsLire' }, { delai: 240000 }).then(function (r) {
        if (r && r.vehicules && r.lues === undefined) throw new Error(PAS_A_JOUR);
        if (r && r.enCours) { AMX.toast(r.erreur, 'info'); return; }
        AMX.verifier(r, 'Lecture refusée');
        var t = r.lues ? r.lues + ' pièce' + (r.lues > 1 ? 's' : '') + ' lue' + (r.lues > 1 ? 's' : '') + ' : ' + [r.entres ? r.entres + ' entrée' + (r.entres > 1 ? 's' : '') + ' au registre' : '', r.aValider ? r.aValider + ' à vérifier' : '', r.deja ? r.deja + ' déjà au registre' : '', r.pasContrat ? r.pasContrat + ' pas un contrat' : ''].filter(Boolean).join(', ') : 'Aucun nouveau contrat.';
        if (r.reste) t += ' — ' + r.reste + ' de plus au prochain passage';
        AMX.toast(t, r.entres ? 'ok' : 'info');
        if (r.entres) apres();
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); })
        .then(function () { if (btn) btn.classList.remove('occupe'); return recharger(); });
    }
    function relire(c, btn) {
      btn.classList.add('occupe');
      return AMX.post({ action: 'achatCourrielRelire', id: c.id }, { delai: 240000 }).then(function (r) {
        if (r && r.vehicules && r.lues === undefined) throw new Error(PAS_A_JOUR);
        AMX.verifier(r, 'Relecture refusée');
        AMX.toast(r.entres ? 'Relu : entré au registre' : 'Relu', r.entres ? 'ok' : 'info');
        if (r.entres) apres();
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }).then(function () { btn.classList.remove('occupe'); return recharger(); });
    }
    function reglages(d) {
      var r = d.reglages || {};
      var elAdr = h('textarea.saisie', { rows: 3, text: (r.adresses || []).join('\n') });
      var elJours = h('input.saisie', { type: 'number', min: 1, max: 60, value: String(r.jours || 14) });
      var elAuto = h('input', { type: 'checkbox', checked: r.auto !== false });
      var err = h('p.erreur', { hidden: true });
      AMX.modale({ titre: 'Réglages — contrats par courriel', corps: h('div.contrat-form', [
        h('label.champ', [h('span', 'Adresses lues (une par ligne, 5 au plus)'), elAdr]),
        h('p.doux.petit', { text: 'Une adresse du groupe (ex. achats@groupeautomax.com) doit transférer ses courriels à maximeallard207+achats@gmail.com.' }),
        h('label.champ', [h('span', 'Courriels des N derniers jours'), elJours]),
        h('label.case', [elAuto, h('span', ' Entrer au registre tout seul quand la lecture est complète (sinon : tout à vérifier)')]),
        err
      ]), boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
        return AMX.post({ action: 'achatsCourrielReglages', adresses: elAdr.value.split(/[\s,;]+/).filter(Boolean), jours: elJours.value, auto: elAuto.checked ? 'oui' : 'non' }, { rejouer: true }).then(function (x) {
          if (x && x.vehicules && !x.reglages) throw new Error(PAS_A_JOUR);
          if (x && x.ok === false && !x.refuse) { err.hidden = false; err.textContent = x.erreur || 'Refusé'; return false; }
          AMX.verifier(x, 'Refusé'); AMX.toast(x.message || 'Enregistré', 'ok'); recharger();
        }).catch(function (e) { err.hidden = false; err.textContent = AMX.erreurTexte(e); return false; });
      } }] });
    }
    function ignorer(c) {
      var raison = h('input.saisie', { type: 'text', placeholder: 'Pourquoi (facultatif) : doublon, pas un achat…' });
      AMX.modale({ titre: 'Ignorer ce contrat', proteger: false, corps: h('div', [h('p', { text: ligneVehicule(c) || c.fichier }), h('label.champ', [h('span', 'Raison'), raison])]), boutons: [
        { texte: 'Annuler' },
        { texte: 'Ignorer', classe: 'danger', action: function () {
          return AMX.post({ action: 'achatCourrielIgnorer', id: c.id, raison: raison.value }, { rejouer: true }).then(function (r) {
            if (r && r.vehicules && !r.contrat) throw new Error(PAS_A_JOUR);
            AMX.verifier(r, 'Refusé'); AMX.toast('Contrat ignoré', 'ok'); recharger();
          }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
        } }
      ] });
    }
    function formulaire(c, d) {
      var v = c.vehicule || {}, champs = {};
      function champ(cle, libelle, valeur, o) {
        o = o || {};
        var el = o.options ? h('select.saisie', o.options.map(function (x) { return h('option', { value: x[0], text: x[1], selected: String(valeur || '') === x[0] }); }))
          : h('input.saisie', { type: o.type || 'text', value: valeur === undefined || valeur === null ? '' : String(valeur), placeholder: o.placeholder || '', inputmode: o.inputmode || null, maxlength: o.max || null });
        champs[cle] = el;
        return h('label.champ' + (o.large ? '.large' : ''), [h('span', { text: libelle }), el]);
      }
      var codes = AMX.codesPour ? AMX.codesPour('inventaire') : Object.keys(AMX.COMPAGNIES_TOUTES || {});
      var optsCie = [['', '— Choisir —']].concat(codes.map(function (k) { return [k, nomCie(k)]; }));
      var erreur = h('p.erreur', { hidden: true });
      var corps = h('div.contrat-form', [
        c.raison ? h('p.contrats-avis', { text: 'À vérifier : ' + c.raison }) : null,
        h('p.doux.petit', { text: 'Corrigez ce qu\'Einstein AI a lu, d\'après le document' + (c.aDocument ? ' (bouton « Voir le document »)' : '') + '. NIV, concession, date d\'achat et prix sont obligatoires. Le véhicule entre au registre au statut « Acheté », confirmé : vous l\'avez vérifié.' }),
        c.aDocument ? h('div.actions-ligne', [h('button.btn.petit', { type: 'button', html: (I.externe || '') + '<span>Voir le document</span>', onclick: function () { C.document(c.id); } })]) : null,
        h('div.grille-champs', [
          champ('compagnie', 'Concession qui achète', c.compagnie, { options: optsCie }),
          champ('vin', 'NIV (17 caractères)', c.vin || v.vin, { max: 17, placeholder: '1GCPDBEK5RZ189486' }),
          champ('dateAchat', 'Date d\'achat', c.acheteLe || v.dateAchat, { type: 'date' }),
          champ('prix', 'Prix d\'achat (avant taxes)', c.prix || v.prix, { inputmode: 'decimal' }),
          champ('frais', 'Frais d\'achat (sans transport)', v.frais, { inputmode: 'decimal' }),
          champ('paye', 'Payé', v.paye === 'oui' ? 'oui' : 'non', { options: [['non', 'Pas encore'], ['oui', 'Oui']] }),
          champ('annee', 'Année', v.annee, { inputmode: 'numeric', max: 4 }),
          champ('marque', 'Marque', v.marque),
          champ('modele', 'Modèle', v.modele),
          champ('version', 'Version', v.version),
          champ('km', 'Km', v.km, { inputmode: 'numeric' }),
          champ('couleur', 'Couleur', v.couleur),
          champ('vendeur', 'Vendeur ou encan', c.vendeur || (c.lecture && c.lecture.vendeur)),
          champ('lieu', 'Lieu du véhicule (encan, terrain)', v.lieu),
          champ('ville', 'Ville', v.ville),
          champ('province', 'Province', v.province, { max: 4 }),
          champ('codePostal', 'Code postal', v.codePostal, { max: 10 })
        ]),
        erreur
      ]);
      var f = AMX.modale({ titre: 'Vérifier et entrer au registre', large: true, corps: corps, boutons: [
        { texte: 'Annuler' },
        { texte: 'Entrer au registre', classe: 'primaire', action: function () {
          var o = {}; Object.keys(champs).forEach(function (k) { o[k] = String(champs[k].value || '').trim(); });
          o.vin = o.vin.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
          var manque = [];
          if (!o.compagnie) manque.push('la concession'); if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(o.vin)) manque.push('un NIV de 17 caractères (sans I, O ni Q)');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(o.dateAchat)) manque.push('la date d\'achat'); if (!(Number(String(o.prix).replace(/[^0-9.]/g, '')) > 0)) manque.push('le prix');
          if (manque.length) { erreur.hidden = false; erreur.textContent = 'Il manque ' + manque.join(', ') + '.'; return false; }
          erreur.hidden = true;
          return AMX.post({ action: 'achatCourrielValider', id: c.id, champs: o }, { delai: 60000 }).then(function (r) {
            if (r && r.vehicules && !r.contrat) throw new Error(PAS_A_JOUR);
            if (r && r.ok === false && !r.refuse) { erreur.hidden = false; erreur.textContent = r.erreur || 'Refusé'; recharger(); return false; }
            AMX.verifier(r, 'Refusé');
            AMX.toast(r.message || 'Entré au registre', 'ok');
            if (r.registre && AMX.inventaire && AMX.inventaire.lire) AMX.inventaire.lire(r.registre, true).catch(function () {});
            apres(); recharger();
          }).catch(function (e) { erreur.hidden = false; erreur.textContent = AMX.erreurTexte(e); return false; });
        } }
      ] });
      return f;
    }

    C.charger(true).then(dessiner).catch(function (e) {
      AMX.vider(elListe);
      elListe.appendChild(h('p.erreur', { text: AMX.erreurTexte(e) }));
    });
    return m;
  }

  /* Violet : la ligne d'Occasion, la puce, le chiffre et le bloc du panneau (couleurs du thème, mode sombre compris). */
  if (!document.getElementById('css-achats-auto')) {
    var st = document.createElement('style'); st.id = 'css-achats-auto';
    st.textContent = [
      '.ligne.achat-auto { box-shadow: inset 4px 0 0 var(--violet); background: var(--violet-bg); }',
      '.puce.auto { color: var(--violet); background: var(--violet-bg); border-color: var(--violet-bord); font-weight: 600; }',
      '.kpi.auto { border-color: var(--violet-bord); } .kpi.auto .valeur { color: var(--violet); } .kpi.auto.actif { background: var(--violet-bg); }',
      '.bloc.achat-auto-bloc { border: 1px solid var(--violet-bord); border-left: 4px solid var(--violet); background: var(--violet-bg); border-radius: 10px; padding: 12px 14px; }',
      '.bloc.achat-auto-bloc h3 { color: var(--violet); }',
      '.bloc.achat-auto-bloc p { margin: 4px 0; }',
      '.contrats-adresse { border: 1px solid var(--trait); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; background: var(--fond-2); }',
      '.contrats-adresse p { margin: 6px 0; }',
      '.lien-copier { background: none; border: 0; padding: 0; color: var(--vert-fonce); font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }',
      '.contrats-avis { color: var(--ambre); font-weight: 600; margin: 6px 0; }',
      '.contrats-filtres { margin: 6px 0 10px; }',
      '.contrats-liste { display: grid; gap: 8px; }',
      '.contrat-carte { border: 1px solid var(--trait); border-left: 4px solid var(--encre-4); border-radius: 10px; padding: 10px 12px; background: var(--fond-carte, #fff); }',
      '.contrat-carte.ambre { border-left-color: var(--ambre); } .contrat-carte.rouge { border-left-color: var(--rouge); }',
      '.contrat-carte.violet { border-left-color: var(--violet); background: var(--violet-bg); } .contrat-carte.vert { border-left-color: var(--vert); }',
      '.contrat-carte p { margin: 4px 0; } .contrat-tete { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }',
      '.contrat-tete strong { flex: 1 1 260px; min-width: 0; } .contrat-raison { font-weight: 600; color: var(--encre-2); }',
      '.badge.violet { color: var(--violet); background: var(--violet-bg); border-color: var(--violet-bord); }',
      '.inv2-pastille.contrats { border-color: var(--violet-bord); background: var(--violet-bg); color: var(--violet); font-weight: 600; }',
      '.inv2-pastille.contrats b { color: var(--violet); } .inv2-pastille.contrats:hover { border-color: var(--violet); color: var(--violet); }',
      '.contrat-form .grille-champs { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px 12px; margin-top: 8px; }',
      '.contrat-form .champ { display: grid; gap: 4px; } .contrat-form .champ > span { font-size: 12px; color: var(--encre-3); }',
      '.contrats-modale .erreur, .contrat-form .erreur { color: var(--rouge); font-weight: 600; margin: 8px 0 0; }'
    ].join('\n');
    document.head.appendChild(st);
  }
})();
