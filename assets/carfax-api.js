/* =========================================================================
   carfax-api.js — l'API officielle de CARFAX Canada dans le site (27 oct. 2026)

   Le script (Carfax.gs) parle à CARFAX avec le Client ID, le secret et le jeton de compte de chaque concession ; ici :
     - AMX.carfaxApi.bouton(vin, opts) : à la place de « Commander un CARFAX » (panneau Occasion, évaluation, fiche
       d'achat). Plus de lien vers le portail CARFAX (retiré le 27 oct., Maxime) : sans l'API branchée, rien ne s'affiche.
       Branchée : « Commander le CARFAX » → Lookup d'abord (gratuit : un rapport déjà acheté se montre, il ne se
       rachète pas), puis une fenêtre de confirmation qui dit que c'est FACTURÉ, case à cocher obligatoire. Sans le droit
       « CARFAX — commander des rapports » : « Vérifier chez CARFAX » seulement (Lookup).
     - AMX.carfaxApi.carteAdmin() : Admin › CARFAX (API) — Client ID, secret et jetons de compte collés par le
       propriétaire. Le site ne voit JAMAIS une clé : il envoie celle qu'on colle, le serveur n'en renvoie que la fin.
   Une commande n'est JAMAIS rejouée par le site (secours: false, pas de rejouer) : une réponse perdue se vérifie par
   le Lookup, jamais par une deuxième commande.
   Routes : GET ?cfxEtat=1 · ?cfxVin=NIV ; POST cfxCles · cfxCompte · cfxRetirer · cfxVerifier · cfxCommander.
   ========================================================================= */
