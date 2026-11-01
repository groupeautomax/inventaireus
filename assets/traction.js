/* =========================================================================
   traction.js — Admin › Traction (CRM) (1er novembre 2026)

   Le CRM Traction (Traction DK) demande des évaluations à ScanAutomax et reçoit la valeur dans la cotation
   (Traction.gs). Cette carte, réservée au propriétaire, donne ce qu'il faut remettre à Traction (adresse et clé
   ScanAutomax, montrée seulement sur demande) et reçoit ce que Traction nous donne (adresse de retour et sa clé,
   jamais réaffichée : le serveur n'en renvoie que les 4 derniers caractères).
   Routes : GET ?traction=1 ; POST tractionReglages · tractionCle · tractionTester · tractionRenvoyer.
   ========================================================================= */
(function () {
  'use strict';
  var AMX = window.AMX, h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez une nouvelle version (Traction.gs).';

  function injecterCss() {
    if (document.getElementById('css-traction')) return;
    var s = document.createElement('style'); s.id = 'css-traction';
    s.textContent = [
      '.trx-admin h3 { margin: 14px 0 4px; font-size: 14px; }',
      '.trx-admin .trx-cie { border-top: 1px solid var(--ligne); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }',
      '.trx-admin .trx-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }',
      '.trx-admin .champ { display: flex; flex-direction: column; gap: 4px; } .trx-admin .champ label { font-size: 12.5px; color: var(--encre-3); font-weight: 600; }',
      '.trx-admin .trx-remettre { background: var(--fond); border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }',
      '.trx-admin .trx-remettre .mono { font-family: var(--mono); font-size: 12.5px; word-break: break-all; }',
      '.trx-admin .trx-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }',
      '.trx-admin .trx-etat { font-size: 12.5px; color: var(--encre-3); line-height: 1.5; }',
      '.trx-admin .trx-echec { color: var(--rouge); font-size: 12.5px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }'
    ].join('\n');
    document.head.appendChild(s);
  }
  function quand(iso) { return iso ? AMX.fmtDate(iso, true) : '—'; }

  function carteAdmin() {
    injecterCss();
    var corps = h('div.carte-corps.trx-admin', [h('p.doux.petit', { text: 'Chargement…' })]);
    var carte = h('div.carte.admin-parametres.admin-traction', [h('div.carte-entete', [h('h2', 'Traction (CRM) — évaluations')]), corps]);
    var charger = function () {
      AMX.get({ traction: 1 }, { secours: false }).then(function (d) {
        if (!d || d.refuse) throw new Error((d && d.erreur) || 'Non autorisé.');
        if (!Array.isArray(d.concessions)) throw new Error(SCRIPT_PAS_A_JOUR);
        dessiner(d);
      }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('p.doux.petit', { text: AMX.erreurTexte(e) })); });
    };
    var poster = function (c, btn) {
      if (btn) btn.classList.add('occupe');
      return AMX.post(c, { secours: false, delai: 60000 }).then(function (x) {
        if (!x || x.refuse || x.ok === false) throw new Error((x && x.erreur) || 'Refusé');
        if (x.ok === undefined && x.vehicules) throw new Error(SCRIPT_PAS_A_JOUR);
        return x;
      }).then(function (x) { if (btn) btn.classList.remove('occupe'); return x; }, function (e) { if (btn) btn.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(e), 'erreur', 12000); throw e; });
    };
    var dessiner = function (d) {
      AMX.vider(corps);
      corps.appendChild(h('p.doux.petit', { style: { margin: 0 }, text: 'Un représentant demande l\'évaluation d\'un échange depuis Traction ; elle arrive dans les demandes d\'évaluation comme les autres, et la valeur retourne d\'elle-même dans la cotation. Traction doit d\'abord développer son côté (fiche technique remise à Traction DK). Aucune clé n\'est affichée sans un clic.' }));
      (d.concessions || []).forEach(function (x) { corps.appendChild(blocCie(d, x)); });
    };
    var blocCie = function (d, x) {
      var bloc = h('div.trx-cie', [h('b', { text: x.nom + ' (' + x.code + ')' })]);
      var et = x.etat || {}, dm = x.demandes || {};
      var lignes = [
        'Reçu de Traction : ' + (et.recus || 0) + (et.dernierRecu ? ' · dernier ' + quand(et.dernierRecu.le) + ' (' + et.dernierRecu.evenement + (et.dernierRecu.ok ? '' : ', refusé ' + (et.dernierRecu.code || '')) + ')' : '') + (et.refus ? ' · ' + et.refus + ' refus de clé' : ''),
        'Envoyé à Traction : ' + (et.envoyes || 0) + (et.dernierEnvoi ? ' · dernier ' + quand(et.dernierEnvoi.le) + ' (' + et.dernierEnvoi.evenement + (et.dernierEnvoi.ok ? '' : ', ' + (et.dernierEnvoi.erreur || 'échec')) + ')' : '') + (dm.attente ? ' · ' + dm.attente + ' en reprise' : ''),
        'Demandes venues de Traction : ' + (dm.demandes || 0) + (dm.ouvertes ? ' dont ' + dm.ouvertes + (dm.ouvertes > 1 ? ' ouvertes' : ' ouverte') : ''),
        'Retours : ' + (x.pret ? 'actifs' : (x.actif ? 'actifs, mais il manque l\'adresse ou la clé de Traction' : 'arrêtés'))
      ];
      bloc.appendChild(h('div.trx-etat', lignes.map(function (t) { return h('div', { text: t }); })));
      (dm.echecs || []).forEach(function (e) {
        bloc.appendChild(h('div.trx-echec', [h('span', { text: e.demandeId + ' · ' + (e.vehicule || '') + ' · ' + e.evenement + ' : ' + (e.erreur || 'échec') + ' (' + quand(e.le) + ')' }),
          d.peutRegler ? h('button.btn.petit', { type: 'button', text: 'Renvoyer', onclick: function (ev) { poster({ action: 'tractionRenvoyer', demandeId: e.demandeId }, ev.currentTarget).then(function (r) { AMX.toast(r.message || 'Renvoyé', 'ok'); charger(); }, function () {}); } }) : null]));
      });
      if (!d.peutRegler) { bloc.appendChild(h('p.doux.petit', { text: 'Réglages réservés au propriétaire.' })); return bloc; }
      /* À remettre à Traction */
      var zoneCle = h('div');
      var montrer = function (nouvelle, btn) {
        poster({ action: 'tractionCle', compagnie: x.code, nouvelle: !!nouvelle }, btn).then(function (r) {
          AMX.vider(zoneCle);
          var champ = h('input.saisie.mono', { type: 'text', readonly: 'readonly', value: r.cle });
          zoneCle.appendChild(h('div.trx-actions', [champ, h('button.btn.petit', { type: 'button', text: 'Copier la clé', onclick: function () { AMX.copier(r.cle, 'Clé copiée'); } }),
            h('span.doux.petit', { text: r.cree ? (nouvelle ? 'Nouvelle clé : l\'ancienne ne marche plus.' : 'Clé créée.') : '' })]));
          if (nouvelle) charger();
        }, function () {});
      };
      bloc.appendChild(h('div.trx-remettre', [
        h('b.petit', { text: 'À remettre à Traction (par un canal sûr)' }),
        h('div', [h('span.doux.petit', { text: 'Adresse : ' }), h('span.mono', { text: d.adresse || '—' }), ' ', h('button.btn.petit', { type: 'button', text: 'Copier', onclick: function () { AMX.copier(d.adresse || '', 'Adresse copiée'); } })]),
        h('div', [h('span.doux.petit', { text: 'Action : ' }), h('span.mono', { text: d.action || 'tractionEvaluation' }), h('span.doux.petit', { text: ' · instance « ' + (x.instance || '?') + ' », ' + (x.departementId ? 'département ' + x.departementId : 'tous les départements') })]),
        h('div.trx-actions', [
          h('button.btn.petit', { type: 'button', text: x.cleExiste ? 'Montrer la clé ScanAutomax' : 'Créer la clé ScanAutomax', onclick: function (ev) { montrer(false, ev.currentTarget); } }),
          x.cleExiste ? h('button.btn.petit.danger', { type: 'button', text: 'Nouvelle clé', onclick: function (ev) {
            var b = ev.currentTarget;
            AMX.confirmer('Faire une nouvelle clé ?', 'L\'ancienne clé ne marchera plus : Traction devra mettre la nouvelle avant sa prochaine demande.', { ok: 'Nouvelle clé', danger: true }).then(function (ok) { if (ok) montrer(true, b); });
          } }) : null
        ]),
        zoneCle
      ]));
      /* Ce que Traction nous donne */
      var inInstance = h('input.saisie', { type: 'text', value: x.instance || '', placeholder: 'stemarieautomobiles' });
      var inDep = h('input.saisie', { type: 'text', value: x.departementId || '', placeholder: '1' });
      var inUrl = h('input.saisie', { type: 'url', value: x.retourUrl || '', placeholder: 'https://… (donnée par Traction)' });
      var inCle = h('input.saisie', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: x.retourCleFin ? 'Clé de Traction …' + x.retourCleFin + ' (coller pour la remplacer)' : 'Coller la clé donnée par Traction' });
      var caseActif = h('input', { type: 'checkbox', checked: x.actif ? 'checked' : undefined });
      var champ = function (t, el) { return h('div.champ', [h('label', { text: t }), el]); };
      bloc.appendChild(h('div.trx-grille', [champ('Instance Traction', inInstance), champ('Département', inDep), champ('Adresse de retour (Traction)', inUrl), champ('Clé de Traction', inCle)]));
      var enregistrer = h('button.btn.primaire.petit', { type: 'button', text: 'Enregistrer', onclick: function (ev) {
        var cle = String(inCle.value || '').replace(/[\s ​-‍﻿]+/g, '').trim();
        if (/[•*]/.test(cle)) { AMX.toast('La clé collée contient des « • » ou « * » : c\'est une clé masquée.', 'erreur', 12000); return; }
        var corps2 = { action: 'tractionReglages', compagnie: x.code, instance: inInstance.value, departementId: inDep.value, retourUrl: String(inUrl.value || '').trim(), actif: caseActif.checked };
        if (cle) corps2.retourCle = cle;   /* « retourCle », pas « jeton » : AMX.post ajoute déjà le jeton de session */
        poster(corps2, ev.currentTarget).then(function (r) { inCle.value = ''; AMX.toast(r.message || 'Enregistré', 'ok'); if (r.etat) dessiner(r.etat); else charger(); }, function () {});
      } });
      var tester = h('button.btn.petit', { type: 'button', text: 'Essayer le retour', onclick: function (ev) {
        poster({ action: 'tractionTester', compagnie: x.code }, ev.currentTarget).then(function (r) { AMX.toast(r.message || 'Traction a répondu', 'ok', 9000); }, function () {});
      } });
      bloc.appendChild(h('div.trx-actions', [h('label.case', [caseActif, h('span', { text: ' Renvoyer les évaluations à Traction' })]), enregistrer, tester]));
      return bloc;
    };
    charger();
    return carte;
  }

  AMX.traction = { carteAdmin: carteAdmin };
})();
