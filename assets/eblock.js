/* Fiches eBlock (7 octobre 2026) — Outils › Fiches eBlock et bloc « Fiche eBlock »
   dans le panneau d'inventaire et la fiche d'achat.

   Maxime : « importer les fiches descriptives de eBlock comme on le fait pour
   CARFAX et Torque », pour les véhicules achetés encore en stock.

   Le signet « Automax ← eBlock (fiches) » (chargeur : CODE_SIGNET_EBLOCK_FICHES,
   code complet publié dans assets/signet-eblock-fiches.js par
   mock/signet-build.py depuis mock/signet-eblock-fiches.src.js) parcourt My
   Block › Buyer sur app.eblock.com, envoie la liste des achats via pont.html,
   reçoit du serveur (Eblock.gs) ceux dont le véhicule est encore à
   l'inventaire, ouvre chaque fiche dans la page eBlock et l'envoie par lots.
   Routes : GET ?eblock=1, ?eblockFiche=ID, ?eblockVin=NIV ; POST eblockImporter.

   - AMX.vues.FichesEblock : la page (import, cartes par concession, table,
     fiche complète en modale avec photos / dommages / pneus / peinture /
     déclarations / valeurs, export Excel).
   - AMX.eblockFiche(vin, conteneur) : bloc compact pour un NIV (panneau
     d'inventaire, fiche d'achat) avec « Voir la fiche ».
   - AMX.eblockOuvrir(id) : la modale, d'où qu'on vienne. */
