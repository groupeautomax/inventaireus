/* =========================================================================
   transport.js — le transport de nos achats par Central Fleet (23 oct. 2026)

   Maxime : « il faut connecter nos achats à Central Fleet ». Le script (CentralFleet.gs) parle à l'API partenaire de
   Central Fleet avec le jeton de chaque concession ; ici :
     - AMX.transport.bloc(vin, conteneur, ctx) : le bloc « Transport (Central Fleet) » de la fiche d'achat et de la fiche
       du véhicule — état, prix, cueillette, livraison, documents, facture, ou le bouton « Demander le transport » ;
     - AMX.transport.demander(prefill) : la fenêtre de demande (véhicule, cueillette, livraison, date) ;
     - la page Inventaire › Transports (section « transports ») : filtres d'abord, chiffres sur la liste filtrée ;
     - AMX.transport.carteAdmin() : Admin › Central Fleet — les jetons se collent ici, par le propriétaire.
   Le site ne voit JAMAIS un jeton : il envoie celui qu'on colle, le serveur le garde et n'en renvoie que l'état.
   Routes : GET ?transports=1 · ?transportDocument=1&commande=&doc= · ?cfEtat=1 ; POST transportDemander ·
   transportActualiser · cfJeton · cfJetonRetirer.
   ========================================================================= */
