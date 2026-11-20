/* Feuille d'évaluation (19 nov. 2026) — suggestions S29651453EC et S6FDA5B1BCE (François, Ste Marie : « quand un prix est
   confirmé dans Torque nous avions une feuille imprimée pour certifier le prix reçu, est-ce possible d'avoir cette feuille dans
   Scan ? »).

   Une page lettre à imprimer (ou à enregistrer en PDF) qui certifie la valeur donnée au client : la concession, le client, le
   conseiller, le véhicule et son état, la valeur évaluée, sa validité, la déclaration du propriétaire et les signatures.

   RÈGLES
   - Elle sort d'une DEMANDE d'évaluation dont le montant est donné : état « faite » et valeur > 0. Dans le circuit de la
     direction, « faite » veut dire montant confirmé : le représentant, la direction et l'évaluateur impriment tous le même
     montant, celui que la fiche affiche. Jamais une demande annulée, refusée, ou encore « à confirmer ».
   - JAMAIS sur la feuille : prix d'achat interne, recon, marge, % du marché, coûts, solde de prêt, mode de financement, notes
     (du représentant, de l'évaluateur, de la direction, du véhicule), raison d'un renvoi, messages. `donnees()` ne prend que
     les champs nommés ici — rien n'est recopié en bloc.
   - Un représentant ne lit jamais l'évaluation : pour lui la feuille se bâtit avec la demande (ce qu'il a inscrit) et le
     décodeur du NIV. La direction et l'évaluateur la complètent avec l'état inscrit dans l'évaluation (?evalVin=).
   - Au nom de la concession qui évalue (?concessionInfo=, comme la feuille d'offre), jamais « Groupe Automax ».
   - Valeur expirée : la feuille s'imprime quand même, et le dit en gros à la place de la validité.
   - Anglais quand la langue du client de la demande est « en ».

   AMX.feuilleEvaluation = { possible(x), ouvrir(x, { portail }), donnees(x, sources), construire(f) } */
