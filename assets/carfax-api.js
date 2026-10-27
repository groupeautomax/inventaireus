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