(function () {
  'use strict';
  var AMX = window.AMX, h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez une nouvelle version (Carfax.gs).';
  var NIV_TEST = 'AAAAAAAAAAAAAAAA2';
  var etatCache = null, etatQuand = 0, etatPromesse = null;

  function injecterCss() {
    if (document.getElementById('css-carfax-api')) return;
    var s = document.createElement('style'); s.id = 'css-carfax-api';
    s.textContent = [
      '.cfx-fenetre { display: flex; flex-direction: column; gap: 10px; }',
      '.cfx-fenetre .champ { display: flex; flex-direction: column; gap: 4px; } .cfx-fenetre .champ label { font-size: 12.5px; color: var(--encre-3); font-weight: 600; }',
      '.cfx-fenetre .vin { font-family: var(--mono); letter-spacing: .04em; }',
      '.cfx-facture { border: 1px solid var(--ambre); background: var(--ambre-bg, #FFF4E0); border-radius: var(--rayon-s); padding: 10px 12px; line-height: 1.45; }',
      '.cfx-facture b { color: var(--ambre); }',
      '.cfx-case { display: flex; gap: 8px; align-items: flex-start; font-weight: 600; } .cfx-case input { margin-top: 3px; width: 18px; height: 18px; }',
      '.cfx-rapport { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }',
      '.cfx-rapport .tete { font-weight: 600; } .cfx-rapport .doux { font-size: 12.5px; }',
      '.cfx-admin .cfx-rang { display: grid; grid-template-columns: 220px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--ligne); }',
      '.cfx-admin .cfx-rang:first-of-type { border-top: none; } .cfx-admin .etat { font-size: 12.5px; color: var(--encre-3); }',
      '.cfx-admin .saisies { display: flex; gap: 6px; flex-wrap: wrap; } .cfx-admin .saisies input { min-width: 220px; }',
      '.cfx-admin h3 { margin: 14px 0 4px; font-size: 14px; }',
      '@media (max-width: 760px) { .cfx-admin .cfx-rang { grid-template-columns: 1fr; } .cfx-admin .saisies input { min-width: 0; flex: 1 1 100%; } }'
    ].join('\n');
    document.head.appendChild(s);
  }
  /* Les options du bouton peuvent être des fonctions : lues au moment du clic (l'évaluation remplit le véhicule après le décodage). */
  function val(x) { return typeof x === 'function' ? x() : x; }
  function resoudre(o) { var r = {}; Object.keys(o || {}).forEach(function (k) { r[k] = k === 'onFait' ? o[k] : val(o[k]); }); return r; }
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c; }
  function quand(iso) { return iso ? AMX.fmtDate(iso, true) : ''; }
  function nettoyerCle(x) { return String(x || '').replace(/[\s\u00a0\u200b-\u200d\ufeff]+/g, ' ').trim(); }

  /* ------------------------------- État ------------------------------- */
  function etat(force) {
    if (!force && etatCache && Date.now() - etatQuand < 5 * 60000) return Promise.resolve(etatCache);
    if (etatPromesse) return etatPromesse;
    etatPromesse = AMX.get({ cfxEtat: 1 }, { secours: false }).then(function (d) {
      etatPromesse = null;
      if (!d || !d.client || !Array.isArray(d.concessions)) throw new Error((d && d.erreur) || SCRIPT_PAS_A_JOUR);
      etatCache = d; etatQuand = Date.now();
      document.dispatchEvent(new CustomEvent('amx:carfaxApi'));
      return d;
    }, function (e) { etatPromesse = null; throw e; });
    return etatPromesse;
  }
  function branchees() { return (etatCache && etatCache.client && etatCache.client.present) ? etatCache.concessions.filter(function (c) { return c.present; }) : []; }
  function estBranche(cie) { return branchees().some(function (c) { return !cie || c.compagnie === cie; }); }

  /* ----------------------------- Vérifier ----------------------------- */
  function verifier(vin, cie) {
    return AMX.post({ action: 'cfxVerifier', vin: vin, compagnie: cie || '' }, { secours: false, delai: 60000 }).then(function (d) {
      if (!d || d.refuse) throw new Error((d && d.erreur) || 'Non autorisé.');
      if (d.ok === undefined && d.vehicules) throw new Error(SCRIPT_PAS_A_JOUR);
      if (d.enregistre && AMX.carfax && AMX.carfax.charger) AMX.carfax.charger(true).catch(function () {});
      return d;
    });
  }
  function ligneRapport(m) {
    return h('div.cfx-rapport', [
      h('span.tete', { text: (m.typeLibelle || 'Rapport') + (m.statut ? ' — ' + (/complet/i.test(m.statut) ? 'complet' : (/pending|attente/i.test(m.statut) ? 'en préparation' : m.statut)) : '') }),
      h('span.doux', { text: ['acheté par ' + (m.nomConcession || nomCie(m.compagnie)), m.date ? 'le ' + AMX.fmtDateCourte(m.date) : '', m.numero ? 'no ' + m.numero : '', m.expire ? 'valide jusqu\'au ' + AMX.fmtDateCourte(m.expire) : ''].filter(Boolean).join(' · ') })
    ]);
  }
  /** Le rapport déjà acheté : on le montre ; « Commander quand même » seulement avec le droit, et à part. */
  function montrerTrouve(vin, d, opts) {
    var m = d.meilleur, lien = m ? (m.lienFr || m.lien) : '';
    var corps = h('div.cfx-fenetre', [
      h('p', { style: { margin: 0 }, text: 'Un rapport CARFAX existe déjà pour ce NIV : pas besoin d\'en acheter un autre.' }),
      m ? ligneRapport(m) : null,
      d.enregistre ? h('p.doux.petit', { style: { margin: 0 }, text: 'Le lien est maintenant posé sur le véhicule.' })
        : (d.lien && d.lien !== lien ? h('p.doux.petit', { style: { margin: 0 }, text: 'Le véhicule a déjà un autre lien CARFAX (collé ou importé) : il est gardé.' }) : null)
    ]);
    var boutons = [{ texte: 'Fermer' }];
    if (etatCache && etatCache.peutCommander) boutons.push({ texte: 'Commander quand même (facturé)…', classe: 'danger', action: function (f) { f(); confirmer(vin, Object.assign({}, opts, { malgreExistant: true })); return false; } });
    if (lien) boutons.push({ texte: 'Ouvrir le rapport', classe: 'primaire', action: function () { window.open(lien, '_blank', 'noopener'); } });
    AMX.modale({ titre: 'Rapport CARFAX trouvé', corps: corps, boutons: boutons, proteger: false });
  }

  /* ----------------------------- Commander ----------------------------- */
  function confirmer(vin, opts) {
    opts = opts || {};
    injecterCss();
    var comptes = branchees();
    if (!comptes.length) { AMX.toast('L\'API CARFAX n\'est pas branchée (Admin › CARFAX).', 'attention'); return; }
    var cieDefaut = comptes.some(function (c) { return c.compagnie === opts.compagnie; }) ? opts.compagnie : comptes[0].compagnie;
    var selCie = h('select.saisie', comptes.map(function (c) { return h('option', { value: c.compagnie, text: nomCie(c.compagnie) + ' — compte ' + c.compte, selected: c.compagnie === cieDefaut }); }));
    var types = (etatCache && etatCache.types) || [{ type: 4, libelle: 'Historique du véhicule' }];
    var selType = h('select.saisie', types.map(function (t) { return h('option', { value: String(t.type), text: t.libelle + (t.type === 4 ? ' (habituel)' : ''), selected: t.type === ((etatCache && etatCache.typeDefaut) || 4) }); }));
    var champRef = h('input.saisie', { type: 'text', maxlength: '20', value: opts.reference || '', placeholder: '# stock ou référence' });
    var caseOk = h('input', { type: 'checkbox' });
    var avis = h('div.cfx-facture');
    var majAvis = function () {
      var c = comptes.filter(function (x) { return x.compagnie === selCie.value; })[0] || {};
      avis.innerHTML = '';
      avis.appendChild(h('div', [h('b', { text: 'Commande facturée. ' }), h('span', { text: 'CARFAX facture ce rapport au compte de ' + nomCie(selCie.value) + ' (no ' + (c.compte || '?') + '). Une commande ne s\'annule pas.' })]));
      avis.appendChild(h('div.doux.petit', { style: { marginTop: '4px' }, text: opts.malgreExistant ? 'Un rapport existe déjà pour ce NIV : vous en achetez un nouveau.' : 'ScanAutomax vient de vérifier : aucun rapport n\'a déjà été acheté pour ce NIV dans les comptes branchés.' }));
    };
    selCie.addEventListener('change', majAvis); majAvis();
    var corps = h('div.cfx-fenetre', [
      h('div', [h('div', { style: { fontWeight: 600 }, text: opts.vehicule || 'Véhicule' }), h('div.vin', { text: vin })]),
      h('div.champ', [h('label', { text: 'Compte CARFAX facturé' }), selCie]),
      h('div.champ', [h('label', { text: 'Type de rapport' }), selType]),
      h('div.champ', [h('label', { text: 'Référence (sur le rapport)' }), champRef]),
      avis,
      h('label.cfx-case', [caseOk, h('span', { text: 'Je confirme la commande de ce rapport, facturée par CARFAX.' })])
    ]);
    var m = AMX.modale({
      titre: 'Commander le rapport CARFAX', corps: corps, proteger: false,
      boutons: [{ texte: 'Annuler' }, { texte: 'Commander (facturé)', classe: 'danger', action: function () {
        if (!caseOk.checked) { AMX.toast('Cochez la case pour confirmer la commande facturée.', 'attention'); caseOk.focus(); return false; }
        return envoyer(vin, { compagnie: selCie.value, type: Number(selType.value) || 4, reference: champRef.value, vehicule: opts.vehicule, source: opts.source, malgreExistant: !!opts.malgreExistant, malgreRecente: !!opts.malgreRecente }, opts);
      } }]
    });
    return m;
  }
  /** POST cfxCommander — une seule fois : jamais de requête de secours, jamais rejouée. */
  function envoyer(vin, choix, opts) {
    var corps = Object.assign({ action: 'cfxCommander', vin: vin, confirme: true }, choix);
    return AMX.post(corps, { secours: false, delai: 120000 }).then(function (d) {
      if (!d) throw new Error('Aucune réponse');
      if (d.ok === undefined && d.vehicules) throw new Error(SCRIPT_PAS_A_JOUR);
      if (d.refuse) { AMX.toast(d.erreur || 'Refusé.', 'erreur', 9000); return false; }
      if (d.ok) {
        AMX.toast(d.message || 'Rapport CARFAX commandé.', 'ok', 9000);
        if (AMX.carfax && AMX.carfax.charger) AMX.carfax.charger(true).catch(function () {});
        if (opts && opts.onFait) opts.onFait(d);
        return true;
      }
      if (d.code === 'DEJA') { setTimeout(function () { montrerTrouve(vin, d, opts); }, 0); return true; }
      if (d.code === 'RECENTE') {
        var c = d.commande || {};
        setTimeout(function () {
          AMX.confirmer('Déjà commandé', 'Ce NIV a été commandé le ' + quand(c.le) + ' par ' + (c.par || '?') + ' (' + (c.etat === 'incertain' ? 'réponse de CARFAX incertaine' : 'compte ' + (c.nomConcession || '')) + '). Une nouvelle commande sera facturée de nouveau.', { ok: 'Commander quand même (facturé)', danger: true })
            .then(function (oui) { if (oui) confirmer(vin, Object.assign({}, opts, { malgreRecente: true, malgreExistant: true })); });
        }, 0);
        return true;
      }
      if (d.code === 'INCERTAIN') { AMX.toast(d.erreur, 'attention', 20000); if (opts && opts.onFait) opts.onFait(d); return true; }
      AMX.toast(d.erreur || 'Commande impossible.', d.code === 'EN_COURS' ? 'attention' : 'erreur', 12000);
      return d.code === 'REFUSE' ? false : true;
    }, function (e) {
      var msg = AMX.erreurTexte(e);
      if (/trop de temps|Failed to fetch|NetworkError|Load failed|network|illisible/i.test(msg)) {
        AMX.toast('Pas de réponse du serveur : la commande a peut-être été passée. Ne recommencez pas ; cliquez « Vérifier chez CARFAX » dans quelques minutes.', 'attention', 20000);
        return true;
      }
      AMX.toast(msg, 'erreur', 10000);
      return false;
    });
  }
  /** Le clic « Commander le CARFAX » : Lookup d'abord, puis la confirmation (ou le rapport trouvé). */
  function commander(vin, opts, btn) {
    opts = resoudre(opts);
    if (btn) btn.classList.add('occupe');
    return verifier(vin, opts.compagnie).then(function (d) {
      if (!d.ok) { AMX.toast('Vérification CARFAX impossible : ' + (d.erreur || 'pas de réponse') + '. Rien n\'a été commandé.', 'erreur', 10000); return; }
      if (d.trouve) { montrerTrouve(vin, d, opts); if (d.enregistre && opts.onFait) opts.onFait(d); return; }
      if (!opts.verifierSeulement) confirmer(vin, opts);
      else AMX.toast('Aucun rapport CARFAX acheté pour ce NIV dans les comptes branchés.', 'attention', 7000);
    }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 9000); })
      .then(function () { if (btn) btn.classList.remove('occupe'); });
  }

  /* -------------------------------- Bouton -------------------------------- */
  /** opts : { compagnie, reference (# stock), vehicule (texte), source ('occasion' | 'evaluation' | 'achat'), classe, onFait } —
      compagnie, reference et vehicule peuvent être des fonctions (lues au clic).
      Rien tant que l'état de l'API n'est pas lu ou qu'aucune concession n'est branchée ; ensuite le bouton de l'API. */
  function bouton(vin, opts) {
    opts = opts || {};
    injecterCss();
    var zone = h('span.cfx-bouton', { style: { display: 'contents' } });
    var classe = opts.classe || '';
    var dessiner = function () {
      AMX.vider(zone);
      var vinOk = /^[A-HJ-NPR-Z0-9]{17}$/.test(String(vin || '').toUpperCase());
      if (!vinOk || !branchees().length) return;   // concession pas branchée : la fenêtre propose les comptes branchés
      var peut = !!(etatCache && etatCache.peutCommander);
      var b = h('button.btn' + classe, { type: 'button', title: peut ? 'Vérifie les rapports déjà achetés, puis commande (facturé) au compte de la concession' : 'Cherche un rapport déjà acheté par nos concessions',
        html: AMX.icones.recherche + '<span>' + (peut ? 'Commander le CARFAX' : 'Vérifier chez CARFAX') + '</span>' });
      b.addEventListener('click', function () { commander(String(vin).toUpperCase(), Object.assign({}, opts, { verifierSeulement: !peut }), b); });
      zone.appendChild(b);
    };
    dessiner();
    etat().then(dessiner, function () {});
    return zone;
  }

  /* --------------------------- Admin › CARFAX --------------------------- */
  function carteAdmin() {
    injecterCss();
    var corps = h('div.carte-corps.cfx-admin');
    var carte = h('div.carte.admin-parametres', [h('div.carte-entete', [h('h2', 'CARFAX (API)')]), corps]);
    var poster = function (corps2, btn, fini) {
      if (btn) btn.classList.add('occupe');
      return AMX.post(corps2, { secours: false, delai: 60000 }).then(function (x) {
        if (!x || x.refuse || x.ok === false) { AMX.toast((x && x.erreur) || 'Refusé', 'erreur', 12000); if (x && x.etat) dessiner(x.etat); return; }
        AMX.toast(x.message || 'Enregistré', 'ok', 9000); if (x.avertissement) AMX.toast(x.avertissement, 'attention', 12000);
        if (fini) fini();
        etatCache = null; dessiner(x.etat || null); if (!x.etat) charger();
      }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }).then(function () { if (btn) btn.classList.remove('occupe'); });
    };
    var dessiner = function (r) {
      if (!r) return;
      etatCache = r; etatQuand = Date.now();
      AMX.vider(corps);
      corps.appendChild(h('p.doux.petit', { style: { margin: 0 }, text: 'L\'API officielle de CARFAX Canada : ScanAutomax lit lui-même les rapports déjà achetés (aux 20 minutes, gratuit) et pose les liens sur les véhicules ; « Commander le CARFAX » achète un rapport au compte de la concession (facturé, toujours confirmé). Les clés reçues de CARFAX se collent ici ; elles ne sont jamais affichées ni envoyées ailleurs. Le favori « Automax ← CARFAX » reste en secours.' }));
      var c = r.client || {};
      corps.appendChild(h('h3', { text: 'Clés de l\'API (Client ID et Client Secret)' }));
      var etatClient = c.present ? 'Branché' + (c.finId ? ' — Client ID …' + c.finId : '') + (c.finSecret ? ' · secret …' + c.finSecret : '') + (c.jetonJusqua ? ' · jeton valable jusqu\'à ' + quand(c.jetonJusqua) : '') : (c.idPresent || c.secretPresent ? 'Incomplet : il manque ' + (c.idPresent ? 'le secret' : 'le Client ID') : 'Pas branché');
      var champId = h('input.saisie', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: c.idPresent ? 'Nouveau Client ID (pour le remplacer)' : 'Coller le Client ID' });
      var champSecret = h('input.saisie', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: c.secretPresent ? 'Nouveau Client Secret (pour le remplacer)' : 'Coller le Client Secret' });
      var poserCles = h('button.btn.primaire.petit', { type: 'button', text: c.present ? 'Remplacer' : 'Brancher', onclick: function () {
        // `cfxClientId` / `cfxSecret`, pas `jeton` : AMX.post ajoute déjà `jeton` (la session) à chaque requête.
        var id = nettoyerCle(champId.value), secret = nettoyerCle(champSecret.value);
        if (!id && !secret) { AMX.toast('Collez le Client ID et le Client Secret.', 'attention'); return; }
        if (/[•*]/.test(id + secret)) { AMX.toast('La clé collée contient des « • » ou « * » : c\'est une clé masquée. Copiez la clé elle-même.', 'erreur', 12000); return; }
        poster({ action: 'cfxCles', cfxClientId: id, cfxSecret: secret }, poserCles, function () { champId.value = ''; champSecret.value = ''; });
      } });
      var retirerCles = (c.idPresent || c.secretPresent) && r.peutRegler ? h('button.btn.petit.danger', { type: 'button', text: 'Retirer', onclick: function () {
        AMX.confirmer('Débrancher l\'API CARFAX ?', 'Le Client ID et le secret seront effacés de ScanAutomax : plus de lecture automatique ni de commande jusqu\'à ce qu\'on les recolle. Les liens déjà posés restent.', { ok: 'Retirer', danger: true }).then(function (ok) { if (ok) poster({ action: 'cfxRetirer', quoi: 'client' }, null); });
      } }) : null;
      corps.appendChild(h('div.cfx-rang', [h('b', { text: 'CARFAX Canada' }), h('div', [h('div.etat', { text: etatClient }), c.erreur ? h('div.etat', { style: { color: 'var(--rouge)' }, text: c.erreur }) : null]),
        r.peutRegler ? h('div.saisies', [champId, champSecret, poserCles, retirerCles]) : h('span.doux.petit', { text: 'Réservé au propriétaire' })]));
      corps.appendChild(h('h3', { text: 'Jetons de compte (un par concession)' }));
      (r.concessions || []).forEach(function (x) {
        var etatX = x.present ? 'Branché' + (x.fin ? ' — jeton …' + x.fin : '') + (x.verifieLe ? ' · vérifié le ' + quand(x.verifieLe) : '') : 'Pas branché';
        var champ = h('input.saisie', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: x.present ? 'Coller un nouveau jeton pour le remplacer' : 'Coller le jeton de compte (account token)' });
        var poser = h('button.btn.primaire.petit', { type: 'button', text: x.present ? 'Remplacer' : 'Brancher', onclick: function () {
          var t = nettoyerCle(champ.value);
          if (!t) { AMX.toast('Collez d\'abord le jeton de compte.', 'attention'); return; }
          if (/^\d{4,6}$/.test(t)) { AMX.toast('Ceci est le numéro de compte (' + t + ') : collez le long jeton que CARFAX a envoyé pour ce compte.', 'erreur', 12000); return; }
          if (/[•*]/.test(t)) { AMX.toast('Le jeton collé contient des « • » ou « * » : c\'est un jeton masqué.', 'erreur', 12000); return; }
          poster({ action: 'cfxCompte', compagnie: x.compagnie, cfxCompte: t }, poser, function () { champ.value = ''; });
        } });
        var retirer = x.present && r.peutRegler ? h('button.btn.petit.danger', { type: 'button', text: 'Retirer', onclick: function () {
          AMX.confirmer('Débrancher ' + x.nomConcession + ' ?', 'Le jeton de compte sera effacé de ScanAutomax : plus de lecture ni de commande CARFAX pour cette concession jusqu\'à ce qu\'on le recolle.', { ok: 'Retirer', danger: true }).then(function (ok) { if (ok) poster({ action: 'cfxRetirer', quoi: 'compte', compagnie: x.compagnie }, null); });
        } }) : null;
        corps.appendChild(h('div.cfx-rang', [h('div', [h('b', { text: x.nomConcession }), h('div.etat', { text: 'compte CARFAX ' + (x.compte || '?') })]), h('div', [h('div.etat', { text: etatX }), x.erreur ? h('div.etat', { style: { color: 'var(--ambre)' }, text: x.erreur }) : null]),
          r.peutRegler ? h('div.saisies', [champ, poser, retirer]) : h('span.doux.petit', { text: 'Réservé au propriétaire' })]));
      });
      var p = r.passage;
      corps.appendChild(h('p.doux.petit', { style: { margin: '10px 0 0' }, text: p && p.le ? 'Dernière lecture automatique : ' + quand(p.le) + ' — ' + (p.lus || 0) + ' NIV lus, ' + (p.trouves || 0) + ' rapports trouvés, ' + (p.enregistres || 0) + ' liens posés' + (p.erreurs ? ', ' + p.erreurs + ' erreurs' : '') + '.' : (c.present ? 'La lecture automatique commence au prochain passage (aux 20 minutes, de 6 h à 22 h).' : '') }));
      if (r.peutRegler && c.present && branchees().length) {
        var selEssai = h('select.saisie', { style: { maxWidth: '260px' } }, branchees().map(function (x) { return h('option', { value: x.compagnie, text: x.nomConcession }); }));
        var essai = h('button.btn.petit', { type: 'button', text: 'Essai de commande (NIV de test, non facturé)', onclick: function () {
          AMX.confirmer('Essai de commande CARFAX', 'Commande du NIV de test de CARFAX (' + NIV_TEST + ') au compte de ' + nomCie(selEssai.value) + '. D\'après la documentation de CARFAX, ce NIV de test n\'est pas facturé : il sert à vérifier que la commande fonctionne.', { ok: 'Faire l\'essai' }).then(function (ok) {
            if (!ok) return;
            essai.classList.add('occupe');
            AMX.post({ action: 'cfxCommander', vin: NIV_TEST, compagnie: selEssai.value, confirme: true, essai: true }, { secours: false, delai: 60000 }).then(function (x) {
              if (x && x.ok) AMX.toast('Essai réussi : CARFAX a répondu' + (x.test ? ' (rapport de test, non facturé)' : '') + (x.commande && x.commande.numero ? ', no ' + x.commande.numero : '') + '.', 'ok', 12000);
              else AMX.toast((x && x.erreur) || 'Essai refusé', 'erreur', 12000);
            }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }).then(function () { essai.classList.remove('occupe'); });
          });
        } });
        corps.appendChild(h('div.actions-ligne', { style: { marginTop: '8px', alignItems: 'center' } }, [selEssai, essai]));
      }
    };
    var charger = function () {
      AMX.vider(corps); corps.appendChild(h('p.doux.petit', { text: 'Lecture de l\'état…' }));
      etat(true).then(dessiner).catch(function (e) { AMX.vider(corps); corps.appendChild(h('p.doux.petit', { text: 'CARFAX : ' + AMX.erreurTexte(e) })); });
    };
    charger();
    return carte;
  }

  AMX.carfaxApi = {
    etat: etat, enCache: function () { return etatCache; }, estBranche: estBranche, branchees: branchees,
    verifier: verifier, commander: commander, confirmer: confirmer, bouton: bouton,
    vin: function (vin) { return AMX.get({ cfxVin: vin }, { secours: false }); },
    carteAdmin: carteAdmin,
    vider: function () { etatCache = null; etatQuand = 0; }
  };
})();

