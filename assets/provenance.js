/* =========================================================================
   provenance.js — une occasion est-elle reprise en échange ou achetée ?
   (7 nov. 2026 — suggestion SC71C0DDBA2, Louis Prassinos, Hyundai Longueuil :
   « il faut différencier les étapes si un véhicule est repris en échange vs
   acheté aux encans, car on n'a pas les étapes immatriculation, arrivée… »)

   Même règle que gs/Provenance.gs (les deux se suivent) :
     1. le choix fait à la main (?provenances=1) ;
     1b. entré automatiquement depuis une place de marché (achats-auto.js) = achat ;
     2. l'origine « Échange » du registre ;
     3. le # stock, avec les règles des livres des ventes
        (BMW P… = achat ; VW …P/…PA = achat ; Hyundai U… = achat ;
         chiffres + lettre à la fin = échange : 27049A, 26J04A, W2363A) ;
     4. sinon achat (toutes les étapes restent).
   L'origine « Achat » ne compte pas : c'est la valeur par défaut des exports du DMS.

   Un échange n'a ni release, ni transport, ni vérification à la livraison, ni
   registre à attendre (le client remet le certificat avec l'échange).

   AMX.provenance = { de(v), estEchange(v), regle(v), charger(force), modifier(v, p),
                      puce(v), controle(v, { peut, apres }), libelle(p), vider() }
   Événement « amx:provenance » quand les choix à la main changent.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h;

  var REGLES = {
    BMW:     { achat: /^P/, echangeAvant: false },
    VW:      { achat: /\dP[A-Z]?$/, echangeAvant: false },
    HYUNDAI: { achat: /^U/, echangeAvant: false },
    HAWKS:   { achat: /^(W|US|F|L)\d/, echangeAvant: true },
    STM:     { achat: /^(U|HA|HU|EX|LMB)\d/, echangeAvant: true }
  };
  var SUFFIXE = /\d[A-Z]{1,2}$/;
  var LIB = { echange: 'Échange', achat: 'Achat' };
  var SOURCES = {
    manuel: 'choisi à la main',
    portail: 'acheté sur une place de marché',
    origine: 'origine « Échange » au registre',
    stock: 'd\'après le # stock',
    defaut: 'aucun indice d\'échange'
  };

  var etat = { manuel: {}, quand: 0, enVol: null, peut: false, pasAJour: false };

  function vinDe(x) { var s = String(x || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); return s.length === 17 ? s : ''; }
  function stockDe(s) { return String(s === null || s === undefined ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  /** La provenance d'après le registre seul (sans le choix à la main). */
  function regle(v) {
    v = v || {};
    if (/chang/i.test(String(v.origine || ''))) return { provenance: 'echange', source: 'origine' };
    var s = stockDe(v.stock);
    var r = REGLES[String(v.compagnie || '').trim().toUpperCase()] || { achat: null, echangeAvant: true };
    if (s) {
      var suffixe = SUFFIXE.test(s), achat = r.achat ? r.achat.test(s) : false;
      if (r.echangeAvant ? suffixe : (suffixe && !achat)) return { provenance: 'echange', source: 'stock' };
      if (achat) return { provenance: 'achat', source: 'stock' };
    }
    return { provenance: 'achat', source: 'defaut' };
  }

  function de(v) {
    var vin = vinDe(v && v.vin), m = vin ? etat.manuel[vin] : '';
    // Entré automatiquement depuis DealerSource, Manheim, OPENLANE, eBlock ou un contrat reçu par courriel : un achat.
    var auto = vin && AMX.achatsAuto && (AMX.achatsAuto.achat ? AMX.achatsAuto.achat(vin) : AMX.achatsAuto.entree(vin));
    var r = (m === 'echange' || m === 'achat') ? { provenance: m, source: 'manuel' } : (auto ? { provenance: 'achat', source: 'portail' } : regle(v));
    r.libelle = LIB[r.provenance];
    r.explication = SOURCES[r.source];
    return r;
  }
  function estEchange(v) { return de(v).provenance === 'echange'; }

  function annoncer() { try { document.dispatchEvent(new CustomEvent('amx:provenance')); } catch (e) {} }

  function charger(force) {
    if (!force && etat.quand && Date.now() - etat.quand < AMX.dureeCopie(300000)) return Promise.resolve(etat);
    if (etat.enVol) return etat.enVol;
    etat.enVol = AMX.get({ provenances: 1 }, { discret: true, secours: false }).then(function (d) {
      etat.enVol = null; etat.quand = Date.now();
      if (d && d.manuel && typeof d.manuel === 'object' && !Array.isArray(d.manuel)) {
        var m = {};
        Object.keys(d.manuel).forEach(function (k) { if (d.manuel[k] === 'echange' || d.manuel[k] === 'achat') m[k] = d.manuel[k]; });
        etat.manuel = m; etat.peut = !!d.peutModifier; etat.pasAJour = false;
      } else {
        etat.pasAJour = true;   // script d'avant : la règle du # stock s'applique quand même, sans choix à la main
      }
      annoncer();
      return etat;
    }, function (e) { etat.enVol = null; throw e; });
    return etat.enVol;
  }

  function modifier(v, p) {
    var vin = vinDe(v && v.vin);
    if (!vin) return Promise.reject(new Error('NIV invalide.'));
    if (etat.pasAJour) return Promise.reject(new Error('Le script n\'est pas à jour : déployez la nouvelle version (Provenance.gs).'));
    return AMX.post({ action: 'provenanceModifier', vin: vin, provenance: p || '' }, { rejouer: true }).then(function (d) {
      if (d && d.ok && !d.vin) { etat.pasAJour = true; throw new Error('Le script n\'est pas à jour : déployez la nouvelle version (Provenance.gs).'); }
      AMX.verifier(d, 'Changement impossible');
      if (d.manuel === 'echange' || d.manuel === 'achat') etat.manuel[vin] = d.manuel; else delete etat.manuel[vin];
      annoncer();
      return d;
    });
  }

  /** Petite pastille « Échange » / « Achat » pour une ligne de liste. */
  function puce(v) {
    var p = de(v);
    if (p.provenance === 'achat' && p.source === 'defaut' && !v.origine) return null;
    return h('span.puce.prov-' + p.provenance, { text: p.libelle, title: (p.provenance === 'echange' ? 'Repris en échange' : 'Acheté (encan, place de marché, à la porte)') + ' — ' + p.explication });
  }

  /**
   * La ligne « Échange ou achat » du panneau d'un véhicule : deux boutons, la raison du choix,
   * et « Automatique » quand le choix a été fait à la main. opts.apres(d) après un changement.
   */
  function controle(v, opts) {
    opts = opts || {};
    var p = de(v), peut = opts.peut !== false && (etat.peut || !etat.quand) && !etat.pasAJour;
    var seg = h('div.segment.petit', { role: 'group', 'aria-label': 'Échange ou achat' });
    var occupe = false;
    function choisir(q) {
      if (occupe) return;
      occupe = true;
      modifier(v, q).then(function (d) {
        AMX.toast(d.message || 'Enregistré', 'succes');
        if (opts.apres) opts.apres(d);
      }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 7000); }).then(function () { occupe = false; });
    }
    ['echange', 'achat'].forEach(function (q) {
      seg.appendChild(h('button' + (p.provenance === q ? '.actif' : ''), { type: 'button', text: LIB[q], disabled: !peut, 'aria-pressed': p.provenance === q ? 'true' : 'false',
        title: q === 'echange' ? 'Repris en échange : pas de release, de transport, de vérification à la livraison ni de registre à attendre' : 'Acheté (encan, place de marché, à la porte) : toutes les étapes',
        onclick: function () { if (p.provenance !== q || p.source !== 'manuel') choisir(q); } }));
    });
    var enfants = [h('span.l', { text: 'Provenance' }), seg, h('span.doux.petit', { text: p.explication })];
    if (p.source === 'manuel' && peut) enfants.push(h('button.prov-auto', { type: 'button', text: 'Automatique', title: 'Oublier le choix fait à la main (règle du # stock)', onclick: function () { choisir(''); } }));
    if (etat.pasAJour) enfants.push(h('span.doux.petit', { text: '· script à déployer pour corriger à la main' }));
    return h('div.ligne-registre.ligne-provenance', enfants);
  }

  // Styles : pastilles de liste.
  if (!document.getElementById('css-provenance')) {
    var st = document.createElement('style'); st.id = 'css-provenance';
    st.textContent = '.puce.prov-echange { background: var(--sarcelle-bg); color: var(--sarcelle); border-color: var(--sarcelle-bord); }' +
      '.puce.prov-achat { background: var(--fond); color: var(--encre-3); }' +
      '.ligne-provenance .prov-auto { background: none; border: 0; color: var(--bleu); cursor: pointer; padding: 0; font-size: 12px; text-decoration: underline; }';
    document.head.appendChild(st);
  }

  AMX.provenance = {
    REGLES: REGLES, SOURCES: SOURCES,
    regle: regle, de: de, estEchange: estEchange, charger: charger, modifier: modifier,
    puce: puce, controle: controle,
    libelle: function (p) { return LIB[p] || ''; },
    vider: function () { etat.manuel = {}; etat.quand = 0; etat.peut = false; etat.pasAJour = false; }
  };
})();