(function () {
  'use strict';
  var AMX = window.AMX, h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez une nouvelle version (CentralFleet.gs).';
  var PORTAIL = 'https://centralfleet.ca/';

  var STATUTS_DEMANDE = {
    new_request: ['Demande reçue', 'bleu'], sourcing_rates: ['Recherche d\'un tarif', 'bleu'], ready_for_review: ['Prix en vérification', 'bleu'],
    sent_to_customer: ['Prix à accepter', 'ambre'], accepted: ['Acceptée', 'vert'], declined: ['Refusée', 'gris'], expired: ['Prix expiré', 'gris'],
    cancelled: ['Annulée', 'gris'], superseded: ['Remplacée', 'gris']
  };
  var STATUTS_COMMANDE = {
    needs_carrier: ['Transporteur à trouver', 'bleu'], carrier_pending_acceptance: ['Transporteur à confirmer', 'bleu'], confirmed: ['Transporteur confirmé', 'bleu'],
    pending_customer: ['Information demandée', 'ambre'], dispatched: ['En route vers la cueillette', 'violet'], in_transit: ['En transit', 'violet'],
    delivered: ['Livré', 'vert'], on_hold: ['En pause', 'ambre'], delivery_disputed: ['Problème à la livraison', 'rouge'], retrieval_pending: ['À récupérer', 'ambre'],
    cancelled: ['Annulée', 'gris']
  };
  var TYPES = [['suv', 'VUS'], ['pickup', 'Camionnette'], ['sedan', 'Voiture (berline, coupé…)'], ['van', 'Fourgonnette'], ['motorcycle', 'Moto'], ['oversized', 'Hors normes'], ['inoperable', 'Inopérant'], ['other', 'Autre']];
  var PROVINCES = ['QC', 'ON', 'NB', 'NS', 'PE', 'NL', 'MB', 'SK', 'AB', 'BC', 'NY', 'VT', 'PA', 'NH', 'ME', 'MA', 'OH', 'MI'];
  var DOCS = { bol: 'Connaissement', vehicle_release: 'Bon de libération', inspection_report: 'Rapport d\'inspection', other: 'Document' };
  var GROUPES = [
    ['', 'Tous', function () { return true; }],
    ['accepter', 'Prix à accepter', function (t) { return t.statut === 'sent_to_customer' && !t.commande; }],
    ['attente', 'En attente de prix', function (t) { return ['new_request', 'sourcing_rates', 'ready_for_review'].indexOf(t.statut) >= 0; }],
    ['route', 'En route', function (t) { return !!t.commande && t.ouvert; }],
    ['livres', 'Livrés', function (t) { return t.statutCommande === 'delivered'; }],
    ['fermes', 'Refusés / annulés', function (t) { return !t.ouvert && t.statutCommande !== 'delivered'; }]
  ];

  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c || ''; }
  function argent(n) { return n === '' || n === null || n === undefined || isNaN(n) ? '—' : AMX.fmtArgent(Number(n)); }
  function jour(x) { var s = String(x || ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? AMX.fmtDateCourte(s.slice(0, 10)) : ''; }
  function etape(t) {
    if (t.statutCommande) { var c = STATUTS_COMMANDE[t.statutCommande] || [t.statutCommande, 'gris']; return { libelle: c[0], couleur: c[1] }; }
    var d = STATUTS_DEMANDE[t.statut] || [t.statut || 'Envoyée', 'bleu']; return { libelle: d[0], couleur: d[1] };
  }
  function trajet(t) { return [t.depart.ville, t.depart.province].filter(Boolean).join(', ') + ' → ' + [t.arrivee.ville, t.arrivee.province].filter(Boolean).join(', '); }
  function prixDe(t) { return t.montant !== '' && t.montant !== undefined ? t.montant : t.prix; }
  function badge(t) { var e = etape(t); return h('span.badge.' + e.couleur, { text: e.libelle + (t.test ? ' · TEST' : '') }); }

  /* ------------------------------ Données ------------------------------ */
  var cache = { rep: null, quand: 0, promesse: null };
  function verifier(d) {
    if (!d) throw new Error('Aucune réponse');
    if (d.refuse) throw new Error(d.erreur || 'Accès refusé.');
    if (d.ok === false) throw new Error(d.erreur || 'Le serveur a refusé.');
    if (!Array.isArray(d.transports)) throw new Error(SCRIPT_PAS_A_JOUR);
    return d;
  }
  AMX.transport = {
    charger: function (force) {
      if (!force && cache.rep && Date.now() - cache.quand < 60000) return Promise.resolve(cache.rep);
      if (cache.promesse) return cache.promesse;
      cache.promesse = AMX.get({ transports: 1 }, { secours: false, delai: 45000 }).then(function (d) {
        cache.promesse = null; verifier(d); cache.rep = d; cache.quand = Date.now();
        document.dispatchEvent(new CustomEvent('amx:transports')); return d;
      }, function (e) { cache.promesse = null; throw e; });
      return cache.promesse;
    },
    enCache: function () { return cache.rep; },
    vider: function () { cache.rep = null; cache.quand = 0; },
    parVin: function (vin) { var d = cache.rep; vin = String(vin || '').toUpperCase(); return d ? d.transports.filter(function (t) { return t.vin === vin; }) : []; },
    branche: function (cie) { var d = cache.rep; return !!(d && d.branches && d.branches[cie]); },
    /* À faire : prix à accepter chez Central Fleet, information demandée, problème à la livraison. */
    compteur: function () {
      var d = cache.rep; if (!d) return '';
      var cie = AMX.compagnieChoisie('inventaire');
      var n = d.transports.filter(function (t) { return (!cie || t.compagnie === cie) && ((t.statut === 'sent_to_customer' && !t.commande) || ['pending_customer', 'delivery_disputed', 'on_hold'].indexOf(t.statutCommande) >= 0); }).length;
      return n || '';
    },
    poser: function (liste) {
      if (!cache.rep || !liste) return;
      liste.forEach(function (t) { var i = cache.rep.transports.findIndex(function (x) { return x.id === t.id && x.vin === t.vin; }); if (i >= 0) cache.rep.transports[i] = t; else cache.rep.transports.unshift(t); });
      document.dispatchEvent(new CustomEvent('amx:transports'));
    },
    actualiser: function (cie) {
      return AMX.post({ action: 'transportActualiser', compagnie: cie || '' }, { delai: 90000 }).then(function (r) {
        if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Actualisation refusée');
        if (!Array.isArray(r.transports)) throw new Error(SCRIPT_PAS_A_JOUR);
        if (cache.rep) { cache.rep.transports = r.transports; cache.quand = Date.now(); }
        document.dispatchEvent(new CustomEvent('amx:transports'));
        return r;
      });
    },
    document: function (t, doc) {
      AMX.toast('Téléchargement du document…', 'info');
      return AMX.get({ transportDocument: 1, commande: t.commande, doc: doc.id }, { secours: false, delai: 60000 }).then(function (r) {
        if (!r || !r.ok || !r.base64) throw new Error((r && r.erreur) || 'Document indisponible');
        var bin = atob(r.base64), oct = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) oct[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([oct], { type: r.mime || 'application/pdf' }));
        var a = h('a', { href: url, download: r.nom || 'document.pdf' }); document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      }).catch(function (e) { AMX.toast('Document : ' + AMX.erreurTexte(e), 'erreur'); });
    },
    demander: function (prefill) { return ouvrirDemande(prefill || {}); },
    bloc: function (vin, conteneur, ctx) { return rendreBloc(vin, conteneur, ctx || {}); },
    ouvrir: function (t) { return ouvrirDetail(t); },
    carteAdmin: function () { return carteAdmin(); },
    etape: etape
  };

  function injecterCss() {
    if (document.getElementById('css-transport')) return;
    var s = document.createElement('style'); s.id = 'css-transport';
    s.textContent = [
      '.tr-bloc { display: flex; flex-direction: column; gap: 8px; }',
      '.tr-ligne { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 10px 12px; background: var(--carte); display: flex; flex-direction: column; gap: 6px; }',
      '.tr-ligne .tete { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .tr-ligne .tete .id { font-family: var(--mono); font-size: 12px; color: var(--encre-3); } .tr-ligne .tete .trajet { font-weight: 600; }',
      '.tr-ligne .faits { display: flex; gap: 6px 18px; flex-wrap: wrap; font-size: 13px; color: var(--encre-2); } .tr-ligne .faits b { color: var(--encre); font-variant-numeric: tabular-nums; }',
      '.tr-ligne .actions { display: flex; gap: 6px; flex-wrap: wrap; }',
      '.tr-avis { font-size: 13px; color: var(--encre-3); } .tr-avis.ambre { color: var(--ambre); }',
      '.tr-form .grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px 12px; }',
      '.tr-form h4 { margin: 14px 0 8px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); }',
      '.tr-form .avis { margin: 0 0 10px; padding: 8px 12px; border-radius: var(--rayon-s); background: #FEF3C7; border: 1px solid #FDE68A; color: #92400E; font-size: 12.5px; line-height: 1.5; }',
      '.tr-table td .sous { display: block; font-size: 12px; color: var(--encre-3); } .tr-table td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; } .tr-table tr.rangee { cursor: pointer; } .tr-table tr.rangee:hover td { background: var(--carte-2); }',
      '.tr-cf .rang { display: grid; grid-template-columns: 200px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--ligne); } .tr-cf .rang:first-of-type { border-top: none; }',
      '.tr-cf .rang .etat { font-size: 12.5px; color: var(--encre-3); } .tr-cf .rang .saisie-jeton { display: flex; gap: 6px; } .tr-cf .rang input { min-width: 220px; }',
      '@media (max-width: 760px) { .tr-cf .rang { grid-template-columns: 1fr; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* --------------------------- Le bloc d'un NIV --------------------------- */
  function faits(t) {
    var l = [];
    var p = prixDe(t);
    if (p !== '' && p !== undefined) l.push(['Prix', argent(p) + (t.montant !== '' && t.montant !== undefined ? ' (facturé)' : ' avant taxes')]);
    if (t.valideJusqu && t.statut === 'sent_to_customer' && !t.commande) l.push(['Valide jusqu\'au', jour(t.valideJusqu)]);
    if (t.joursTransit !== '' && t.joursTransit !== undefined && !t.livraison) l.push(['Transit', t.joursTransit + ' j']);
    if (t.cueillette) l.push(['Cueilli le', jour(t.cueillette)]); else if (t.cueilletteEstimee) l.push(['Cueillette prévue', jour(t.cueilletteEstimee)]); else if (t.dateSouhaitee) l.push(['Souhaitée le', jour(t.dateSouhaitee)]);
    if (t.livraison) l.push(['Livré le', jour(t.livraison)]); else if (t.livraisonEstimee) l.push(['Livraison prévue', jour(t.livraisonEstimee)]);
    if (t.consignes && t.consignes.release) l.push(['Release', t.consignes.release + (t.consignes.refusees || t.consignes.lues === 'non' ? ' (à donner à Central Fleet)' : '')]);
    if (t.facture) l.push(['Facture', t.facture + ' · ' + argent(t.totalFacture) + ' taxes incl.' + (t.statutFacture === 'paid' ? ' · payée' : (t.echeance ? ' · échéance ' + jour(t.echeance) : ''))]);
    return h('div.faits', l.map(function (x) { return h('span', [x[0] + ' : ', h('b', { text: x[1] })]); }));
  }
  function ligneTransport(t, avecVehicule) {
    var actions = [];
    if (t.statut === 'sent_to_customer' && !t.commande) actions.push(h('a.btn.petit.primaire', { href: PORTAIL, target: '_blank', rel: 'noopener', html: AMX.icones.externe + '<span>Accepter le prix chez Central Fleet</span>' }));
    (t.documents || []).forEach(function (d) { actions.push(h('button.btn.petit', { type: 'button', html: AMX.icones.telecharger + '<span>' + AMX.esc(DOCS[d.type] || d.nom || 'Document') + '</span>', onclick: function (e) { e.stopPropagation(); AMX.transport.document(t, d); } })); });
    var tete = h('div.tete', [badge(t), h('span.trajet', { text: trajet(t) }), h('span.id', { text: t.id + (t.commande ? ' · ' + t.commande : '') })]);
    return h('div.tr-ligne', [
      avecVehicule ? h('div', [h('b', { text: t.vehicule || t.vin }), h('span.doux', { text: ' · ' + t.vin + (t.stock ? ' · #' + t.stock : '') })]) : null,
      tete, faits(t),
      t.erreur ? h('div.tr-avis.ambre', { text: t.erreur }) : null,
      actions.length ? h('div.actions', actions) : null
    ]);
  }
  function rendreBloc(vin, conteneur, ctx) {
    injecterCss();
    vin = String(vin || '').trim().toUpperCase();
    AMX.vider(conteneur);
    if (vin.length !== 17) { conteneur.appendChild(h('p.tr-avis', { text: 'Entrez le NIV complet pour demander le transport à Central Fleet.' })); return Promise.resolve(); }
    conteneur.appendChild(h('p.tr-avis', { text: 'Lecture des transports…' }));
    var dessiner = function (d) {
      AMX.vider(conteneur);
      var liste = d.transports.filter(function (t) { return t.vin === vin; });
      var cie = String(ctx.compagnie || '').toUpperCase(), ouvert = liste.filter(function (t) { return t.ouvert; })[0];
      var wrap = h('div.tr-bloc', liste.map(function (t) { return ligneTransport(t, false); }));
      if (!ouvert && d.peutDemander) {
        if (cie && d.branches && d.branches[cie] === false) wrap.appendChild(h('p.tr-avis', { text: 'Central Fleet n\'est pas encore branché pour ' + nomCie(cie) + ' : le propriétaire colle le jeton de la concession dans Admin › Central Fleet.' }));
        else wrap.appendChild(h('div', [h('button.btn.primaire', { type: 'button', html: AMX.icones.plus + '<span>' + (liste.length ? 'Nouvelle demande de transport' : 'Demander le transport à Central Fleet') + '</span>',
          onclick: function () { AMX.transport.demander(Object.assign({ vin: vin }, ctx, typeof ctx.prefill === 'function' ? ctx.prefill() : {})).then(function (r) { if (r && r.transports) { if (ctx.onDemande) ctx.onDemande(r.transports[0]); rendreBloc(vin, conteneur, ctx); } }); } })]));
      }
      if (!liste.length && !d.peutDemander) wrap.appendChild(h('p.tr-avis', { text: 'Aucun transport demandé à Central Fleet pour ce véhicule.' }));
      conteneur.appendChild(wrap);
      if (ctx.onInfos && liste.length) ctx.onInfos(liste[0]);
    };
    return AMX.transport.charger().then(dessiner, function (e) { AMX.vider(conteneur); conteneur.appendChild(h('p.tr-avis.ambre', { text: 'Transports Central Fleet : ' + AMX.erreurTexte(e) })); });
  }

  /* ------------------------------ La demande ------------------------------ */
  function champ(libelle, el, aide) { return h('div.champ', [h('label', { text: libelle }), el, aide ? h('div.doux.petit', { text: aide }) : null]); }
  function saisie(valeur, o) { return h('input.saisie', Object.assign({ type: 'text', value: valeur || '' }, o || {})); }
  function choix(options, valeur) { var s = h('select.saisie'); options.forEach(function (o) { s.appendChild(h('option', { value: o[0], text: o[1], selected: o[0] === valeur ? 'selected' : undefined })); }); return s; }
  function province(valeur) {
    if (!document.getElementById('tr-provinces')) document.body.appendChild(h('datalist#tr-provinces', PROVINCES.map(function (p) { return h('option', { value: p }); })));
    return saisie(valeur, { list: 'tr-provinces', maxlength: '2', style: { textTransform: 'uppercase' }, placeholder: 'QC' });
  }
  function typeDe(carrosserie) {
    var c = String(carrosserie || '').toLowerCase();
    if (/camionnette|pickup/.test(c)) return 'pickup';
    if (/vus|suv/.test(c)) return 'suv';
    if (/fourgon|van/.test(c)) return 'van';
    if (/berline|hayon|coupe|cabriolet|familiale|sedan/.test(c)) return 'sedan';
    return '';
  }
  function ouvrirDemande(p) {
    injecterCss();
    return AMX.transport.charger().then(function (d) {
      return new Promise(function (resoudre) {
        var codes = (AMX.codesPour ? AMX.codesPour('inventaire') : Object.keys(AMX.COMPAGNIES_TOUTES || {})).filter(function (c) { return d.branches && d.branches[c] !== undefined; });
        var cie0 = String(p.compagnie || AMX.compagnieChoisie('inventaire') || codes[0] || '').toUpperCase();
        var selCie = choix(codes.map(function (c) { return [c, nomCie(c) + (d.branches[c] ? '' : ' (pas branché)')]; }), cie0);
        var liv = function (c) { return (d.livraisons && d.livraisons[c]) || {}; };
        var vin = saisie(p.vin, { maxlength: '17', style: { fontFamily: 'var(--mono)', textTransform: 'uppercase' } });
        var annee = saisie(p.annee, { inputmode: 'numeric', maxlength: '4' }), marque = saisie(p.marque), modele = saisie(p.modele), stock = saisie(p.stock);
        var type = choix([['', 'Deviné d\'après le NIV']].concat(TYPES), p.typeVehicule || typeDe(p.carrosserie));
        var etat = choix([['running', 'Roule'], ['non_running', 'Ne roule pas']], 'running'), couvert = choix([['open', 'Ouvert'], ['enclosed', 'Fermé']], 'open');
        var dep = p.depart || {}, arr = p.arrivee || liv(cie0);
        var depAdr = saisie(dep.adresse, { placeholder: 'Adresse civique (encan, vendeur…)' }), depVille = saisie(dep.ville), depProv = province(dep.province || 'QC');
        var arrAdr = saisie(arr.adresse), arrVille = saisie(arr.ville), arrProv = province(arr.province || (cie0 === 'HAWKS' ? 'ON' : 'QC'));
        var date = saisie('', { type: 'date' }), note = saisie('', { placeholder: 'Pour nous seulement (pas envoyé à Central Fleet)' });
        // 26 oct. : le release — consignes de cueillette envoyées à Central Fleet (no de release, heures, contact sur place).
        var cs = p.consignes || {}, rel = p.release || null;
        var csContact = saisie(cs.contact, { placeholder: 'Nom ou service' }), csTel = saisie(cs.telephone, { inputmode: 'tel' });
        var csInstr = h('textarea.saisie', { rows: '2', maxlength: '500', placeholder: 'Release # …, heures du lot, porte à utiliser…' }); csInstr.value = cs.instructions || '';
        var avisRelease = null;
        if (rel && rel.recu) avisRelease = h('p.avis', { style: { background: 'var(--vert-clair)', borderColor: 'var(--vert)', color: 'var(--vert-fonce)' }, text: 'Release reçu le ' + jour(rel.recu) + (rel.no ? ' — no ' + rel.no : '') + ' : le véhicule peut être cueilli.' });
        else if (rel) avisRelease = h('p.avis', { text: (rel.paye ? 'Payé, mais le release n\'est pas encore reçu' : 'Ni payé ni release reçu') + ' : sans release, le transporteur ne pourra pas sortir le véhicule du lot (déplacement à vide possible). Vous pouvez demander le prix quand même ; déposez le release dans la fiche d\'achat dès qu\'il arrive.' });
        var test = h('input', { type: 'checkbox' });
        selCie.addEventListener('change', function () { var l = liv(selCie.value); if (!arrVille.value || arrVille.dataset.auto) { arrAdr.value = l.adresse || ''; arrVille.value = l.ville || ''; arrProv.value = l.province || ''; arrVille.dataset.auto = '1'; } });
        if (!p.arrivee) arrVille.dataset.auto = '1';
        var corps = h('div.tr-form', [
          h('p.avis', { text: 'C\'est une vraie demande : Central Fleet la verra et en établira le prix. Elle devient un transport quand le prix est accepté chez Central Fleet. ScanAutomax suivra ensuite le prix, la cueillette, la livraison, les documents et la facture.' }),
          h('div.grille', [champ('Concession qui paie le transport', selCie)]),
          h('h4', 'Véhicule'),
          h('div.grille', [champ('NIV (17 caractères)', vin), champ('Année', annee), champ('Marque', marque), champ('Modèle', modele), champ('# stock (pour nous)', stock), champ('Type', type), champ('État', etat), champ('Transport', couvert)]),
          avisRelease,
          h('h4', 'Cueillette'),
          h('div.grille', [champ('Adresse', depAdr), champ('Ville', depVille), champ('Province ou État', depProv, '2 lettres : QC, ON, NY…')]),
          h('div.grille', { style: { marginTop: '10px' } }, [champ('Contact sur place', csContact), champ('Téléphone sur place', csTel), champ('Consignes de cueillette (envoyées à Central Fleet)', csInstr)]),
          h('h4', 'Livraison'),
          h('div.grille', [champ('Adresse', arrAdr), champ('Ville', arrVille), champ('Province ou État', arrProv)]),
          h('div.grille', { style: { marginTop: '10px' } }, [champ('Cueillette souhaitée le', date), champ('Note', note)]),
          d.peutRegler ? h('label.case', { style: { marginTop: '10px' } }, [test, h('span', 'Demande de test (« TEST - ne pas expédier » dans les adresses) — à convenir d\'abord avec Central Fleet')]) : null
        ]);
        var m = AMX.modale({ titre: 'Demander le transport à Central Fleet', corps: corps, large: true, onFermer: function () { resoudre(null); },
          boutons: [{ texte: 'Annuler' }, { texte: 'Envoyer à Central Fleet', classe: 'primaire', action: function (fermer) {
            var corpsPost = { action: 'transportDemander', compagnie: selCie.value, note: note.value.trim(), test: test.checked,
              vehicules: [{ vin: vin.value.trim().toUpperCase(), annee: annee.value.trim(), marque: marque.value.trim(), modele: modele.value.trim(), stock: stock.value.trim(), typeVehicule: type.value, etatVehicule: etat.value, typeTransport: couvert.value }],
              depart: { adresse: depAdr.value.trim(), ville: depVille.value.trim(), province: depProv.value.trim().toUpperCase() },
              arrivee: { adresse: arrAdr.value.trim(), ville: arrVille.value.trim(), province: arrProv.value.trim().toUpperCase() },
              dateSouhaitee: date.value,
              consignes: { contact: csContact.value.trim(), telephone: csTel.value.trim(), instructions: csInstr.value.trim(), release: (cs.release || (rel && rel.no) || '') } };
            if (corpsPost.vehicules[0].vin.length !== 17) { AMX.toast('Le NIV doit avoir 17 caractères.', 'erreur'); return false; }
            if (!corpsPost.depart.ville || !/^[A-Z]{2}$/.test(corpsPost.depart.province) || !corpsPost.arrivee.ville || !/^[A-Z]{2}$/.test(corpsPost.arrivee.province)) { AMX.toast('Ville et province (2 lettres) de cueillette et de livraison obligatoires.', 'erreur'); return false; }
            // Jamais de requête de secours ni de rejeu : une demande créée deux fois serait un doublon chez Central Fleet.
            return AMX.post(corpsPost, { delai: 90000, secours: false }).then(function (r) {
              if (r && r.vehicules && !r.transports) throw new Error(SCRIPT_PAS_A_JOUR);
              if (!r || r.refuse || r.ok === false) { AMX.toast((r && r.erreur) || 'Demande refusée', r && (r.code === 'DEJA' || r.code === 'INCERTAIN') ? 'attention' : 'erreur', 10000); if (r && r.transport) AMX.transport.poser([r.transport]); return false; }
              AMX.transport.poser(r.transports || []);
              AMX.toast(r.message || 'Demande envoyée à Central Fleet', 'ok', 8000);
              if (r.avertissement) AMX.toast(r.avertissement, 'attention', 14000);
              m.modifie(false); resoudre(r); fermer(); return false;
            }, function (e) { AMX.toast('Réponse incertaine (' + AMX.erreurTexte(e) + ') : rien n\'a été renvoyé. Actualisez Inventaire › Transports dans quelques minutes avant de redemander.', 'attention', 12000); return false; });
          } }] });
      });
    }, function (e) { AMX.toast('Central Fleet : ' + AMX.erreurTexte(e), 'erreur'); return null; });
  }

  function ouvrirDetail(t) {
    injecterCss();
    AMX.modale({ titre: (t.vehicule || t.vin) + ' — transport', corps: h('div.tr-bloc', [ligneTransport(t, true),
      h('dl.kv', [h('dt', 'Concession'), h('dd', { text: nomCie(t.compagnie) }), h('dt', 'Cueillette'), h('dd', { text: [t.depart.adresse, t.depart.ville, t.depart.province].filter(Boolean).join(', ') }),
        h('dt', 'Livraison'), h('dd', { text: [t.arrivee.adresse, t.arrivee.ville, t.arrivee.province].filter(Boolean).join(', ') }),
        h('dt', 'Demandé'), h('dd', { text: AMX.fmtDate(t.demandeLe, true) + (t.demandePar ? ' par ' + t.demandePar : '') }),
        t.note ? h('dt', 'Note') : null, t.note ? h('dd', { text: t.note }) : null,
        h('dt', 'Lu chez Central Fleet'), h('dd', { text: t.luLe ? AMX.fmtDate(t.luLe, true) : '—' })])]),
      boutons: [{ texte: 'Fermer' }, { texte: 'Fiche d\'achat', action: function () { AMX.aller('achat', '', { vin: t.vin }); } }] });
  }

  /* ------------------------- Inventaire › Transports ------------------------- */
  AMX.section('transports', {
    titre: 'Transports', icone: 'inventaire', ordre: 25,
    visible: function () { return AMX.perm('consulter') || AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.estAdmin(); },
    monter: function (conteneur, ctx) { return new VueTransports(conteneur, ctx); }
  });
  function VueTransports(conteneur, ctx) {
    var self = this;
    injecterCss();
    this.conteneur = conteneur; this.compagnie = AMX.compagnieChoisie('inventaire');
    this.filtres = { groupe: '', recherche: '' };
    this.filtresRel = { etat: '', recherche: '' };
    this.vue = (ctx && ctx.params && ctx.params.vue === 'releases') || AMX.memo.lire('tr_vue', '') === 'releases' ? 'releases' : 'transports';
    this.construire();
    this.sur = function () { self.rendre(); AMX.rafraichirSousBarre(); };
    this.surCie = function (e) { self.compagnie = (e.detail && e.detail.compagnie) || ''; self.rendre(); };
    this.surRel = function () { if (self.vue === 'releases') self.rendreReleases(); };
    document.addEventListener('amx:transports', this.sur);
    document.addEventListener('amx:releases', this.surRel);
    document.addEventListener('amx:compagnie', this.surCie);
    AMX.transport.charger(false).then(function () { self.rendre(); }, function (e) { self.elSous.textContent = AMX.erreurTexte(e); AMX.vider(self.elListe); self.elListe.appendChild(h('div.carte', [h('div.vide', { text: AMX.erreurTexte(e) })])); });
    void ctx;
  }
  VueTransports.prototype.demonter = function () { document.removeEventListener('amx:transports', this.sur); document.removeEventListener('amx:releases', this.surRel); document.removeEventListener('amx:compagnie', this.surCie); };
  VueTransports.prototype.rendreVues = function () {
    var self = this, d = AMX.release && AMX.release.enCache();
    AMX.vider(this.elVues);
    var nRel = d ? d.releases.filter(function (x) { return (!self.compagnie || x.compagnie === self.compagnie) && x.etat !== 'transport'; }).length : null;
    [['transports', 'Transports Central Fleet'], ['releases', 'Achats à aller chercher' + (nRel ? ' (' + nRel + ')' : '')]].forEach(function (v) {
      self.elVues.appendChild(h('button' + (self.vue === v[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': self.vue === v[0] ? 'true' : 'false', text: v[1], onclick: function () { self.vue = v[0]; AMX.memo.ecrire('tr_vue', v[0]); self.rendre(); } }));
    });
    this.zoneTr.classList.toggle('cache', this.vue !== 'transports');
    this.zoneRel.classList.toggle('cache', this.vue !== 'releases');
  };
  /* Les achats à aller chercher : au registre (Acheté, Transit QC), pas un échange, avec une fiche d'achat ou un achat
     Manheim / eBlock / Opportunités. Filtres d'abord, la liste suit (Release.gs, ?releases=1). */
  VueTransports.prototype.construireReleases = function () {
    var self = this, f = this.filtresRel;
    if (this.relConstruit) return; this.relConstruit = true;
    this.relRech = h('input.saisie', { type: 'search', placeholder: 'NIV, # stock, modèle, lieu, no de release…', 'aria-label': 'Chercher un achat', oninput: AMX.debounce(function (e) { f.recherche = e.target.value; self.rendreReleases(); }, 120) });
    this.relPastilles = h('div.inv2-statuts', { role: 'group', 'aria-label': 'État du release' });
    this.relPortee = h('div.portee-chiffres');
    this.relListe = h('div');
    this.zoneRel.appendChild(h('div.inv2-filtres', [h('div.recherche.inv2-recherche', [h('span', { html: AMX.icones.recherche }), this.relRech]), this.relPastilles]));
    this.zoneRel.appendChild(this.relPortee);
    this.zoneRel.appendChild(this.relListe);
  };
  VueTransports.prototype.rendreReleases = function () {
    var self = this, f = this.filtresRel;
    this.construireReleases();
    if (!AMX.release) { AMX.vider(this.relListe); this.relListe.appendChild(h('div.carte', [h('div.vide', { text: 'release.js n\'est pas chargé.' })])); return; }
    var d = AMX.release.enCache();
    if (!d) {
      AMX.vider(this.relListe); this.relListe.appendChild(AMX.chargeur ? AMX.chargeur('Achats à aller chercher', { compact: true }) : h('p.doux', 'Lecture…'));
      AMX.release.charger().then(function () { self.rendreVues(); self.rendreReleases(); }, function (e) { AMX.vider(self.relListe); self.relListe.appendChild(h('div.carte', [h('div.vide', { style: { padding: '24px' }, text: AMX.erreurTexte(e) })])); });
      return;
    }
    var base = d.releases.filter(function (x) { return (!self.compagnie || x.compagnie === self.compagnie) && (!f.recherche || AMX.correspond([x.vin, x.stock, x.modele, x.lieu, x.ville, x.no, x.source], f.recherche)); });
    AMX.vider(this.relPastilles);
    [['', 'Tous']].concat(Object.keys(AMX.release.ETATS).map(function (k) { return [k, AMX.release.ETATS[k].libelle]; })).forEach(function (g) {
      var n = g[0] ? base.filter(function (x) { return x.etat === g[0]; }).length : base.length, actif = f.etat === g[0];
      if (g[0] && !n && !actif) return;
      self.relPastilles.appendChild(h('button.inv2-pastille' + (actif ? '.actif' : ''), { type: 'button', 'aria-pressed': actif ? 'true' : 'false', title: g[0] ? AMX.release.ETATS[g[0]].aide : '', onclick: function () { f.etat = g[0]; self.rendreReleases(); } }, [h('span', { text: g[1] }), h('b', { text: String(n) })]));
    });
    var liste = f.etat ? base.filter(function (x) { return x.etat === f.etat; }) : base;
    AMX.porteeChiffres(this.relPortee, { n: liste.length, unite: ['achat', 'achats'], contexte: [this.compagnie ? nomCie(this.compagnie) : 'toutes les concessions'],
      filtres: [f.etat ? AMX.release.ETATS[f.etat].libelle : '', f.recherche.trim() ? '« ' + f.recherche.trim() + ' »' : ''],
      effacer: function () { f.etat = ''; f.recherche = ''; self.relRech.value = ''; self.rendreReleases(); } });
    AMX.vider(this.relListe);
    if (!liste.length) { this.relListe.appendChild(h('div.carte', [h('div.vide', { style: { padding: '28px', textAlign: 'center' }, text: base.length ? 'Aucun achat pour ce filtre.' : 'Aucun achat à aller chercher : les véhicules « Acheté » du registre qui ont une fiche d\'achat (ou un achat Manheim, eBlock, DealerSource) apparaissent ici.' })])); return; }
    var corps = h('tbody');
    liste.forEach(function (x) {
      var demander = (!x.transport || !x.transport.ouvert) && d.peutEcrire ? h('button.btn.petit' + (x.etat === 'pret' ? '.primaire' : ''), { type: 'button', text: 'Demander le transport', onclick: function (e) { e.stopPropagation(); self.demanderDepuisRelease(x); } }) : null;
      var tr = h('tr.rangee', [
        h('td', [h('b', { text: x.modele || '—' }), h('span.sous.mono', { text: x.vin + (x.stock ? ' · #' + x.stock : '') })]),
        h('td', [h('span', { text: nomCie(x.compagnie) }), h('span.sous', { text: (x.registre === 'DETAIL' ? 'Detail' : x.registre === 'CAN' ? 'Canada' : 'É.-U.') + (x.jours !== null && x.jours !== undefined ? ' · acheté il y a ' + x.jours + ' j' : '') })]),
        h('td', [h('span', { text: x.lieu || x.source || '—' }), h('span.sous', { text: [x.ville, x.province].filter(Boolean).join(', ') })]),
        h('td', { text: x.paye === 'oui' ? 'oui' : (x.paye ? jour(x.paye) : '—') }),
        h('td', [h('span', { text: x.recu ? jour(x.recu) : '—' }), h('span.sous.mono', { text: [x.no ? '# ' + x.no : '', x.doc ? 'document' : ''].filter(Boolean).join(' · ') })]),
        h('td', [AMX.release.badge(x.etat), x.transport ? h('span.sous.mono', { text: x.transport.id }) : null]),
        h('td', [demander])
      ]);
      tr.addEventListener('click', function () { AMX.release.modale(x.vin, { titre: x.modele, onEnregistre: function () { AMX.release.vider(); self.rendreReleases(); self.rendreVues(); } }); });
      corps.appendChild(tr);
    });
    this.relListe.appendChild(h('div.carte', [h('div', { style: { overflowX: 'auto' } }, [h('table.tableau.rel-table', [h('thead', [h('tr', ['Véhicule', 'Concession', 'Où le cueillir', 'Payé', 'Release', 'État', ''].map(function (t) { return h('th', { text: t }); }))]), corps])])]));
  };
  /** « Demander le transport » depuis un achat : le release donne le lieu de cueillette et les consignes. */
  VueTransports.prototype.demanderDepuisRelease = function (x) {
    var self = this, mots = String(x.modele || '').trim().split(/\s+/), an = /^\d{4}$/.test(mots[mots.length - 1] || '') ? mots.pop() : '';
    AMX.release.vin(x.vin).then(function (d) {
      var r = d.release || {};
      return AMX.transport.demander({ vin: x.vin, compagnie: x.compagnie, stock: x.stock, annee: an, marque: mots.shift() || '', modele: mots.join(' '),
        depart: { adresse: r.adresse, ville: r.ville || x.ville, province: r.province || x.province }, consignes: AMX.release.consignes(r), release: { recu: r.recu, paye: r.paye, no: r.no } });
    }).then(function (rep) { if (rep && rep.transports) { AMX.release.vider(); self.rendreReleases(); self.rendreVues(); } }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  VueTransports.prototype.construire = function () {
    var self = this;
    this.elSous = h('p', 'Chargement…');
    var actions = [
      h('button.btn', { type: 'button', html: AMX.icones.rafraichir + '<span>Actualiser chez Central Fleet</span>', onclick: function (e) { var b = e.currentTarget; b.classList.add('occupe'); AMX.transport.actualiser(self.compagnie).then(function () { AMX.toast('Transports relus chez Central Fleet', 'ok'); }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); }).then(function () { b.classList.remove('occupe'); }); } }),
      h('button.btn.primaire', { type: 'button', html: AMX.icones.plus + '<span>Demander un transport</span>', onclick: function () { AMX.transport.demander({ compagnie: self.compagnie }); } })
    ];
    this.elActions = h('div.actions', AMX.actionsEntete ? AMX.actionsEntete(actions, [actions[1]]) : actions);
    this.elCies = h('div.barre-cies');
    this.elFiltres = h('div.inv2-filtres');
    this.elPortee = h('div.portee-chiffres');
    this.elKpis = h('div.kpis');
    this.elListe = h('div');
    this.rech = h('input.saisie', { type: 'search', placeholder: 'NIV, # stock, modèle, ville, INQ-…', 'aria-label': 'Chercher un transport', oninput: AMX.debounce(function (e) { self.filtres.recherche = e.target.value; self.rafraichir(); }, 120) });
    this.elPastilles = h('div.inv2-statuts', { role: 'group', 'aria-label': 'État du transport' });
    this.elFiltres.appendChild(h('div.recherche.inv2-recherche', [h('span', { html: AMX.icones.recherche }), this.rech]));
    this.elFiltres.appendChild(this.elPastilles);
    // 26 oct. : deux vues — les transports Central Fleet, et les achats à aller chercher (release : à payer → attendu → prêt).
    this.elVues = h('div.segment.tr-vues', { role: 'group', 'aria-label': 'Vue' });
    this.zoneTr = h('div', [this.elFiltres, this.elPortee, this.elKpis, this.elListe]);
    this.zoneRel = h('div.cache');
    this.conteneur.appendChild(h('div.page.tr-page', [h('div.entete-page', [h('div', [h('h1', 'Transports'), this.elSous]), this.elActions]), this.elCies, this.elVues, this.zoneTr, this.zoneRel]));
  };
  VueTransports.prototype.base = function (sauf) {
    var d = AMX.transport.enCache(), self = this, f = this.filtres; if (!d) return [];
    var g = GROUPES.filter(function (x) { return x[0] === f.groupe; })[0] || GROUPES[0];
    return d.transports.filter(function (t) {
      if (self.compagnie && t.compagnie !== self.compagnie) return false;
      if (sauf !== 'groupe' && !g[2](t)) return false;
      if (f.recherche && !AMX.correspond([t.vin, t.stock, t.vehicule, t.id, t.commande, t.facture, t.depart.ville, t.arrivee.ville, t.demandePar], f.recherche)) return false;
      return true;
    });
  };
  VueTransports.prototype.rendre = function () {
    var self = this, d = AMX.transport.enCache();
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.compagnie, onchange: function (c) { self.compagnie = c; self.rendre(); } });
    this.rendreVues();
    if (this.vue === 'releases') this.rendreReleases();
    if (!d) return;
    var branchees = Object.keys(d.branches || {}).filter(function (c) { return d.branches[c]; });
    this.elSous.textContent = branchees.length ? 'Central Fleet branché : ' + branchees.map(nomCie).join(', ') + ' · suivi automatique (prix aux 15 min, transports aux 30 min, factures 2 fois par jour)' : 'Central Fleet n\'est branché pour aucune concession : le propriétaire colle les jetons dans Admin › Central Fleet.';
    this.rafraichir();
  };
  VueTransports.prototype.rafraichir = function () {
    var self = this, f = this.filtres, base = this.base('groupe');
    AMX.vider(this.elPastilles);
    GROUPES.forEach(function (g) {
      var n = base.filter(g[2]).length, actif = f.groupe === g[0];
      if (g[0] && !n && !actif) return;
      self.elPastilles.appendChild(h('button.inv2-pastille' + (actif ? '.actif' : ''), { type: 'button', 'aria-pressed': actif ? 'true' : 'false', onclick: function () { f.groupe = g[0]; self.rafraichir(); } }, [h('span', { text: g[1] }), h('b', { text: String(n) })]));
    });
    var liste = this.base();
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['transport', 'transports'], contexte: [this.compagnie ? nomCie(this.compagnie) : 'toutes les concessions'],
      filtres: [f.groupe ? (GROUPES.filter(function (g) { return g[0] === f.groupe; })[0] || [])[1] : '', f.recherche.trim() ? '« ' + f.recherche.trim() + ' »' : ''],
      effacer: function () { f.groupe = ''; f.recherche = ''; self.rech.value = ''; self.rafraichir(); } });
    // Les chiffres portent sur la liste filtrée.
    AMX.vider(this.elKpis);
    var kpi = function (v, l, sous, cls) { return h('div.kpi' + (cls ? '.' + cls : ''), [h('div.valeur', { text: String(v) }), h('div.libelle', { text: l }), sous ? h('div.sous', { text: sous }) : null]); };
    var aAccepter = liste.filter(GROUPES[1][2]).length, route = liste.filter(GROUPES[3][2]).length;
    var avecPrix = liste.filter(function (t) { var p = prixDe(t); return p !== '' && p !== undefined; });
    var total = avecPrix.reduce(function (s, t) { return s + Number(prixDe(t)); }, 0);
    var delais = liste.filter(function (t) { return t.cueillette && t.livraison; }).map(function (t) { return (new Date(t.livraison) - new Date(t.cueillette)) / 86400000; });
    this.elKpis.appendChild(kpi(liste.length, 'Transports', liste.filter(function (t) { return t.ouvert; }).length + ' en cours', 'neutre'));
    this.elKpis.appendChild(kpi(aAccepter, 'Prix à accepter', 'chez Central Fleet', aAccepter ? 'attention' : 'neutre'));
    this.elKpis.appendChild(kpi(route, 'En route', 'transporteur assigné ou en transit', 'neutre'));
    this.elKpis.appendChild(kpi(avecPrix.length ? AMX.fmtArgent(Math.round(total / avecPrix.length)) : '—', 'Coût moyen', avecPrix.length ? avecPrix.length + ' avec un prix · total ' + AMX.fmtArgent(Math.round(total)) : 'aucun prix encore', 'neutre'));
    this.elKpis.appendChild(kpi(delais.length ? (Math.round(delais.reduce(function (a, b) { return a + b; }, 0) / delais.length * 10) / 10) + ' j' : '—', 'Transit moyen', delais.length ? 'cueillette → livraison, sur ' + delais.length : 'aucune livraison encore', 'neutre'));
    this.rendreListe(liste);
  };
  VueTransports.prototype.rendreListe = function (liste) {
    AMX.vider(this.elListe);
    if (!liste.length) { this.elListe.appendChild(h('div.carte', [h('div.vide', { style: { padding: '28px', textAlign: 'center' }, text: (this.filtres.groupe || this.filtres.recherche) ? 'Aucun transport pour ce filtre.' : 'Aucun transport demandé à Central Fleet pour l\'instant. Demandez-le depuis la fiche d\'achat du véhicule, ou avec « Demander un transport ».' })])); return; }
    var corps = h('tbody');
    liste.forEach(function (t) {
      var tr = h('tr.rangee', [
        h('td', [h('span', { text: jour(t.demandeLe) }), h('span.sous.mono', { text: t.id })]),
        h('td', [h('b', { text: t.vehicule || '—' }), h('span.sous.mono', { text: t.vin + (t.stock ? ' · #' + t.stock : '') })]),
        h('td', [h('span', { text: trajet(t) }), h('span.sous', { text: nomCie(t.compagnie) })]),
        h('td', [badge(t), t.commande ? h('span.sous.mono', { text: t.commande }) : null]),
        h('td.num', { text: argent(prixDe(t)) }),
        h('td', { text: t.cueillette ? jour(t.cueillette) : (t.cueilletteEstimee ? 'prévue ' + jour(t.cueilletteEstimee) : '—') }),
        h('td', { text: t.livraison ? jour(t.livraison) : (t.livraisonEstimee ? 'prévue ' + jour(t.livraisonEstimee) : '—') }),
        h('td', { text: t.facture ? argent(t.totalFacture) + (t.statutFacture === 'paid' ? ' · payée' : '') : '—' })
      ]);
      tr.addEventListener('click', function () { AMX.transport.ouvrir(t); });
      corps.appendChild(tr);
    });
    this.elListe.appendChild(h('div.carte', [h('div', { style: { overflowX: 'auto' } }, [h('table.tableau.tr-table', [h('thead', [h('tr', ['Demande', 'Véhicule', 'Trajet', 'État', 'Prix', 'Cueillette', 'Livraison', 'Facture'].map(function (x, i) { return h('th' + (i === 4 ? '.num' : ''), { text: x }); }))]), corps])])]));
  };

  /* ----------------------------- Admin › Central Fleet ----------------------------- */
  function carteAdmin() {
    injecterCss();
    var corps = h('div.carte-corps.tr-cf');
    var carte = h('div.carte.admin-parametres', [h('div.carte-entete', [h('h2', 'Central Fleet (transport des achats)')]), corps]);
    var dessiner = function (r) {
      AMX.vider(corps);
      corps.appendChild(h('p.doux.petit', { style: { margin: 0 }, text: 'Un jeton par concession, fourni par Central Fleet (il commence par « cfrt_ »). Collez-le ici : le serveur le vérifie auprès de Central Fleet, le garde et le renouvelle seul à chaque échange. Il n\'est jamais affiché, ni envoyé ailleurs. Avant les premières vraies demandes, prévenez Central Fleet (orders@centralfleet.ca).' }));
      (r.concessions || []).forEach(function (c) {
        var etat = c.branche ? ('Branché' + (c.nom ? ' — ' + c.nom : '') + (c.echangeLe ? ' · dernier échange ' + AMX.fmtDate(c.echangeLe, true) : '') + (c.expireLe ? ' · expire le ' + AMX.fmtDateCourte(String(c.expireLe).slice(0, 10)) : '')) : 'Pas branché';
        var champJeton = h('input.saisie', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: c.branche ? 'Coller un nouveau jeton pour le remplacer' : 'Coller le jeton cfrt_…' });
        var poser = h('button.btn.primaire.petit', { type: 'button', text: c.branche ? 'Remplacer' : 'Brancher', onclick: function () {
          // Ce qu'on colle depuis Excel : espaces, retours de ligne, guillemets, libellé devant (« Ste-Marie : cfrt_… »).
          var brut = champJeton.value || '', j = brut.replace(/[\s\u00a0\u200b-\u200d\ufeff]+/g, '').replace(/^["'«»“”‘’]+|["'«»“”‘’]+$/g, '');
          var i0 = j.toLowerCase().indexOf('cfrt_'); if (i0 > 0) j = j.slice(i0);
          if (!j) { AMX.toast('Collez d\'abord le jeton.', 'attention'); return; }
          if (!/^cfrt_\S{8,}$/i.test(j)) {
            var forme = j.length + ' caractères' + (j.toLowerCase().indexOf('cfrt') < 0 ? ', sans « cfrt »' : '') + (/^[0-9]/.test(j) ? ', commence par un chiffre' : '') + (/[•*]/.test(j) ? ', avec des « • » ou « * » (jeton masqué ?)' : '');
            AMX.toast('Ce n\'est pas un jeton Central Fleet : il doit contenir « cfrt_ » suivi du jeton (' + forme + '). Copiez la case du jeton elle-même.', 'erreur', 14000);
            return;
          }
          poser.classList.add('occupe');
          // `cleCf`, pas `jeton` : AMX.post ajoute déjà `jeton` (la session) à chaque requête.
          AMX.post({ action: 'cfJeton', compagnie: c.compagnie, cleCf: j }, { delai: 60000, secours: false }).then(function (x) {
            champJeton.value = '';
            if (!x || x.refuse || x.ok === false) { AMX.toast((x && x.erreur) || 'Jeton refusé', 'erreur', 10000); return; }
            AMX.toast(x.message || 'Branché', 'ok', 9000); if (x.avertissement) AMX.toast(x.avertissement, 'attention', 12000);
            AMX.transport.vider(); charger();
          }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }).then(function () { poser.classList.remove('occupe'); });
        } });
        var retirer = c.branche ? h('button.btn.petit.danger', { type: 'button', text: 'Retirer', onclick: function () {
          AMX.confirmer('Débrancher ' + c.nomConcession + ' ?', 'Le jeton sera révoqué chez Central Fleet : il faudra leur en demander un nouveau pour rebrancher la concession. Les transports déjà suivis restent dans ScanAutomax.', { ok: 'Retirer', danger: true }).then(function (ok) {
            if (!ok) return;
            AMX.post({ action: 'cfJetonRetirer', compagnie: c.compagnie }, { secours: false }).then(function (x) { if (!x || x.ok === false) throw new Error((x && x.erreur) || 'Refusé'); AMX.toast(c.nomConcession + ' débranché', 'ok'); AMX.transport.vider(); charger(); }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
          });
        } }) : null;
        corps.appendChild(h('div.rang', [h('b', { text: c.nomConcession }), h('div', [h('div.etat', { text: etat }), c.erreur ? h('div.etat', { style: { color: 'var(--rouge)' }, text: c.erreur }) : null]),
          r.peutRegler ? h('div.saisie-jeton', [champJeton, poser, retirer]) : h('span.doux.petit', { text: 'Réservé au propriétaire' })]));
      });
    };
    var charger = function () {
      AMX.vider(corps); corps.appendChild(h('p.doux.petit', { text: 'Lecture de l\'état…' }));
      AMX.get({ cfEtat: 1 }, { secours: false }).then(function (r) {
        if (!r || !Array.isArray(r.concessions)) throw new Error((r && r.erreur) || SCRIPT_PAS_A_JOUR);
        dessiner(r);
      }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('p.doux.petit', { text: 'Central Fleet : ' + AMX.erreurTexte(e) })); });
    };
    charger();
    return carte;
  }
})();