(function () {
  'use strict';
  var h = AMX.h, esc = AMX.esc, I = AMX.icones;
  var URL_EBLOCK = 'https://app.eblock.com/my-block/buyer?formats=AUCTION&showDetails=true&id=';
  var CODE_SIGNET_EBLOCK_FICHES = "javascript:(function () { var s = document.createElement('script'); s.src = " + JSON.stringify(AMX.SITE) + " + 'assets/signet-eblock-fiches.js?t=' + Date.now(); s.onerror = function () { alert(\"Impossible de charger le signet depuis le site d'inventaire (groupeautomax.github.io). V\u00e9rifiez votre connexion, puis recliquez.\"); }; document.body.appendChild(s); })();";

  /* FR-DEBUT — bloc identique dans assets/eblock.js (site) et Eblock.gs (script) ; gs/test_eblock.js vérifie qu'ils sont les mêmes.
     Libellés d'eBlock (anglais) → français : pièces des photos de dommages (« Front Door - Driver »),
     déclarations (« Former Daily Rental »), couleurs (« Blue »). Inconnu = texte d'origine. */
  var EBLOCK_FR_PIECES = {
    'hood': 'Capot', 'roof': 'Toit', 'trunk': 'Coffre', 'trunk lid': 'Couvercle de coffre', 'deck lid': 'Couvercle de coffre', 'tailgate': 'Hayon', 'lift gate': 'Hayon', 'liftgate': 'Hayon',
    'trunk / tailgate / lift gate': 'Coffre / hayon', 'trunk / tailgate': 'Coffre / hayon', 'tailgate / lift gate': 'Hayon',
    'front bumper': 'Pare-chocs avant', 'rear bumper': 'Pare-chocs arrière', 'bumper': 'Pare-chocs', 'front bumper cover': 'Pare-chocs avant', 'rear bumper cover': 'Pare-chocs arrière', 'bumper cover': 'Pare-chocs',
    'front door': 'Porte avant', 'rear door': 'Porte arrière', 'door': 'Porte', 'sliding door': 'Porte coulissante', 'door handle': 'Poignée de porte', 'handle': 'Poignée', 'door panel': 'Panneau de porte',
    'front fender': 'Aile avant', 'rear fender': 'Aile arrière', 'fender': 'Aile', 'rear quarter panel': 'Aile arrière', 'quarter panel': 'Aile arrière', 'front quarter panel': 'Aile avant', 'quarter': 'Aile arrière',
    'rocker panel': 'Bas de caisse', 'rocker': 'Bas de caisse', 'side skirt': 'Jupe latérale', 'running board': 'Marchepied', 'side step': 'Marchepied', 'pillar': 'Montant', 'a pillar': 'Montant A', 'b pillar': 'Montant B', 'c pillar': 'Montant C', 'cowl': 'Auvent',
    'windshield': 'Pare-brise', 'windscreen': 'Pare-brise', 'rear windshield': 'Lunette arrière', 'rear window': 'Lunette arrière', 'back glass': 'Lunette arrière', 'rear glass': 'Lunette arrière', 'window': 'Vitre', 'glass': 'Vitre', 'door glass': 'Vitre de porte', 'quarter glass': 'Vitre de custode', 'sunroof': 'Toit ouvrant', 'moonroof': 'Toit ouvrant', 'panoramic roof': 'Toit panoramique',
    'mirror': 'Rétroviseur', 'side mirror': 'Rétroviseur', 'mirror cover': 'Coquille de rétroviseur', 'rear view mirror': 'Rétroviseur intérieur',
    'headlight': 'Phare', 'head light': 'Phare', 'headlamp': 'Phare', 'tail light': 'Feu arrière', 'taillight': 'Feu arrière', 'tail lamp': 'Feu arrière', 'fog light': 'Phare antibrouillard', 'fog lamp': 'Phare antibrouillard', 'turn signal': 'Clignotant', 'marker light': 'Feu de position', 'light': 'Feu', 'lights': 'Feux', 'lens': 'Lentille',
    'grille': 'Calandre', 'grill': 'Calandre', 'emblem': 'Emblème', 'badge': 'Emblème', 'molding': 'Moulure', 'moulding': 'Moulure', 'trim': 'Garniture', 'spoiler': 'Aileron', 'antenna': 'Antenne', 'wiper': 'Essuie-glace', 'wipers': 'Essuie-glaces', 'fuel door': 'Trappe à essence', 'gas cap': 'Bouchon d\'essence', 'roof rail': 'Rail de toit', 'roof rack': 'Porte-bagages', 'license plate': 'Plaque', 'tow hitch': 'Attache-remorque', 'hitch': 'Attache-remorque', 'bed': 'Caisse', 'truck bed': 'Caisse', 'bed liner': 'Doublure de caisse', 'tonneau cover': 'Couvre-caisse', 'mud flap': 'Garde-boue', 'splash guard': 'Garde-boue',
    'tires / rims': 'Pneus / jantes', 'tires/rims': 'Pneus / jantes', 'tires': 'Pneus', 'tire': 'Pneu', 'rims': 'Jantes', 'rim': 'Jante', 'wheel': 'Roue', 'wheels': 'Roues', 'hubcap': 'Enjoliveur', 'hub cap': 'Enjoliveur', 'wheel cover': 'Enjoliveur', 'spare tire': 'Pneu de secours', 'wheel well': 'Passage de roue',
    'interior': 'Intérieur', 'exterior': 'Extérieur', 'other': 'Autre', 'body': 'Carrosserie', 'paint': 'Peinture', 'undercarriage': 'Dessous', 'underbody': 'Dessous', 'frame': 'Châssis', 'exhaust': 'Échappement', 'engine': 'Moteur', 'engine bay': 'Compartiment moteur', 'engine compartment': 'Compartiment moteur', 'mechanical': 'Mécanique', 'suspension': 'Suspension', 'brakes': 'Freins', 'battery': 'Batterie', 'transmission': 'Transmission', 'electrical': 'Électrique', 'structure': 'Structure', 'drivetrain': 'Motricité',
    'dashboard': 'Tableau de bord', 'dash': 'Tableau de bord', 'steering wheel': 'Volant', 'console': 'Console', 'center console': 'Console centrale', 'seat': 'Siège', 'seats': 'Sièges', 'front seat': 'Siège avant', 'rear seat': 'Siège arrière', 'driver seat': 'Siège conducteur', 'passenger seat': 'Siège passager', 'headliner': 'Ciel de toit', 'carpet': 'Tapis', 'floor': 'Plancher', 'floor mat': 'Tapis de plancher', 'floor mats': 'Tapis de plancher', 'cargo area': 'Espace cargo', 'trunk area': 'Intérieur du coffre', 'cargo cover': 'Cache-bagages', 'armrest': 'Accoudoir', 'headrest': 'Appuie-tête', 'seat belt': 'Ceinture', 'shifter': 'Levier de vitesse', 'pedals': 'Pédales', 'odometer': 'Odomètre', 'key': 'Clé', 'keys': 'Clés', 'radio': 'Radio', 'infotainment': 'Écran multimédia', 'screen': 'Écran', 'air conditioning': 'Climatisation', 'heater': 'Chauffage', 'sun visor': 'Pare-soleil', 'glove box': 'Boîte à gants'
  };
  // Côtés / positions ajoutés à la pièce (« - Driver », « Passenger Side », « Left », « Upper »…).
  var EBLOCK_FR_COTES = { 'driver': 'conducteur', 'passenger': 'passager', 'left': 'gauche', 'right': 'droite', 'front': 'avant', 'rear': 'arrière', 'back': 'arrière', 'upper': 'supérieur', 'lower': 'inférieur', 'center': 'centre', 'centre': 'centre', 'middle': 'centre', 'both': 'des deux côtés', 'inner': 'intérieur', 'outer': 'extérieur', 'top': 'dessus', 'bottom': 'dessous', 'lh': 'gauche', 'rh': 'droite' };
  // Noms féminins (accord de « droit », « supérieur »…) : premier mot de la traduction.
  var EBLOCK_FR_FEMININ_ = { 'Porte': 1, 'Aile': 1, 'Vitre': 1, 'Lunette': 1, 'Calandre': 1, 'Moulure': 1, 'Garniture': 1, 'Antenne': 1, 'Poignée': 1, 'Trappe': 1, 'Plaque': 1, 'Caisse': 1, 'Doublure': 1, 'Jante': 1, 'Jantes': 1, 'Roue': 1, 'Roues': 1, 'Console': 1, 'Ceinture': 1, 'Pédales': 1, 'Clé': 1, 'Clés': 1, 'Radio': 1, 'Climatisation': 1, 'Carrosserie': 1, 'Peinture': 1, 'Suspension': 1, 'Batterie': 1, 'Transmission': 1, 'Mécanique': 1, 'Jupe': 1, 'Coquille': 1, 'Lentille': 1, 'Boîte': 1, 'Structure': 1, 'Motricité': 1 };
  var EBLOCK_FR_DECLARATIONS = {
    'former daily rental': 'Ancien véhicule de location', 'daily rental': 'Ancien véhicule de location', 'former rental': 'Ancien véhicule de location', 'out of province vehicle': 'Véhicule hors province', 'out of province': 'Véhicule hors province', 'out-of-province': 'Véhicule hors province',
    '2 taxes': '2 taxes (TPS + TVQ)', 'two taxes': '2 taxes (TPS + TVQ)', '1 tax': '1 taxe', 'one tax': '1 taxe', 'no tax': 'Sans taxe',
    'former taxi': 'Ancien taxi', 'taxi': 'Ancien taxi', 'former police vehicle': 'Ancien véhicule de police', 'former police car': 'Ancien véhicule de police', 'police': 'Ancien véhicule de police', 'former emergency vehicle': 'Ancien véhicule d\'urgence', 'former limousine': 'Ancienne limousine', 'former lease': 'Retour de location (lease)', 'lease return': 'Retour de location (lease)', 'off lease': 'Retour de location (lease)', 'former driver training': 'Ancien véhicule d\'école de conduite', 'driver education': 'Ancien véhicule d\'école de conduite', 'government vehicle': 'Ancien véhicule gouvernemental', 'former government vehicle': 'Ancien véhicule gouvernemental', 'fleet vehicle': 'Véhicule de flotte', 'former fleet vehicle': 'Véhicule de flotte', 'commercial use': 'Usage commercial', 'former commercial vehicle': 'Usage commercial', 'dealer demo': 'Démonstrateur', 'demonstrator': 'Démonstrateur',
    'previous accident': 'Accident antérieur', 'previously damaged': 'Dommages antérieurs', 'previous damage': 'Dommages antérieurs', 'prior damage': 'Dommages antérieurs', 'accident': 'Accident antérieur', 'collision': 'Collision antérieure', 'previous repair': 'Réparation antérieure', 'structural damage': 'Dommages structurels', 'frame damage': 'Dommages au châssis', 'airbag deployed': 'Coussins gonflables déployés', 'airbags deployed': 'Coussins gonflables déployés', 'flood damage': 'Dommages par inondation', 'flood': 'Dommages par inondation', 'water damage': 'Dommages par l\'eau', 'fire damage': 'Dommages par le feu', 'hail damage': 'Dommages par la grêle', 'hail': 'Dommages par la grêle', 'vehicle damaged in transit': 'Endommagé en transport', 'rust': 'Rouille', 'rust present': 'Rouille', 'paint work': 'Retouche de peinture', 'repaint': 'Repeint', 'repainted': 'Repeint',
    'salvage': 'Titre récupéré (salvage)', 'salvage title': 'Titre récupéré (salvage)', 'rebuilt': 'Reconstruit', 'rebuilt title': 'Reconstruit', 'non-repairable': 'Irréparable', 'non repairable': 'Irréparable', 'irreparable': 'Irréparable', 'branded title': 'Titre marqué', 'lemon law buyback': 'Rachat par le constructeur (lemon)', 'manufacturer buyback': 'Rachat par le constructeur (lemon)', 'buyback': 'Rachat par le constructeur (lemon)',
    'odometer discrepancy': 'Kilométrage incertain', 'odometer rollback': 'Odomètre reculé', 'true mileage unknown': 'Kilométrage inconnu', 'tmu': 'Kilométrage inconnu', 'odometer replaced': 'Odomètre remplacé', 'odometer in miles': 'Odomètre en milles', 'odometer broken': 'Odomètre brisé', 'high mileage': 'Kilométrage élevé',
    'us vehicle': 'Véhicule des États-Unis', 'u.s. vehicle': 'Véhicule des États-Unis', 'previously registered in us': 'Déjà immatriculé aux États-Unis', 'previously registered in the us': 'Déjà immatriculé aux États-Unis', 'imported from us': 'Importé des États-Unis', 'imported': 'Importé', 'us import': 'Importé des États-Unis', 'grey market': 'Marché gris', 'gray market': 'Marché gris', 'export only': 'Exportation seulement',
    'theft recovery': 'Vol récupéré', 'recovered theft': 'Vol récupéré', 'stolen recovered': 'Vol récupéré', 'lien': 'Lien (privilège)', 'lien on vehicle': 'Lien (privilège)', 'recall': 'Rappel ouvert', 'open recall': 'Rappel ouvert', 'outstanding recall': 'Rappel ouvert', 'warranty cancelled': 'Garantie annulée', 'warranty void': 'Garantie annulée', 'as is': 'Tel quel', 'as-is': 'Tel quel', 'sold as is': 'Tel quel',
    'no keys': 'Aucune clé', 'missing key': 'Clé manquante', 'one key': 'Une seule clé', 'second key': 'Deuxième clé', 'spare key': 'Deuxième clé', 'two keys': 'Deux clés', 'winter tires': 'Pneus d\'hiver', 'second set of tires': 'Deuxième jeu de pneus', 'aftermarket wheels': 'Jantes après-marché', 'aftermarket modifications': 'Modifications après-marché', 'modified': 'Modifié', 'aftermarket exhaust': 'Échappement après-marché', 'lift kit': 'Suspension surélevée', 'lowered': 'Suspension abaissée', 'tinted windows': 'Vitres teintées', 'remote starter': 'Démarreur à distance', 'tow package': 'Ensemble remorquage', 'trailer hitch': 'Attache-remorque',
    'smoker': 'Odeur de fumée', 'smoke odor': 'Odeur de fumée', 'smoke odour': 'Odeur de fumée', 'smoker\'s vehicle': 'Odeur de fumée', 'pet odor': 'Odeur d\'animal', 'pet odour': 'Odeur d\'animal', 'odor': 'Odeur', 'odour': 'Odeur',
    'engine light on': 'Témoin moteur allumé', 'check engine light': 'Témoin moteur allumé', 'check engine light on': 'Témoin moteur allumé', 'abs light': 'Témoin ABS allumé', 'abs light on': 'Témoin ABS allumé', 'airbag light': 'Témoin coussins allumé', 'airbag light on': 'Témoin coussins allumé', 'warning light on': 'Témoin allumé', 'tpms light': 'Témoin de pression des pneus', 'tpms light on': 'Témoin de pression des pneus',
    'transmission issue': 'Problème de transmission', 'engine issue': 'Problème de moteur', 'engine noise': 'Bruit de moteur', 'transmission noise': 'Bruit de transmission', 'oil leak': 'Fuite d\'huile', 'coolant leak': 'Fuite de liquide de refroidissement', 'needs brakes': 'Freins à faire', 'needs tires': 'Pneus à remplacer', 'timing belt due': 'Courroie de distribution à faire', 'battery replaced': 'Batterie remplacée', 'mechanical issue': 'Problème mécanique', 'not running': 'Ne démarre pas', 'inoperable': 'Non roulant', 'drivable': 'Roulant', 'not drivable': 'Non roulant', 'ev battery replaced': 'Batterie EV remplacée', 'charging cable missing': 'Câble de recharge manquant', 'no charging cable': 'Câble de recharge manquant', 'plug-in hybrid': 'Hybride rechargeable', 'electric vehicle': 'Véhicule électrique',
    'trade in': 'Échange', 'trade-in': 'Échange', 'dealer trade': 'Échange de concessionnaire', 'one owner': 'Un seul propriétaire', 'single owner': 'Un seul propriétaire', 'two owners': 'Deux propriétaires', 'multiple owners': 'Plusieurs propriétaires', 'carfax available': 'CARFAX disponible', 'clean carfax': 'CARFAX propre', 'no accidents': 'Aucun accident déclaré', 'original paint': 'Peinture d\'origine', 'certified': 'Certifié', 'extended warranty': 'Garantie prolongée', 'factory warranty': 'Garantie du fabricant', 'warranty remaining': 'Garantie restante', 'service records': 'Dossiers d\'entretien', 'full service history': 'Historique d\'entretien complet', 'green light': 'Feu vert', 'yellow light': 'Feu jaune', 'red light': 'Feu rouge', 'arbitration': 'Arbitrage possible', 'no arbitration': 'Sans arbitrage'
  };
  var EBLOCK_FR_COULEURS = { 'black': 'Noir', 'white': 'Blanc', 'blue': 'Bleu', 'red': 'Rouge', 'grey': 'Gris', 'gray': 'Gris', 'silver': 'Argent', 'green': 'Vert', 'brown': 'Brun', 'beige': 'Beige', 'tan': 'Beige', 'orange': 'Orange', 'yellow': 'Jaune', 'gold': 'Or', 'burgundy': 'Bourgogne', 'maroon': 'Bourgogne', 'purple': 'Violet', 'charcoal': 'Charbon', 'bronze': 'Bronze', 'copper': 'Cuivre', 'pink': 'Rose', 'turquoise': 'Turquoise', 'teal': 'Sarcelle', 'navy': 'Bleu marine', 'cream': 'Crème', 'ivory': 'Ivoire', 'pearl': 'Perle', 'pearl white': 'Blanc perle', 'metallic': 'métallisé', 'dark': 'foncé', 'light': 'pâle', 'deep': 'foncé', 'bright': 'vif', 'matte': 'mat' };

  function EBLOCK_frNorm_(t) { return String(t === undefined || t === null ? '' : t).replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ').trim(); }
  /** « Front Door - Driver » → « Porte avant conducteur » ; « Rear Quarter Panel - Passenger » → « Aile arrière passager » ;
      inconnu → texte d'origine (avec le côté traduit entre parenthèses s'il y en a un). */
  function EBLOCK_traduirePiece_(texte) {
    var t = EBLOCK_frNorm_(texte); if (!t) return '';
    var cle = t.toLowerCase();
    if (EBLOCK_FR_PIECES[cle]) return EBLOCK_FR_PIECES[cle];
    // Jetons : mots, en gardant « / » ; tirets, parenthèses, virgules et « 's » / « side » = séparateurs.
    var mots = cle.replace(/'s\b/g, '').replace(/\bside\b/g, ' ').split(/[\s\-–—:(),]+/).filter(Boolean);
    var orig = t.replace(/'s\b/g, '').replace(/\bside\b/gi, ' ').split(/[\s\-–—:(),]+/).filter(Boolean);
    var cotes = [];
    var essayer = function () { return EBLOCK_FR_PIECES[mots.join(' ')] || ''; };
    var base = essayer();
    while (!base && mots.length > 1 && EBLOCK_FR_COTES[mots[mots.length - 1]]) { cotes.push(mots.pop()); orig.pop(); base = essayer(); }
    while (!base && mots.length > 1 && EBLOCK_FR_COTES[mots[0]]) { cotes.push(mots.shift()); orig.shift(); base = essayer(); }
    if (!base) {
      // Base inconnue (ou déjà en français, « Pare-chocs avant ») : texte d'origine tel quel, traits
      // d'union compris ; les côtés anglais détachés sont traduits entre parenthèses.
      if (!cotes.length) return t;
      var reste = t, fr = cotes.map(function (c) { return EBLOCK_FR_COTES[c]; }).filter(function (x, i, l) { return l.indexOf(x) === i; });
      for (var k = 0; k < cotes.length; k++) {
        var mot = cotes[k].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        reste = reste.replace(new RegExp('[\\s\\-–—:(),]+' + mot + "(?:'s)?(?:\\s+side)?[\\s)]*$", 'i'), '').replace(new RegExp('^' + mot + "(?:'s)?(?:\\s+side)?[\\s\\-–—:(),]+", 'i'), '');
      }
      return (reste.trim() || orig.join(' ')) + ' (' + fr.join(' ') + ')';
    }
    if (!cotes.length) return base;
    var feminin = !!EBLOCK_FR_FEMININ_[base.split(' ')[0]];
    var accord = function (m) { return feminin ? ({ 'droite': 'droite', 'supérieur': 'supérieure', 'inférieur': 'inférieure', 'intérieur': 'intérieure', 'extérieur': 'extérieure' }[m] || m) : (m === 'droite' ? 'droit' : m); };
    // Ordre français : position (avant / arrière), côté (conducteur / passager / gauche / droite), niveau, reste.
    var ordre = ['avant', 'arrière', 'conducteur', 'passager', 'gauche', 'droite', 'supérieur', 'inférieur', 'intérieur', 'extérieur', 'dessus', 'dessous', 'centre', 'des deux côtés'];
    var mapped = cotes.map(function (c) { return EBLOCK_FR_COTES[c]; }).filter(function (x, i, l) { return l.indexOf(x) === i; });
    mapped.sort(function (a, b) { return ordre.indexOf(a) - ordre.indexOf(b); });
    var baseMin = ' ' + base.toLowerCase() + ' ';
    var ajouts = mapped.filter(function (m) { return baseMin.indexOf(' ' + m + ' ') < 0; }).map(accord);
    return ajouts.length ? base + ' ' + ajouts.join(' ') : base;
  }
  /** « Hood ×2, Tires / Rims » (colonne Pièces endommagées) → « Capot ×2, Pneus / jantes ». Déjà en français : inchangé. */
  function EBLOCK_traduirePieces_(texte) {
    return String(texte || '').split(/,\s*(?![^(]*\))/).map(function (p) {
      var m = p.trim().match(/^(.*?)\s*(×\s*\d+)?$/);
      if (!m || !m[1]) return '';
      return EBLOCK_traduirePiece_(m[1]) + (m[2] ? ' ' + m[2].replace(/\s+/g, '') : '');
    }).filter(Boolean).join(', ');
  }
  /** Liste des pièces d'une fiche (dommages[].piece) → [« Capot ×2 », « Pneus / jantes »] (ordre d'apparition). */
  function EBLOCK_piecesListe_(dommages) {
    var comptes = {}, ordre = [];
    (dommages || []).forEach(function (d) { var p = EBLOCK_traduirePiece_(d && d.piece); if (!p) return; if (!comptes[p]) { comptes[p] = 0; ordre.push(p); } comptes[p]++; });
    return ordre.map(function (p) { return comptes[p] > 1 ? p + ' ×' + comptes[p] : p; });
  }
  function EBLOCK_traduireDeclaration_(nom) {
    var t = EBLOCK_frNorm_(nom); if (!t) return '';
    var cle = t.toLowerCase().replace(/\.$/, '');
    return EBLOCK_FR_DECLARATIONS[cle] || t;
  }
  /** « Dark Blue Metallic » → « Bleu foncé métallisé » ; inconnu → tel quel. */
  function EBLOCK_traduireCouleur_(texte) {
    var t = EBLOCK_frNorm_(texte); if (!t) return '';
    var cle = t.toLowerCase();
    if (EBLOCK_FR_COULEURS[cle]) return EBLOCK_FR_COULEURS[cle];
    var mots = cle.split(/[\s\/-]+/).filter(Boolean), connus = mots.filter(function (m) { return EBLOCK_FR_COULEURS[m]; });
    if (!connus.length || connus.length < mots.length - 1) return t;
    var noms = mots.filter(function (m) { return EBLOCK_FR_COULEURS[m] && /^[A-ZÉ]/.test(EBLOCK_FR_COULEURS[m]); }).map(function (m) { return EBLOCK_FR_COULEURS[m]; });
    var qualifs = mots.filter(function (m) { return EBLOCK_FR_COULEURS[m] && !/^[A-ZÉ]/.test(EBLOCK_FR_COULEURS[m]); }).map(function (m) { return EBLOCK_FR_COULEURS[m]; });
    var inconnus = mots.filter(function (m) { return !EBLOCK_FR_COULEURS[m]; });
    if (!noms.length) return t;
    return noms.concat(qualifs).concat(inconnus).join(' ');
  }
  /* FR-FIN */

  function nombre(v) { if (v === null || v === undefined || v === '') return null; var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; }
  function fmt(n) { n = nombre(n); return n === null ? '—' : AMX.fmtArgent(n, 0); }
  function fmtKm(n) { n = nombre(n); return n === null ? '—' : AMX.fmtNombre(Math.round(n)) + ' km'; }
  function vehiculeTexte(r) { return [r.annee, r.marque, r.modele, r.version].filter(Boolean).join(' ') || '—'; }
  function nomCie(code) { return (AMX.COMPAGNIES_TOUTES[code] || code || '').replace(' Chevrolet Buick Cadillac', ''); }
  function couleurCie(code) { return (AMX.COULEUR_COMPAGNIE && AMX.COULEUR_COMPAGNIE[code]) || 'gris'; }
  function libelleMotricite(v) { return { AWD: 'Intégrale (AWD)', '4WD': '4x4', FWD: 'Traction (FWD)', RWD: 'Propulsion (RWD)', '4X4': '4x4' }[String(v || '').toUpperCase()] || v || ''; }
  function libelleCarburant(v) { v = String(v || ''); return v.replace(/Gasoline \/ Electric Hybrid/i, 'Hybride (essence)').replace(/^Gasoline$/i, 'Essence').replace(/^Diesel$/i, 'Diesel').replace(/^Electric$/i, 'Électrique').replace(/Plug-in Hybrid/i, 'Hybride rechargeable'); }
  function libelleTransmission(v) { return { Automatic: 'Automatique', Manual: 'Manuelle', CVT: 'CVT' }[v] || v || ''; }
  function libelleStatutEblock(s) { return { SOLD: 'Acheté', AWAITING_CHECKOUT: 'Paiement à faire', IN_IF_BID: 'En négociation (If Bid)' }[s] || s || ''; }
  // Cote d'état eBlock sur 100 : vert ≥ 90, bleu ≥ 75, ambre ≥ 60, rouge en dessous.
  function couleurCote(c) { c = nombre(c); if (c === null) return 'gris'; return c >= 90 ? 'vert' : (c >= 75 ? 'bleu' : (c >= 60 ? 'ambre' : 'rouge')); }
  function badgeCote(c) { c = nombre(c); return h('span.badge.sans-point.' + couleurCote(c), { text: c === null ? 'État —' : 'État ' + Math.round(c) + ' / 100', title: 'Cote d\'état du rapport eBlock (sur 100)' }); }
  function badgeInventaire(r) {
    if (!r.registre) return h('span.badge.sans-point.gris', { text: 'Plus à l\'inventaire', title: 'Ce NIV n\'est dans aucun registre' });
    var s = AMX.statut(r.statutInventaire, r.registre);
    return h('span.badge.sans-point.' + s.couleur, { text: s.libelle + ' · ' + (r.registre === 'DETAIL' ? 'Detail' : (r.registre === 'CAN' ? 'Canada' : 'É.-U.')) });
  }
  function pneusCourt(p) {
    if (!p) return '';
    var roues = ['avG', 'avD', 'arG', 'arD'].map(function (k) { var r = p[k] || {}; return [r.marque, r.grandeur, r.usure].filter(Boolean).join(' '); }).filter(Boolean);
    var u = roues.filter(function (x, i) { return roues.indexOf(x) === i; });
    return u.join(' / ');
  }
  function decla(d) { var nom = d.nom || d.id || ''; return h('span.badge.sans-point.' + (d.type === 'NEGATIVE' ? 'rouge' : (d.type === 'POSITIVE' ? 'vert' : 'gris')), { text: EBLOCK_traduireDeclaration_(nom), title: nom }); }
  // Colonne « Déclarations » de la feuille (noms joints par « , ») → badges français.
  function declasTexte(texte) { return String(texte || '').split(/,\s*(?![^(]*\))/).map(function (x) { return x.trim(); }).filter(Boolean).map(function (nom) { return h('span.badge.sans-point.gris', { text: EBLOCK_traduireDeclaration_(nom), title: nom }); }); }
  // Dommages AutoGrade (section · pièce : dommage — sévérité), en français.
  var DOMMAGES_FR = { 'scratch': 'Égratignure', 'scratches': 'Égratignures', 'scratched': 'Égratigné', 'deep scratch': 'Égratignure profonde', 'multiple scratches': 'Égratignures multiples', 'dent': 'Bosse', 'dents': 'Bosses', 'dented': 'Bossé', 'ding': 'Petite bosse', 'dings': 'Petites bosses', 'paintless dent': 'Bosse sans bris de peinture', 'dent with paint damage': 'Bosse avec peinture abîmée', 'chip': 'Éclat', 'chips': 'Éclats', 'paint chip': 'Éclat de peinture', 'paint chips': 'Éclats de peinture', 'stone chip': 'Éclat de gravier', 'stone chips': 'Éclats de gravier', 'rock chip': 'Éclat de gravier', 'crack': 'Fissure', 'cracked': 'Fissuré', 'cracks': 'Fissures', 'scuff': 'Éraflure', 'scuffed': 'Éraflé', 'scuffs': 'Éraflures', 'gouge': 'Entaille', 'gouges': 'Entailles', 'rust': 'Rouille', 'rusted': 'Rouillé', 'corrosion': 'Corrosion', 'peeling': 'Peinture qui pèle', 'paint peeling': 'Peinture qui pèle', 'clear coat peeling': 'Vernis qui pèle', 'fading': 'Décoloration', 'faded': 'Décoloré', 'discoloration': 'Décoloration', 'discolored': 'Décoloré', 'oxidation': 'Oxydation', 'oxidized': 'Oxydé', 'missing': 'Manquant', 'broken': 'Brisé', 'bent': 'Tordu', 'torn': 'Déchiré', 'tear': 'Déchirure', 'rip': 'Déchirure', 'ripped': 'Déchiré', 'stain': 'Tache', 'stained': 'Taché', 'stains': 'Taches', 'burn': 'Brûlure', 'burn hole': 'Trou de brûlure', 'burns': 'Brûlures', 'wear': 'Usure', 'worn': 'Usé', 'heavy wear': 'Usure importante', 'hail': 'Grêle', 'hail damage': 'Grêle', 'pitted': 'Piqûres', 'pitting': 'Piqûres', 'hole': 'Trou', 'holes': 'Trous', 'loose': 'Détaché', 'dirty': 'Sale', 'soiled': 'Sale', 'odor': 'Odeur', 'odour': 'Odeur', 'leak': 'Fuite', 'leaking': 'Fuite', 'noise': 'Bruit', 'warning light': 'Témoin allumé', 'inoperative': 'Inopérant', 'not working': 'Inopérant', 'curb rash': 'Éraflure de trottoir', 'bubbling': 'Cloques', 'blistering': 'Cloques', 'previous repair': 'Réparation antérieure', 'prior repair': 'Réparation antérieure', 'repaired': 'Réparé', 'poor repair': 'Mauvaise réparation', 'repaint': 'Repeint', 'repainted': 'Repeint', 'paint transfer': 'Transfert de peinture', 'misaligned': 'Mal aligné', 'alignment': 'Mal aligné', 'gap': 'Jeu d\'ajustement', 'damaged': 'Endommagé', 'damage': 'Dommage', 'cracked windshield': 'Pare-brise fissuré', 'chipped windshield': 'Pare-brise éclaté', 'star': 'Étoile (impact)', 'bullseye': 'Impact', 'delaminating': 'Délaminage', 'sagging': 'Affaissé', 'frayed': 'Effiloché', 'cut': 'Coupure', 'puncture': 'Perforation', 'low tread': 'Pneu usé', 'uneven wear': 'Usure inégale', 'dry rot': 'Craquelé (sec)', 'sidewall damage': 'Flanc endommagé', 'bent rim': 'Jante tordue', 'cracked rim': 'Jante fissurée' };
  var SEVERITE_FR = { 'minor': 'mineur', 'moderate': 'modéré', 'major': 'majeur', 'severe': 'sévère', 'small': 'petit', 'medium': 'moyen', 'large': 'grand', 'light': 'léger', 'heavy': 'important', 'extensive': 'étendu', 'minimal': 'minime', 'significant': 'important', 'cosmetic': 'cosmétique', 'structural': 'structurel', 'low': 'faible', 'high': 'élevé', 'none': 'aucun' };
  function traduireDommage(t) { t = EBLOCK_frNorm_(t); if (!t) return ''; return DOMMAGES_FR[t.toLowerCase()] || t; }
  function traduireSeverite(t) { t = EBLOCK_frNorm_(t); if (!t) return ''; var cle = t.toLowerCase(); if (SEVERITE_FR[cle]) return SEVERITE_FR[cle]; return t.replace(/\binches\b/i, 'po').replace(/\binch\b/i, 'po').replace(/\bin\.?$/i, 'po'); }
  function libelleEtatPneus(v) { return { GOOD: 'Bon', FAIR: 'Passable', POOR: 'Mauvais', EXCELLENT: 'Excellent', NEW: 'Neuf', REPLACE: 'À remplacer', WORN: 'Usé' }[String(v || '').toUpperCase()] || v || ''; }
  // Liste des pièces endommagées (texte de la feuille, français ou anglais) → éléments : n premières + « +k autres ».
  function listePieces(texte, max, cls) {
    var pieces = EBLOCK_traduirePieces_(texte).split(/,\s*(?![^(]*\))/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (!pieces.length) return null;
    var el = h('ul.' + (cls || 'pieces'), { title: pieces.join('\n') });
    pieces.slice(0, max || 3).forEach(function (p) { el.appendChild(h('li', { text: p })); });
    if (pieces.length > (max || 3)) el.appendChild(h('li.plus', { text: '+ ' + (pieces.length - (max || 3)) + ' autre' + (pieces.length - (max || 3) > 1 ? 's' : '') }));
    return el;
  }

  function injecterCss() {
    if (document.getElementById('css-eblock')) return;
    var s = document.createElement('style');
    s.id = 'css-eblock';
    s.textContent = [
      '.eb-page .carte { margin-bottom: 12px; }',
      '.eb-cartes { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 12px; }',
      '.eb-carte { text-align: left; background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); padding: 10px 12px 9px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; box-shadow: var(--ombre); position: relative; overflow: hidden; }',
      '.eb-carte::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--ligne-forte); }',
      '.eb-carte.vert::before { background: var(--vert); } .eb-carte.bleu::before { background: var(--bleu); } .eb-carte.violet::before { background: var(--violet); } .eb-carte.sombre::before { background: var(--noir-2); } .eb-carte.ambre::before { background: var(--ambre); } .eb-carte.toutes::before { background: linear-gradient(var(--vert), var(--noir-2)); }',
      '.eb-carte.actif { border-color: var(--encre); box-shadow: 0 0 0 2px rgba(0,0,0,.08); }',
      '.eb-carte .haut { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; } .eb-carte .nom { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .eb-carte .n { font-size: 20px; font-weight: 700; }',
      '.eb-carte .bas { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11.5px; color: var(--encre-3); } .eb-carte .bas b { color: var(--encre); font-weight: 600; }',
      '.eb-outils { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .eb-outils .recherche { display: flex; align-items: center; gap: 6px; flex: 1 1 220px; } .eb-outils .recherche svg { width: 16px; height: 16px; color: var(--encre-3); } .eb-outils .recherche input { flex: 1; }',
      '.eb-outils .compte { margin-left: auto; font-size: 12px; }',
      '.eb-table { overflow-x: auto; } .eb-table .tableau { min-width: 1040px; } .eb-table td, .eb-table th { padding: 7px 10px; vertical-align: middle; }',
      '.eb-table td.vehicule { display: flex; gap: 8px; align-items: center; min-width: 230px; } .eb-table td.vehicule .nom { font-weight: 600; } .eb-table td.vehicule .vin { font-family: var(--mono); font-size: 11px; color: var(--encre-3); }',
      '.eb-table td.photo img { width: 60px; height: 45px; object-fit: cover; border-radius: 6px; background: var(--gris-bg); display: block; }',
      '.eb-table td.photo .sans { width: 60px; height: 45px; border-radius: 6px; background: var(--gris-bg); display: flex; align-items: center; justify-content: center; color: var(--encre-4); font-size: 10px; }',
      '.eb-table tr.sans-fiche td { color: var(--encre-3); }',
      // Dommages : compte + pièces en français, une par ligne (3 au plus, puis « + n autres »), jamais de débordement.
      '.eb-table td.dommages { min-width: 150px; max-width: 210px; vertical-align: top; } .eb-table td.dommages .n { display: inline-block; min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--rouge-bg); color: var(--rouge); font-weight: 700; font-size: 12px; text-align: center; } .eb-table td.dommages .n.zero { background: var(--vert-clair); color: var(--vert); }',
      'ul.pieces { list-style: none; margin: 4px 0 0; padding: 0; font-size: 11.5px; line-height: 1.3; color: var(--encre-2); } ul.pieces li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 10px; position: relative; } ul.pieces li::before { content: ""; position: absolute; left: 0; top: 6px; width: 5px; height: 5px; border-radius: 50%; background: var(--rouge); } ul.pieces li.plus { color: var(--encre-3); font-style: italic; } ul.pieces li.plus::before { background: var(--encre-4); }',
      '.eb-table td.num, .eb-table td.date, .eb-table td.badges { white-space: nowrap; } .eb-table td.pneus { max-width: 190px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; } .eb-table td.decl { max-width: 170px; font-size: 12px; } .eb-table td.decl .badge { display: inline-block; margin: 1px 2px 1px 0; white-space: nowrap; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }',
      '.eb-etapes { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; } .eb-etapes .section-titre { margin-bottom: 4px; } .eb-etapes p { margin: 0 0 8px; color: var(--encre-2); font-size: 12.5px; }',
      '.eb-import-etat { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 12px; } .eb-import-etat .case { background: var(--carte-2); border: 1px solid var(--ligne); border-radius: 8px; padding: 8px 10px; } .eb-import-etat .case b { display: block; font-size: 18px; } .eb-import-etat .mini { font-size: 11px; color: var(--encre-3); }',
      '.eb-fiche { display: grid; grid-template-columns: 1.15fr 1fr; gap: 16px; } @media (max-width: 760px) { .eb-fiche { grid-template-columns: 1fr; } }',
      '.eb-fiche h4 { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin: 14px 0 6px; } .eb-fiche h4:first-child { margin-top: 0; }',
      '.eb-fiche dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; font-size: 12.5px; margin: 0; } .eb-fiche dt { color: var(--encre-3); } .eb-fiche dd { margin: 0; }',
      '.eb-galerie { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; } .eb-galerie a { display: block; aspect-ratio: 4/3; border-radius: 8px; overflow: hidden; background: var(--gris-bg); position: relative; } .eb-galerie img { width: 100%; height: 100%; object-fit: cover; display: block; }',
      '.eb-galerie.dommages a { outline: 2px solid var(--rouge); outline-offset: -2px; } .eb-galerie a .piece { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(180,35,24,.88); color: #fff; font-size: 10.5px; font-weight: 600; padding: 2px 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.eb-tuiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; } .eb-tuiles .tuile { background: var(--carte-2); border: 1px solid var(--ligne); border-radius: 8px; padding: 8px 10px; } .eb-tuiles .l { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--encre-3); } .eb-tuiles .v { font-size: 16px; font-weight: 700; } .eb-tuiles .tuile.fort { background: var(--vert-clair); border-color: #B6E0C6; }',
      '.eb-pneus { width: 100%; border-collapse: collapse; font-size: 12.5px; } .eb-pneus th, .eb-pneus td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--ligne); } .eb-pneus th { color: var(--encre-3); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }',
      '.eb-peinture { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 6px; } .eb-peinture .p { background: var(--carte-2); border: 1px solid var(--ligne); border-radius: 8px; padding: 6px 8px; font-size: 12px; } .eb-peinture .p b { display: block; font-size: 15px; } .eb-peinture .p.epais { border-color: var(--ambre-bord); background: var(--ambre-bg); } .eb-peinture .p.tres-epais { border-color: var(--rouge-bord); background: var(--rouge-bg); color: var(--rouge); }',
      '.eb-options { display: flex; flex-wrap: wrap; gap: 4px; } .eb-options span { background: var(--gris-bg); border-radius: 999px; padding: 2px 8px; font-size: 11.5px; }',
      '.eb-notes { white-space: pre-wrap; font-size: 12.5px; background: var(--carte-2); border-radius: 8px; padding: 8px 10px; }',
      '.eb-badges { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }',
      '.eb-bloc { display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; } .eb-bloc .ligne-badges { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; } .eb-bloc ul.pieces { font-size: 12.5px; margin: 0; columns: 2; column-gap: 14px; } .eb-bloc ul.pieces li { break-inside: avoid; } .eb-bloc .vignettes { display: flex; gap: 6px; flex-wrap: wrap; } .eb-bloc .vignettes a { position: relative; display: block; } .eb-bloc .vignettes img { width: 72px; height: 54px; object-fit: cover; border-radius: 6px; outline: 2px solid var(--rouge); outline-offset: -2px; display: block; } .eb-bloc .vignettes .piece { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(180,35,24,.88); color: #fff; font-size: 9.5px; font-weight: 600; padding: 1px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-radius: 0 0 6px 6px; }',
      // Puce « eBlock » sur les lignes d'inventaire et de service (voir AMX.eblockPuce).
      '.puce.eblock { cursor: pointer; } .puce.eblock b { font-weight: 700; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ La vue ------------------------------- */
  function FichesEblock(ctx) {
    injecterCss();
    this.generation = 0;
    this.liste = null; this.erreur = ''; this.refus = '';
    this.compagnie = AMX.compagnieChoisie('inventaire');   // même concession que le reste du site
    this.portee = AMX.memo.lire('eblock_portee', 'stock');  // 'stock' = encore à l'inventaire, 'tous' = tous les achats
    this.recherche = '';
    this.tri = { cle: 'achatLe', desc: true };
    this.construire();
    // Dernière liste gardée en local (une semaine) : la page s'affiche tout de suite, puis se
    // rafraîchit — Google met parfois 25 s+ à livrer une réponse à l'ouverture d'une page.
    var local = AMX.cacheLocal.lire('eblock', 7 * 86400000);
    if (local && Array.isArray(local.donnees)) { this.liste = local.donnees; this.duCache = true; }
    this.rendre();
    this.naviguer(ctx || {});
    this.charger();
    // Le profil (portée) peut arriver après le montage : les cartes suivent.
    var moi = this;
    this.surProfil = function () { if (moi.liste) { moi.compagnie = AMX.compagnieChoisie('inventaire'); moi.rendre(); } };
    document.addEventListener('amx:profil', this.surProfil);
  }
  FichesEblock.prototype.demonter = function () { this.generation++; document.removeEventListener('amx:profil', this.surProfil); };
  FichesEblock.prototype.naviguer = function (ctx) {
    var p = (ctx && ctx.params) || {};
    if (p.vin) { this.recherche = String(p.vin).trim().toUpperCase(); this.elRecherche.value = this.recherche; this.portee = 'tous'; if (this.liste) this.rendre(); }
    if (p.id) { this.ouvrirId = String(p.id); if (this.liste) AMX.eblockOuvrir(this.ouvrirId); }
  };

  FichesEblock.prototype.construire = function () {
    var self = this;
    this.elEtat = h('p', { text: 'Chargement des fiches…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.btnImport = h('button.btn.primaire', { type: 'button', text: 'Importer depuis eBlock', onclick: function () { self.elImport.open = !self.elImport.open; if (self.elImport.open) self.elImport.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Fiches eBlock'), this.elEtat]),
      h('div.actions', [this.btnRafraichir, this.btnExport, this.btnImport])
    ]);
    this.elImport = this.construireImport();
    this.elCartes = h('div.eb-cartes');
    this.elRecherche = h('input.saisie#eblock-recherche', { type: 'search', placeholder: 'NIV, # stock, modèle, vendeur, pièce endommagée…', autocomplete: 'off', oninput: AMX.debounce(function (e) { self.recherche = e.target.value; self.rendreTable(); }, 120) });
    this.elSegment = h('div.segment', { role: 'group', 'aria-label': 'Portée' });
    this.elCompte = h('span.compte.doux');
    var barre = h('div.carte', [h('div.carte-corps', [h('div.eb-outils', [h('div.recherche', [h('span', { html: I.recherche }), this.elRecherche]), this.elSegment, this.elCompte])])]);
    this.elTable = h('div.eb-table');
    this.elVide = h('div');
    this.el = h('div.page.eb-page', [entete, this.elImport, this.elCartes, barre, this.elVide, h('div.carte', [h('div.carte-corps', [this.elTable])])]);
  };

  /* --------------------------- Carte d'import --------------------------- */
  FichesEblock.prototype.construireImport = function () {
    var signet = h('a.btn.primaire', { href: CODE_SIGNET_EBLOCK_FICHES, text: 'Automax ← eBlock (fiches)', title: 'Glissez ce bouton dans votre barre de favoris', draggable: 'true' });
    signet.addEventListener('click', function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B pour l\'afficher), puis cliquez-le depuis eBlock, connecté, sur My Block › Buyer.', 'attention', 8000); });
    this.elImportEtat = h('div.eb-import-etat');
    var d = h('details.carte#eblock-import', [
      h('summary.carte-entete', { style: { cursor: 'pointer' } }, [h('h2', 'Importer les fiches descriptives depuis eBlock')]),
      h('div.carte-corps', [
        h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)' } }, 'Le signet parcourt vos achats eBlock (My Block › Buyer, depuis le 1er janvier), demande au site lesquels sont encore à l\'inventaire, puis ouvre et enregistre la fiche descriptive de chacun : rapport d\'état (cote sur 100), dommages avec photos, pneus, épaisseur de peinture, options, déclarations, photos, valeurs Black Book, notes du vendeur, facture. Une fiche déjà importée est relue après 30 jours. Rien n\'est modifié dans eBlock.'),
        h('div.eb-etapes', [
          h('div', [h('div.section-titre', '1. Installer (une fois)'), h('p', 'Glissez ce bouton dans la barre de favoris de Chrome. Si la barre est cachée : Cmd+Shift+B.'), signet]),
          h('div', [h('div.section-titre', '2. Dans eBlock'), h('p', 'Connectez-vous sur app.eblock.com et ouvrez My Block › Buyer. Gardez cet onglet du site ouvert et connecté : la petite fenêtre « Pont Automax » s\'en sert.')]),
          h('div', [h('div.section-titre', '3. Cliquer le signet'), h('p', 'Une bande verte suit la progression en bas de la page eBlock (environ 2 secondes par fiche). À la fin, revenez ici : « Rafraîchir ».')])
        ]),
        this.elImportEtat
      ])
    ]);
    d.open = false;
    return d;
  };
  FichesEblock.prototype.rendreImport = function () {
    AMX.vider(this.elImportEtat);
    var l = this.liste || [];
    var enStock = l.filter(function (r) { return r.enStock; }), avecFiche = l.filter(function (r) { return r.fiche; }), aLire = enStock.filter(function (r) { return !r.fiche; });
    var dernier = l.map(function (r) { return r.importeLe || ''; }).sort().pop() || '';
    this.elImportEtat.appendChild(h('div.case', [h('div', 'Achats eBlock connus'), h('b', { text: AMX.fmtNombre(l.length) }), h('div.mini', { text: dernier ? 'dernier import ' + AMX.fmtDate(dernier, true) : 'pas encore importé' })]));
    this.elImportEtat.appendChild(h('div.case', [h('div', 'Encore à l\'inventaire'), h('b', { text: AMX.fmtNombre(enStock.length) }), h('div.mini', 'achetés, pas vendus ni comptabilisés')]));
    this.elImportEtat.appendChild(h('div.case', [h('div', 'Fiches descriptives'), h('b', { text: AMX.fmtNombre(avecFiche.length) }), h('div.mini', { text: aLire.length ? aLire.length + ' encore à lire — recliquez le signet' : 'toutes les fiches des véhicules en stock sont là' })]));
  };

  /* ------------------------------ Données ------------------------------ */
  FichesEblock.prototype.charger = function (manuel, tentative) {
    var self = this, gen = ++this.generation;
    tentative = tentative || 1;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    return AMX.get({ eblock: 1 }).then(function (d) {
      if (gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      if (d && d.refuse) { self.refus = d.erreur || 'Accès refusé.'; self.rendre(); return; }
      if (!d || !d.ok) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
      self.liste = d.achats || []; self.duCache = false; self.erreur = ''; self.refus = '';
      AMX.eblock.poser(self.liste);   // cache local + index par NIV (puces des lignes d'inventaire et de service)
      self.rendre();
      if (!self.liste.length) self.elImport.open = true;
      if (self.ouvrirId) { var id = self.ouvrirId; self.ouvrirId = null; AMX.eblockOuvrir(id); }
      if (manuel) AMX.toast('Fiches eBlock mises à jour — ' + self.liste.length + ' achat' + (self.liste.length > 1 ? 's' : ''), 'ok');
    }).catch(function (e) {
      if (gen !== self.generation) return;
      // Délai dépassé (Google qui traîne) : on réessaie tout seul deux fois, sans bruit.
      if (tentative < 3 && /Pas de réponse|réseau|HTTP 5|illisible/i.test(String(e && e.message || e))) { self.generation--; setTimeout(function () { if (gen === self.generation) self.charger(manuel, tentative + 1); }, 2500); return; }
      self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e); self.rendre();
      AMX.toast('Impossible de charger les fiches eBlock — ' + self.erreur, 'erreur');
    });
  };
  FichesEblock.prototype.base = function () {
    var self = this;
    return (this.liste || []).filter(function (r) { return self.portee === 'tous' || r.enStock; });
  };
  FichesEblock.prototype.filtrees = function () {
    var self = this, l = this.base();
    if (this.compagnie) l = l.filter(function (r) { return String(r.compagnie || '').toUpperCase() === self.compagnie; });
    var q = String(this.recherche || '').trim().toLowerCase();
    // Pièces et déclarations cherchées en français ET dans le texte d'origine (« capot » comme « hood »).
    if (q) l = l.filter(function (r) { return [r.vin, r.stock, r.annee, r.marque, r.modele, r.version, r.vendeur, r.pieces, EBLOCK_traduirePieces_(r.pieces), r.declarations, String(r.declarations || '').split(/,\s*/).map(EBLOCK_traduireDeclaration_).join(' '), r.couleur, EBLOCK_traduireCouleur_(r.couleur)].join(' ').toLowerCase().indexOf(q) >= 0; });
    return l;
  };

  FichesEblock.prototype.rendre = function () {
    var self = this;
    this.limite = 300;
    AMX.vider(this.elCartes); AMX.vider(this.elSegment); AMX.vider(this.elVide);
    this.rendreImport();
    if (this.refus) { this.elEtat.textContent = this.refus; this.elVide.appendChild(h('div.vide', [h('div', { html: I.cadenas }), h('h3', 'Accès non autorisé'), h('div', { text: this.refus })])); this.elTable.textContent = ''; return; }
    if (!this.liste) { this.elEtat.textContent = this.erreur ? 'Serveur injoignable : ' + this.erreur : 'Chargement des fiches…'; if (!this.erreur) this.elVide.appendChild(AMX.chargeur('Fiches eBlock')); return; }
    var total = this.liste.length, enStock = this.liste.filter(function (r) { return r.enStock; }).length, fiches = this.liste.filter(function (r) { return r.fiche; }).length;
    this.elEtat.textContent = (total ? (total + ' achat' + (total > 1 ? 's' : '') + ' eBlock, ' + enStock + ' encore à l\'inventaire, ' + fiches + ' fiche' + (fiches > 1 ? 's' : '') + ' descriptive' + (fiches > 1 ? 's' : '') + ' — rapport d\'état, dommages, pneus, peinture, options, photos. Cliquez une ligne pour la fiche complète.') : 'Aucun achat eBlock importé pour l\'instant : installez le signet ci-dessous et cliquez-le depuis eBlock › My Block › Buyer.') + (this.erreur ? ' (liste gardée localement — serveur injoignable : ' + this.erreur + ')' : (this.duCache ? ' (mise à jour en cours…)' : ''));
    [['stock', 'Encore à l\'inventaire'], ['tous', 'Tous les achats']].forEach(function (p) {
      self.elSegment.appendChild(h('button' + (p[0] === self.portee ? '.actif' : ''), { type: 'button', text: p[1], onclick: function () { self.portee = p[0]; AMX.memo.ecrire('eblock_portee', p[0]); self.rendre(); } }));
    });
    var base = this.base();
    var carte = function (code, libelle, lignes) {
      var actif = self.compagnie === code, n = lignes.length, nf = lignes.filter(function (r) { return r.fiche; }).length, nd = lignes.filter(function (r) { return nombre(r.nDommages) > 0; }).length;
      var cotes = lignes.map(function (r) { return nombre(r.cote); }).filter(function (c) { return c !== null; });
      var moy = cotes.length ? Math.round(cotes.reduce(function (a, b) { return a + b; }, 0) / cotes.length) : null;
      return h('button.eb-carte' + (actif ? '.actif' : '') + (code ? '.' + couleurCie(code) : '.toutes'), { type: 'button', 'aria-pressed': actif ? 'true' : 'false', 'data-compagnie': code, onclick: function () { self.compagnie = code; AMX.choisirCompagnie(code); self.rendre(); } }, [
        h('div.haut', [h('div.nom', { text: libelle }), h('div.n.num', { text: AMX.fmtNombre(n) })]),
        h('div.bas', n ? [h('span', [h('b', { text: String(nf) }), ' fiche' + (nf > 1 ? 's' : '')]), h('span', [h('b', { text: String(nd) }), ' avec dommages']), moy !== null ? h('span', [h('b', { text: String(moy) }), ' état moy.']) : null] : [h('span.doux', 'aucun achat')])
      ]);
    };
    this.elCartes.appendChild(carte('', 'Toutes les concessions', base));
    AMX.codesPour('inventaire').forEach(function (c) { self.elCartes.appendChild(carte(c, nomCie(c), base.filter(function (r) { return String(r.compagnie || '').toUpperCase() === c; }))); });
    if (this.compagnie && AMX.codesPour('inventaire').indexOf(this.compagnie) < 0) this.compagnie = '';
    this.rendreTable();
  };

  var COLONNES = [
    { cle: 'photo', libelle: '' },
    { cle: 'achatLe', libelle: 'Acheté' },
    { cle: 'vehicule', libelle: 'Véhicule', valeur: function (r) { return vehiculeTexte(r); } },
    { cle: 'km', libelle: 'Km', num: true, valeur: function (r) { return nombre(r.km); } },
    { cle: 'compagnie', libelle: 'Concession' },
    { cle: 'statutInventaire', libelle: 'Inventaire' },
    { cle: 'prixPaye', libelle: 'Prix payé', num: true, valeur: function (r) { return nombre(r.prixPaye); } },
    { cle: 'cote', libelle: 'État', num: true, valeur: function (r) { return nombre(r.cote); } },
    { cle: 'nDommages', libelle: 'Dommages', num: true, valeur: function (r) { return nombre(r.nDommages); } },
    { cle: 'declarations', libelle: 'Déclarations' },
    { cle: 'pneus', libelle: 'Pneus' },
    { cle: 'fiche', libelle: 'Fiche', valeur: function (r) { return r.fiche ? 1 : 0; } }
  ];
  FichesEblock.prototype.rendreTable = function () {
    var self = this;
    AMX.vider(this.elTable);
    var lignes = this.filtrees();
    this.elCompte.textContent = lignes.length + ' achat' + (lignes.length > 1 ? 's' : '') + (this.compagnie ? ' · ' + nomCie(this.compagnie) : '');
    if (!lignes.length) { this.elTable.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucun achat'), h('div', { text: this.recherche ? 'Rien ne correspond à la recherche.' : (this.liste && this.liste.length ? (this.portee === 'stock' ? 'Aucun achat eBlock encore à l\'inventaire pour ce filtre — « Tous les achats » montre aussi les véhicules vendus.' : 'Aucun achat pour ce filtre.') : 'Importez d\'abord depuis eBlock (bouton « Importer depuis eBlock »).') })])); return; }
    var c = COLONNES.filter(function (x) { return x.cle === self.tri.cle; })[0] || COLONNES[1];
    var val = c.valeur || function (r) { return r[c.cle]; };
    lignes = lignes.slice().sort(function (a, b) {
      var va = val(a), vb = val(b), r;
      if (typeof va === 'number' || typeof vb === 'number') { va = (typeof va === 'number' && !isNaN(va)) ? va : -Infinity; vb = (typeof vb === 'number' && !isNaN(vb)) ? vb : -Infinity; r = va === vb ? 0 : (va < vb ? -1 : 1); }
      else r = String(va || '').localeCompare(String(vb || ''), 'fr', { numeric: true, sensitivity: 'base' });
      return self.tri.desc ? -r : r;
    });
    var thead = h('thead', [h('tr', COLONNES.map(function (col) {
      var actif = self.tri.cle === col.cle;
      var th = h('th' + (col.num ? '.num' : '') + (col.libelle ? '.registre-triable' : '') + (actif ? '.actif' : ''), { 'aria-sort': actif ? (self.tri.desc ? 'descending' : 'ascending') : 'none', title: col.libelle ? 'Trier par ' + col.libelle.toLowerCase() : '' }, [col.libelle, actif ? h('span', { text: self.tri.desc ? ' ▾' : ' ▴' }) : null]);
      if (col.libelle) th.addEventListener('click', function () { if (self.tri.cle === col.cle) self.tri.desc = !self.tri.desc; else { self.tri.cle = col.cle; self.tri.desc = !!col.num || col.cle === 'achatLe'; } self.rendreTable(); });
      return th;
    }))]);
    var tbody = h('tbody');
    var LIMITE = this.limite || 300, visibles = lignes.slice(0, LIMITE);
    visibles.forEach(function (r) {
      var nd = nombre(r.nDommages) || 0;
      var tr = h('tr.cliquable' + (r.fiche ? '' : '.sans-fiche'), { tabindex: '0', 'data-id': r.id }, [
        h('td.photo', r.photo ? [h('img', { src: r.photo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })] : [h('div.sans', { text: 'sans photo' })]),
        h('td.date', [h('div', { text: r.achatLe ? AMX.fmtDate(r.achatLe) : '—' }), h('div.mini', { text: libelleStatutEblock(r.statutEblock) })]),
        h('td.vehicule', [AMX.logoMarque(r.marque, 'petit'), h('div', [h('div.nom', { text: vehiculeTexte(r) }), h('div.mini', { text: [EBLOCK_traduireCouleur_(r.couleur), r.stock ? '# ' + r.stock : ''].filter(Boolean).join(' · ') }), h('div.vin', { text: r.vin || '' })])]),
        h('td.num', { text: fmtKm(r.km) }),
        h('td.badges', r.compagnie ? [h('span.badge.sans-point.' + couleurCie(r.compagnie), { text: nomCie(r.compagnie) })] : [h('span.doux', '—')]),
        h('td.badges', [badgeInventaire(r)]),
        h('td.num', [h('div', { text: fmt(r.prixPaye) }), nombre(r.totalFacture) !== null ? h('div.mini', { text: 'facture ' + fmt(r.totalFacture) }) : null]),
        h('td.num', r.fiche ? [badgeCote(r.cote)] : [h('span.doux', '—')]),
        h('td.dommages', r.fiche ? [h('span.n' + (nd ? '' : '.zero'), { text: nd ? String(nd) : '0', title: nd ? nd + ' dommage' + (nd > 1 ? 's' : '') + ' répertorié' + (nd > 1 ? 's' : '') + ' sur eBlock' : 'Aucun dommage répertorié' }), nd ? listePieces(r.pieces, 3) : null] : [h('span.doux', '—')]),
        h('td.decl', r.fiche ? (r.declarations ? declasTexte(r.declarations) : [h('span.doux', '—')]) : [h('span.doux', '—')]),
        h('td.pneus', { text: r.fiche ? (r.pneus || '—') : '—', title: r.pneus || '' }),
        h('td', r.fiche ? [h('span.badge.sans-point.vert', { text: 'Fiche' })] : [h('span.badge.sans-point.' + (r.enStock ? 'ambre' : 'gris'), { text: r.enStock ? 'À lire' : 'Pas lue', title: r.enStock ? 'Recliquez le signet dans eBlock pour lire cette fiche' : 'Véhicule plus à l\'inventaire : la fiche n\'est pas lue' })])
      ]);
      var ouvrir = function () { AMX.eblockOuvrir(r.id, r); };
      tr.addEventListener('click', ouvrir);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') ouvrir(); });
      tbody.appendChild(tr);
    });
    if (lignes.length > visibles.length) {
      tbody.appendChild(h('tr', [h('td', { colspan: String(COLONNES.length), style: { textAlign: 'center', padding: '12px' } }, [
        h('span.doux', { text: visibles.length + ' lignes affichées sur ' + lignes.length + ' — ' }),
        h('button.btn.petit', { type: 'button', text: 'Afficher 300 de plus', onclick: function () { self.limite = LIMITE + 300; self.rendreTable(); } })
      ])]));
    }
    var totalPaye = lignes.reduce(function (s, r) { return s + (nombre(r.prixPaye) || 0); }, 0), nDom = lignes.filter(function (r) { return nombre(r.nDommages) > 0; }).length;
    var tfoot = h('tfoot', [h('tr', [h('td', { colspan: '6', text: 'Total — ' + lignes.length + ' achat' + (lignes.length > 1 ? 's' : '') + ' · ' + nDom + ' avec dommages' }), h('td.num', { text: fmt(totalPaye) }), h('td', { colspan: '5', text: '' })])]);
    this.elTable.appendChild(h('table.tableau#eblock-table', [thead, tbody, tfoot]));
  };

  /* ------------------------------- Fiche -------------------------------- */
  function dl(paires) {
    var el = h('dl');
    paires.forEach(function (p) { if (p[1] === null || p[1] === undefined || p[1] === '' || p[1] === '—') return; el.appendChild(h('dt', { text: p[0] })); el.appendChild(h('dd', typeof p[1] === 'string' || typeof p[1] === 'number' ? { text: String(p[1]) } : [p[1]])); });
    return el;
  }
  function galerie(photos, dommages) {
    return h('div.eb-galerie' + (dommages ? '.dommages' : ''), photos.map(function (p) {
      var piece = EBLOCK_traduirePiece_(p.piece);
      return h('a', { href: p.url, target: '_blank', rel: 'noopener', title: piece ? piece + (p.piece && p.piece !== piece ? ' (' + p.piece + ')' : '') : '' }, [h('img', { src: p.vignette || p.url, alt: piece, loading: 'lazy', referrerpolicy: 'no-referrer' }), piece ? h('span.piece', { text: piece }) : null]);
    }));
  }
  var PEINTURE = [['capot', 'Capot'], ['toit', 'Toit'], ['coffre', 'Coffre'], ['aileAvG', 'Aile av. G'], ['porteAvG', 'Porte av. G'], ['porteArG', 'Porte ar. G'], ['panneauArG', 'Panneau ar. G'], ['aileAvD', 'Aile av. D'], ['porteAvD', 'Porte av. D'], ['porteArD', 'Porte ar. D'], ['panneauArD', 'Panneau ar. D']];
  var VALEURS = { BLACK_BOOK_CLEAN_COMBINED: 'Black Book propre', BLACK_BOOK_AVG_COMBINED: 'Black Book moyen', BLACK_BOOK_ROUGH_COMBINED: 'Black Book rude', MARKET_GUIDE_AVERAGE_SOLD_PRICE: 'Marché eBlock — moyen vendu', MARKET_GUIDE_HIGHEST_SOLD_PRICE: 'Marché eBlock — plus haut', MARKET_GUIDE_LOWEST_SOLD_PRICE: 'Marché eBlock — plus bas' };

  function rendreFiche(corps, r, f) {
    AMX.vider(corps);
    f = f || {};
    var v = f.vehicule || {}, et = f.etat || {}, p = f.pneus || {}, pe = f.peinture || {}, ph = f.photos || {};
    var gauche = h('div'), droite = h('div');
    var dommages = (f.dommages || []);
    var nDom = f.id ? dommages.length : (nombre(r.nDommages) || 0);

    gauche.appendChild(h('h4', 'Rapport d\'état'));
    gauche.appendChild(h('div.eb-badges', { style: { marginBottom: '8px' } }, [
      badgeCote(f.id ? et.cote : r.cote),
      h('span.badge.sans-point.' + (nDom ? 'rouge' : 'vert'), { text: nDom ? nDom + ' dommage' + (nDom > 1 ? 's' : '') + ' répertorié' + (nDom > 1 ? 's' : '') : 'Aucun dommage répertorié' }),
      et.codesObd ? h('span.badge.sans-point.ambre', { text: et.codesObd + ' code' + (et.codesObd > 1 ? 's' : '') + ' OBD' }) : null,
      et.repeints ? h('span.badge.sans-point.ambre', { text: et.repeints + ' panneau' + (et.repeints > 1 ? 'x' : '') + ' repeint' + (et.repeints > 1 ? 's' : '') }) : null,
      et.carfax && et.carfax.divulgations ? h('span.badge.sans-point.rouge', { text: 'Divulgations CARFAX' }) : null,
      et.carfax && nombre(et.carfax.reclamations) ? h('span.badge.sans-point.rouge', { text: 'Réclamations ' + fmt(et.carfax.reclamations) }) : null
    ].concat((et.declarations || []).map(decla))));
    if (dommages.length) {
      // La liste des pièces en clair (« Capot ×2, Pneus / jantes ») avant les photos.
      var piecesFiche = EBLOCK_piecesListe_(dommages);
      if (piecesFiche.length) gauche.appendChild(listePieces(piecesFiche.join(', '), 12, 'pieces.fiche'));
      gauche.appendChild(galerie(dommages, true));
    } else if (!f.id && r.pieces) gauche.appendChild(listePieces(r.pieces, 12, 'pieces.fiche'));
    if ((f.dommagesAutoGrade || []).length) {
      gauche.appendChild(h('h4', 'Dommages AutoGrade (' + f.dommagesAutoGrade.length + ')'));
      gauche.appendChild(dl(f.dommagesAutoGrade.map(function (d) { return [[EBLOCK_traduirePiece_(d.section), EBLOCK_traduirePiece_(d.piece)].filter(Boolean).join(' · '), [traduireDommage(d.dommage), traduireSeverite(d.severite)].filter(Boolean).join(' — ')]; })));
    }
    var notesEtat = [['Extérieur', et.exterieur], ['Intérieur', et.interieur], ['Mécanique', et.mecanique], ['Moteur', et.moteur], ['Transmission', et.transmission], ['Motricité', et.motricite], ['Pneus', et.pneus]].filter(function (x) { return x[1] && (x[1].note || x[1].cote !== null && x[1].cote !== undefined); });
    if (notesEtat.length) gauche.appendChild(dl(notesEtat.map(function (x) { return [x[0], [x[1].cote !== null && x[1].cote !== undefined ? 'cote ' + x[1].cote : '', x[1].note].filter(Boolean).join(' — ')]; })));

    var nPhotos = (ph.exterieur || []).length + (ph.interieur || []).length + (ph.dessous || []).length;
    gauche.appendChild(h('h4', 'Photos' + (nPhotos ? ' (' + nPhotos + ')' : '')));
    if ((ph.exterieur || []).length) gauche.appendChild(galerie(ph.exterieur));
    if ((ph.interieur || []).length) { gauche.appendChild(h('div.doux.petit', { style: { margin: '6px 0 4px' }, text: 'Intérieur' })); gauche.appendChild(galerie(ph.interieur)); }
    if ((ph.dessous || []).length) { gauche.appendChild(h('div.doux.petit', { style: { margin: '6px 0 4px' }, text: 'Dessous' })); gauche.appendChild(galerie(ph.dessous)); }
    if (!nPhotos) gauche.appendChild(h('div.doux.petit', f.id ? 'Aucune photo dans la fiche eBlock.' : 'Fiche descriptive pas encore lue : recliquez le signet dans eBlock.'));

    if (f.id) {
      gauche.appendChild(h('h4', 'Pneus'));
      var roues = [['avG', 'Avant gauche'], ['avD', 'Avant droit'], ['arG', 'Arrière gauche'], ['arD', 'Arrière droit']];
      gauche.appendChild(h('table.eb-pneus', [h('thead', [h('tr', [h('th', 'Roue'), h('th', 'Marque'), h('th', 'Grandeur'), h('th', 'Usure')])]), h('tbody', roues.map(function (x) { var t = p[x[0]] || {}; return h('tr', [h('td', { text: x[1] }), h('td', { text: t.marque || '—' }), h('td', { text: t.grandeur || '—' }), h('td', { text: t.usure || '—' })]); }))]));
      var drapeaux = [];
      if (p.hiver) drapeaux.push('Pneus d\'hiver' + (p.cloutes ? ' cloutés' : '')); if (p.deuxiemeJeu) drapeaux.push('Deuxième jeu de pneus' + (p.deuxiemeJeuJantes ? ' avec jantes' : '')); if (p.apresMarche) drapeaux.push('Pneus après-marché'); if (p.quatreIdentiques === false) drapeaux.push('Pneus dépareillés'); if (p.tpms === false) drapeaux.push('Pas de TPMS'); if (p.general) drapeaux.push('État : ' + libelleEtatPneus(p.general));
      if (drapeaux.length) gauche.appendChild(h('div.doux.petit', { style: { marginTop: '6px' }, text: drapeaux.join(' · ') }));

      var peintureVals = PEINTURE.filter(function (x) { return nombre(pe[x[0]]) !== null; });
      if (peintureVals.length) {
        gauche.appendChild(h('h4', 'Épaisseur de peinture (mils)'));
        gauche.appendChild(h('div.eb-peinture', peintureVals.map(function (x) { var n = nombre(pe[x[0]]); return h('div.p' + (n >= 10 ? '.tres-epais' : (n >= 7 ? '.epais' : '')), { title: n >= 7 ? 'Épaisseur élevée : panneau probablement repeint' : '' }, [h('span', { text: x[1] }), h('b', { text: String(n) })]); })));
        gauche.appendChild(h('div.doux.petit', { style: { marginTop: '4px' }, text: 'Peinture d\'origine ≈ 4 à 6 mils ; 7 et plus : retouche probable.' }));
      }
    }

    droite.appendChild(h('h4', 'Véhicule'));
    droite.appendChild(dl([
      ['NIV', h('span.mono', { text: r.vin || v.vin || '' })], ['Véhicule', f.id ? [v.annee, v.marque, v.modele, v.sousModele && String(v.version || '').indexOf(v.sousModele) !== 0 ? v.sousModele : '', v.version].filter(Boolean).join(' ') : vehiculeTexte(r)],
      ['Carrosserie', f.id ? [v.carrosserie, v.portes ? v.portes + ' portes' : '', v.passagers ? v.passagers + ' places' : ''].filter(Boolean).join(' · ') : r.carrosserie],
      ['Moteur', f.id ? [v.cylindres ? v.cylindres + ' cyl.' : '', v.cylindree ? v.cylindree + ' L' : ''].filter(Boolean).join(' · ') : ''], ['Transmission', libelleTransmission(f.id ? v.transmission : r.transmission)], ['Motricité', libelleMotricite(f.id ? v.motricite : r.motricite)], ['Carburant', libelleCarburant(f.id ? v.carburant : r.carburant)],
      ['Odomètre', fmtKm(f.id ? v.km : r.km)], ['Couleur', EBLOCK_traduireCouleur_(f.id ? v.couleur : r.couleur)], ['Intérieur', f.id ? [EBLOCK_traduireCouleur_(v.couleurInterieure), v.sieges].filter(Boolean).join(' · ') : EBLOCK_traduireCouleur_(r.interieur)],
      ['# stock', r.stock], ['Inventaire', badgeInventaire(r)]
    ]));
    droite.appendChild(h('h4', 'Achat eBlock'));
    droite.appendChild(h('div.eb-tuiles', [
      h('div.tuile.fort', [h('div.l', 'Prix payé'), h('div.v', { text: fmt(r.prixPaye) })]),
      h('div.tuile', [h('div.l', 'Frais'), h('div.v', { text: fmt(r.frais) })]),
      h('div.tuile', [h('div.l', 'Total facture'), h('div.v', { text: fmt(r.totalFacture) })])
    ]));
    droite.appendChild(dl([
      ['Acheté le', r.achatLe ? AMX.fmtDate(r.achatLe, true) : ''], ['Statut eBlock', libelleStatutEblock(r.statutEblock)], ['Vendeur', r.vendeur], ['Lieu', f.lieu ? [f.lieu.nom, f.lieu.ville, f.lieu.region].filter(Boolean).join(', ') : r.region], ['Encan', f.encan],
      ['Transaction', f.numeroTransaction ? String(f.numeroTransaction) : ''], ['Capture', r.capture === 'VERIFIED_CAPTURE' ? 'Vérifiée par eBlock' + (f.capture && f.capture.le ? ' le ' + AMX.fmtDate(f.capture.le) : '') : (r.capture || '')],
      ['Importée', r.importeLe ? AMX.fmtDate(r.importeLe, true) + (r.importePar ? ' par ' + r.importePar : '') : ''], ['Fiche lue', r.ficheLe ? AMX.fmtDate(r.ficheLe, true) : '']
    ]));
    var valeurs = (f.valeurs || []).filter(function (x) { return nombre(x.montant) !== null; });
    if (valeurs.length) {
      droite.appendChild(h('h4', 'Valeurs (eBlock)'));
      droite.appendChild(dl(valeurs.map(function (x) { return [VALEURS[x.type] || x.type, fmt(x.montant) + (x.le ? ' · ' + AMX.fmtDate(x.le) : '')]; })));
    }
    var options = f.id ? (f.options || []) : String(r.options || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (options.length) { droite.appendChild(h('h4', 'Options (' + options.length + ')')); droite.appendChild(h('div.eb-options', options.map(function (o) { return h('span', { text: o }); }))); }
    var notesV = f.id ? f.notesVendeur : r.notesVendeur;
    var notes = (f.notes || []);
    if (notesV || notes.length) {
      droite.appendChild(h('h4', 'Notes'));
      if (notesV) droite.appendChild(h('div.eb-notes', { text: notesV }));
      if (notes.length) droite.appendChild(h('div.eb-notes', { style: { marginTop: '6px' }, text: notes.map(function (n) { return (n.le ? AMX.fmtDateCourte(n.le) + ' ' : '') + n.texte; }).join('\n') }));
    }
    corps.appendChild(gauche); corps.appendChild(droite);
  }

  /** La modale d'une fiche eBlock, d'où qu'on vienne (table, panneau d'inventaire, fiche d'achat). */
  AMX.eblockOuvrir = function (id, ligne) {
    injecterCss();
    var corps = h('div.eb-fiche');
    corps.appendChild(h('div.doux', { text: 'Chargement de la fiche eBlock…' }));
    var r0 = ligne || null;
    var boutons = [];
    var titre = r0 ? vehiculeTexte(r0) + (r0.stock ? ' — # ' + r0.stock : '') : 'Fiche eBlock';
    var modale = AMX.modale({ titre: titre, corps: corps, large: true, boutons: [{ texte: 'Fermer' }] });
    AMX.get({ eblockFiche: id }).then(function (d) {
      if (!d || !d.ok) throw new Error((d && d.erreur) || 'Fiche indisponible');
      var r = d.ligne || r0 || {}, f = d.fiche || null;
      rendreFiche(corps, r, f);
      // Boutons sous la fiche (dans le corps, pour ne pas dépendre de la modale)
      var carfax = (f && f.etat && f.etat.carfax && f.etat.carfax.lien) || r.carfax || AMX.carfax.lien(r.vin);
      var actions = h('div', { style: { gridColumn: '1 / -1', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' } }, [
        r.vin ? h('a.btn.primaire', { href: AMX.lien('achat', '', { vin: r.vin }), html: I.achat + '<span>Fiche d\'achat</span>' }) : null,
        r.vehiculeId && r.registre ? h('a.btn', { href: AMX.lien('inventaire', r.registre.toLowerCase(), { vin: r.vin }), text: 'Voir à l\'inventaire' }) : null,
        f && f.rapport ? h('a.btn', { href: f.rapport, target: '_blank', rel: 'noopener', html: I.externe + '<span>Rapport d\'état eBlock</span>' }) : null,
        carfax ? h('a.btn', { href: carfax, target: '_blank', rel: 'noopener', html: I.externe + '<span>Rapport CARFAX</span>' }) : null,
        h('a.btn', { href: URL_EBLOCK + encodeURIComponent(r.id || id), target: '_blank', rel: 'noopener', html: I.externe + '<span>Voir sur eBlock</span>' }),
        f && f.facture ? h('a.btn.fantome', { href: /^https?:/.test(f.facture) ? f.facture : 'https://app.eblock.com' + f.facture, target: '_blank', rel: 'noopener', text: 'Facture' }) : null
      ]);
      corps.appendChild(actions);
    }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('div.vide', [h('div', { html: I.alerte }), h('h3', 'Fiche indisponible'), h('div', { text: AMX.erreurTexte(e) })])); });
    return modale;
  };

  /* -------------------------------- Excel ------------------------------- */
  FichesEblock.prototype.exporter = function () {
    var lignes = this.filtrees();
    if (!lignes.length) { AMX.toast('Aucun achat à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var rows = lignes.map(function (r) {
      return { 'Acheté le': r.achatLe ? AMX.fmtDate(r.achatLe) : '', 'Statut eBlock': libelleStatutEblock(r.statutEblock), 'Concession': nomCie(r.compagnie), 'Registre': r.registre, '# stock': r.stock, 'Statut inventaire': r.registre ? AMX.statut(r.statutInventaire, r.registre).libelle : 'Plus à l\'inventaire',
        'NIV': r.vin, 'Année': r.annee, 'Marque': r.marque, 'Modèle': r.modele, 'Version': r.version, 'Km': nombre(r.km), 'Couleur': EBLOCK_traduireCouleur_(r.couleur), 'Intérieur': EBLOCK_traduireCouleur_(r.interieur), 'Transmission': libelleTransmission(r.transmission), 'Motricité': libelleMotricite(r.motricite), 'Carburant': libelleCarburant(r.carburant), 'Carrosserie': r.carrosserie,
        'Prix payé': nombre(r.prixPaye), 'Frais': nombre(r.frais), 'Total facture': nombre(r.totalFacture), 'Vendeur': r.vendeur, 'Région': r.region,
        'Cote état': nombre(r.cote), 'Déclarations': String(r.declarations || '').split(/,\s*(?![^(]*\))/).map(EBLOCK_traduireDeclaration_).filter(Boolean).join(', '), 'Dommages': nombre(r.nDommages), 'Pièces endommagées': EBLOCK_traduirePieces_(r.pieces), 'Pneus': r.pneus, 'Peinture max (mils)': nombre(r.peintureMax), 'Codes OBD': nombre(r.codesObd), 'CARFAX': r.carfax, 'Rapport eBlock': r.rapport, 'Photos': nombre(r.nPhotos), 'Fiche lue': r.fiche ? 'oui' : 'non', 'Id eBlock': r.id };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'eBlock');
    XLSX.writeFile(wb, 'fiches-eblock-' + (this.compagnie || 'toutes') + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export Excel — ' + lignes.length + ' ligne' + (lignes.length > 1 ? 's' : ''), 'ok');
  };

  /* ------------- Bloc compact d'un NIV (panneau d'inventaire, fiche d'achat) -------------- */
  // Rend dans `conteneur` la fiche eBlock du véhicule s'il a été acheté sur eBlock et
  // que sa fiche a été importée. Renvoie la promesse (null si rien).
  AMX.eblockFiche = function (vin, conteneur) {
    injecterCss();
    AMX.vider(conteneur);
    vin = String(vin || '').trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return Promise.resolve(null);
    return AMX.get({ eblockVin: vin }, { essais: 1 }).then(function (d) {
      var achats = (d && d.ok && d.achats) || [];
      if (!achats.length) return null;
      var r = achats[0], f = d.fiche || null, et = (f && f.etat) || {};
      var nd = f ? (f.dommages || []).length : (nombre(r.nDommages) || 0);
      var bloc = h('div.eb-bloc');
      bloc.appendChild(h('div.ligne-badges', [
        h('span.badge.sans-point.sombre', { text: 'eBlock', title: 'Acheté sur eBlock le ' + (r.achatLe ? AMX.fmtDate(r.achatLe) : '') }),
        r.fiche ? badgeCote(r.cote) : h('span.badge.sans-point.ambre', { text: 'Fiche pas encore lue' }),
        r.fiche ? h('span.badge.sans-point.' + (nd ? 'rouge' : 'vert'), { text: nd ? nd + ' dommage' + (nd > 1 ? 's' : '') : 'Aucun dommage' }) : null
      ].concat((et.declarations || []).map(decla))));
      bloc.appendChild(h('div', { text: 'Acheté le ' + (r.achatLe ? AMX.fmtDate(r.achatLe) : '—') + ' · ' + fmt(r.prixPaye) + (r.vendeur ? ' · ' + r.vendeur : '') }));
      // Pièces endommagées en français (de la fiche si on l'a, sinon de la colonne de la feuille), puis les photos.
      if (r.fiche && nd) bloc.appendChild(listePieces(f && (f.dommages || []).length ? EBLOCK_piecesListe_(f.dommages).join(', ') : r.pieces, 8));
      if (f && (f.dommages || []).length) bloc.appendChild(h('div.vignettes', f.dommages.slice(0, 6).map(function (dm) { var piece = EBLOCK_traduirePiece_(dm.piece); return h('a', { href: dm.url, target: '_blank', rel: 'noopener', title: piece }, [h('img', { src: dm.vignette || dm.url, alt: piece, loading: 'lazy', referrerpolicy: 'no-referrer' }), piece ? h('span.piece', { text: piece }) : null]); })));
      if (r.fiche && r.pneus) bloc.appendChild(h('div.doux.petit', { text: 'Pneus : ' + r.pneus }));
      bloc.appendChild(h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
        h('button.btn.petit', { type: 'button', text: r.fiche ? 'Voir la fiche eBlock' : 'Voir l\'achat', onclick: function () { AMX.eblockOuvrir(r.id, r); } }),
        h('a.btn.petit.fantome', { href: AMX.lien('outils', 'eblock', { vin: vin }), text: 'Fiches eBlock' })
      ]));
      conteneur.appendChild(bloc);
      return achats;
    }).catch(function () { return null; });
  };

  /* ---------------- Index par NIV (lignes d'inventaire et de service) ---------------- */
  // Les achats eBlock, une fois chargés, servent à toutes les pages : la liste d'inventaire et
  // le Suivi service montrent une puce « eBlock · n dommages » sur chaque véhicule acheté sur
  // eBlock dont la fiche est importée. Même cache local (une semaine) que la page Fiches eBlock ;
  // un rafraîchissement silencieux si la copie a plus d'une heure. Événement : amx:eblock.
  var ebIndex = null, ebPromesse = null, ebQuand = 0;
  function indexer(liste) {
    var idx = {};
    (liste || []).slice().sort(function (a, b) { return String(a.achatLe || '').localeCompare(String(b.achatLe || '')); }).forEach(function (r) { if (r && r.vin) idx[String(r.vin).toUpperCase()] = r; });   // le plus récent gagne
    return idx;
  }
  AMX.eblock = {
    charger: function (force) {
      if (!force && ebIndex && Date.now() - ebQuand < 3600000) return Promise.resolve(ebIndex);
      if (ebPromesse) return ebPromesse;
      if (!ebIndex) { var local = AMX.cacheLocal.lire('eblock', 7 * 86400000); if (local && Array.isArray(local.donnees)) { ebIndex = indexer(local.donnees); ebQuand = local.quand || 0; if (!force && Date.now() - ebQuand < 3600000) return Promise.resolve(ebIndex); } }
      ebPromesse = AMX.get({ eblock: 1 }, { essais: 2 }).then(function (d) {
        ebPromesse = null;
        if (!d || !d.ok) { if (!ebIndex) ebIndex = {}; return ebIndex; }    // refus (compte sans accès) : pas de puces
        AMX.eblock.poser(d.achats || []);
        return ebIndex;
      }, function (e) { ebPromesse = null; if (!ebIndex) ebIndex = {}; throw e; });
      return ebPromesse;
    },
    // La page Fiches eBlock partage ce qu'elle vient de charger.
    poser: function (liste) { ebIndex = indexer(liste); ebQuand = Date.now(); AMX.cacheLocal.ecrire('eblock', liste); document.dispatchEvent(new CustomEvent('amx:eblock')); },
    achat: function (vin) { return (ebIndex && ebIndex[String(vin || '').toUpperCase()]) || null; },
    enCache: function () { return ebIndex; }
  };
  /** Puce « eBlock · 3 dommages » (ou « eBlock · fiche à lire ») pour une ligne ; null si pas acheté sur eBlock. Clic = la fiche. */
  AMX.eblockPuce = function (vin) {
    var r = AMX.eblock.achat(vin);
    if (!r) return null;
    var nd = nombre(r.nDommages) || 0, cote = nombre(r.cote);
    var cls = r.fiche ? (nd ? '.alerte' : '.ok') : '';
    var texte = r.fiche ? (nd ? 'eBlock · ' + nd + ' dommage' + (nd > 1 ? 's' : '') : 'eBlock · sans dommage') : 'eBlock · fiche à lire';
    var titre = 'Acheté sur eBlock' + (r.achatLe ? ' le ' + AMX.fmtDate(r.achatLe) : '') + (r.fiche ? (cote !== null ? ' — état ' + Math.round(cote) + ' / 100' : '') + (nd ? ' — ' + EBLOCK_traduirePieces_(r.pieces) : '') : ' — fiche descriptive pas encore importée (signet eBlock)') + '. Cliquez pour la fiche.';
    var el = h('span.puce.eblock' + cls, { text: texte, title: titre, role: 'button', tabindex: '0' });
    var ouvrir = function (e) { e.preventDefault(); e.stopPropagation(); AMX.eblockOuvrir(r.id, r); };
    el.addEventListener('click', ouvrir);
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') ouvrir(e); });
    return el;
  };

  // Traductions partagées (fiche d'achat, Suivi service) : « Hood » → « Capot », « BLUE » → « Bleu ».
  AMX.eblockTraduirePieces = EBLOCK_traduirePieces_;
  AMX.eblockTraduireCouleur = EBLOCK_traduireCouleur_;
  // Liste de dommages (une par ligne, anglais de l'ancien signet ou français) → lignes en français.
  AMX.eblockTraduireLignes = function (lignes) { return (lignes || []).map(function (x) { return EBLOCK_traduirePieces_(x) || x; }); };

  AMX.vues = AMX.vues || {};
  AMX.vues.FichesEblock = FichesEblock;
})();