(function () {
  'use strict';
  var AMX = window.AMX;
  if (!AMX) return;

  /* ------------------------------ Textes ------------------------------ */
  var T = {
    fr: {
      titre: 'Évaluation de véhicule', document: 'Document', evalueeLe: 'Évaluée le', par: 'par', imprimeeLe: 'Imprimée le',
      client: 'Client', conseiller: 'Conseiller', vehicule: 'Véhicule', niv: 'NIV', odometre: 'Odomètre', carrosserie: 'Carrosserie',
      moteur: 'Moteur', carburant: 'Carburant', transmission: 'Transmission', motricite: 'Motricité', cles: 'Clés',
      couleur: 'Couleur', interieur: 'Intérieur', etat: 'État général', valeur: 'Valeur évaluée', valide: 'Valide jusqu\'au',
      expiree: 'Valeur expirée le', expireeSuite: 'Une nouvelle évaluation est nécessaire.',
      options: 'Options', aucuneOption: 'Aucune option inscrite', constats: 'À noter', pneus: 'Pneus', ete: 'Été', hiver: 'Hiver',
      dimension: 'Dimension', pareBrise: 'Pare-brise', accident: 'Accident déclaré', dommages: 'dommages de',
      carro: 'Carrosserie', voyants: 'Voyants', garanties: 'Garanties et protections', aucune: 'Aucune inscrite',
      commentaires: 'Commentaires', declaration: 'Déclaration du propriétaire',
      d1: 'Je confirme que les renseignements de cette feuille décrivent fidèlement mon véhicule. Si je le cède à {cie}, je le remets avec les clés, les pneus et les accessoires qui y sont inscrits.',
      d2: 'Si le véhicule est endommagé ou subit un bris mécanique entre ma signature et la transaction, je le fais réparer à mes frais ou j\'accepte qu\'il soit évalué de nouveau.',
      d3: 'Je déclare que le véhicule n\'a aucun vice ni défaut, visible ou caché, autre que ceux inscrits ici, y compris au moteur et à la transmission.',
      d4: 'La concession n\'a pas à retirer le lettrage du véhicule avant de le revendre. La valeur repose sur ces renseignements : elle peut être revue si l\'état, le kilométrage ou l\'historique du véhicule diffèrent à la remise.',
      proprietaire: 'Propriétaire vendeur', date: 'Date', representant: 'Représentant', km: 'km', deux: ' : '
    },
    en: {
      titre: 'Vehicle Appraisal', document: 'Document', evalueeLe: 'Appraised on', par: 'by', imprimeeLe: 'Printed on',
      client: 'Customer', conseiller: 'Sales consultant', vehicule: 'Vehicle', niv: 'VIN', odometre: 'Odometer', carrosserie: 'Body style',
      moteur: 'Engine', carburant: 'Fuel', transmission: 'Transmission', motricite: 'Drivetrain', cles: 'Keys',
      couleur: 'Colour', interieur: 'Interior', etat: 'Overall condition', valeur: 'Appraised value', valide: 'Valid until',
      expiree: 'Value expired on', expireeSuite: 'A new appraisal is required.',
      options: 'Options', aucuneOption: 'No option recorded', constats: 'Notes on the vehicle', pneus: 'Tires', ete: 'Summer', hiver: 'Winter',
      dimension: 'Size', pareBrise: 'Windshield', accident: 'Declared accident', dommages: 'damage of',
      carro: 'Body', voyants: 'Warning lights', garanties: 'Warranties and protections', aucune: 'None recorded',
      commentaires: 'Comments', declaration: 'Owner\'s declaration',
      d1: 'I confirm that the information on this sheet accurately describes my vehicle. If I transfer it to {cie}, I will hand it over with the keys, tires and accessories listed here.',
      d2: 'If the vehicle is damaged or has a mechanical failure between my signature and the transaction, I will have it repaired at my expense or accept a new appraisal.',
      d3: 'I declare that the vehicle has no defect, visible or hidden, other than those listed here, including the engine and the transmission.',
      d4: 'The dealership is not required to remove any lettering from the vehicle before reselling it. The value is based on this information: it may be revised if the vehicle\'s condition, mileage or history differ at delivery.',
      proprietaire: 'Owner (seller)', date: 'Date', representant: 'Sales consultant', km: 'km', deux: ': '
    }
  };
  /* Libellés des codes (les mêmes codes que l'évaluation et l'app). */
  var CODES = {
    etat: { fr: { excellent: 'Excellent', bon: 'Bon', normal: 'Normal', mauvais: 'Mauvais' }, en: { excellent: 'Excellent', bon: 'Good', normal: 'Average', mauvais: 'Poor' } },
    accident: { fr: { non: 'Non', oui: 'Oui', inconnu: 'Inconnu' }, en: { non: 'No', oui: 'Yes', inconnu: 'Unknown' } },
    cles: { fr: { '0': 'Aucune', '1': '1', '2': '2', '3': '3 et plus' }, en: { '0': 'None', '1': '1', '2': '2', '3': '3 or more' } },
    constats: {
      fr: { vu: 'Véhicule vu', moteur: 'Témoin moteur', abs: 'Témoin ABS', coussins: 'Témoin coussins', clim: 'Clim défectueuse', fumeur: 'Fumeur', modifie: 'Modifié', americain: 'Véhicule américain' },
      en: { vu: 'Vehicle seen', moteur: 'Check-engine light', abs: 'ABS light', coussins: 'Airbag light', clim: 'A/C not working', fumeur: 'Smoker', modifie: 'Modified', americain: 'U.S. vehicle' }
    },
    garanties: {
      fr: { origine: 'Garantie d\'origine', prolongee: 'Garantie prolongée', motopropulseur: 'Motopropulseur', assurance: 'Produits d\'assurance' },
      en: { origine: 'Factory warranty', prolongee: 'Extended warranty', motopropulseur: 'Powertrain', assurance: 'Insurance products' }
    },
    options: {
      fr: { toit: 'Toit ouvrant', cuir: 'Cuir', siegesChauffants: 'Sièges chauffants', volantChauffant: 'Volant chauffant', siegesVentiles: 'Sièges ventilés', navigation: 'Navigation', camera360: 'Caméra 360°', demarreur: 'Démarreur à distance', regulateur: 'Régulateur adaptatif', anglesMorts: 'Angles morts', hayon: 'Hayon électrique', attelage: 'Attelage', son: 'Son haut de gamme', teteHaute: 'Affichage tête haute', marchepieds: 'Marchepieds', caisse: 'Doublure de caisse', cable: 'Câble de recharge (VÉ)' },
      en: { toit: 'Sunroof', cuir: 'Leather', siegesChauffants: 'Heated seats', volantChauffant: 'Heated steering wheel', siegesVentiles: 'Ventilated seats', navigation: 'Navigation', camera360: '360° camera', demarreur: 'Remote start', regulateur: 'Adaptive cruise', anglesMorts: 'Blind-spot monitoring', hayon: 'Power liftgate', attelage: 'Trailer hitch', son: 'Premium audio', teteHaute: 'Head-up display', marchepieds: 'Running boards', caisse: 'Bedliner', cable: 'Charging cable (EV)' }
    },
    pneus: { fr: {}, en: { 'neufs': 'New', 'bons': 'Good', 'moyens': 'Fair', 'à changer': 'To replace', 'aucun': 'None' } },
    pareBrise: { fr: {}, en: { 'bon': 'Good', 'éclat': 'Chipped', 'fissuré': 'Cracked', 'à changer': 'To replace' } },
    carrosserie: {
      fr: { camionnette: 'Camionnette', vus: 'VUS', berline: 'Berline', hayon: 'Hatchback', cabriolet: 'Cabriolet', coupe: 'Coupé', fourgonnette: 'Fourgonnette', familiale: 'Familiale', fourgon: 'Fourgon', grancoupe: 'Gran Coupé', vuscoupe: 'VUS coupé' },
      en: { camionnette: 'Pickup', vus: 'SUV', berline: 'Sedan', hayon: 'Hatchback', cabriolet: 'Convertible', coupe: 'Coupe', fourgonnette: 'Minivan', familiale: 'Wagon', fourgon: 'Van', grancoupe: 'Gran Coupe', vuscoupe: 'SUV coupe' }
    },
    motricite: {
      fr: { awd: 'Intégrale', int: 'Intégrale / 4x4', '4x4': '4x4', traction: 'Traction avant', avant: 'Traction avant', propulsion: 'Propulsion', arriere: 'Propulsion', deux: '2 roues motrices' },
      en: { awd: 'All-wheel drive', int: 'All-wheel drive / 4x4', '4x4': '4x4', traction: 'Front-wheel drive', avant: 'Front-wheel drive', propulsion: 'Rear-wheel drive', arriere: 'Rear-wheel drive', deux: '2-wheel drive' }
    },
    carburant: {
      fr: { essence: 'Essence', diesel: 'Diesel', hybride: 'Hybride', hybrideBranchable: 'Hybride rechargeable', electrique: 'Électrique', flex: 'Polycarburant (E85)' },
      en: { essence: 'Gasoline', diesel: 'Diesel', hybride: 'Hybrid', hybrideBranchable: 'Plug-in hybrid', electrique: 'Electric', flex: 'Flex fuel (E85)' }
    },
    transmission: {
      fr: { automatique: 'Automatique', manuelle: 'Manuelle', cvt: 'CVT (variation continue)', dct: 'Double embrayage', amt: 'Manuelle automatisée' },
      en: { automatique: 'Automatic', manuelle: 'Manual', cvt: 'CVT', dct: 'Dual-clutch', amt: 'Automated manual' }
    }
  };
  var ORDRE_ETAT = ['mauvais', 'normal', 'bon', 'excellent'];

  function txt(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function nombre(v) { var n = Number(String(v === null || v === undefined ? '' : v).replace(/[^\d.,-]/g, '').replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; }
  function libelle(groupe, langue, code) {
    var c = txt(code); if (!c) return '';
    var g = CODES[groupe] || {}, t = (g[langue] || {})[c] || (g[langue] || {})[c.toLowerCase()];
    if (t) return t;
    if (langue === 'fr') return ((g.fr || {})[c]) || c;
    return ((g.fr || {})[c]) || c;   /* code inconnu en anglais : le texte tel quel */
  }
  function transmissionTexte(langue, v) {
    var s = txt(v); if (!s) return '';
    var m = /^([^:]+):(\d+)$/.exec(s), code = m ? m[1] : s, n = m ? Number(m[2]) : 0;
    var nom = libelle('transmission', langue, code);
    return n ? nom + (langue === 'en' ? ', ' + n + '-speed' : ', ' + n + ' rapports') : nom;
  }
  function argent(v, langue) {
    var n = Number(v) || 0;
    try { return n.toLocaleString(langue === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' }).replace(/CA\$/, '$').replace(/[  ]/g, ' '); }
    catch (e) { return n.toFixed(2) + ' $'; }
  }
  function entier(v, langue) { var n = Math.round(Number(v) || 0); try { return n.toLocaleString(langue === 'en' ? 'en-CA' : 'fr-CA').replace(/[  ]/g, ' '); } catch (e) { return String(n); } }
  function dateLongue(iso, langue, avecHeure) {
    var d = iso instanceof Date ? iso : new Date(iso);
    if (!isFinite(d.getTime())) return '';
    var o = { year: 'numeric', month: 'long', day: 'numeric' };
    var s;
    try { s = d.toLocaleDateString(langue === 'en' ? 'en-CA' : 'fr-CA', o); } catch (e) { s = d.toISOString().slice(0, 10); }
    if (avecHeure) { var hh = d.getHours(), mm = ('0' + d.getMinutes()).slice(-2); s += langue === 'en' ? ', ' + hh + ':' + mm : ', ' + hh + ' h ' + mm; }
    return s;
  }
  function codesDe(liste) { return (Array.isArray(liste) ? liste : []).map(txt).filter(Boolean); }

  /* La feuille s'imprime-t-elle pour cette demande ? (le montant est donné et la personne le voit) */
  function possible(x) { return !!x && x.etat === 'faite' && nombre(x.valeur) > 0; }

  /* Les données de la feuille — SEULEMENT ce qui peut être remis au client. sources = { info (concession), dec (décodeur),
     ev (évaluation, jamais pour un représentant), maintenant }. */
  function donnees(x, sources) {
    sources = sources || {};
    var info = sources.info || {}, dec = (sources.dec && sources.dec.ok !== false) ? sources.dec : {}, ev = sources.ev || null;
    var detail = x.detail || {};
    var suivi = detail.suivi || {};
    var e = {}, eDemande = detail.etatVehicule || {}, eEval = (ev && ev.etatVehicule) || {};
    /* l'état : ce que l'évaluateur a inscrit l'emporte sur ce que le représentant a inscrit dans sa demande */
    ['general', 'pneusEte', 'pneusHiver', 'pneusDim', 'pareBrise', 'accident', 'accidentMontant', 'carrosserie', 'voyants', 'cles', 'couleurExt', 'couleurInt'].forEach(function (k) {
      var v = txt(eEval[k]) || txt(eDemande[k]); if (v) e[k] = v;
    });
    ['constats', 'options', 'garanties'].forEach(function (k) {
      var l = codesDe(eEval[k]); if (!l.length) l = codesDe(eDemande[k]); e[k] = l;
    });
    var langue = (txt(suivi.langue) || txt(ev && ev.suivi && ev.suivi.langue)).toLowerCase() === 'en' ? 'en' : 'fr';
    var titre = txt(x.vehicule) || [x.annee, x.marque, x.modele].map(txt).filter(Boolean).join(' ')
      || [(ev && ev.annee) || dec.annee, (ev && ev.marque) || dec.marque, (ev && ev.modele) || dec.modele].map(txt).filter(Boolean).join(' ');   /* demande sans véhicule décodé */
    var version = txt(ev && ev.version) || txt(dec.version);
    if (version && titre.toLowerCase().indexOf(version.toLowerCase()) < 0) titre = (titre + ' ' + version).trim();
    var nomCie = txt(info.nomOfficiel) || txt(info.nom) || txt((AMX.COMPAGNIES_TOUTES || {})[x.compagnie]) || txt(x.compagnie);
    var adresse = [txt(info.adressePhys) || txt(info.adresse), [txt(info.villePhys) || txt(info.ville), txt(info.province)].filter(Boolean).join(', '), txt(info.codePostalPhys) || txt(info.codePostal)].filter(Boolean).join(' · ');
    var valide = txt(x.valideJusqu), maintenant = sources.maintenant || new Date();
    var expiree = !!x.expiree || (!!valide && !x.issue && new Date(valide).getTime() < maintenant.getTime());
    return {
      langue: langue, id: txt(x.id),
      concession: { nom: nomCie, adresse: adresse, telephone: txt(info.telephone), permis: txt(info.noConcessionnaire), province: txt(info.province) },
      client: { nom: txt(suivi.client) || txt(x.client), telephone: txt(x.telephone) },
      conseiller: txt(x.demandeParNom), evaluePar: txt(x.faitePar), evalueLe: txt(x.faiteLe), imprimeLe: maintenant,
      vehicule: {
        titre: titre, vin: txt(x.vin), km: nombre(x.km),
        carrosserie: txt(ev && ev.carrosserie) || txt(dec.carrosserie), moteur: txt(dec.moteur),
        carburant: txt(ev && ev.carburant) || txt(dec.carburant), transmission: txt(dec.transmission),
        motricite: txt(ev && ev.motricite) || txt(dec.motricite),
        cles: e.cles || '', couleurExt: e.couleurExt || '', couleurInt: e.couleurInt || ''
      },
      etat: {
        general: e.general || '', pneusEte: e.pneusEte || '', pneusHiver: e.pneusHiver || '', pneusDim: e.pneusDim || '',
        pareBrise: e.pareBrise || '', accident: e.accident || '', accidentMontant: e.accident === 'oui' ? nombre(e.accidentMontant) : 0,
        carrosserie: e.carrosserie || '', voyants: e.voyants || '', constats: e.constats, options: e.options, garanties: e.garanties
      },
      /* une valeur dont la date est passée sans être « expirée » (véhicule repris, dossier perdu) : la date ne s'imprime plus */
      valeur: nombre(x.valeur), valideJusqu: (expiree || !valide || new Date(valide).getTime() >= maintenant.getTime()) ? valide : '', expiree: expiree
    };
  }

  /* ------------------------------ La page ------------------------------ */
  function injecterCss() {
    if (document.getElementById('css-feuille-eval')) return;
    var s = document.createElement('style');
    s.id = 'css-feuille-eval';
    s.textContent = [
      '#feuille-eval-impression { display: none; }',
      '#feuille-eval-impression.fev-apercu { display: block; }',
      '@page fev { size: letter; margin: 0.45in 0.5in; }',
      '@media print { body.impression-feuille-eval > *:not(#feuille-eval-impression) { display: none !important; } body.impression-feuille-eval { background: #fff !important; } body.impression-feuille-eval #feuille-eval-impression { display: block; page: fev; } }',
      '.fev-page { box-sizing: border-box; width: 100%; max-width: 7.5in; margin: 0 auto; background: #fff; color: #111; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 11.5px; line-height: 1.38; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      '.fev-page * { box-sizing: border-box; }',
      '.fev-entete { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 8px; }',
      '.fev-cie-nom { font-size: 16px; font-weight: 800; } .fev-doux { color: #444; font-size: 10.5px; }',
      '.fev-titre { text-align: right; } .fev-titre h1 { margin: 0 0 3px; font-size: 21px; line-height: 1.1; letter-spacing: .01em; }',
      '.fev-deux { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; }',
      '.fev-boite { border: 1px solid #999; border-radius: 4px; padding: 6px 9px; break-inside: avoid; }',
      '.fev-l { display: block; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #444; margin-bottom: 2px; }',
      '.fev-fort { font-size: 13.5px; font-weight: 700; }',
      '.fev-veh { display: grid; grid-template-columns: 1.3fr 1fr; gap: 10px; margin-bottom: 8px; }',
      '.fev-veh-titre { font-size: 15px; font-weight: 800; margin-bottom: 4px; }',
      '.fev-table { width: 100%; border-collapse: collapse; } .fev-table th { text-align: left; font-weight: 600; color: #444; padding: 1px 8px 1px 0; width: 96px; vertical-align: top; white-space: nowrap; } .fev-table td { padding: 1px 0; font-weight: 600; }',
      '.fev-mono { font-family: Menlo, Consolas, "Courier New", monospace; letter-spacing: .04em; }',
      '.fev-echelle { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #111; border-radius: 4px; overflow: hidden; margin-bottom: 8px; }',
      '.fev-echelle span { text-align: center; padding: 5px 2px; font-size: 10.5px; color: #555; border-right: 1px solid #bbb; } .fev-echelle span:last-child { border-right: 0; }',
      '.fev-echelle span.choisi { background: #111; color: #fff; font-weight: 800; }',
      '.fev-valeur { border: 2px solid #111; border-radius: 6px; padding: 8px 10px; text-align: center; }',
      '.fev-valeur b { display: block; font-size: 27px; line-height: 1.15; font-weight: 800; }',
      '.fev-valeur .fev-valide { font-size: 11px; font-weight: 600; }',
      '.fev-valeur .fev-expiree { display: block; margin-top: 4px; padding: 4px 6px; border: 2px solid #111; font-size: 12.5px; font-weight: 800; text-transform: uppercase; }',
      '.fev-options { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px 10px; }',
      '.fev-options span::before { content: "\\2713\\00a0"; font-weight: 800; }',
      '.fev-trois { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin: 8px 0; }',
      '.fev-rang { margin: 0 0 2px; } .fev-rang b { font-weight: 700; }',
      '.fev-lignes { margin: 0 0 8px; } .fev-lignes p { margin: 0 0 3px; }',
      '.fev-comm .fev-trait { border-bottom: 1px solid #999; height: 17px; }',
      '.fev-decl { margin-top: 8px; border-top: 2px solid #111; padding-top: 7px; break-inside: avoid; }',
      '.fev-decl-tete { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 4px; } .fev-decl-tete b { font-size: 13.5px; } .fev-decl-tete span { font-size: 11px; font-weight: 700; }',
      '.fev-decl p { margin: 0 0 4px; font-size: 10.5px; line-height: 1.36; text-align: justify; }',
      '.fev-signatures { display: grid; grid-template-columns: 1.4fr .8fr 1.2fr; gap: 22px; margin-top: 20px; break-inside: avoid; }',
      '.fev-signatures .fev-trait { border-bottom: 1px solid #111; height: 22px; margin-bottom: 3px; }',
      '.fev-pied { margin-top: 10px; font-size: 9.5px; color: #555; text-align: center; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function construire(f) {
    var h = AMX.h, L = T[f.langue] || T.fr, lg = f.langue;
    var c = f.concession, v = f.vehicule, e = f.etat;
    var rangee = function (nom, valeur, mono) { return valeur ? h('tr', [h('th', { text: nom }), h('td' + (mono ? '.fev-mono' : ''), { text: valeur })]) : null; };
    var permis = c.permis ? (lg === 'en' ? (c.province === 'ON' ? 'Dealer licence (OMVIC) ' : 'Dealer licence (SAAQ) ') : (c.province === 'ON' ? 'Permis de commerçant (OMVIC) ' : 'Permis de commerçant (SAAQ) ')) + c.permis : '';
    var couleur = [v.couleurExt, v.couleurInt ? L.interieur.toLowerCase() + ' ' + v.couleurInt : ''].filter(Boolean).join(' · ');
    var tableVeh = h('table.fev-table', [h('tbody', [
      rangee(L.niv, v.vin, true),
      rangee(L.odometre, v.km ? entier(v.km, lg) + ' ' + L.km : ''),
      rangee(L.carrosserie, libelle('carrosserie', lg, v.carrosserie)),
      rangee(L.moteur, v.moteur),
      rangee(L.carburant, libelle('carburant', lg, v.carburant)),
      rangee(L.transmission, transmissionTexte(lg, v.transmission)),
      rangee(L.motricite, libelle('motricite', lg, v.motricite)),
      rangee(L.couleur, couleur),
      rangee(L.cles, libelle('cles', lg, v.cles))
    ].filter(Boolean))]);
    var echelle = e.general && ORDRE_ETAT.indexOf(e.general) >= 0 ? h('div', [h('span.fev-l', { text: L.etat }), h('div.fev-echelle', ORDRE_ETAT.map(function (k) {
      return h('span' + (k === e.general ? '.choisi' : ''), { text: (k === e.general ? '✓ ' : '') + libelle('etat', lg, k) });
    }))]) : (e.general ? h('p.fev-rang', [h('b', { text: L.etat + L.deux }), libelle('etat', lg, e.general)]) : null);
    var validite = f.expiree
      ? h('span.fev-expiree', { text: L.expiree + ' ' + dateLongue(f.valideJusqu, lg) + ' — ' + L.expireeSuite })
      : (f.valideJusqu ? h('span.fev-valide', { text: L.valide + ' ' + dateLongue(f.valideJusqu, lg) }) : null);
    var valeur = h('div.fev-valeur', [h('span.fev-l', { text: L.valeur }), h('b', { text: argent(f.valeur, lg) }), validite]);

    var options = e.options.length
      ? h('div.fev-options', e.options.map(function (k) { return h('span', { text: libelle('options', lg, k) }); }))
      : h('span.fev-doux', { text: L.aucuneOption });
    var accident = e.accident ? libelle('accident', lg, e.accident) + (e.accidentMontant ? ' (' + L.dommages + ' ' + argent(e.accidentMontant, lg) + ')' : '') : '';
    var pneus = [
      e.pneusEte ? h('p.fev-rang', [h('b', { text: L.ete + L.deux }), libelle('pneus', lg, e.pneusEte)]) : null,
      e.pneusHiver ? h('p.fev-rang', [h('b', { text: L.hiver + L.deux }), libelle('pneus', lg, e.pneusHiver)]) : null,
      e.pneusDim ? h('p.fev-rang', [h('b', { text: L.dimension + L.deux }), e.pneusDim]) : null
    ].filter(Boolean);
    var vitre = [
      e.pareBrise ? h('p.fev-rang', [h('b', { text: L.pareBrise + L.deux }), libelle('pareBrise', lg, e.pareBrise)]) : null,
      accident ? h('p.fev-rang', [h('b', { text: L.accident + L.deux }), accident]) : null
    ].filter(Boolean);
    var garanties = e.garanties.length ? e.garanties.map(function (k) { return h('p.fev-rang', { text: '✓ ' + libelle('garanties', lg, k) }); }) : [h('span.fev-doux', { text: L.aucune })];
    var trois = h('div.fev-trois', [
      h('div.fev-boite', [h('span.fev-l', { text: L.pneus })].concat(pneus.length ? pneus : [h('span.fev-doux', { text: '—' })])),
      h('div.fev-boite', [h('span.fev-l', { text: L.pareBrise + ' · ' + L.accident })].concat(vitre.length ? vitre : [h('span.fev-doux', { text: '—' })])),
      h('div.fev-boite', [h('span.fev-l', { text: L.garanties })].concat(garanties))
    ]);
    var lignes = [
      e.carrosserie ? h('p', [h('b', { text: L.carro + L.deux }), e.carrosserie]) : null,
      e.voyants ? h('p', [h('b', { text: L.voyants + L.deux }), e.voyants]) : null,
      e.constats.length ? h('p', [h('b', { text: L.constats + L.deux }), e.constats.map(function (k) { return libelle('constats', lg, k); }).join(' · ')]) : null
    ].filter(Boolean);

    var evaluee = f.evalueLe ? L.evalueeLe + ' ' + dateLongue(f.evalueLe, lg) + (f.evaluePar ? ' ' + L.par + ' ' + f.evaluePar : '') : '';
    return h('div#feuille-eval-impression.fev-page', { lang: lg }, [
      h('div.fev-entete', [
        h('div', [h('div.fev-cie-nom', { text: c.nom }), c.adresse ? h('div.fev-doux', { text: c.adresse }) : null, c.telephone ? h('div.fev-doux', { text: c.telephone }) : null, permis ? h('div.fev-doux', { text: permis }) : null]),
        h('div.fev-titre', [h('h1', { text: L.titre }), h('div.fev-doux', { text: L.document + ' ' + f.id }), evaluee ? h('div.fev-doux', { text: evaluee }) : null])
      ]),
      h('div.fev-deux', [
        h('div.fev-boite', [h('span.fev-l', { text: L.client }), h('div.fev-fort', { text: f.client.nom || '—' }), f.client.telephone ? h('div', { text: f.client.telephone }) : null]),
        h('div.fev-boite', [h('span.fev-l', { text: L.conseiller }), h('div.fev-fort', { text: f.conseiller || '—' }), h('div', { text: c.nom })])
      ]),
      h('div.fev-veh', [
        h('div.fev-boite', [h('span.fev-l', { text: L.vehicule }), h('div.fev-veh-titre', { text: v.titre || '—' }), tableVeh]),
        h('div', [echelle, valeur])
      ]),
      h('div.fev-boite', [h('span.fev-l', { text: L.options }), options]),
      trois,
      lignes.length ? h('div.fev-lignes', lignes) : null,
      h('div.fev-comm', [h('span.fev-l', { text: L.commentaires }), h('div.fev-trait'), h('div.fev-trait')]),
      h('div.fev-decl', [
        h('div.fev-decl-tete', [h('b', { text: L.declaration }), f.expiree ? h('span', { text: L.expiree + ' ' + dateLongue(f.valideJusqu, lg) }) : (f.valideJusqu ? h('span', { text: L.valide + ' ' + dateLongue(f.valideJusqu, lg) }) : null)]),
        h('p', { text: L.d1.replace('{cie}', c.nom || (lg === 'en' ? 'the dealership' : 'la concession')) + ' ' + L.d2 }),
        h('p', { text: L.d3 }),
        h('p', { text: L.d4 })
      ]),
      h('div.fev-signatures', [
        h('div', [h('div.fev-trait'), h('div.fev-doux', { text: L.proprietaire + (f.client.nom ? ' — ' + f.client.nom : '') })]),
        h('div', [h('div.fev-trait'), h('div.fev-doux', { text: L.date })]),
        h('div', [h('div.fev-trait'), h('div.fev-doux', { text: L.representant + (f.conseiller ? ' — ' + f.conseiller : '') })])
      ]),
      h('div.fev-pied', { text: [c.nom, L.document + ' ' + f.id, L.imprimeeLe + ' ' + dateLongue(f.imprimeLe, lg, true)].filter(Boolean).join(' · ') })
    ]);
  }

  /* ------------------------------ Ouvrir (imprimer) ------------------------------ */
  var CACHE_INFO = {}, CACHE_DEC = {};
  /* Une lecture qui ne bloque jamais l'impression : au plus `ms`, sinon rien. */
  function auPlus(promesse, ms) {
    return new Promise(function (res) {
      var fini = false, t = setTimeout(function () { if (!fini) { fini = true; res(null); } }, ms);
      promesse.then(function (r) { if (!fini) { fini = true; clearTimeout(t); res(r); } }, function () { if (!fini) { fini = true; clearTimeout(t); res(null); } });
    });
  }
  function lireInfo(x) {
    var cle = (AMX.COMPAGNIE_CONCESSION || {})[x.compagnie] || x.compagnie || '';
    if (!cle) return Promise.resolve(null);
    if (CACHE_INFO[cle]) return Promise.resolve(CACHE_INFO[cle]);
    return AMX.get({ concessionInfo: cle }, { discret: true }).then(function (r) { if (r && r.ok) { CACHE_INFO[cle] = r; return r; } return null; });
  }
  function lireDecodage(vin) {
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(String(vin || ''))) return Promise.resolve(null);
    if (CACHE_DEC[vin]) return Promise.resolve(CACHE_DEC[vin]);
    return AMX.get({ decoder: vin }, { discret: true, essais: 1 }).then(function (r) { if (r && r.ok) { CACHE_DEC[vin] = r; return r; } return null; });
  }
  function lireEvaluation(x, portail) {
    if (portail || (AMX.representantEval && AMX.representantEval())) return Promise.resolve(null);   /* un représentant ne lit jamais l'évaluation */
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(String(x.vin || ''))) return Promise.resolve(null);
    return AMX.get({ evalVin: x.vin }, { discret: true }).then(function (r) { return r && r.trouve && r.donnees ? r.donnees : null; });
  }
  var enCours = false;
  function ouvrir(x, opts) {
    opts = opts || {};
    if (!possible(x)) { AMX.toast('La feuille s\'imprime une fois le montant donné.', 'attention'); return Promise.resolve(false); }
    if (enCours) return Promise.resolve(false);
    enCours = true;
    injecterCss();
    var portail = !!opts.portail;
    if (opts.bouton) opts.bouton.classList.add('occupe');
    return Promise.all([auPlus(lireInfo(x), 7000), auPlus(lireDecodage(x.vin), 7000), auPlus(lireEvaluation(x, portail), 7000)]).then(function (r) {
      var f = donnees(x, { info: r[0], dec: r[1], ev: r[2], maintenant: new Date() });
      var ancienne = document.getElementById('feuille-eval-impression'); if (ancienne) ancienne.remove();
      var page = construire(f);
      document.body.appendChild(page);
      document.body.classList.add('impression-feuille-eval');
      var nettoyer = function () {
        document.body.classList.remove('impression-feuille-eval');
        window.removeEventListener('afterprint', nettoyer);
        setTimeout(function () { if (page.parentNode && !page.classList.contains('fev-apercu')) page.remove(); }, 500);
      };
      window.addEventListener('afterprint', nettoyer);
      if (f.expiree) AMX.toast('Cette valeur est expirée : la feuille le dit. Pour une valeur à jour, demandez une réévaluation.', 'attention', 7000);
      setTimeout(function () { try { window.print(); } catch (e) { nettoyer(); } }, 80);
      /* sans événement afterprint (certains navigateurs), on nettoie après coup */
      setTimeout(function () { if (document.body.classList.contains('impression-feuille-eval')) nettoyer(); }, 60000);
      return true;
    }).catch(function (e) { AMX.toast('Feuille non préparée — ' + (AMX.erreurTexte ? AMX.erreurTexte(e) : e.message), 'erreur'); return false; })
      .then(function (ok) { enCours = false; if (opts.bouton) opts.bouton.classList.remove('occupe'); return ok; });
  }

  AMX.feuilleEvaluation = { possible: possible, ouvrir: ouvrir, donnees: donnees, construire: construire, injecterCss: injecterCss, textes: T };
})();
