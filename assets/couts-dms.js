/* =========================================================================
   couts-dms.js — le coût réel d'une occasion : payé, ajouté par le service, PAD
   (20 nov. 2026 — suggestion S57B2871C3C, Eric Morin, VW Brossard : « quand je
   veux wholesaler une auto, j'aimerais voir le coûtant réel sans PAD ou frais,
   seulement le coût payé et le surplus si le service a injecté des coûts » ;
   Maxime : « les deux montants distincts pour voir le total avec le PAD de 450 »)

   Le fichier d'inventaire du DMS donne deux montants par occasion : le payé et
   le coût aux livres. Le serveur les garde (gs/CoutsDms.gs, GET ?coutsDms=1) ;
   le PAD est un montant fixe par concession (VW : 450 $). Même calcul que le
   serveur (CDMS_calcul_) :
       ajouté      = aux livres − payé
       PAD compté  = le PAD de la concession, seulement si « ajouté » le contient
       service     = ajouté − PAD compté
       coût réel   = aux livres − PAD compté          (= payé + service)

   Rien n'est gardé dans le navigateur (ce sont des coûts) : mémoire seulement,
   et rien du tout pour un compte qui ne voit pas les coûts (AMX.voitCouts).

   AMX.coutsDms = { charger(force), de(v), calcul(paye, livres, pad), sousCout(v),
                    bloc(v, opts), pad(cie), pads(), peutRegler(), regler(), vider() }
   Événement « amx:coutsDms » quand les montants ou les PAD changent.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h;
  var JOURS_MAX = 10;

  var etat = { cies: {}, pads: {}, quand: 0, enVol: null, peutRegler: false, pasAJour: false, courriel: '' };

  function voit() { return !AMX.voitCouts || AMX.voitCouts(); }
  function vinDe(x) { var s = String(x || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); return s.length === 17 ? s : ''; }
  function cieDe(v) { return String((v && v.compagnie) || '').trim().toUpperCase(); }
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c; }
  function argent(n) { return AMX.fmtArgent(n, Math.round(n * 100) % 100 ? 2 : 0); }

  function montant(x) {
    if (x === null || x === undefined || x === '') return null;
    var n = (typeof x === 'number') ? x : Number(String(x).replace(/[^\d.\-]/g, ''));
    if (!isFinite(n) || n <= 0 || n > 2000000) return null;
    return Math.round(n * 100) / 100;
  }

  /** Le même calcul que CDMS_calcul_ (gs/CoutsDms.gs) : changer l'un, changer l'autre. */
  function calcul(paye, livres, pad) {
    paye = montant(paye); livres = montant(livres); pad = Number(pad) > 0 ? Number(pad) : 0;
    if (paye === null && livres === null) return null;
    var r = { paye: paye, livres: livres, ajoute: null, pad: 0, service: null, reel: null };
    if (paye !== null && livres !== null) {
      r.ajoute = Math.round((livres - paye) * 100) / 100;
      if (pad > 0 && r.ajoute >= pad) r.pad = pad;
      r.service = Math.round((r.ajoute - r.pad) * 100) / 100;
      r.reel = Math.round((livres - r.pad) * 100) / 100;
    } else if (paye !== null) r.reel = paye;
    return r;
  }

  function memeCompte() {
    var c = String((AMX.session && AMX.session.courriel) || '');
    if (etat.courriel !== c) { etat.cies = {}; etat.pads = {}; etat.quand = 0; etat.peutRegler = false; etat.courriel = c; }
  }
  function annoncer() { try { document.dispatchEvent(new CustomEvent('amx:coutsDms')); } catch (e) {} }

  function charger(force) {
    memeCompte();
    if (!voit()) return Promise.resolve(etat);
    if (!force && etat.quand && Date.now() - etat.quand < AMX.dureeCopie(600000)) return Promise.resolve(etat);
    if (etat.enVol) return etat.enVol;
    var pour = etat.courriel;
    etat.enVol = AMX.get({ coutsDms: 1 }, { discret: true, secours: false }).then(function (d) {
      etat.enVol = null;
      if (pour !== String((AMX.session && AMX.session.courriel) || '')) return etat;      // un autre compte s'est connecté entre-temps
      etat.quand = Date.now();
      if (d && d.coutsDms === true && d.cies && typeof d.cies === 'object') {
        etat.cies = d.masque ? {} : d.cies; etat.pads = (d.pads && typeof d.pads === 'object') ? d.pads : {};
        etat.peutRegler = !!d.peutRegler; etat.pasAJour = false;
      } else {
        etat.cies = {}; etat.pads = {}; etat.pasAJour = true;      // script d'avant : la page reste comme elle était
      }
      annoncer();
      return etat;
    }, function (e) { etat.enVol = null; throw e; });
    return etat.enVol;
  }

  function frais(le) { var t = new Date(le || 0).getTime(); return t > 0 && Date.now() - t < JOURS_MAX * 86400000; }

  /** Les montants du DMS d'une occasion : { paye, livres, ajoute, pad, service, reel, padRegle, le, cie } ou null. */
  function de(v) {
    if (!v || !voit()) return null;
    memeCompte();
    var cie = cieDe(v), c = etat.cies[cie], vin = vinDe(v.vin);
    var x = (c && c.vins && vin && frais(c.le)) ? c.vins[vin] : null;
    if (!x) return null;
    var r = calcul(x[0], x[1], etat.pads[cie]);
    if (!r) return null;
    r.padRegle = Number(etat.pads[cie]) > 0 ? Number(etat.pads[cie]) : 0;
    r.le = c.le; r.cie = cie;
    return r;
  }

  function dateFichier(le) { return 'fichier du DMS du ' + AMX.fmtDate(le); }

  /** La phrase d'explication (infobulle de la liste). */
  function phrase(r) {
    var t = [];
    if (r.paye !== null) t.push('payé ' + argent(r.paye));
    if (r.service !== null && r.service !== 0) t.push((r.service > 0 ? 'ajouté par le service ' : 'écart ') + argent(r.service));
    if (r.pad) t.push('PAD ' + argent(r.pad) + ' retiré');
    else if (r.padRegle && r.ajoute !== null) t.push('le PAD de ' + argent(r.padRegle) + ' n\'est pas dans le coût du DMS');
    if (r.livres !== null) t.push('total aux livres ' + argent(r.livres));
    return t.join(' · ') + ' — ' + dateFichier(r.le);
  }

  /** Sous le coût, dans la liste : « réel 18 887 $ » (concession avec un PAD), sinon « payé 18 242 $ ». */
  function sousCout(v) {
    var r = de(v);
    if (!r) return null;
    if (r.padRegle && r.reel !== null) return h('span.cdms-reel', { text: 'réel ' + argent(r.reel), title: 'Coût réel, sans le PAD : ' + phrase(r) });
    if (!r.padRegle && r.paye !== null && r.livres !== null && r.paye !== r.livres) return h('span.cdms-reel', { text: 'payé ' + argent(r.paye), title: phrase(r) });
    return null;
  }

  function ligne(libelle, valeur, cls, note) {
    return h('div.cdms-l' + (cls ? '.' + cls : ''), [h('span.cdms-n', [libelle, note ? h('span.cdms-note', { text: note }) : null]), h('span.cdms-v', { text: valeur })]);
  }

  /** Le bloc « Coût réel » du panneau d'une occasion ; null quand le DMS ne donne rien pour ce véhicule. */
  function bloc(v, opts) {
    opts = opts || {};
    var r = de(v);
    if (!r) return null;
    var corps = h('div.cdms-table');
    if (r.paye !== null) corps.appendChild(ligne('Payé', argent(r.paye)));
    if (r.service !== null && (r.service !== 0 || r.pad)) {
      corps.appendChild(ligne(r.service >= 0 ? (r.padRegle ? 'Ajouté par le service' : 'Ajouté depuis l\'achat') : 'Écart (crédit ou dévaluation)', (r.service < 0 ? '−' : '') + argent(Math.abs(r.service))));
    }
    if (r.padRegle) {
      if (r.reel !== null) corps.appendChild(ligne('Coût réel', argent(r.reel), 'fort', 'sans le PAD'));
      if (r.pad) corps.appendChild(ligne('PAD', argent(r.pad)));
      else if (r.ajoute !== null) corps.appendChild(ligne('PAD', '—', '', 'pas dans le coût du DMS'));
      if (r.livres !== null) corps.appendChild(ligne('Total', argent(r.livres), 'fort', r.pad ? 'avec le PAD' : 'aux livres'));
    } else if (r.livres !== null) {
      corps.appendChild(ligne('Total aux livres', argent(r.livres), 'fort'));
    }
    var pied = [h('span', { text: dateFichier(r.le).replace(/^f/, 'F') + (r.paye === null ? ' · payé pas inscrit au DMS' : '') + (!r.padRegle ? ' · aucun PAD réglé pour ' + nomCie(r.cie) : '') })];
    if (etat.peutRegler) pied.push(h('button.cdms-lien', { type: 'button', text: 'PAD par concession…', onclick: function () { regler().then(function (fait) { if (fait && opts.apres) opts.apres(); }); } }));
    return h('div.bloc.cdms-bloc', [h('h3', 'Coût réel'), corps, h('p.cdms-pied', pied)]);
  }

  /** La fenêtre du PAD par concession (propriétaire). Rend une promesse : true si quelque chose a changé. */
  function regler() {
    var codes = Object.keys(AMX.COMPAGNIES_TOUTES || {}), champs = {};
    var corps = h('div.cdms-reglage', [
      h('p', { text: 'Le PAD est le montant fixe que le DMS ajoute au coût d\'une occasion. ScanAutomax le retire pour montrer le coût réel (payé + ce que le service a ajouté). Laissez vide ou 0 pour une concession sans PAD.' })
    ].concat(codes.map(function (c) {
      champs[c] = h('input.saisie', { type: 'text', inputmode: 'decimal', value: etat.pads[c] ? String(etat.pads[c]) : '', placeholder: '0', 'aria-label': 'PAD de ' + nomCie(c) });
      return h('label.cdms-champ', [h('span.cdms-nomcie', { text: nomCie(c) }), champs[c], h('span.cdms-unite', '$')]);
    })));
    return new Promise(function (resolve) {
      var fait = false;
      AMX.modale({ titre: 'PAD par concession', corps: corps, onFermer: function () { resolve(fait); }, boutons: [
        { texte: 'Annuler' },
        { texte: 'Enregistrer', classe: 'primaire', action: function () {
          var pads = {}, mauvais = '';
          codes.forEach(function (c) {
            var t = String(champs[c].value || '').replace(/\s|\$/g, '').replace(',', '.'), n = t === '' ? 0 : Number(t);
            if (!isFinite(n) || n < 0 || n > 5000) mauvais = mauvais || c; else pads[c] = n;
          });
          if (mauvais) { AMX.toast('PAD de ' + nomCie(mauvais) + ' : un montant de 0 à 5 000 $.', 'attention'); champs[mauvais].focus(); return false; }
          return AMX.post({ action: 'coutsDmsReglages', pads: pads }, { rejouer: true }).then(function (d) {
            if (d && d.ok && d.coutsDms !== true) throw new Error('Le script n\'est pas à jour : déployez la nouvelle version (CoutsDms.gs).');
            AMX.verifier(d, 'PAD pas enregistré');
            etat.pads = d.pads || {}; fait = true;
            AMX.toast(d.message || 'PAD enregistré', 'succes');
            annoncer();
          }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 7000); throw e; });
        } }] });
    });
  }

  if (!document.getElementById('css-couts-dms')) {
    var st = document.createElement('style'); st.id = 'css-couts-dms';
    st.textContent =
      '.ligne .montant .cdms-reel { display: block; margin-top: 2px; font-size: 12px; font-weight: 600; color: var(--vert-fonce); white-space: nowrap; }' +
      '.cdms-table { display: grid; gap: 0; max-width: 420px; }' +
      '.cdms-l { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 7px 0; border-bottom: 1px solid var(--trait); font-size: 14px; }' +
      '.cdms-l:last-child { border-bottom: 0; }' +
      '.cdms-l .cdms-v { font-variant-numeric: tabular-nums; white-space: nowrap; }' +
      '.cdms-l.fort .cdms-n, .cdms-l.fort .cdms-v { font-weight: 700; }' +
      '.cdms-l.fort .cdms-v { font-size: 16px; }' +
      '.cdms-note { margin-left: 6px; font-size: 12px; font-weight: 400; color: var(--encre-3); }' +
      '.cdms-pied { margin: 8px 0 0; font-size: 12px; color: var(--encre-3); display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }' +
      '.cdms-lien { background: none; border: 0; padding: 0; font-size: 12px; color: var(--bleu); text-decoration: underline; cursor: pointer; }' +
      '.cdms-reglage p { margin: 0 0 12px; font-size: 14px; color: var(--encre-3); }' +
      '.cdms-reglage .cdms-champ { display: grid; grid-template-columns: minmax(0, 1fr) 120px 14px; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 14px; }' +
      '.cdms-reglage .cdms-champ .cdms-nomcie { text-align: left; font-weight: 600; }' +
      '.cdms-reglage .cdms-champ input { text-align: right; width: 100%; }' +
      '.cdms-unite { color: var(--encre-3); font-size: 14px; }';
    document.head.appendChild(st);
  }

  AMX.coutsDms = {
    charger: charger,
    de: de,
    calcul: calcul,
    sousCout: sousCout,
    bloc: bloc,
    pad: function (cie) { memeCompte(); var n = Number(etat.pads[String(cie || '').toUpperCase()]); return n > 0 ? n : 0; },
    pads: function () { memeCompte(); return Object.assign({}, etat.pads); },
    peutRegler: function () { memeCompte(); return !!etat.peutRegler && voit(); },
    pasAJour: function () { return !!etat.pasAJour; },
    regler: regler,
    vider: function () { etat.cies = {}; etat.pads = {}; etat.quand = 0; etat.peutRegler = false; etat.courriel = ''; }
  };
})();
