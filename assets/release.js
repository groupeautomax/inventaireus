/* =========================================================================
   release.js — le release d'un achat avant le transport Central Fleet (26 oct. 2026)

   Maxime : « le meilleur moyen d'ajouter le release (on a payé le véhicule et on peut aller le chercher) avant de
   confirmer le transport dans Central Fleet ; on peut même aller chercher les informations où on cherche le véhicule ».
   Le release vit dans la fiche d'achat (champs f-release…, Release.gs). Ici :
     - AMX.release.charger / vin / maj / deposer / ouvrirDoc : les routes ;
     - AMX.release.lireDocument(fichier) : lit un PDF de release dans le navigateur (pdf.js) et devine le no de release,
       l'adresse, le code postal, le téléphone et le NIV — toujours proposé, jamais imposé ;
     - AMX.release.modale(vin, ctx) : la fenêtre « Release » (page Transports, panneau Occasion) ;
     - AMX.release.consignes(r) : les consignes de cueillette envoyées avec la demande Central Fleet.
   Le document d'un release n'est jamais partagé par lien : il permet de sortir le véhicule du lot.
   ========================================================================= */
(function () {
  'use strict';
  var AMX = window.AMX, h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez une nouvelle version (Release.gs).';
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_TRAVAILLEUR = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var ETATS = {
    apayer: { libelle: 'À payer', couleur: 'gris', aide: 'acheté, pas encore payé' },
    attente: { libelle: 'Release attendu', couleur: 'ambre', aide: 'payé, le release n\'est pas arrivé' },
    pret: { libelle: 'Prêt à transporter', couleur: 'vert', aide: 'release reçu : demandez le transport' },
    transport: { libelle: 'Transport demandé', couleur: 'bleu', aide: 'demande ou commande Central Fleet ouverte' }
  };
  var CHAMPS = [
    ['paye', 'Payé le', 'date'], ['recu', 'Release reçu le', 'date'], ['no', 'No de release / gate pass'],
    ['lieu', 'Lieu de cueillette (encan, concession)'], ['adresse', 'Adresse'], ['ville', 'Ville'], ['province', 'Province ou État'], ['codePostal', 'Code postal'],
    ['heures', 'Heures de cueillette'], ['contact', 'Contact sur place'], ['telephone', 'Téléphone sur place'], ['note', 'Instructions (envoyées à Central Fleet)']
  ];

  function verifier(d, cle) {
    if (!d) throw new Error('Aucune réponse');
    if (d.refuse) throw new Error(d.erreur || 'Accès refusé.');
    if (d.ok === false) throw new Error(d.erreur || 'Le serveur a refusé.');
    if (cle && d[cle] === undefined) throw new Error(SCRIPT_PAS_A_JOUR);
    return d;
  }
  var cache = { rep: null, quand: 0, promesse: null };

  /* ------------------------------ Lecture d'un PDF ------------------------------ */
  function chargerPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (chargerPdfJs.p) return chargerPdfJs.p;
    chargerPdfJs.p = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = PDFJS; s.async = true;
      s.onload = function () { if (!window.pdfjsLib) { chargerPdfJs.p = null; rej(new Error('Le lecteur de PDF ne s\'est pas chargé.')); return; } window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_TRAVAILLEUR; res(window.pdfjsLib); };
      s.onerror = function () { chargerPdfJs.p = null; rej(new Error('Le lecteur de PDF ne s\'est pas chargé.')); };
      document.head.appendChild(s);
    });
    return chargerPdfJs.p;
  }
  function texteDuPdf(octets) {
    return chargerPdfJs().then(function (pdfjs) { return pdfjs.getDocument({ data: octets }).promise; }).then(function (doc) {
      var pages = []; for (var i = 1; i <= Math.min(doc.numPages, 4); i++) pages.push(i);
      return Promise.all(pages.map(function (n) { return doc.getPage(n).then(function (p) { return p.getTextContent(); }).then(function (tc) {
        // Une ligne = les morceaux à la même hauteur.
        var lignes = {}; tc.items.forEach(function (it) { var y = Math.round(it.transform[5] / 3) * 3; (lignes[y] = lignes[y] || []).push({ x: it.transform[4], s: it.str }); });
        return Object.keys(lignes).map(Number).sort(function (a, b) { return b - a; }).map(function (y) { return lignes[y].sort(function (a, b) { return a.x - b.x; }).map(function (m) { return m.s; }).join(' ').replace(/\s+/g, ' ').trim(); }).filter(Boolean).join('\n');
      }); })).then(function (t) { return t.join('\n'); });
    });
  }
  var PROVINCES = ['QC', 'ON', 'NB', 'NS', 'PE', 'NL', 'MB', 'SK', 'AB', 'BC', 'YT', 'NT', 'NU', 'NY', 'VT', 'PA', 'NH', 'ME', 'MA', 'OH', 'MI', 'NJ', 'CT', 'IN', 'IL', 'TX', 'FL', 'GA', 'CA'];
  /** Ce qu'un release écrit d'habitude : no de release / gate pass, adresse avec code postal, téléphone, NIV. */
  function analyserTexte(t) {
    var r = {}, lignes = String(t || '').split('\n');
    // Le no de release : sur la même ligne que son libellé, et avec au moins un chiffre (« VEHICLE RELEASE » n'est pas un numéro).
    var reNo = /(?:release|gate[ \t]*pass|passe?[ \t]*de[ \t]*sortie|lib[ée]ration|pick[ \t-]?up[ \t]*(?:code|number|no|#)|bon[ \t]*de[ \t]*sortie)[ \t]*(?:no\.?|n[°o]|number|num[ée]ro|#|code|id)?[ \t]*[:#]?[ \t]*([A-Z0-9][A-Z0-9-]{3,24})/ig, mNo;
    while ((mNo = reNo.exec(t))) { if (/\d/.test(mNo[1]) && !/^\d{1,2}$/.test(mNo[1])) { r.no = mNo[1].toUpperCase(); break; } }
    var mVin = t.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/); if (mVin) r.vin = mVin[0];
    var mTel = t.match(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/); if (mTel) r.telephone = mTel[0].trim();
    // Adresse canadienne : « …, Ville, QC H1H 1H1 » ; américaine : « …, City, NY 12345 ».
    for (var i = 0; i < lignes.length; i++) {
      var l = lignes[i];
      var ca = l.match(/^(.*?)[,\s]+([A-Za-zÀ-ÿ' .-]{2,40}),?\s+(QC|ON|NB|NS|PE|NL|MB|SK|AB|BC|QUÉBEC|QUEBEC|ONTARIO)\b[\s,]*([A-Z]\d[A-Z]\s?\d[A-Z]\d)/i);
      var us = !ca && l.match(/^(.*?)[,\s]+([A-Za-z' .-]{2,40}),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/);
      var m = ca || us;
      if (!m) continue;
      var prov = m[3].toUpperCase(); prov = /QU/.test(prov) ? 'QC' : (/ONT/.test(prov) ? 'ON' : prov);
      if (PROVINCES.indexOf(prov) < 0) continue;
      var rue = m[1].replace(/^(adresse|address|location|lieu|pick[\s-]?up(?: location)?)\s*:?\s*/i, '').trim();
      if (!rue && i > 0 && /\d/.test(lignes[i - 1])) rue = lignes[i - 1].replace(/^(adresse|address|location|lieu)\s*:?\s*/i, '').trim();
      r.adresse = rue; r.ville = m[2].trim(); r.province = prov; r.codePostal = m[4].toUpperCase().replace(/^([A-Z]\d[A-Z])(\d)/, '$1 $2');
      break;
    }
    if (!r.codePostal) { var cp = t.toUpperCase().match(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/); if (cp) r.codePostal = cp[0].replace(/^([A-Z]\d[A-Z])(\d)/, '$1 $2'); }
    return r;
  }
  function lireDocument(fichier) {
    if (!fichier || !/pdf$/i.test(fichier.type || fichier.name || '')) return Promise.resolve({});
    return fichier.arrayBuffer().then(function (b) { var o = new Uint8Array(b), i = 0; while (i < o.length - 4 && !(o[i] === 37 && o[i + 1] === 80 && o[i + 2] === 68 && o[i + 3] === 70)) i++; return texteDuPdf(i ? o.slice(i) : o); })
      .then(analyserTexte, function () { return {}; });
  }
  /* Une photo du release prise au téléphone : réduite à 2000 px en JPEG pour l'envoi. */
  function preparer(fichier) {
    var type = (fichier.type || '').toLowerCase();
    if (type === 'application/pdf' || !/^image\/(jpeg|png|webp)$/.test(type) || fichier.size < 1500000) return Promise.resolve(fichier);
    return new Promise(function (res) {
      var img = new Image(), url = URL.createObjectURL(fichier);
      img.onload = function () {
        var k = Math.min(1, 2000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { res(b ? new File([b], fichier.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : fichier); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); res(fichier); };
      img.src = url;
    });
  }
  function base64(fichier) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).replace(/^data:[^,]*,/, '')); }; r.onerror = function () { rej(new Error('Fichier illisible')); }; r.readAsDataURL(fichier); });
  }

  /* --------------------------------- Routes --------------------------------- */
  AMX.release = {
    ETATS: ETATS,
    charger: function (force) {
      if (!force && cache.rep && Date.now() - cache.quand < 60000) return Promise.resolve(cache.rep);
      if (cache.promesse) return cache.promesse;
      cache.promesse = AMX.get({ releases: 1 }, { secours: false, delai: 45000 }).then(function (d) {
        cache.promesse = null; verifier(d, 'releases'); cache.rep = d; cache.quand = Date.now();
        document.dispatchEvent(new CustomEvent('amx:releases')); return d;
      }, function (e) { cache.promesse = null; throw e; });
      return cache.promesse;
    },
    enCache: function () { return cache.rep; },
    vider: function () { cache.rep = null; cache.quand = 0; },
    /** Prêts à transporter (release reçu, pas encore de demande) de la concession choisie. */
    compteur: function () {
      var d = cache.rep; if (!d) return '';
      var cie = AMX.compagnieChoisie('inventaire');
      return d.releases.filter(function (x) { return (!cie || x.compagnie === cie) && x.etat === 'pret'; }).length || '';
    },
    vin: function (vin) { return AMX.get({ releaseVin: vin }, { secours: false, delai: 45000 }).then(function (d) { return verifier(d, 'release'); }); },
    maj: function (vin, release) {
      return AMX.post({ action: 'releaseMaj', vin: vin, release: release }, { delai: 60000, rejouer: true }).then(function (d) {
        if (d && d.vehicules && !d.release) throw new Error(SCRIPT_PAS_A_JOUR);
        verifier(d, 'release'); cache.quand = 0; document.dispatchEvent(new CustomEvent('amx:releases')); return d;
      });
    },
    deposer: function (vin, fichier) {
      return preparer(fichier).then(function (f) {
        if (f.size > 15 * 1024 * 1024) throw new Error('Fichier trop gros (15 Mo au plus).');
        return base64(f).then(function (b) { return AMX.post({ action: 'releaseDoc', vin: vin, nom: f.name, mime: f.type || 'application/pdf', base64: b }, { delai: 120000, secours: false }); });
      }).then(function (d) {
        if (d && d.vehicules && !d.release) throw new Error(SCRIPT_PAS_A_JOUR);
        verifier(d, 'release'); cache.quand = 0; document.dispatchEvent(new CustomEvent('amx:releases')); return d;
      });
    },
    /** Ouvre le document dans un nouvel onglet (fenêtre ouverte tout de suite, dans le clic). */
    ouvrirDoc: function (vin) {
      var w = window.open('', '_blank');
      if (w) { try { w.document.title = 'Release'; w.document.body.style.font = '14px system-ui'; w.document.body.textContent = 'Téléchargement du release…'; } catch (e0) {} }
      return AMX.get({ releaseDoc: 1, vin: vin }, { secours: false, delai: 60000 }).then(function (r) {
        if (!r || !r.ok || !r.base64) throw new Error((r && r.erreur) || 'Document indisponible');
        var bin = atob(r.base64), oct = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) oct[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([oct], { type: r.mime || 'application/pdf' }));
        if (w) w.location = url; else { var a = h('a', { href: url, download: r.nom || 'release.pdf' }); document.body.appendChild(a); a.click(); a.remove(); }
        setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
      }).catch(function (e) { if (w) w.close(); AMX.toast('Release : ' + AMX.erreurTexte(e), 'erreur'); });
    },
    lireDocument: lireDocument,
    analyserTexte: analyserTexte,
    /** Les consignes de cueillette pour Central Fleet : no de release, heures, instructions. */
    consignes: function (r) {
      r = r || {};
      var instr = [r.no ? 'Release # ' + r.no : '', r.lieu ? 'Lieu : ' + r.lieu : '', r.heures ? 'Heures : ' + r.heures : '', r.note || ''].filter(Boolean).join(' · ');
      return { contact: r.contact || '', telephone: r.telephone || '', instructions: instr.slice(0, 500), release: r.no || '' };
    },
    modale: function (vin, ctx) { return modale(vin, ctx || {}); },
    badge: function (etat) { var e = ETATS[etat] || { libelle: etat || '—', couleur: 'gris' }; return h('span.badge.' + e.couleur, { text: e.libelle }); },
    CHAMPS: CHAMPS
  };

  /* ------------------------------ La fenêtre « Release » ------------------------------ */
  function modale(vin, ctx) {
    vin = String(vin || '').toUpperCase();
    var corps = h('div.rel-form', [h('p.doux', { text: 'Lecture du release…' })]);
    var champs = {}, original = {};
    var m = AMX.modale({ titre: 'Release — ' + (ctx.titre || vin), corps: corps, large: true,
      boutons: [{ texte: 'Fermer' }, { texte: 'Enregistrer', classe: 'primaire', action: function (fermer) {
        var envoi = {}; Object.keys(champs).forEach(function (k) { var e = champs[k], x = e.type === 'checkbox' ? e.checked : e.value.trim(); if (String(x) !== String(original[k] === undefined ? '' : original[k])) envoi[k] = x; });
        if (!Object.keys(envoi).length) { fermer(); return false; }
        return AMX.release.maj(vin, envoi).then(function (d) { AMX.toast(d.message || 'Release enregistré', 'ok'); m.modifie(false); if (ctx.onEnregistre) ctx.onEnregistre(d.release); fermer(); return false; }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
      } }] });
    AMX.release.vin(vin).then(function (d) {
      AMX.vider(corps);
      var r = d.release || {};
      original = Object.assign({}, r);
      var grille = h('div.rel-grille');
      CHAMPS.forEach(function (c) {
        var val = r[c[0]] === 'oui' && c[0] === 'paye' ? '' : (r[c[0]] || '');
        var e = c[0] === 'note' ? h('textarea.saisie', { rows: '2', maxlength: '500' }) : h('input.saisie', { type: c[2] === 'date' ? 'date' : 'text', maxlength: c[0] === 'province' ? '2' : undefined, style: c[0] === 'province' ? { textTransform: 'uppercase' } : undefined });
        e.value = val; champs[c[0]] = e; original[c[0]] = val;
        grille.appendChild(h('div.champ' + (c[0] === 'note' || c[0] === 'lieu' ? '.large' : ''), [h('label', { text: c[1] }), e]));
      });
      var inutile = h('input', { type: 'checkbox' }); inutile.checked = !!r.inutile; champs.inutile = inutile; original.inutile = !!r.inutile;
      var doc = h('div.rel-doc');
      var dessinerDoc = function (rr) {
        AMX.vider(doc);
        if (rr.pdf) doc.appendChild(h('button.btn.petit', { type: 'button', html: AMX.icones.externe + '<span>Voir le release' + (rr.pdfNom ? ' (' + AMX.esc(rr.pdfNom) + ')' : '') + '</span>', onclick: function () { AMX.release.ouvrirDoc(vin); } }));
        var inp = h('input', { type: 'file', accept: 'application/pdf,image/*', style: { display: 'none' } });
        inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; if (f) deposer(f); inp.value = ''; });
        doc.appendChild(inp);
        if (d.peutEcrire) doc.appendChild(h('button.btn.petit', { type: 'button', html: AMX.icones.plus + '<span>' + (rr.pdf ? 'Remplacer le document' : 'Déposer le release (PDF ou photo)') + '</span>', onclick: function () { inp.click(); } }));
      };
      var deposer = function (f) {
        AMX.toast('Envoi du release…', 'info');
        lireDocument(f).then(function (lu) { remplir(lu, 'le document'); });
        AMX.release.deposer(vin, f).then(function (x) { AMX.toast(x.message || 'Release déposé', 'ok', 6000); champs.recu.value = champs.recu.value || x.release.recu; original.recu = x.release.recu; dessinerDoc(x.release); if (ctx.onEnregistre) ctx.onEnregistre(x.release); }, function (e) { AMX.toast('Release : ' + AMX.erreurTexte(e), 'erreur', 9000); });
      };
      var remplir = function (s, quoi) {
        var n = 0;
        ['lieu', 'adresse', 'ville', 'province', 'codePostal', 'telephone', 'no', 'contact'].forEach(function (k) { if (s[k] && champs[k] && !champs[k].value.trim()) { champs[k].value = s[k]; n++; } });
        if (n) { m.modifie(true); AMX.toast(n + ' champ' + (n > 1 ? 's' : '') + ' rempli' + (n > 1 ? 's' : '') + ' depuis ' + quoi + ' — vérifiez avant d\'enregistrer.', 'ok', 6000); }
        if (s.vin && s.vin !== vin) AMX.toast('Attention : le document mentionne le NIV ' + s.vin + ', pas ' + vin + '.', 'attention', 10000);
      };
      dessinerDoc(r);
      var sug = (d.suggestions || []).map(function (s) {
        var t = [s.lieu, [s.ville, s.province].filter(Boolean).join(', '), s.codePostal].filter(Boolean).join(' · ') + (s.paiement ? ' · paiement : ' + s.paiement : '');
        return h('button.btn.petit.fantome', { type: 'button', title: 'Remplir les cases vides avec ce que ' + s.libelle + ' sait', onclick: function () { remplir(s, s.libelle); if (!champs.source.value) champs.source.value = s.source; } }, [h('b', { text: s.libelle + ' : ' }), h('span', { text: t })]);
      });
      champs.source = h('input', { type: 'hidden', value: r.source || '' }); original.source = r.source || '';
      corps.appendChild(h('p.doux.petit', { style: { marginTop: 0 }, text: 'Le release prouve que le véhicule est payé et qu\'on peut aller le chercher. Il reste dans la fiche d\'achat ; le no de release, les heures et le contact partent avec la demande de transport Central Fleet.' }));
      if (sug.length) corps.appendChild(h('div.rel-sug', [h('span.doux.petit', { text: 'Où est le véhicule, selon :' })].concat(sug)));
      corps.appendChild(grille);
      corps.appendChild(h('div.rel-bas', [doc, h('label.case', [inutile, h('span', 'Déjà chez nous : pas de release ni de transport')])]));
      corps.appendChild(champs.source);
      if (!d.peutEcrire) Object.keys(champs).forEach(function (k) { champs[k].disabled = true; });
    }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('p', { text: AMX.erreurTexte(e) })); });
    return m;
  }

  /* CSS commun (fenêtre, fiche d'achat, page Transports). */
  function injecterCss() {
    if (document.getElementById('css-release')) return;
    var s = document.createElement('style'); s.id = 'css-release';
    s.textContent = [
      '.rel-grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px 12px; }',
      '.rel-grille .large { grid-column: span 2; } @media (max-width: 640px) { .rel-grille .large { grid-column: auto; } }',
      '.rel-sug { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0 0 12px; } .rel-sug .btn { text-align: left; white-space: normal; }',
      '.rel-bas { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-top: 12px; } .rel-doc { display: flex; gap: 6px; flex-wrap: wrap; }',
      '.rel-avis { margin: 0 0 10px; padding: 8px 12px; border-radius: var(--rayon-s); font-size: 13px; line-height: 1.5; } .rel-avis.ambre { background: #FEF3C7; border: 1px solid #FDE68A; color: #92400E; } .rel-avis.vert { background: var(--vert-clair); border: 1px solid var(--vert); color: var(--vert-fonce); }',
      '.rel-table td .sous { display: block; font-size: 12px; color: var(--encre-3); } .rel-table tr.rangee { cursor: pointer; } .rel-table tr.rangee:hover td { background: var(--carte-2); }'
    ].join('\n');
    document.head.appendChild(s);
  }
  injecterCss();
})();
