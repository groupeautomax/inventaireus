/* =====================================================================================================
   campagnes-relance.js — Relance › Portefeuille clients › Campagnes · Liste du matin (sprint 6, 6 nov. 2026)

   Maxime : « Campagnes (sprint 6) ». Serveur : CampagnesRelance.gs.
   - Une campagne part d'une liste du portefeuille (segment, filtres) : bouton « Campagne avec cette liste ».
   - Le serveur refait toutes les vérifications (consentement LCAP, Loi 25 au Québec, STOP, offre prête, un véhicule par
     client, pas joint depuis 30 jours) et met 20 % des clients de côté (groupe témoin, toujours les mêmes clients).
   - Aperçu de dix messages et coût ; texto sans chiffres (le prix est sur la page de l'offre).
   - « Envoyer » : seulement avec le droit « Relance — envoyer des campagnes », en tapant ENVOYER. L'horloge envoie ensuite par
     lots, de 9 h à 20 h, sur le numéro de campagne de la concession.
   - Liste du matin : les rendez-vous du service avec une offre prête, à remettre de vive voix ; témoins marqués.
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h;

  var CSS = [
    '.crl-cartes { display: grid; gap: 10px; }',
    '.crl-carte { border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 12px 14px; cursor: pointer; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; text-align: left; width: 100%; font: inherit; color: inherit; }',
    '.crl-carte:hover { border-color: var(--vert-fonce); }',
    '.crl-carte b { font-size: 14px; } .crl-carte .s { font-size: 12.5px; color: var(--encre-3); grid-column: 1 / -1; }',
    '.crl-carte .chiffres { display: flex; gap: 14px; flex-wrap: wrap; grid-column: 1 / -1; font-size: 13px; }',
    '.crl-carte .chiffres span b { font-variant-numeric: tabular-nums; }',
    '.crl-etat { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 2px 9px; background: var(--fond-2); color: var(--encre-2); white-space: nowrap; align-self: start; }',
    '.crl-etat.prete { background: var(--bleu-bg, #E3EEFB); color: var(--bleu); } .crl-etat.planifiee, .crl-etat.encours { background: var(--ambre-bg); color: var(--ambre); }',
    '.crl-etat.terminee { background: var(--vert-clair); color: var(--vert-fonce); } .crl-etat.pause { background: var(--rouge-bg, #FDE2E2); color: var(--rouge); } .crl-etat.annulee { opacity: .7; }',
    '.crl-vide { padding: 22px; border: 1px dashed var(--ligne); border-radius: 12px; color: var(--encre-3); font-size: 14px; }',
    '.crl-vide p { margin: 0 0 10px; }',
    '.crl-h { font-weight: 700; font-size: 13px; margin: 14px 0 6px; }',
    '.crl-trois { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }',
    '.crl-trois > div { border: 1px solid var(--ligne); border-radius: 10px; padding: 8px 10px; } .crl-trois .t { font-size: 12px; color: var(--encre-3); font-weight: 600; } .crl-trois .v { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; } .crl-trois .x { font-size: 12px; color: var(--encre-3); }',
    '.crl-exclus { display: grid; gap: 3px; font-size: 13px; } .crl-exclus div { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--ligne); padding: 3px 0; } .crl-exclus b { font-variant-numeric: tabular-nums; }',
    '.crl-msg { border: 1px solid var(--ligne); border-radius: 12px 12px 12px 3px; background: var(--fond-2); padding: 8px 11px; font-size: 13px; margin: 0 0 6px; max-width: 620px; overflow-wrap: anywhere; }',
    '.crl-msg .m { font-size: 11.5px; color: var(--encre-3); margin-top: 3px; }',
    '.crl-cout { padding: 9px 12px; border-radius: 10px; background: var(--vert-clair); color: var(--vert-fonce); font-size: 13px; margin: 8px 0; }',
    '.crl-cout.alerte { background: var(--ambre-bg); color: var(--ambre); }',
    '.crl-regles { font-size: 12.5px; color: var(--encre-3); margin: 6px 0 0; line-height: 1.5; }',
    '.crl-texte { width: 100%; min-height: 88px; font: inherit; font-size: 13px; }',
    '.crl-champ { display: grid; gap: 4px; margin: 0 0 10px; } .crl-champ > span { font-size: 12px; font-weight: 600; color: var(--encre-3); }',
    '.crl-onglets { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0; }',
    '.crl-onglets button { border: 1px solid var(--ligne); background: var(--carte); border-radius: 999px; padding: 3px 11px; font-size: 12.5px; cursor: pointer; }',
    '.crl-onglets button.actif { background: var(--vert-fonce); border-color: var(--vert-fonce); color: #fff; }',
    '.crl-table { width: 100%; border-collapse: collapse; font-size: 13px; } .crl-table th { text-align: left; font-size: 12px; color: var(--encre-3); font-weight: 600; padding: 5px 6px; border-bottom: 1px solid var(--ligne); }',
    '.crl-table td { padding: 6px; border-bottom: 1px solid var(--ligne); vertical-align: top; } .crl-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '.crl-defile { overflow-x: auto; max-height: 360px; overflow-y: auto; }',
    '.crl-puce { display: inline-block; font-size: 11.5px; font-weight: 700; border-radius: 999px; padding: 1px 8px; background: var(--fond-2); color: var(--encre-2); white-space: nowrap; }',
    '.crl-puce.vert { background: var(--vert-clair); color: var(--vert-fonce); } .crl-puce.ambre { background: var(--ambre-bg); color: var(--ambre); } .crl-puce.rouge { background: var(--rouge-bg, #FDE2E2); color: var(--rouge); } .crl-puce.mauve { background: #EEE7FA; color: #5B3A99; }',
    '.crl-avis { padding: 9px 12px; border-radius: 10px; border-left: 4px solid var(--ambre); background: var(--ambre-bg); font-size: 13px; margin: 0 0 10px; }',
    '.crl-avis.bleu { border-left-color: var(--bleu); background: var(--bleu-bg, #E3EEFB); }',
    '.crl-journal { font-size: 12px; color: var(--encre-3); display: grid; gap: 2px; }',
    '.crl-matin-outils { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 10px; }',
    '.crl-matin-outils .saisie { width: auto; max-width: 180px; flex: 0 0 auto; }',
    '.crl-matin tr.temoin td { background: repeating-linear-gradient(135deg, transparent 0 6px, rgba(0,0,0,.025) 6px 12px); }',
    '@media (max-width: 640px) { .crl-carte { grid-template-columns: 1fr; } .crl-table th:nth-child(4), .crl-table td:nth-child(4) { display: none; } }'
  ].join('\n');
  function css() { if (!document.getElementById('css-campagnes-relance')) { var s = document.createElement('style'); s.id = 'css-campagnes-relance'; s.textContent = CSS; document.head.appendChild(s); } }

  function perms() { return (AMX.session && AMX.session.perms) || {}; }
  function peutVoir() { var p = perms(); return !!(p.consulter || p.ficheAchat || p.changerStatut || p.voirResultats || p.gererUtilisateurs); }
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c; }
  function argent(n) { return AMX.fmtArgent ? AMX.fmtArgent(n) : String(n); }
  /** Un petit coût garde ses cents (2 tranches ≈ 0,02 $ US). */
  function cout(n, devise) { n = Number(n) || 0; var t = n < 100 ? n.toFixed(2).replace('.', ',') : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return t + ' $' + (devise ? ' ' + devise : ''); }
  function nb(n) { return AMX.fmtNombre ? AMX.fmtNombre(n || 0) : String(n || 0); }
  function quand(iso) { return iso ? AMX.fmtDate(iso, true) : '—'; }
  function telJoli(n) { var s = String(n || '').replace(/[^\d]/g, ''); if (s.length === 11) s = s.slice(1); return s.length === 10 ? s.slice(0, 3) + ' ' + s.slice(3, 6) + '-' + s.slice(6) : s; }
  function verifier(r, cle) {
    if (r && r.refuse) throw new Error(r.erreur || 'Non autorisé.');
    if (!r || r.ok === false) throw new Error((r && r.erreur) || 'Réponse illisible.');
    if (cle && r[cle] === undefined) throw new Error('Le script n\'est pas à jour : déployez la version qui contient CampagnesRelance.gs.');
    return r;
  }

  /* --------------------------------------------------------------------------------------------- données */
  var cache = { par: {}, enCours: {} };
  function charger(cie, force) {
    var x = cache.par[cie];
    if (!force && x && Date.now() - x.le < AMX.dureeCopie(60000)) return Promise.resolve(x.rep);
    if (cache.enCours[cie] && !force) return cache.enCours[cie];
    cache.enCours[cie] = AMX.get({ campagnesRelance: '1', compagnie: cie }, { delai: 90000, secours: false }).then(function (d) {
      cache.enCours[cie] = null; verifier(d, 'campagnes');
      cache.par[cie] = { rep: d, le: Date.now() };
      return d;
    }, function (e) { cache.enCours[cie] = null; throw e; });
    return cache.enCours[cie];
  }
  function oublier(cie) { if (cie) delete cache.par[cie]; else cache.par = {}; }
  function detail(id) { return AMX.get({ campagneRelance: id }, { delai: 90000, secours: false }).then(function (d) { return verifier(d, 'campagne'); }); }

  /* --------------------------------------------------------------------------------------------- les textes */
  function regles(d) {
    var R = (d && d.reglages) || {};
    return 'Pas de chiffres, de $ ni de % (le prix total et le crédit sont sur la page de l\'offre). Champs : {prenom}, {modele} (son véhicule actuel), {concession}, {lien}. La mention STOP est ajoutée si elle manque. ' +
      'Au Québec, seuls les clients qui ont consenti aux offres personnalisées (Loi 25) sont joints ; ' + (R.temoinPct || 0) + ' % des clients sont mis de côté (groupe témoin) pour mesurer les ventes vraiment ajoutées.';
  }
  function champTexte(libelle, valeur, aide) {
    var t = h('textarea.saisie.crl-texte'); t.value = valeur || '';
    var info = h('span.doux.petit');
    function compter() {
      var n = t.value.replace(/\{lien\}/g, new Array(86).join('x')).replace(/\{prenom\}/g, 'Marie').replace(/\{modele\}/g, 'Equinox').replace(/\{concession\}/g, 'Concession').length;
      info.textContent = '≈ ' + n + ' caractères avec le lien' + (/[0-9$%]/.test(t.value.replace(/\{[a-z]+\}/g, '')) ? ' · retirez les chiffres, $ et %' : '');
    }
    t.addEventListener('input', compter); compter();
    return { el: h('label.crl-champ', [h('span', { text: libelle }), t, info, aide ? h('span.doux.petit', { text: aide }) : null]), t: t };
  }
  function boutonEinstein(cie, segment, langue, champ) {
    return h('button.btn.petit', { type: 'button', text: 'Proposer avec Einstein AI', onclick: function (e) {
      var b = e.currentTarget; b.disabled = true; b.textContent = 'Einstein AI rédige…';
      AMX.post({ action: 'relanceCampagneTexteIA', compagnie: cie, segment: segment || '', langue: langue }, { secours: false }).then(function (r) {
        verifier(r, 'texte'); champ.t.value = r.texte; champ.t.dispatchEvent(new Event('input'));
        AMX.toast('Proposition d\'Einstein AI : relisez-la avant de préparer.', 'ok');
      }).catch(function (x) { AMX.toast(AMX.erreurTexte(x), 'erreur'); }).then(function () { b.disabled = false; b.textContent = 'Proposer avec Einstein AI'; });
    } });
  }
  function choixRepondant(d, valeur) {
    var s = h('select.saisie'), moi = (AMX.session && AMX.session.courriel) || '';
    var liste = (d && d.repondants) || [];
    if (!liste.some(function (r) { return r.courriel === moi; }) && moi) s.appendChild(h('option', { value: moi, text: 'Moi (' + moi + ')' }));
    liste.forEach(function (r) { s.appendChild(h('option', { value: r.courriel, text: r.nom })); });
    s.value = valeur || moi;
    return s;
  }

  /* --------------------------------------------------------------------------------------------- préparer (depuis le portefeuille) */
  /** opts : { cie, cles, segment, filtres } — la liste filtrée du portefeuille. */
  function preparer(opts) {
    css();
    var cie = opts.cie, corps = h('div', [h('p', { text: 'Lecture des réglages…' })]);
    var m = AMX.modale({ titre: 'Nouvelle campagne — ' + nomCie(cie), corps: corps, large: true, boutons: [{ texte: 'Annuler' }] });
    charger(cie).then(function (d) {
      AMX.vider(corps);
      if (!d.droits || !d.droits.preparer) { corps.appendChild(h('p', { text: 'Préparer une campagne est réservé à la direction (ou aux personnes qui ont le droit « Relance — envoyer des campagnes »).' })); return; }
      corps.appendChild(h('div.crl-avis.bleu', { text: 'Liste choisie : ' + nb(opts.cles.length) + ' véhicule' + (opts.cles.length > 1 ? 's' : '') + (opts.segment ? ' · ' + opts.segment : '') + (opts.filtres ? ' · ' + opts.filtres : '') + '. Le serveur garde seulement les clients qu\'on a le droit de joindre ; rien ne part avant « Envoyer ».' }));
      var nom = h('input.saisie', { type: 'text', value: (opts.segment || 'Campagne') + ' — ' + new Date().toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' }) });
      corps.appendChild(h('label.crl-champ', [h('span', { text: 'Nom de la campagne' }), nom]));
      var rep = choixRepondant(d, '');
      corps.appendChild(h('label.crl-champ', [h('span', { text: 'Personne qui répond aux clients' }), rep, h('span.doux.petit', { text: 'Les réponses par texto lui sont confiées (Service › Texto) ; son nom paraît sur la page de l\'offre.' })]));
      var mot = h('textarea.saisie.crl-texte', { rows: 2 }); mot.style.minHeight = '54px';
      corps.appendChild(h('label.crl-champ', [h('span', { text: 'Mot sur la page de l\'offre (facultatif)' }), mot]));
      var fr = champTexte('Texto en français', (d.textesDefaut || {}).fr), en = champTexte('Texto en anglais (clients qui l\'ont demandé)', (d.textesDefaut || {}).en);
      corps.appendChild(fr.el); corps.appendChild(h('div', { style: { margin: '-4px 0 10px' } }, [boutonEinstein(cie, opts.segment, 'fr', fr)]));
      corps.appendChild(en.el); corps.appendChild(h('div', { style: { margin: '-4px 0 10px' } }, [boutonEinstein(cie, opts.segment, 'en', en)]));
      corps.appendChild(h('p.crl-regles', { text: regles(d) }));
      m.boutons([{ texte: 'Annuler' }, { texte: 'Préparer la campagne', classe: 'primaire', action: function (fermer, btn) {
        btn.disabled = true; btn.textContent = 'Vérification de la liste…';
        return AMX.post({ action: 'relanceCampagnePreparer', compagnie: cie, nom: nom.value.trim(), segment: opts.segment || '', filtres: opts.filtres || '', cles: opts.cles, texteFr: fr.t.value, texteEn: en.t.value, messagePage: mot.value.trim(), repondant: rep.value }, { secours: false, delai: 180000 }).then(function (r) {
          verifier(r, 'campagne'); oublier(cie); fermer();
          ouvrirDetail(r.campagne.id, r);
          try { document.dispatchEvent(new CustomEvent('amx:campagnesRelance', { detail: { compagnie: cie } })); } catch (e) {}
        }).catch(function (x) { btn.disabled = false; btn.textContent = 'Préparer la campagne'; AMX.toast(AMX.erreurTexte(x), 'erreur'); return false; });
      } }]);
    }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('p', { text: AMX.erreurTexte(e) })); });
    return m;
  }

  /* --------------------------------------------------------------------------------------------- la fiche d'une campagne */
  function puceEtat(c) { return h('span.crl-etat.' + c.etat, { text: c.etatLibelle || c.etat }); }
  function trois(c) {
    return h('div.crl-trois', [
      h('div', [h('div.t', { text: 'À joindre' }), h('div.v', { text: nb(c.n.envoi) }), h('div.x', { text: 'reçoivent un texto et leur page' })]),
      h('div', [h('div.t', { text: 'Groupe témoin (' + c.temoinPct + ' %)' }), h('div.v', { text: nb(c.n.temoin) }), h('div.x', { text: 'rien n\'est envoyé : pour mesurer' })]),
      h('div', [h('div.t', { text: 'Exclus' }), h('div.v', { text: nb(c.n.exclus) }), h('div.x', { text: 'consentement, STOP, pas d\'offre…' })])
    ]);
  }
  function suivi(c) {
    var s = c.suivi; if (!s) return null;
    var st = c.statuts || {};
    var lignes = [['Textos envoyés', st.envoye], ['Échecs', st.echec], ['Sautés à l\'envoi (STOP, plus d\'offre, plus au client)', (st.stop || 0) + (st.sansOffre || 0) + (st.plusAuClient || 0)], ['À envoyer', st.attente],
      ['Pages ouvertes', s.vues + ' sur ' + s.pages], ['Veulent faire évaluer', s.reponses.evaluer], ['Veulent un essai routier', s.reponses.essai], ['Demandent un rappel', s.reponses.rappel], ['Ne veulent plus recevoir (page)', s.refus], ['STOP par texto', s.stop]];
    return h('div', [h('div.crl-h', { text: 'Suivi' }), h('div.crl-exclus', lignes.map(function (l) { return h('div', [h('span', { text: l[0] }), h('b', { text: String(l[1] === undefined ? 0 : l[1]) })]); })),
      h('p.crl-regles', { text: 'Les ventes du groupe joint et du groupe témoin se comparent dans le tableau de bord (prochaine étape) : c\'est l\'écart entre les deux qui dit ce que la campagne a vraiment rapporté.' })]);
  }
  function apercu(a) {
    if (!a) return null;
    var c = a.cout || {}, alerte = !c.gsm || (c.segmentsMax || 0) > 2;
    return h('div', [
      h('div.crl-h', { text: 'Aperçu (dix messages)' }),
      a.messages.length ? h('div', a.messages.map(function (mm) { return h('div.crl-msg', [h('div', { text: mm.texte }), h('div.m', { text: mm.nom + ' · ' + (mm.langue === 'en' ? 'anglais' : 'français') + ' · ' + mm.caracteres + ' caractères · ' + mm.segments + ' tranche' + (mm.segments > 1 ? 's' : '') })]); })) : h('p.doux', { text: 'Personne à joindre.' }),
      h('div.crl-cout' + (alerte ? '.alerte' : ''), { text: nb(c.textos) + ' texto' + (c.textos > 1 ? 's' : '') + ' · ' + nb(c.segments) + ' tranches facturées · environ ' + cout(c.usd, 'US') + ' (' + cout(c.cad) + ')' +
        (!c.gsm ? ' · caractères hors de l\'alphabet des textos (' + (c.horsGsm || []).join(' ') + ') : chaque tranche ne prend que 70 caractères, remplacez-les pour payer moins.' : '') }) ]);
  }
  function destinataires(rep) {
    var liste = rep.destinataires || [], vue = 'envoi', zone = h('div');
    var nbs = { envoi: 0, temoin: 0, exclu: 0 }; liste.forEach(function (d) { nbs[d.groupe] = (nbs[d.groupe] || 0) + 1; });
    var onglets = h('div.crl-onglets');
    function dessiner() {
      AMX.vider(onglets); AMX.vider(zone);
      [['envoi', 'À joindre'], ['temoin', 'Groupe témoin'], ['exclu', 'Exclus']].forEach(function (o) { onglets.appendChild(h('button' + (vue === o[0] ? '.actif' : ''), { type: 'button', text: o[1] + ' (' + nb(nbs[o[0]] || 0) + ')', onclick: function () { vue = o[0]; dessiner(); } })); });
      var l = liste.filter(function (d) { return d.groupe === vue; });
      if (!l.length) { zone.appendChild(h('p.doux', { text: 'Personne.' })); return; }
      zone.appendChild(h('div.crl-defile', [h('table.crl-table', [
        h('thead', [h('tr', ['Client', 'Véhicule', vue === 'exclu' ? 'Raison' : 'État', 'Page'].map(function (t) { return h('th', { text: t }); }))]),
        h('tbody', l.slice(0, 600).map(function (d) {
          var etat = vue === 'exclu' ? d.raisonLibelle : (vue === 'temoin' ? 'Témoin — rien d\'envoyé' : (d.statutLibelle || '—'));
          var ton = d.stop ? 'rouge' : (d.statut === 'envoye' ? 'vert' : (d.statut === 'echec' ? 'rouge' : (vue === 'temoin' ? 'mauve' : '')));
          return h('tr', [h('td', { text: d.nom || '—' }), h('td', { text: d.modele || '—' }), h('td', [h('span.crl-puce' + (ton ? '.' + ton : ''), { text: d.stop ? 'STOP après l\'envoi' : etat })].concat(d.erreur ? [h('div.doux.petit', { text: d.erreur })] : [])),
            h('td', { text: d.pageId ? d.pageId + (d.vues ? ' · vue' : '') + (d.reponse ? ' · ' + d.reponse : '') : '' })]);
        }))
      ])]));
      if (l.length > 600) zone.appendChild(h('p.doux.petit', { text: '600 premiers sur ' + nb(l.length) + '.' }));
    }
    dessiner();
    return h('div', [h('div.crl-h', { text: 'Clients' }), onglets, zone]);
  }
  /** La fiche d'une campagne : audience, textes (modifiables avant l'envoi), aperçu et coût, suivi, clients, envoi. */
  function ouvrirDetail(id, repDeja) {
    css();
    var corps = h('div', [h('p', { text: 'Lecture de la campagne…' })]);
    var m = AMX.modale({ titre: 'Campagne ' + id, corps: corps, large: true, proteger: false, boutons: [{ texte: 'Fermer' }] });
    function dessiner(rep) {
      var c = rep.campagne, R = rep.reglages || {};
      AMX.vider(corps);
      corps.appendChild(h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } }, [h('b', { text: c.nom }), puceEtat(c), h('span.doux.petit', { text: nomCie(c.compagnie) + (c.segment ? ' · ' + c.segment : '') + ' · préparée le ' + quand(c.prepareLe) + ' par ' + (c.creeParNom || '—') })]));
      if (c.filtres) corps.appendChild(h('p.doux.petit', { text: 'Filtres : ' + c.filtres }));
      if (c.etat === 'pause') corps.appendChild(h('div.crl-avis', { text: c.pauseRaison || 'En pause.' }));
      if (c.etat === 'planifiee' || c.etat === 'encours') corps.appendChild(h('div.crl-avis.bleu', { text: 'Autorisée par ' + (c.envoyeParNom || '—') + ' — départ ' + quand(c.planifieLe) + ' sur le ' + telJoli(c.numero) + ' ; lots de ' + (R.lot || 15) + ' à la minute, de ' + (R.heureDebut || 9) + ' h à ' + (R.heureFin || 20) + ' h' + (R.dimanche ? '' : ', du lundi au samedi') + '.' }));
      if (c.etat === 'annulee') corps.appendChild(h('div.crl-avis', { text: 'Annulée le ' + quand(c.annuleLe) + (c.annuleRaison ? ' — ' + c.annuleRaison : '') + '.' }));
      corps.appendChild(trois(c));
      if (c.exclus.length) corps.appendChild(h('div', [h('div.crl-h', { text: 'Pourquoi des clients sont exclus' }), h('div.crl-exclus', c.exclus.map(function (x) { return h('div', [h('span', { text: x.libelle }), h('b', { text: nb(x.n) })]); }))]));
      var sv = suivi(c); if (sv) corps.appendChild(sv);
      /* textes */
      var fr = champTexte('Texto en français', c.texteFr), en = champTexte('Texto en anglais', c.texteEn), mot = h('textarea.saisie.crl-texte', { rows: 2 }), rep2 = choixRepondant(rep, c.repondant), nomC = h('input.saisie', { type: 'text', value: c.nom });
      mot.value = c.messagePage || ''; mot.style.minHeight = '54px';
      if (c.peutModifier) {
        corps.appendChild(h('div.crl-h', { text: 'Textes (modifiables jusqu\'à l\'envoi)' }));
        corps.appendChild(h('label.crl-champ', [h('span', { text: 'Nom' }), nomC]));
        corps.appendChild(h('label.crl-champ', [h('span', { text: 'Personne qui répond aux clients' }), rep2]));
        corps.appendChild(fr.el); corps.appendChild(h('div', { style: { margin: '-4px 0 10px' } }, [boutonEinstein(c.compagnie, c.segment, 'fr', fr)]));
        corps.appendChild(en.el);
        corps.appendChild(h('label.crl-champ', [h('span', { text: 'Mot sur la page de l\'offre' }), mot]));
        corps.appendChild(h('p.crl-regles', { text: regles(rep) }));
      } else {
        corps.appendChild(h('div.crl-h', { text: 'Texte envoyé' }));
        corps.appendChild(h('div.crl-msg', { text: c.texteFr })); if (c.texteEn) corps.appendChild(h('div.crl-msg', { text: c.texteEn }));
        corps.appendChild(h('p.doux.petit', { text: 'Personne qui répond : ' + (c.repondantNom || '—') }));
      }
      corps.appendChild(apercu(rep.apercu));
      corps.appendChild(destinataires(rep));
      if ((c.journal || []).length) corps.appendChild(h('div', [h('div.crl-h', { text: 'Journal' }), h('div.crl-journal', c.journal.slice().reverse().map(function (j) { return h('div', { text: quand(j.le) + ' — ' + j.quoi + (j.qui ? ' (' + j.qui + ')' : '') }); }))]));
      /* boutons */
      var b = [{ texte: 'Fermer' }];
      if (c.peutAnnuler) b.push({ texte: 'Annuler la campagne', classe: 'danger', action: function () { annuler(c, recharger); return false; } });
      if (c.peutModifier) b.push({ texte: 'Enregistrer les textes', action: function (f, btn) {
        btn.disabled = true;
        return AMX.post({ action: 'relanceCampagneModifier', id: c.id, nom: nomC.value.trim(), texteFr: fr.t.value, texteEn: en.t.value, messagePage: mot.value.trim(), repondant: rep2.value }, { secours: false }).then(function (r) { verifier(r, 'campagne'); dessiner(r); AMX.toast('Textes enregistrés.', 'ok'); return false; })
          .catch(function (x) { btn.disabled = false; AMX.toast(AMX.erreurTexte(x), 'erreur'); return false; });
      } });
      if (c.peutModifier || c.peutEnvoyer) b.push({ texte: 'Essai à mon cellulaire', action: function (f, btn) {
        btn.disabled = true;
        return AMX.post({ action: 'relanceCampagneEssai', id: c.id }, { secours: false }).then(function (r) { verifier(r); AMX.toast(r.message || 'Essai envoyé.', 'ok'); }).catch(function (x) { AMX.toast(AMX.erreurTexte(x), 'erreur'); }).then(function () { btn.disabled = false; return false; });
      } });
      if (c.peutEnvoyer) b.push({ texte: c.etat === 'pause' ? 'Relancer l\'envoi…' : 'Envoyer…', classe: 'primaire', action: function () { envoyer(rep, recharger); return false; } });
      m.boutons(b);
    }
    function recharger(rep) { if (rep && rep.campagne && rep.apercu) { dessiner(rep); return; } detail(id).then(dessiner).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }); }
    if (repDeja && repDeja.campagne && repDeja.apercu) dessiner(repDeja); else recharger();
    return m;
  }
  function envoyer(rep, apres) {
    var c = rep.campagne, R = rep.reglages || {}, numero = (R.numeros || {})[c.compagnie], a = rep.apercu || {}, co = a.cout || {};
    var corps = h('div');
    if (!numero) {
      corps.appendChild(h('div.crl-avis', { text: 'Aucun numéro d\'envoi des campagnes pour ' + nomCie(c.compagnie) + '. Le propriétaire le règle dans Campagnes › Réglages : un numéro Infobip à part de celui des conversations du service (environ 1 $ US par mois), pour que les textos du service ne soient pas filtrés.' }));
      AMX.modale({ titre: 'Envoyer — ' + c.nom, corps: corps, boutons: [{ texte: 'Fermer' }] });
      return;
    }
    var phrase = (c.n.envoi > 1 ? nb(c.n.envoi) + ' clients recevront' : '1 client recevra') + ' un texto du ' + telJoli(numero) + ' avec le lien de ' + (c.n.envoi > 1 ? 'leur' : 'sa') + ' page d\'offre (' + nb(co.segments) + ' tranches, environ ' + cout(co.usd, 'US') + '). ' +
      (c.n.temoin ? (c.n.temoin > 1 ? nb(c.n.temoin) + ' clients du groupe témoin ne recevront rien.' : '1 client du groupe témoin ne recevra rien.') : 'Aucun client du groupe témoin dans cette liste.');
    corps.appendChild(h('p', { text: phrase }));
    var mode = h('select.saisie', [h('option', { value: 'maintenant', text: 'Maintenant (dans les heures d\'envoi)' }), h('option', { value: 'plusTard', text: 'Plus tard…' })]);
    var dt = h('input.saisie', { type: 'datetime-local' }); dt.style.display = 'none';
    var dans1h = new Date(Date.now() + 3600e3); dt.value = new Date(dans1h.getTime() - dans1h.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    mode.addEventListener('change', function () { dt.style.display = mode.value === 'plusTard' ? '' : 'none'; });
    corps.appendChild(h('label.crl-champ', [h('span', { text: 'Départ' }), mode, dt, h('span.doux.petit', { text: 'Les textos partent par lots de ' + (R.lot || 15) + ' à la minute, de ' + (R.heureDebut || 9) + ' h à ' + (R.heureFin || 20) + ' h' + (R.dimanche ? '' : ', du lundi au samedi') + '. Juste avant chaque texto, ScanAutomax revérifie le STOP, le refus et l\'offre.' })]));
    var champ = h('input.saisie', { type: 'text', placeholder: 'ENVOYER', autocomplete: 'off', spellcheck: 'false' });
    corps.appendChild(h('label.crl-champ', [h('span', { text: 'Tapez ENVOYER pour confirmer' }), champ]));
    AMX.modale({ titre: 'Envoyer — ' + c.nom, corps: corps, boutons: [{ texte: 'Annuler' }, { texte: 'Autoriser l\'envoi', classe: 'primaire', action: function (fermer, btn) {
      if (champ.value.trim().toUpperCase() !== 'ENVOYER') { champ.style.borderColor = 'var(--rouge)'; champ.focus(); return false; }
      var debut = mode.value === 'plusTard' && dt.value ? new Date(dt.value).toISOString() : '';
      btn.disabled = true;
      return AMX.post({ action: 'relanceCampagneEnvoyer', id: c.id, confirmation: 'ENVOYER', debutLe: debut }, { secours: false }).then(function (r) {
        verifier(r, 'campagne'); fermer(); oublier(c.compagnie); AMX.toast(r.message || 'Envoi autorisé.', 'ok'); apres();
        try { document.dispatchEvent(new CustomEvent('amx:campagnesRelance', { detail: { compagnie: c.compagnie } })); } catch (e) {}
      }).catch(function (x) { btn.disabled = false; AMX.toast(AMX.erreurTexte(x), 'erreur'); return false; });
    } }] });
  }
  function annuler(c, apres) {
    var raison = h('input.saisie', { type: 'text', placeholder: 'Raison (facultatif)' });
    AMX.modale({ titre: 'Annuler — ' + c.nom, corps: h('div', [h('p', { text: 'Les textos qui ne sont pas encore partis ne partiront pas. Ceux déjà envoyés restent envoyés.' }), raison]), boutons: [{ texte: 'Garder la campagne' }, { texte: 'Annuler la campagne', classe: 'danger', action: function (fermer, btn) {
      btn.disabled = true;
      return AMX.post({ action: 'relanceCampagneAnnuler', id: c.id, raison: raison.value.trim() }, { secours: false }).then(function (r) { verifier(r, 'campagne'); fermer(); oublier(c.compagnie); AMX.toast('Campagne annulée.', 'ok'); apres(r);
        try { document.dispatchEvent(new CustomEvent('amx:campagnesRelance', { detail: { compagnie: c.compagnie } })); } catch (e) {} })
        .catch(function (x) { btn.disabled = false; AMX.toast(AMX.erreurTexte(x), 'erreur'); return false; });
    } }] });
  }

  /* --------------------------------------------------------------------------------------------- réglages (propriétaire) */
  function reglages(d, cie, apres) {
    var R = d.reglages || {}, corps = h('div'), champs = {};
    corps.appendChild(h('p.doux', { text: 'Un numéro Infobip par concession, réservé aux campagnes (à part du numéro des conversations du service' + (R.numeroService ? ', ' + telJoli(R.numeroService) : '') + '), pour que le service ne soit jamais filtré par les opérateurs.' }));
    (AMX.codesPour ? AMX.codesPour('inventaire') : [cie]).forEach(function (c) {
      champs[c] = h('input.saisie', { type: 'tel', placeholder: '514 555-0000', value: R.numeros && R.numeros[c] ? telJoli(R.numeros[c]) : '' });
      corps.appendChild(h('label.crl-champ', [h('span', { text: 'Numéro de campagne — ' + nomCie(c) }), champs[c]]));
    });
    var pct = h('input.saisie', { type: 'number', min: 0, max: 50, value: R.temoinPct });
    var delai = h('input.saisie', { type: 'number', min: 7, max: 120, value: R.delaiJours });
    var lot = h('input.saisie', { type: 'number', min: 5, max: 30, value: R.lot });
    var hd = h('input.saisie', { type: 'number', min: 8, max: 12, value: R.heureDebut }), hf = h('input.saisie', { type: 'number', min: 17, max: 21, value: R.heureFin });
    var dim = h('input', { type: 'checkbox', checked: !!R.dimanche }), cout = h('input.saisie', { type: 'number', step: '0.0005', min: 0, value: R.coutSegmentUsd });
    corps.appendChild(h('label.crl-champ', [h('span', { text: 'Groupe témoin (% des clients mis de côté)' }), pct, h('span.doux.petit', { text: 'Toujours les mêmes clients d\'une campagne à l\'autre. Le changer après un premier envoi brouille la mesure.' })]));
    corps.appendChild(h('label.crl-champ', [h('span', { text: 'Ne pas joindre de nouveau avant (jours)' }), delai]));
    corps.appendChild(h('label.crl-champ', [h('span', { text: 'Textos par minute' }), lot]));
    corps.appendChild(h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, [h('label.crl-champ', [h('span', { text: 'Heure de début' }), hd]), h('label.crl-champ', [h('span', { text: 'Heure de fin' }), hf]), h('label.crl-champ', [h('span', { text: 'Coût d\'une tranche ($ US)' }), cout])]));
    corps.appendChild(h('label.case', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [dim, h('span', { text: 'Envoyer aussi le dimanche' })]));
    AMX.modale({ titre: 'Réglages des campagnes', corps: corps, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function (fermer, btn) {
      var numeros = {}; Object.keys(champs).forEach(function (c) { numeros[c] = champs[c].value.trim(); });
      btn.disabled = true;
      return AMX.post({ action: 'relanceCampagnesReglages', reglages: { numeros: numeros, temoinPct: pct.value, delaiJours: delai.value, lot: lot.value, heureDebut: hd.value, heureFin: hf.value, dimanche: dim.checked, coutSegmentUsd: cout.value } }, { secours: false }).then(function (r) {
        verifier(r, 'reglages'); fermer(); oublier(); (r.avertissements || []).forEach(function (t) { AMX.toast(t, 'attention', 9000); }); AMX.toast('Réglages enregistrés.', 'ok'); apres();
      }).catch(function (x) { btn.disabled = false; AMX.toast(AMX.erreurTexte(x), 'erreur'); return false; });
    } }] });
  }

  /* --------------------------------------------------------------------------------------------- vue « Campagnes » */
  function VueCampagnes(conteneur, ctx) {
    css();
    var self = this; this.detruit = false; this.conteneur = conteneur;
    var codes = AMX.codesPour ? AMX.codesPour('inventaire') : [];
    this.cie = (AMX.compagnieChoisie && AMX.compagnieChoisie('inventaire')) || codes[0] || 'STM';
    AMX.vider(conteneur);
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    this.btnReglages = h('button.btn', { type: 'button', text: 'Réglages', onclick: function () { if (self.rep) reglages(self.rep, self.cie, function () { self.charger(true); }); } });
    this.btnNouvelle = h('button.btn.primaire', { type: 'button', text: 'Nouvelle campagne', onclick: function () { AMX.aller('portefeuille', 'clients', {}); AMX.toast('Choisissez un segment ou des filtres, puis « Campagne avec cette liste ».', 'info', 7000); } });
    this.elSous = h('p', { text: 'Chargement…' });
    conteneur.appendChild(h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', 'Campagnes'), this.elSous]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnReglages, this.btnNouvelle], [this.btnNouvelle]))]));
    this.elCies = h('div.barre-cies'); conteneur.appendChild(this.elCies);
    this.elAvis = h('div'); conteneur.appendChild(this.elAvis);
    this.elListe = h('div.crl-cartes'); conteneur.appendChild(this.elListe);
    this.surCie = function () { var c = AMX.compagnieChoisie('inventaire'); if (c && c !== self.cie && !self.detruit) { self.cie = c; self.charger(); } };
    document.addEventListener('amx:compagnie', this.surCie);
    this.surMaj = function () { if (!self.detruit) self.charger(true); };
    document.addEventListener('amx:campagnesRelance', this.surMaj);
    this.charger();
  }
  VueCampagnes.prototype.demonter = function () { this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); document.removeEventListener('amx:campagnesRelance', this.surMaj); };
  VueCampagnes.prototype.naviguer = function (ctx) { var p = (ctx && ctx.params) || {}; if (p.id) ouvrirDetail(p.id); };
  VueCampagnes.prototype.charger = function (force) {
    var self = this, cie = this.cie;
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: cie, sansToutes: true, onchange: function (c) { if (c && c !== self.cie) { self.cie = c; self.charger(); } } });
    return charger(cie, force).then(function (d) { if (self.detruit || cie !== self.cie) return; self.rep = d; self.rendre(); }, function (e) {
      if (self.detruit) return; self.elSous.textContent = 'Lecture impossible : ' + AMX.erreurTexte(e);
    });
  };
  VueCampagnes.prototype.rendre = function () {
    var self = this, d = this.rep, R = d.reglages || {}, droits = d.droits || {};
    this.btnReglages.style.display = droits.regler ? '' : 'none';
    this.btnNouvelle.style.display = droits.preparer ? '' : 'none';
    var envoyees = d.campagnes.filter(function (c) { return c.etat === 'terminee' || c.etat === 'encours'; }).length;
    this.elSous.textContent = nb(d.campagnes.length) + ' campagne' + (d.campagnes.length > 1 ? 's' : '') + ' · ' + nb(envoyees) + ' envoyée' + (envoyees > 1 ? 's' : '') + ' · groupe témoin ' + R.temoinPct + ' % · ' + (R.numeros && R.numeros[this.cie] ? 'numéro de campagne ' + telJoli(R.numeros[this.cie]) : 'pas de numéro de campagne');
    AMX.vider(this.elAvis);
    if (!(R.numeros && R.numeros[this.cie])) this.elAvis.appendChild(h('div.crl-avis', { text: 'Aucun numéro de campagne pour ' + nomCie(this.cie) + ' : on peut préparer et vérifier une campagne, mais elle ne peut pas partir. ' + (droits.regler ? 'Réglez-le dans Réglages (un numéro Infobip à part du service).' : 'Le propriétaire le règle.') }));
    if (!R.infobip) this.elAvis.appendChild(h('div.crl-avis', { text: 'Les textos Infobip ne sont pas configurés (Admin).' }));
    if (!droits.envoyer && droits.preparer) this.elAvis.appendChild(h('div.crl-avis.bleu', { text: 'Vous pouvez préparer et vérifier les campagnes ; l\'envoi est réservé aux personnes qui ont le droit « Relance — envoyer des campagnes ».' }));
    AMX.vider(this.elListe);
    if (!d.campagnes.length) {
      this.elListe.appendChild(h('div.crl-vide', [h('p', { text: 'Aucune campagne pour ' + nomCie(this.cie) + '.' }), h('p', { text: 'Une campagne part d\'une liste du portefeuille : choisissez un segment (fin de location, équité positive, paiement semblable…) ou des filtres, puis cliquez « Campagne avec cette liste ». Rien ne part avant qu\'une personne qui en a le droit clique « Envoyer ».' }),
        droits.preparer ? h('button.btn.primaire', { type: 'button', text: 'Ouvrir le portefeuille', onclick: function () { AMX.aller('portefeuille', 'clients', {}); } }) : null]));
      return;
    }
    d.campagnes.forEach(function (c) {
      var st = c.statuts || {}, s = c.suivi;
      var chiffres = [['À joindre', c.n.envoi], ['Témoin', c.n.temoin], ['Exclus', c.n.exclus]];
      if (c.etat === 'encours' || c.etat === 'terminee' || c.etat === 'pause') chiffres = chiffres.concat([['Envoyés', st.envoye], ['Échecs', st.echec]]);
      if (s) chiffres = chiffres.concat([['Pages ouvertes', s.vues], ['Réponses', s.reponses.evaluer + s.reponses.essai + s.reponses.rappel], ['STOP', s.stop]]);
      self.elListe.appendChild(h('button.crl-carte', { type: 'button', onclick: function () { ouvrirDetail(c.id); } }, [
        h('b', { text: c.nom }), puceEtat(c),
        h('div.s', { text: c.id + (c.segment ? ' · ' + c.segment : '') + ' · préparée le ' + quand(c.prepareLe) + ' par ' + (c.creeParNom || '—') + (c.envoyeParNom ? ' · autorisée par ' + c.envoyeParNom : '') + (c.termineLe ? ' · envoyée le ' + quand(c.termineLe) : '') }),
        h('div.chiffres', chiffres.map(function (x) { return h('span', [h('span.doux', { text: x[0] + ' ' }), h('b', { text: nb(x[1]) })]); }))
      ]));
    });
  };

  /* --------------------------------------------------------------------------------------------- vue « Liste du matin » */
  function ajdLocal() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function VueMatin(conteneur, ctx) {
    css();
    var self = this; this.detruit = false; this.voir = 'offre';
    var codes = AMX.codesPour ? AMX.codesPour('inventaire') : [];
    this.cie = (AMX.compagnieChoisie && AMX.compagnieChoisie('inventaire')) || codes[0] || 'STM';
    this.date = ajdLocal();
    AMX.vider(conteneur);
    this.btnImprimer = h('button.btn', { type: 'button', text: 'Imprimer', onclick: function () { self.imprimer(); } });
    this.elSous = h('p', { text: 'Chargement…' });
    conteneur.appendChild(h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', 'Liste du matin'), this.elSous]), h('div.actions', [this.btnImprimer])]));
    this.elCies = h('div.barre-cies'); conteneur.appendChild(this.elCies);
    this.inDate = h('input.saisie', { type: 'date', value: this.date });
    this.inDate.addEventListener('change', function () { if (self.inDate.value) { self.date = self.inDate.value; self.charger(); } });
    this.elVoir = h('div.crl-onglets');
    conteneur.appendChild(h('div.crl-matin-outils', [h('span.doux.petit', { text: 'Jour' }), this.inDate, this.elVoir]));
    conteneur.appendChild(h('p.crl-regles', { text: 'Les rendez-vous du service dont le véhicule a une offre prête. Le conseiller la présente de vive voix (rien n\'est envoyé). Les clients du groupe témoin sont marqués : ne pas leur présenter d\'offre, pour que la mesure reste juste.' }));
    this.elListe = h('div'); conteneur.appendChild(this.elListe);
    this.surCie = function () { var c = AMX.compagnieChoisie('inventaire'); if (c && c !== self.cie && !self.detruit) { self.cie = c; self.charger(); } };
    document.addEventListener('amx:compagnie', this.surCie);
    this.charger();
  }
  VueMatin.prototype.demonter = function () { this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); };
  VueMatin.prototype.naviguer = function () {};
  VueMatin.prototype.charger = function () {
    var self = this, cie = this.cie, date = this.date;
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: cie, sansToutes: true, onchange: function (c) { if (c && c !== self.cie) { self.cie = c; self.charger(); } } });
    this.elSous.textContent = 'Lecture des rendez-vous…';
    AMX.get({ listeMatin: '1', compagnie: cie, date: date }, { delai: 120000, secours: false }).then(function (d) {
      if (self.detruit || cie !== self.cie || date !== self.date) return;
      verifier(d, 'items'); self.rep = d; self.rendre();
    }).catch(function (e) { if (!self.detruit) { self.elSous.textContent = 'Lecture impossible : ' + AMX.erreurTexte(e); AMX.vider(self.elListe); } });
  };
  VueMatin.prototype.filtres = function () {
    var v = this.voir, l = (this.rep && this.rep.items) || [];
    return l.filter(function (i) { return v === 'tous' ? true : (v === 'temoin' ? i.temoin && i.offre : (i.offre && !i.temoin && !i.refus)); });
  };
  VueMatin.prototype.rendre = function () {
    var self = this, d = this.rep, l = d.items;
    this.elSous.textContent = nomCie(d.compagnie) + ' · ' + new Date(d.date + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + nb(d.n) + ' rendez-vous · ' + nb(d.avecOffre) + ' avec une offre à présenter';
    AMX.vider(this.elVoir);
    var nTem = l.filter(function (i) { return i.temoin && i.offre; }).length;
    [['offre', 'Offre à présenter', d.avecOffre], ['temoin', 'Groupe témoin', nTem], ['tous', 'Tous les rendez-vous', d.n]].forEach(function (o) {
      self.elVoir.appendChild(h('button' + (self.voir === o[0] ? '.actif' : ''), { type: 'button', text: o[1] + ' (' + nb(o[2]) + ')', onclick: function () { self.voir = o[0]; self.rendre(); } }));
    });
    AMX.vider(this.elListe);
    var f = this.filtres();
    if (!f.length) { this.elListe.appendChild(h('div.crl-vide', { text: this.voir === 'offre' ? 'Aucune offre prête parmi les rendez-vous de ce jour.' : 'Aucun rendez-vous.' })); return; }
    this.elListe.appendChild(h('div.crl-defile', { style: { maxHeight: 'none' } }, [h('table.crl-table.crl-matin', [
      h('thead', [h('tr', ['Heure', 'Client', 'Véhicule au service', 'Conseiller', 'Offre', ''].map(function (t) { return h('th', { text: t }); }))]),
      h('tbody', f.map(function (i) {
        var off = i.offre ? h('div', [h('div', { text: i.offre.vehicule }), h('div.doux.petit', { text: (i.offre.type === 'location' ? 'Location' : 'Financement') + ' ' + argent(i.offre.paiement) + ' / mois avec l\'échange' + (i.offre.ecart !== null && i.offre.ecart !== undefined ? ' (' + (i.offre.ecart > 0 ? '+' : '') + argent(i.offre.ecart) + ')' : '') + (i.offre.n > 1 ? ' · ' + i.offre.n + ' offres' : '') })]) : h('span.doux', { text: i.dansPortefeuille ? 'Aucune offre prête' : 'Pas dans le portefeuille' });
        var etat = i.temoin && i.offre ? h('span.crl-puce.mauve', { text: 'Groupe témoin : ne pas présenter' }) : (i.refus ? h('span.crl-puce.rouge', { text: 'A refusé les offres' }) : (i.page ? h('span.crl-puce.vert', { text: 'Page ' + i.page.id + (i.page.vues ? ' · vue' : '') }) : null));
        var ouvrir = i.cle && i.vin ? h('button.btn.petit', { type: 'button', text: 'Ouvrir la fiche', onclick: function () { AMX.aller('portefeuille', 'clients', { q: i.vin }); } }) : null;
        return h('tr' + (i.temoin ? '.temoin' : ''), [h('td', { text: i.heure || '' }), h('td', { text: i.client || '' }), h('td', { text: i.vehicule || '' }), h('td', { text: i.conseiller || '' }), h('td', [off, etat ? h('div', { style: { marginTop: '3px' } }, [etat]) : null]), h('td', [ouvrir])]);
      }))
    ])]));
  };
  VueMatin.prototype.imprimer = function () {
    var d = this.rep; if (!d) return;
    var f = this.filtres(), esc = function (s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var lignes = f.map(function (i) {
      return '<tr><td>' + esc(i.heure) + '</td><td>' + esc(i.client) + '</td><td>' + esc(i.vehicule) + '</td><td>' + esc(i.conseiller) + '</td><td>' +
        (i.offre ? esc(i.offre.vehicule) + '<br><small>' + esc((i.offre.type === 'location' ? 'Location ' : 'Financement ') + argent(i.offre.paiement) + ' / mois avec l\'échange') + '</small>' : '—') +
        (i.temoin && i.offre ? '<br><b>Groupe témoin : ne pas présenter</b>' : '') + '</td></tr>';
    }).join('');
    var w = window.open('', '_blank'); if (!w) { AMX.toast('Autorisez les fenêtres pour imprimer.', 'attention'); return; }
    w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Liste du matin</title><style>body{font:13px system-ui,sans-serif;margin:24px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ccc;padding:6px;text-align:left;vertical-align:top}th{font-size:12px;color:#555}small{color:#555}</style></head><body>' +
      '<h2>Liste du matin — ' + esc(nomCie(d.compagnie)) + ' — ' + esc(d.date) + '</h2><p>Offres à présenter de vive voix. Les paiements sont des estimations avec le véhicule actuel en échange ; le prix total et les conditions sont sur la page de l\'offre.</p>' +
      '<table><thead><tr><th>Heure</th><th>Client</th><th>Véhicule au service</th><th>Conseiller</th><th>Offre</th></tr></thead><tbody>' + lignes + '</tbody></table></body></html>');
    w.document.close(); w.focus(); setTimeout(function () { try { w.print(); } catch (e) {} }, 300);
  };

  AMX.section('campagnesRelance', { titre: 'Campagnes', icone: 'relance', ordre: 32, visible: function () { return peutVoir(); }, monter: function (c, ctx) { return new VueCampagnes(c, ctx); } });
  AMX.section('listeMatin', { titre: 'Liste du matin', icone: 'relance', ordre: 33, visible: function () { return peutVoir(); }, monter: function (c, ctx) { return new VueMatin(c, ctx); } });
  AMX.campagnesRelance = { preparer: preparer, ouvrir: ouvrirDetail, charger: charger, vider: function () { oublier(); } };
})();