/* =========================================================================
   Pastilles CARFAX (5 nov. 2026) — « Sans accident » (vert) ou « Rapport CARFAX » (gris depuis le 7 nov., plus de rouge :
   voir texte()), partout où un véhicule est montré, sans rien commander
   Maxime : « dans Opportunités il faudrait pouvoir lire les CARFAX et avoir une icône très visible pour dire s'il y a un
   accident, sans que ça coûte des $ de notre compte », puis « applique l'API partout où on voit un stock dans le site,
   une auto accidentée en rouge ».
   Le script lit la Badging API de CARFAX (CarfaxPastilles.gs) : elle dit si un rapport existe déjà chez CARFAX pour ce
   NIV et donne ses pastilles. Elle ne commande rien.
     - AMX.cfxPastilles.puce(vin, { grande }) : un <span data-cfx="NIV"> qui se remplit et se met à jour tout seul :
       vert « ✓ Sans accident » (pastille CARFAX « Aucun accident déclaré », certain), rouge « ⚠ Accident ? » (rapport SANS
       cette pastille : le plus souvent un accident ou un dommage, mais aussi un véhicule importé ou un historique trop court —
       vu le 5 nov. : la BMW iX WB523CF05PCL23666 n'a aucun accident, c'est une importation ; Maxime veut quand même le rouge,
       d'où le « ? »), gris « Aucun rapport CARFAX » (seulement en grand). Un clic ouvre le rapport (il n'ouvre pas la ligne).
     - AMX.cfxPastilles.ligne(el, vin) : la ligne passe en rouge (.cfx-ligne-accident) avec « Accident ? ».
     - AMX.cfxPastilles.demander(vins) : un NIV pas encore connu (ou trop vieux) est lu chez CARFAX par le script, par
       lots de 60 (POST carfaxPastillesLire) ; puce() le demande d'elle-même.
     - AMX.cfxPastilles.de(vin) → { a: 'n'|'v'|'x'|'e', le, p: [codes], l: lien } (v = « Accident ? » ; un 'o' d'avant le
       5 nov. devient 'v') ; accident(vin) → false (aucun accident déclaré), true (« Accident ? ») ou null (pas de rapport).
   Données : GET ?carfaxPastilles=1 (10 minutes en mémoire, pas de copie dans le navigateur, déjà presque plein).
   ========================================================================= */
(function () {
  'use strict';
  var AMX = window.AMX, h = AMX.h;
  var NOMS = { A: 'Aucun accident déclaré', O: 'Un seul propriétaire', K: 'Faible kilométrage' };
  var LOT = 60, MEMOIRE_MS = 10 * 60000;
  var S = { v: {}, charge: false, quand: 0, promesse: null, file: {}, tentes: {}, enVol: false, minuterie: null, arret: '', lus: 0 };

  function css() {
    if (document.getElementById('css-cfx-pastilles')) return;
    var s = document.createElement('style'); s.id = 'css-cfx-pastilles';
    s.textContent = [
      '.cfx-pastille { display: inline-flex; align-items: center; gap: 4px; border: 0; border-radius: 999px; font: inherit; font-weight: 700; font-size: 12px; line-height: 1.2; padding: 3px 9px; margin: 0 4px; vertical-align: middle; white-space: nowrap; cursor: default; }',
      '.cfx-pastille:empty { display: none; }',
      '.cfx-pastille.lien { cursor: pointer; }',
      '.cfx-pastille.v { background: #EEF2F7; color: #344054; }',   /* 7 nov. : plus de rouge (voir texte()) */
      '.cfx-pastille.n { background: #E3F4EA; color: #1E6B3A; }',
      '.cfx-pastille.x, .cfx-pastille.e { background: var(--fond-2, #F1F3F5); color: var(--encre-3, #4B5563); font-weight: 600; }',
      '.cfx-pastille.grande { font-size: 13.5px; padding: 6px 12px; margin: 0; }',
      '.cfx-pastille.v.lien:hover, .cfx-pastille.n.lien:hover { filter: brightness(.95); }',
      '.cfx-ligne-accident { background: rgba(198, 40, 40, .07) !important; box-shadow: inset 4px 0 0 #C62828 !important; }',
      'tr.cfx-ligne-accident { box-shadow: none !important; }',
      'tr.cfx-ligne-accident > td { background: rgba(198, 40, 40, .07) !important; }',
      'tr.cfx-ligne-accident > td:first-child { box-shadow: inset 4px 0 0 #C62828 !important; }',
      '.cfx-detail { display: flex; flex-direction: column; gap: 8px; }',
      '.cfx-detail .cfx-noms { display: flex; flex-wrap: wrap; gap: 6px; }',
      '.cfx-detail .cfx-noms span { background: #E8F0FB; color: #1A64BF; border-radius: 999px; padding: 3px 9px; font-size: 12.5px; font-weight: 600; }'
    ].join('\n');
    document.head.appendChild(s);
  }
  function norm(v) { return String(v || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
  function valide(v) { return /^[A-HJ-NPR-Z0-9]{17}$/.test(v); }
  function de(vin) {
    var x = S.v[norm(vin)];
    if (!x) return null;
    return { a: x[0] === 'o' ? 'v' : x[0], le: x[1] || '', p: String(x[2] || '').split(',').filter(Boolean), l: x[3] || '' };
  }
  function nomPastille(c) { return NOMS[c] || String(c).replace(/([a-z])([A-Z])/g, '$1 $2'); }
  function perime(x) {
    if (!x) return true;
    var age = (Date.now() - Date.parse((x.le || '2000-01-01') + 'T12:00:00')) / 864e5;
    if (x.a === 'v' || x.a === 'n') return age >= 14;
    if (x.a === 'x') return age >= 7;
    return age >= 1;
  }
  function fusion(v) { Object.keys(v || {}).forEach(function (k) { S.v[k] = v[k]; }); }
  function charger(force) {
    if (!force && S.charge && Date.now() - S.quand < MEMOIRE_MS) return Promise.resolve(S.v);
    if (S.promesse) return S.promesse;
    S.promesse = AMX.get({ carfaxPastilles: 1 }, { discret: true, secours: false, delai: 60000 }).then(function (d) {
      S.promesse = null;
      if (!d || d.refuse) { S.arret = 'refus'; S.charge = true; return S.v; }
      if (!d.v) { S.arret = 'script'; S.charge = true; return S.v; }
      fusion(d.v); S.charge = true; S.quand = Date.now();
      rafraichir();
      return S.v;
    }, function () { S.promesse = null; S.charge = true; S.quand = Date.now() - MEMOIRE_MS + 60000; return S.v; });
    return S.promesse;
  }
  function demander(vins) {
    if (S.arret) return;
    (vins || []).forEach(function (v) {
      v = norm(v);
      if (!valide(v) || S.tentes[v]) return;
      if (S.charge && !perime(de(v))) return;
      S.file[v] = 1;
    });
    planifier();
  }
  function planifier(ms) {
    if (S.minuterie || S.enVol || S.arret || !Object.keys(S.file).length) return;
    S.minuterie = setTimeout(envoyer, ms || 1200);
  }
  function envoyer() {
    S.minuterie = null;
    if (!S.charge) { charger().then(function () { planifier(10); }); return; }
    Object.keys(S.file).forEach(function (v) { if (!perime(de(v))) delete S.file[v]; });
    var lot = Object.keys(S.file).slice(0, LOT);
    if (!lot.length || S.arret) return;
    lot.forEach(function (v) { delete S.file[v]; S.tentes[v] = Date.now(); });
    S.enVol = true;
    AMX.post({ action: 'carfaxPastillesLire', vins: lot }, { secours: false, delai: 150000 }).then(function (r) {
      S.enVol = false;
      if (r && r.v) { fusion(r.v); S.lus += r.lus || 0; rafraichir(); document.dispatchEvent(new CustomEvent('amx:cfxPastilles', { detail: { lus: r.lus || 0 } })); }
      else if (r && r.code === 'NON_BRANCHE') S.arret = 'non branché';
      else if (r && (r.refuse || r.vehicules || /absent|pas à jour/i.test(r.erreur || ''))) S.arret = 'script';
      planifier(400);
    }, function () { S.enVol = false; lot.forEach(function (v) { delete S.tentes[v]; S.file[v] = 1; }); planifier(30000); });
  }
  function texte(x, grande) {
    if (!x) return '';
    /* 7 nov. (Maxime : « le système qui met en rouge les véhicules accidentés ne fonctionne pas, il montre plusieurs unités en
       rouge qui n'ont pas d'accident », ex. 1GNS6TKLXTR348573) : la Badging API ne dit jamais « accident ». Seule la mention
       « Aucun accident déclaré » est sûre. Vérifié sur de vrais rapports le 7 nov. : sans cette mention, un rapport peut avoir
       un accident comme n'en avoir aucun (véhicule neuf, importé, historique court — 910 des 1 148 n'ont aucune pastille).
       Donc plus de rouge : « Rapport CARFAX », à ouvrir. */
    if (x.a === 'v') return grande ? 'Rapport CARFAX à lire — CARFAX ne dit pas « aucun accident »' : 'Rapport CARFAX';
    if (x.a === 'n') return grande ? '✓ Aucun accident déclaré (CARFAX)' : '✓ Sans accident';
    if (x.a === 'x') return grande ? 'Aucun rapport CARFAX pour ce NIV' : '';
    return grande ? 'CARFAX : lecture à refaire' : '';
  }
  function infobulle(x) {
    if (!x) return '';
    var noms = x.p.map(nomPastille).filter(function (n) { return n !== NOMS.A; });
    if (x.a === 'v') return 'Ce rapport CARFAX n\'a pas la mention « Aucun accident déclaré ». Ça ne veut pas dire qu\'il y a un accident : CARFAX ne donne pas cette mention à tous les véhicules (neuf, importé, historique court). Seul le rapport le dit (case « Accidents/dommages »).' + (noms.length ? ' Pastilles : ' + noms.join(', ') + '.' : '') + (x.l ? ' Cliquez pour ouvrir le rapport.' : '') + ' Lu le ' + x.le + '.';
    if (x.a === 'n') return 'Rapport CARFAX : aucun accident déclaré.' + (noms.length ? ' ' + noms.join(', ') + '.' : '') + (x.l ? ' Cliquez pour ouvrir le rapport.' : '') + ' Lu le ' + x.le + '.';
    if (x.a === 'x') return 'Aucun rapport CARFAX n\'existe encore pour ce NIV (lu le ' + x.le + ').';
    return 'La lecture CARFAX a échoué (' + x.le + ') : elle sera refaite.';
  }
  function remplir(el) {
    var vin = el.getAttribute('data-cfx'), grande = el.classList.contains('grande'), x = de(vin), t = texte(x, grande);
    el.className = 'cfx-pastille' + (grande ? ' grande' : '') + (x ? ' ' + x.a : '') + (x && x.l ? ' lien' : '');
    el.textContent = t;
    if (t) el.title = infobulle(x); else el.removeAttribute('title');
  }
  function rafraichir() {
    css();
    Array.prototype.forEach.call(document.querySelectorAll('[data-cfx]'), remplir);
    Array.prototype.forEach.call(document.querySelectorAll('[data-cfx-ligne]'), function (el) {
      var x = de(el.getAttribute('data-cfx-ligne'));
      el.classList.remove('cfx-ligne-accident');
    });
  }
  function puce(vin, opts) {
    opts = opts || {}; css();
    vin = norm(vin);
    if (!valide(vin)) return null;
    var el = h('span.cfx-pastille' + (opts.grande ? '.grande' : ''), { 'data-cfx': vin, role: 'link' });
    el.addEventListener('click', function (e) {
      var x = de(vin);
      if (!x || !x.l) return;
      e.preventDefault(); e.stopPropagation();
      window.open(x.l, '_blank', 'noopener');
    }, true);
    remplir(el);
    if (!S.charge) charger();
    demander([vin]);
    return el;
  }
  function ligne(el, vin) {
    vin = norm(vin);
    if (!el || !valide(vin)) return el;
    el.setAttribute('data-cfx-ligne', vin);
    var x = de(vin);
    return el;
  }
  /* Bloc de la fiche d'un véhicule : la grande pastille, les autres pastilles, le lien du rapport, « Relire ». */
  function bloc(vin) {
    vin = norm(vin);
    if (!valide(vin)) return null;
    var corps = h('div.cfx-detail');
    var dessiner = function () {
      AMX.vider(corps);
      var x = de(vin);
      corps.appendChild(h('div', [puce(vin, { grande: true }) || h('span.doux', { text: 'CARFAX : lecture…' })]));
      if (!x) { corps.appendChild(h('div.doux.petit', { text: 'Lecture chez CARFAX en cours (gratuit : rien n\'est commandé)…' })); return; }
      var noms = x.p.map(nomPastille).filter(function (n) { return n !== NOMS.A; });
      if (noms.length) corps.appendChild(h('div.cfx-noms', noms.map(function (n) { return h('span', { text: n }); })));
      corps.appendChild(h('div.actions-ligne', [
        x.l ? h('a.btn.petit.primaire', { href: x.l, target: '_blank', rel: 'noopener', text: 'Voir le rapport CARFAX ↗' }) : null,
        h('button.btn.petit.fantome', { type: 'button', text: 'Relire chez CARFAX', title: 'Gratuit : relit les pastilles, ne commande rien', onclick: function (e) {
          var b = e.currentTarget; b.classList.add('occupe');
          AMX.post({ action: 'carfaxPastillesLire', vin: vin, forcer: true }, { secours: false, delai: 60000 }).then(function (r) {
            b.classList.remove('occupe');
            if (r && r.v) { fusion(r.v); rafraichir(); dessiner(); } else AMX.toast((r && r.erreur) || 'Le script n\'est pas à jour : déployez une nouvelle version (CarfaxPastilles.gs).', 'erreur');
          }, function (er) { b.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(er), 'erreur'); });
        } })
      ]));
      if (x.a === 'v') corps.appendChild(h('div.petit', { text: 'CARFAX ne dit pas s\'il y a un accident : il donne seulement la mention « Aucun accident déclaré », et pas à tous les véhicules sans accident (neuf, importé, historique court). Ouvrez le rapport : la case « Accidents/dommages » le dit.' }));
      corps.appendChild(h('div.doux.petit', { text: 'Pastilles du rapport CARFAX déjà existant, lues le ' + x.le + '. Aucun rapport n\'est commandé ici.' }));
    };
    dessiner();
    var ecoute = function () { if (!corps.isConnected) { document.removeEventListener('amx:cfxPastilles', ecoute); return; } dessiner(); };
    document.addEventListener('amx:cfxPastilles', ecoute);
    if (!S.charge) charger().then(function () { if (corps.isConnected) dessiner(); });
    return corps;
  }

  AMX.cfxPastilles = {
    charger: charger, de: de, puce: puce, ligne: ligne, bloc: bloc, demander: demander, rafraichir: rafraichir,
    accident: function (vin) { var x = de(vin); return x && x.a === 'n' ? false : null; },   /* 7 nov. : jamais « oui » — CARFAX ne le dit pas */
    enFile: function () { return Object.keys(S.file).length + (S.enVol ? LOT : 0); },
    arret: function () { return S.arret; },
    nomPastille: nomPastille,
    vider: function () { S.v = {}; S.charge = false; S.quand = 0; S.file = {}; S.tentes = {}; S.arret = ''; }
  };
})();
