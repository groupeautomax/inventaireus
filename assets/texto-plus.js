/* texto-plus.js — Service › Texto, suite (20 octobre 2026, soir) : ce que Kimoby fait de plus, en mieux.
   Étend VueTexto (texto.js, AMX.texto.Vue) : photos / vidéos dans les conversations (bouton 📷 du composer, page client media.html),
   onglet Clients (annuaire du service : liste, recherche, fiche, import CSV / Excel du DMS, export), onglet Campagnes (audience,
   message, test, planification, envoi par lots 9 h – 20 h, réponses), onglet Automatisations (8 règles par concession, OFF par
   défaut, journal), métriques par employé dans Statistiques. Serveur : gs/TextoPlus.gs (routes ?textoClients, ?textoClient,
   ?textoCampagnes, ?textoCampagne, ?textoStats, ?textoAutomations ; POST textoMedia, textoClientsImporter, textoAutomations,
   campagne*, paiementRappeler). Chargé après texto.js (index.html). */
(function () {
  'use strict';
  var V = AMX.texto && AMX.texto.Vue; if (!V) return;
  var O = AMX.texto.outils, h = O.h, telChiffres = O.telChiffres, telJoli = O.telJoli, num = O.num, argent = O.argent, nomCie = O.nomCie, prenom = O.prenom, quand = O.quand, duree = O.duree, nomCourt = O.nomCourt, zoneTexte = O.zoneTexte, gabarit = O.gabarit, reduireImage = O.reduireImage, lireBase64 = O.lireBase64;
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var CAMP_COULEUR = { brouillon: 'gris', planifiee: 'bleu', encours: 'ambre', pause: 'ambre', terminee: 'vert', annulee: 'rouge' };
  var STYLE = [
    '.txt-plus-barre { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; } .txt-plus-barre .doux { margin-left: auto; }',
    '.txt-clients td .sous, .txt-camps td .sous { display: block; font-size: 11.5px; color: var(--encre-3); }',
    '.txt-clients .stop { color: var(--rouge); font-weight: 700; font-size: 11px; }',
    '.txt-fiche-client dl { display: grid; grid-template-columns: 130px 1fr; gap: 3px 12px; margin: 0 0 10px; font-size: 13px; } .txt-fiche-client dd { margin: 0; }',
    '.txt-fiche-client h4 { margin: 12px 0 4px; font-size: 12.5px; } .txt-fiche-client .liste-mini { font-size: 12.5px; } .txt-fiche-client .liste-mini > div { padding: 4px 0; border-bottom: 1px solid var(--ligne); display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; } .txt-fiche-client .liste-mini a { cursor: pointer; }',
    '.txt-autos .auto { border: 1px solid var(--ligne); border-radius: 10px; padding: 10px 12px; background: #fff; margin-bottom: 8px; } .txt-autos .auto.on { border-left: 4px solid var(--vert); }',
    '.txt-autos .auto .t { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .txt-autos .auto .t b { font-size: 13.5px; } .txt-autos .auto .q { color: var(--encre-3); font-size: 12px; flex: 1 1 100%; }',
    '.txt-autos .auto textarea { margin-top: 6px; min-height: 54px; font-size: 12.5px; } .txt-autos .auto .regl { display: flex; gap: 6px; align-items: center; font-size: 12.5px; } .txt-autos .auto .regl input { width: 70px; }',
    '.txt-autos .interrupteur { position: relative; width: 38px; height: 22px; border-radius: 11px; background: var(--gris); border: none; cursor: pointer; flex: none; transition: background .15s; } .txt-autos .interrupteur::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .15s; } .txt-autos .interrupteur.on { background: var(--vert); } .txt-autos .interrupteur.on::after { left: 19px; }',
    '.txt-camp-form .grille { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; } @media (max-width: 700px) { .txt-camp-form .grille { grid-template-columns: 1fr; } } .txt-camp-form .champ label { display: block; font-size: 11.5px; color: var(--encre-3); margin-bottom: 2px; }',
    '.txt-camp-form .apercu-aud { background: var(--carte-2); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; margin-top: 8px; }',
    '.txt-stats .emp td.num { text-align: right; font-variant-numeric: tabular-nums; }'
  ].join('\n');
  if (!document.getElementById('txt-plus-style')) { var st = document.createElement('style'); st.id = 'txt-plus-style'; st.textContent = STYLE; document.head.appendChild(st); }
  function dateCourte(iso) { if (!iso) return '—'; var s = String(iso).slice(0, 10), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? Number(m[3]) + ' ' + MOIS[Number(m[2]) - 1] + ' ' + m[1] : s; }
  function csvLigne(l) { return l.map(function (x) { x = x === null || x === undefined ? '' : String(x); return /[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(';'); }
  function telecharger(nom, texte, mime) { var b = new Blob(['﻿' + texte], { type: mime || 'text/csv;charset=utf-8' }), u = URL.createObjectURL(b), a = h('a', { href: u, download: nom }); document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(u); }, 500); }

  /* ================================================================== médias dans une conversation (bouton 📷 du composer) */
  V.prototype.boutonMedia = function (c, inMsg) {
    var self = this;
    var inFichier = h('input', { type: 'file', accept: 'image/*,video/*', style: { display: 'none' } });
    var btn = h('button.btn.fantome.btn-media', { type: 'button', text: '📷', title: 'Envoyer une photo ou une vidéo (le client reçoit un lien)', onclick: function () { inFichier.click(); } });
    inFichier.addEventListener('change', function () {
      var f = inFichier.files && inFichier.files[0]; inFichier.value = ''; if (!f) return;
      var mime = f.type || 'application/octet-stream', video = /^video\//.test(mime);
      var prep = /^image\//.test(mime) ? reduireImage(f) : lireBase64(f).then(function (b) { return { base64: b, mime: mime }; });
      btn.classList.add('occupe'); self.enEcriture = true;
      AMX.toast('Envoi de ' + (video ? 'la vidéo' : 'la photo') + '…', 'info', 2500);
      prep.then(function (p) {
        if (p.base64.length * 0.75 > 35 * 1024 * 1024) throw new Error('Fichier trop lourd (35 Mo max) — filmez en 640 × 360 ou moins de 90 secondes.');
        return AMX.post({ action: 'textoMedia', conversationId: c.id, compagnie: c.compagnie, telephone: c.telephone, nom: f.name, mime: p.mime, base64: p.base64, texte: inMsg && inMsg.value.trim() ? inMsg.value.trim() : '' }, { delai: 240000 });
      }).then(function (d) {
        self.enEcriture = false; btn.classList.remove('occupe');
        if (!d || d.ok === false || d.refuse) throw new Error((d && (d.erreur || d.message)) || 'Envoi refusé');
        AMX.toast((video ? 'Vidéo' : 'Photo') + ' envoyée par texto', 'ok');
        if (inMsg) inMsg.value = '';
        self.chargerFil(c.id); AMX.texto.invalider();
      }).catch(function (e) { self.enEcriture = false; btn.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(e), 'erreur', 8000); });
    });
    btn.appendChild(inFichier);
    return btn;
  };

  /* ================================================================== clients (annuaire du service) */
  V.prototype.chargerClients = function (q, tout) {
    var self = this, p = { textoClients: 1 }; if (this.compagnie) p.compagnie = this.compagnie; if (q) p.q = q; if (tout) p.tout = 1;
    return AMX.get(p, { secours: false, essais: 1 }).then(function (d) { if (!d || !d.ok) throw new Error((d && (d.erreur || d.message)) || 'Clients indisponibles'); return d; });
  };
  V.prototype.rendreClients = function () {
    var self = this, zone = h('div.txt-clients'), corps = h('div');
    this.elCompte.textContent = '';
    var peut = this.peutEcrire();
    var inRech = h('input.saisie', { type: 'search', placeholder: 'Nom, cellulaire, courriel, NIV, plaque, véhicule, # DMS…', value: this.rechercheClients || '', autocomplete: 'off', style: { flex: '1 1 260px' } });
    var barre = h('div.txt-plus-barre', [inRech,
      peut ? h('button.btn', { type: 'button', text: '+ Client', onclick: function () { self.ficheClientForm(null); } }) : null,
      peut ? h('button.btn.fantome', { type: 'button', text: 'Importer (DMS)', title: 'CSV ou Excel : nom, prénom, cellulaire, courriel, véhicule, NIV, plaque, km, # client, dernière visite', onclick: function () { self.importerClients(); } }) : null,
      h('button.btn.fantome', { type: 'button', text: 'Exporter', onclick: function () { self.exporterClients(); } }),
      h('span.doux.petit', { text: '' })]);
    zone.appendChild(barre); zone.appendChild(corps);
    this.elCorps.appendChild(zone);
    var dessiner = function (d) {
      AMX.vider(corps);
      barre.querySelector('.doux').textContent = d.total + ' client' + (d.total > 1 ? 's' : '') + (d.desabonnes ? ' · ' + d.desabonnes + ' désabonné' + (d.desabonnes > 1 ? 's' : '') : '') + (d.sansCellulaire ? ' · ' + d.sansCellulaire + ' sans cellulaire' : '') + (d.trouves !== d.total ? ' · ' + d.trouves + ' trouvé' + (d.trouves > 1 ? 's' : '') : '');
      self.elCompte.textContent = d.trouves + ' client' + (d.trouves > 1 ? 's' : '');
      if (!d.clients.length) { corps.appendChild(h('div.vide', [h('h3', d.q ? 'Aucun client ne correspond.' : 'Aucun client pour l\'instant.'), h('div.doux', 'Les clients arrivent par les rendez-vous, les estimés, ou « Importer (DMS) » (CSV / Excel).')])); return; }
      var tbody = h('tbody');
      d.clients.forEach(function (c) {
        tbody.appendChild(h('tr.cliquable', { onclick: function () { self.ouvrirClient(c.id); } }, [
          h('td', [h('b', { text: c.affichage || telJoli(c.telephone) || '—' }), c.courriel ? h('span.sous', { text: c.courriel }) : null, !self.compagnie ? h('span.sous', { text: nomCie(c.compagnie) }) : null]),
          h('td', [h('span', { text: c.telephoneJoli || '—' }), c.stop || !c.textos ? h('span.sous.stop', { text: c.stop ? 'STOP' : 'textos : non' }) : null]),
          h('td', [h('span', { text: c.vehicule || '—' }), c.vin ? h('span.sous.mono', { text: c.vin }) : null]),
          h('td', { text: dateCourte(c.derniereVisite) }),
          h('td', [h('span', { text: c.dernierContact ? quand(c.dernierContact) : '—' }), c.nonLus ? h('span.sous', { text: c.nonLus + ' non lu' + (c.nonLus > 1 ? 's' : '') }) : null]),
          h('td.num', { text: c.nEstimes || '' }),
          h('td', [peut && c.telephone && !c.stop ? h('button.btn.petit', { type: 'button', text: 'Texto', onclick: function (ev) { ev.stopPropagation(); self.vue = 'conversations'; self.ouvrirTel = c.telephone; self.rendre(); } }) : null])
        ]));
      });
      corps.appendChild(h('table.tableau', [h('thead', [h('tr', [h('th', 'Client'), h('th', 'Cellulaire'), h('th', 'Véhicule'), h('th', 'Dernière visite'), h('th', 'Dernier texto'), h('th.num', 'Estimés'), h('th', '')])]), tbody]));
      if (d.clients.length >= 400 && d.trouves > d.clients.length) corps.appendChild(h('div.doux.petit', { style: { marginTop: '6px' }, text: 'Les 400 plus récents sont affichés — cherchez pour trouver les autres.' }));
    };
    var charger = function (q) { AMX.vider(corps); corps.appendChild(AMX.chargeur('Clients', { compact: true })); self.chargerClients(q).then(dessiner).catch(function (e) { AMX.vider(corps); corps.appendChild(h('div.vide', [h('h3', 'Clients indisponibles'), h('div.doux', { text: AMX.erreurTexte(e) })])); }); };
    inRech.addEventListener('input', AMX.debounce(function () { self.rechercheClients = inRech.value; charger(inRech.value.trim()); }, 300));
    charger(this.rechercheClients || '');
  };
  V.prototype.ouvrirClient = function (id) {
    var self = this, m = AMX.modale({ titre: 'Client', corps: AMX.chargeur('Fiche', { compact: true }), boutons: [{ texte: 'Fermer' }] });
    AMX.get({ textoClient: 1, id: id }, { secours: false }).then(function (d) { m.fermer(); if (!d || !d.ok) { AMX.toast((d && (d.erreur || d.message)) || 'Client introuvable', 'erreur'); return; } self.ficheClient(d); }).catch(function (e) { m.fermer(); AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  V.prototype.ficheClient = function (d) {
    var self = this, c = d.client, peut = this.peutEcrire() && d.peutEcrire;
    var vehs = (c.vehicules || []).map(function (v) { return (v.texte || '') + (v.vin ? ' · ' + v.vin : '') + (v.plaque ? ' · ' + v.plaque : '') + (v.km ? ' · ' + v.km + ' km' : ''); });
    var dl = h('dl', [
      h('dt.doux', 'Cellulaire'), h('dd', { text: (c.telephoneJoli || '—') + (c.telephone2 ? ' · ' + telJoli(c.telephone2) : '') }),
      h('dt.doux', 'Courriel'), h('dd', { text: c.courriel || '—' }),
      h('dt.doux', 'Véhicules'), h('dd', vehs.length ? vehs.map(function (t) { return h('div', { text: t }); }) : '—'),
      h('dt.doux', 'Dernière visite'), h('dd', { text: dateCourte(c.derniereVisite) + (c.dmsId ? ' · # DMS ' + c.dmsId : '') }),
      h('dt.doux', 'Textos'), h('dd', [h('span', { text: c.stop ? 'STOP reçu — plus aucun texto' : (c.textos ? 'acceptés' : 'refusés (fiche)') + (c.consentRappels ? ' · rappels : ' + c.consentRappels : '') + (c.consentOffres ? ' · offres : ' + c.consentOffres : '') })]),
      c.notes ? h('dt.doux', 'Notes') : null, c.notes ? h('dd', { text: c.notes }) : null
    ]);
    var actions = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' } }, [
      peut && c.telephone && !c.stop ? h('button.btn.petit', { type: 'button', text: '💬 Texto', onclick: function () { fermer(); self.vue = 'conversations'; self.ouvrirTel = c.telephone; self.rendre(); } }) : null,
      peut ? h('button.btn.petit', { type: 'button', text: '+ Estimé', onclick: function () { fermer(); var v = (c.vehicules || [])[0] || {}; self.ouvrirEstime(null, { compagnie: c.compagnie, client: c.affichage, clientId: c.id, telephone: c.telephone, courriel: c.courriel, vin: v.vin || '', vehicule: v.texte || '', plaque: v.plaque || '', km: v.km || '' }); } }) : null,
      peut ? h('button.btn.petit', { type: 'button', text: '$ Paiement', onclick: function () { fermer(); var v = (c.vehicules || [])[0] || {}; self.nouveauPaiement({ compagnie: c.compagnie, client: c.affichage, telephone: c.telephone, courriel: c.courriel, vehicule: v.texte || '' }); } }) : null,
      peut ? h('button.btn.petit.fantome', { type: 'button', text: 'Modifier', onclick: function () { fermer(); self.ficheClientForm(c); } }) : null,
      peut ? h('button.btn.petit.fantome', { type: 'button', text: c.textos ? 'Retirer des textos' : 'Réaccepter les textos', onclick: function () { self.action({ action: 'rdvClient', client: { id: c.id, compagnie: c.compagnie, textos: !c.textos, consentements: { rappels: !c.textos ? 'oui' : 'non', offres: !c.textos ? 'oui' : 'non', canal: 'comptoir', texte: 'Changé dans la fiche client (Texto)' } } }, c.textos ? 'Client retiré des textos' : 'Textos réacceptés').then(function (r) { if (r && r.ok) { fermer(); self.ouvrirClient(c.id); } }); } }) : null
    ]);
    var mini = function (titre, items, rendu) { if (!items || !items.length) return null; var l = h('div.liste-mini', items.slice(0, 12).map(rendu)); return h('div', [h('h4', { text: titre + ' (' + items.length + ')' }), l]); };
    var corps = h('div.txt-fiche-client', [dl, actions,
      mini('Conversations', d.conversations, function (x) { return h('div', [h('a', { text: nomCie(x.compagnie) + (x.nonLus ? ' · ' + x.nonLus + ' non lu' : ''), onclick: function () { fermer(); self.vue = 'conversations'; self.convId = x.id; self.compagnie = AMX.compagnieChoisie('service') || self.compagnie; self.rendre(); } }), h('span.doux', { text: (x.dernierTexte || '').slice(0, 70) }), h('span.doux', { text: quand(x.dernierLe) })]); }),
      mini('Estimés', d.estimes, function (x) { return h('div', [h('a', { text: x.id, onclick: function () { fermer(); self.ouvrirEstime(x.id); } }), h('span', { text: x.statutLibelle }), h('b', { text: argent(x.total) }), h('span.doux', { text: (x.vehicule || '') + ' · ' + quand(x.maj) })]); }),
      mini('Paiements', d.paiements, function (x) { return h('div', [h('a', { text: x.id, onclick: function () { fermer(); self.ouvrirPaiement(x.id); } }), h('span', { text: x.statutLibelle }), h('b', { text: argent(x.montant) }), h('span.doux', { text: quand(x.maj) })]); }),
      mini('Rendez-vous', d.rdv, function (x) { return h('div', [h('b', { text: dateCourte(x.date) + ' ' + x.heure }), h('span', { text: x.etatLibelle }), h('span.doux', { text: (x.vehicule || '') + (x.travaux && x.travaux.length ? ' · ' + x.travaux.map(function (t) { return t.libelle; }).join(', ') : '') })]); }),
      mini('Textos automatiques', d.automatisations, function (x) { return h('div', [h('span', { text: x.titre }), h('span.doux', { text: quand(x.le) + ' · ' + x.statut + (x.note !== null && x.note !== undefined ? ' · note ' + x.note + '/5' : '') })]); })
    ]);
    var modale = AMX.modale({ titre: (c.affichage || telJoli(c.telephone)) + ' — ' + nomCie(c.compagnie), corps: corps, large: true, boutons: [{ texte: 'Fermer' }] });
    function fermer() { try { modale.fermer(); } catch (e) {} }
  };
  /* Création / modification d'une fiche (POST rdvClient de Rdv.gs). */
  V.prototype.ficheClientForm = function (c) {
    var self = this, cie = (c && c.compagnie) || this.compagnie || AMX.codesPour('service')[0], codes = AMX.codesPour('service');
    var selCie = h('select.saisie', codes.map(function (k) { return h('option', { value: k, selected: k === cie ? true : undefined, text: nomCie(k) }); })); if (c) selCie.disabled = true;
    var inPrenom = h('input.saisie', { type: 'text', value: (c && c.prenom) || '', placeholder: 'Prénom' }), inNom = h('input.saisie', { type: 'text', value: (c && c.nom) || '', placeholder: 'Nom' }), inEnt = h('input.saisie', { type: 'text', value: (c && c.entreprise) || '', placeholder: 'Entreprise (facultatif)' });
    var inTel = h('input.saisie', { type: 'tel', value: c && c.telephone ? telJoli(c.telephone) : '', placeholder: '514 555-1234' }), inTel2 = h('input.saisie', { type: 'tel', value: c && c.telephone2 ? telJoli(c.telephone2) : '', placeholder: 'autre téléphone' }), inCourriel = h('input.saisie', { type: 'email', value: (c && c.courriel) || '' });
    var selLangue = h('select.saisie', [h('option', { value: 'fr', selected: !c || c.langue !== 'en' ? true : undefined, text: 'Français' }), h('option', { value: 'en', selected: c && c.langue === 'en' ? true : undefined, text: 'English' })]);
    var inDms = h('input.saisie', { type: 'text', value: (c && c.dmsId) || '', placeholder: '# client DMS' }), inVisite = h('input.saisie', { type: 'date', value: c && c.derniereVisite ? String(c.derniereVisite).slice(0, 10) : '' });
    var inNotes = zoneTexte({ placeholder: 'Notes internes', style: { minHeight: '50px' } }, (c && c.notes) || '');
    var vehs = ((c && c.vehicules) || []).slice(), elVehs = h('div');
    var rangeeVeh = function (v) { var inT = h('input.saisie', { type: 'text', value: v.texte || '', placeholder: '2021 BMW X3' }), inV = h('input.saisie', { type: 'text', value: v.vin || '', placeholder: 'NIV', style: { fontFamily: 'var(--mono)', textTransform: 'uppercase' } }), inP = h('input.saisie', { type: 'text', value: v.plaque || '', placeholder: 'Plaque', style: { width: '90px' } }), inK = h('input.saisie', { type: 'number', value: v.km || '', placeholder: 'km', style: { width: '90px' } }); var r = h('div', { style: { display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' } }, [inT, inV, inP, inK, h('button.btn.petit.fantome', { type: 'button', text: '×', onclick: function () { r.remove(); } })]); r._lire = function () { return { texte: inT.value.trim(), vin: inV.value.trim().toUpperCase(), plaque: inP.value.trim().toUpperCase(), km: num(inK.value) || '', kmLe: v.kmLe || '' }; }; elVehs.appendChild(r); };
    vehs.forEach(rangeeVeh);
    var corps = h('div.rdv-form', [
      h('div.grille.c3', [h('div.champ', [h('label', 'Concession'), selCie]), h('div.champ', [h('label', 'Prénom'), inPrenom]), h('div.champ', [h('label', 'Nom'), inNom])]),
      h('div.grille.c3', { style: { marginTop: '6px' } }, [h('div.champ', [h('label', 'Cellulaire'), inTel]), h('div.champ', [h('label', 'Autre téléphone'), inTel2]), h('div.champ', [h('label', 'Courriel'), inCourriel])]),
      h('div.grille.c3', { style: { marginTop: '6px' } }, [h('div.champ', [h('label', 'Entreprise'), inEnt]), h('div.champ', [h('label', 'Langue'), selLangue]), h('div.champ', [h('label', '# DMS'), inDms])]),
      h('div.grille.c2', { style: { marginTop: '6px' } }, [h('div.champ', [h('label', 'Dernière visite'), inVisite]), null]),
      h('div.champ', { style: { marginTop: '8px' } }, [h('label', 'Véhicules'), elVehs, h('button.btn.petit.fantome', { type: 'button', text: '+ véhicule', onclick: function () { rangeeVeh({}); } })]),
      h('div.champ', { style: { marginTop: '8px' } }, [h('label', 'Notes'), inNotes])
    ]);
    AMX.modale({ titre: c ? 'Modifier ' + (c.affichage || 'le client') : 'Nouveau client', corps: corps, large: true, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      if (!inNom.value.trim() && !inEnt.value.trim() && telChiffres(inTel.value).length !== 10) { AMX.toast('Nom (ou entreprise) ou cellulaire requis', 'erreur'); return false; }
      var client = { id: c ? c.id : undefined, compagnie: selCie.value, prenom: inPrenom.value.trim(), nom: inNom.value.trim(), entreprise: inEnt.value.trim(), telephone: inTel.value.trim(), telephone2: inTel2.value.trim(), courriel: inCourriel.value.trim(), langue: selLangue.value, dmsId: inDms.value.trim(), derniereVisite: inVisite.value, notes: inNotes.value.trim(), vehicules: [].map.call(elVehs.children, function (r) { return r._lire(); }).filter(function (v) { return v.texte || v.vin; }) };
      return self.action({ action: 'rdvClient', client: client }, 'Client enregistré').then(function (r) { if (!r || !r.ok) return false; if (self.vue === 'clients') self.rendreCorps(); else self.ouvrirClient(r.client.id); return true; });
    } }] });
  };
  /* Import CSV / Excel (DMS) : on devine les colonnes par leur titre. */
  V.prototype.importerClients = function () {
    var self = this, cie = this.compagnie || AMX.codesPour('service')[0], codes = AMX.codesPour('service');
    var selCie = h('select.saisie', codes.map(function (k) { return h('option', { value: k, selected: k === cie ? true : undefined, text: nomCie(k) }); }));
    var inFichier = h('input', { type: 'file', accept: '.csv,.txt,.xlsx,.xls' }), apercu = h('div.doux.petit', { style: { marginTop: '8px' } }), lignes = [];
    var COLS = { nom: /^(nom|last ?name|lastname|name)$/i, prenom: /^(pr[ée]nom|first ?name|firstname)$/i, entreprise: /^(entreprise|company|compagnie|soci[ée]t[ée])$/i, telephone: /^(cell(ulaire)?|mobile|t[ée]l[ée]phone|phone|cell phone|telephone cellulaire)$/i, telephone2: /^(t[ée]l[ée]phone ?2|phone ?2|maison|home|bureau|work)$/i, courriel: /^(courriel|email|e-mail|mail)$/i, vin: /^(niv|vin)$/i, vehicule: /^(v[ée]hicule|vehicle|description)$/i, annee: /^(ann[ée]e|year)$/i, marque: /^(marque|make)$/i, modele: /^(mod[èe]le|model)$/i, plaque: /^(plaque|plate|immatriculation)$/i, km: /^(km|kilom[ée]trage|odom[èe]tre|mileage)$/i, dmsId: /^(#|no|num[ée]ro|id|client ?id|customer ?(id|no|#)|# ?client|code client)$/i, derniereVisite: /^(derni[èe]re ?visite|last ?visit|date|derni[èe]re ?date)$/i, langue: /^(langue|language|lang)$/i, textos: /^(textos|sms|opt ?in|consentement)$/i };
    var lire = function (f) {
      var fini = function (rows) {
        if (!rows.length) { apercu.textContent = 'Fichier vide.'; return; }
        var ent = rows[0].map(function (x) { return String(x || '').trim(); }), map = {};
        ent.forEach(function (t, i) { Object.keys(COLS).forEach(function (k) { if (map[k] === undefined && COLS[k].test(t)) map[k] = i; }); });
        if (map.telephone === undefined && map.nom === undefined) { apercu.textContent = 'Colonnes non reconnues : ' + ent.join(', ') + '. Il faut au moins « Nom » ou « Cellulaire ».'; lignes = []; return; }
        lignes = rows.slice(1).map(function (r) { var o = {}; Object.keys(map).forEach(function (k) { o[k] = String(r[map[k]] === undefined || r[map[k]] === null ? '' : r[map[k]]).trim(); }); return o; }).filter(function (o) { return o.nom || o.prenom || o.entreprise || o.telephone; });
        apercu.textContent = lignes.length + ' ligne(s) · colonnes reconnues : ' + Object.keys(map).join(', ') + (lignes.length > 2000 ? ' — 2 000 par passage, le reste sera envoyé après' : '');
      };
      if (/\.xlsx?$/i.test(f.name)) {
        if (typeof XLSX === 'undefined') { apercu.textContent = 'Lecteur Excel non chargé — enregistrez en CSV.'; return; }
        var fr = new FileReader(); fr.onload = function (e) { try { var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' }); fini(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' })); } catch (err) { apercu.textContent = 'Fichier illisible : ' + err.message; } }; fr.readAsArrayBuffer(f);
      } else {
        var fr2 = new FileReader(); fr2.onload = function (e) { var t = String(e.target.result || ''), sep = (t.split('\n')[0].match(/;/g) || []).length >= (t.split('\n')[0].match(/,/g) || []).length ? ';' : ','; var rows = []; t.split(/\r?\n/).forEach(function (l) { if (!l.trim()) return; var out = [], cur = '', q = false; for (var i = 0; i < l.length; i++) { var ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); rows.push(out); }); fini(rows); }; fr2.readAsText(f, 'utf-8');
      }
    };
    inFichier.addEventListener('change', function () { if (inFichier.files && inFichier.files[0]) lire(inFichier.files[0]); });
    var corps = h('div', [h('p.doux.petit', 'Export clients du DMS (CSV ou Excel). Colonnes reconnues par leur titre : Nom, Prénom, Entreprise, Cellulaire / Téléphone, Courriel, Véhicule (ou Année + Marque + Modèle), NIV, Plaque, Km, # client, Dernière visite, Langue, Textos. Un client existant (même # DMS ou même cellulaire) est complété, jamais dédoublé.'), h('div.grille.c2', [h('div.champ', [h('label', 'Concession'), selCie]), h('div.champ', [h('label', 'Fichier'), inFichier])]), apercu]);
    AMX.modale({ titre: 'Importer des clients', corps: corps, boutons: [{ texte: 'Annuler' }, { texte: 'Importer', classe: 'primaire', action: function () {
      if (!lignes.length) { AMX.toast('Choisissez un fichier.', 'erreur'); return false; }
      var lots = []; for (var i = 0; i < lignes.length; i += 2000) lots.push(lignes.slice(i, i + 2000));
      var tot = { crees: 0, misAJour: 0, ignores: 0 }, suite = Promise.resolve();
      lots.forEach(function (lot) { suite = suite.then(function () { return AMX.post({ action: 'textoClientsImporter', compagnie: selCie.value, lignes: lot }, { delai: 240000 }).then(function (d) { if (!d || !d.ok) throw new Error((d && (d.erreur || d.message)) || 'Import refusé'); tot.crees += d.crees; tot.misAJour += d.misAJour; tot.ignores += d.ignores; }); }); });
      return suite.then(function () { AMX.toast(tot.crees + ' créé(s), ' + tot.misAJour + ' mis à jour' + (tot.ignores ? ', ' + tot.ignores + ' ignoré(s)' : ''), 'ok', 7000); if (self.vue === 'clients') self.rendreCorps(); return true; }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 8000); return false; });
    } }] });
  };
  V.prototype.exporterClients = function () {
    var self = this;
    AMX.toast('Préparation de l\'export…', 'info', 2000);
    this.chargerClients('', true).then(function (d) {
      var l = [['Concession', 'Prénom', 'Nom', 'Entreprise', 'Cellulaire', 'Autre téléphone', 'Courriel', 'Langue', 'Textos', 'Véhicule', 'NIV', 'Dernière visite', 'Dernier texto', '# DMS', 'Estimés', 'Paiements']];
      d.clients.forEach(function (c) { l.push([nomCie(c.compagnie), c.prenom, c.nom, c.entreprise, c.telephoneJoli, c.telephone2 ? telJoli(c.telephone2) : '', c.courriel, c.langue, c.stop ? 'STOP' : (c.textos ? 'oui' : 'non'), c.vehicule, c.vin, c.derniereVisite, c.dernierContact ? c.dernierContact.slice(0, 10) : '', c.dmsId, c.nEstimes, c.nPaiements]); });
      telecharger('clients-' + (self.compagnie || 'groupe').toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.csv', l.map(csvLigne).join('\n'));
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };

  /* ================================================================== campagnes */
  V.prototype.rendreCampagnes = function () {
    var self = this, zone = h('div.txt-camps'), corps = h('div');
    this.elCompte.textContent = '';
    var peutDir = !!(this.donnees && this.donnees.peutConfigurer);
    zone.appendChild(h('div.txt-plus-barre', [h('span.doux.petit', { style: { marginLeft: 0 }, text: 'Textos de masse aux clients du service (pneus d\'hiver, promotions, clients perdus…). Envoi par lots de 9 h à 20 h ; STOP et consentement « offres » respectés ; les réponses arrivent dans Conversations.' }), peutDir ? h('button.btn.primaire', { type: 'button', text: '+ Campagne', onclick: function () { self.formCampagne(null); } }) : null]));
    zone.appendChild(corps); this.elCorps.appendChild(zone);
    corps.appendChild(AMX.chargeur('Campagnes', { compact: true }));
    var p = { textoCampagnes: 1 }; if (this.compagnie) p.compagnie = this.compagnie;
    AMX.get(p, { secours: false, essais: 1 }).then(function (d) {
      AMX.vider(corps);
      if (!d || !d.ok) { corps.appendChild(h('div.vide', [h('h3', (d && (d.erreur || d.message)) || 'Campagnes indisponibles')])); return; }
      self.elCompte.textContent = d.campagnes.length + ' campagne' + (d.campagnes.length > 1 ? 's' : '');
      if (!d.campagnes.length) { corps.appendChild(h('div.vide', [h('h3', 'Aucune campagne.'), h('div.doux', peutDir ? 'Créez-en une : audience, message, test sur votre cellulaire, puis planifiez.' : 'La direction crée les campagnes.')])); return; }
      var tbody = h('tbody');
      d.campagnes.forEach(function (c) {
        tbody.appendChild(h('tr.cliquable', { onclick: function () { self.ouvrirCampagne(c.id); } }, [
          h('td', [h('b', { text: c.nom }), h('span.sous', { text: c.id + (!self.compagnie ? ' · ' + nomCie(c.compagnie) : '') + ' · ' + nomCourt(c.creePar) })]),
          h('td', [h('span.badge.' + (CAMP_COULEUR[c.etat] || 'gris'), { text: c.etatLibelle }), c.etat === 'planifiee' && c.planifieLe ? h('span.sous', { text: 'pour ' + quand(c.planifieLe) }) : null, c.etat === 'encours' ? h('span.sous', { text: c.attente + ' à envoyer · ' + c.minutesRestantes + ' min' }) : null]),
          h('td.num', { text: c.nDestinataires }),
          h('td.num', { text: c.envoyes + (c.echecs ? ' (' + c.echecs + ' échec' + (c.echecs > 1 ? 's' : '') + ')' : '') }),
          h('td.num', { text: c.envoyes ? c.reponses + ' (' + Math.round(c.reponses / c.envoyes * 100) + ' %)' : '—' }),
          h('td', { text: c.termineLe ? quand(c.termineLe) : (c.debuteLe ? 'depuis ' + quand(c.debuteLe) : 'créée ' + quand(c.creeLe)) })
        ]));
      });
      corps.appendChild(h('table.tableau', [h('thead', [h('tr', [h('th', 'Campagne'), h('th', 'État'), h('th.num', 'Destinataires'), h('th.num', 'Envoyés'), h('th.num', 'Réponses'), h('th', 'Quand')])]), tbody]));
    }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('div.vide', [h('h3', 'Campagnes indisponibles'), h('div.doux', { text: AMX.erreurTexte(e) })])); });
  };
  V.prototype.ouvrirCampagne = function (id) {
    var self = this, m = AMX.modale({ titre: 'Campagne', corps: AMX.chargeur('Campagne', { compact: true }), boutons: [{ texte: 'Fermer' }] });
    AMX.get({ textoCampagne: 1, id: id }, { secours: false }).then(function (d) { m.fermer(); if (!d || !d.ok) { AMX.toast((d && (d.erreur || d.message)) || 'Campagne introuvable', 'erreur'); return; } self.ficheCampagne(d.campagne); }).catch(function (e) { m.fermer(); AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  V.prototype.ficheCampagne = function (c) {
    var self = this, peut = !!(this.donnees && this.donnees.peutConfigurer) && c.peutEcrire;
    var rouvrir = function () { try { modale.fermer(); } catch (e) {} self.ouvrirCampagne(c.id); };
    var etat = function (e, extra, msg) { return self.action(Object.assign({ action: 'campagneEtat', id: c.id, etat: e }, extra || {}), msg).then(function (d) { if (d && d.ok) { rouvrir(); if (self.vue === 'campagnes') self.rendreCorps(); } }); };
    var dl = h('dl', { style: { display: 'grid', gridTemplateColumns: '130px 1fr', gap: '3px 12px', margin: '0 0 10px', fontSize: '13px' } }, [
      h('dt.doux', 'État'), h('dd', { style: { margin: 0 } }, [h('span.badge.' + (CAMP_COULEUR[c.etat] || 'gris'), { text: c.etatLibelle }), h('span.doux', { text: ' ' + (c.etat === 'planifiee' ? 'pour ' + quand(c.planifieLe) : '') + (c.debuteLe ? ' · lancée ' + quand(c.debuteLe) : '') + (c.termineLe ? ' · terminée ' + quand(c.termineLe) : '') })]),
      h('dt.doux', 'Message'), h('dd', { style: { margin: 0, whiteSpace: 'pre-wrap' }, text: c.texte }),
      h('dt.doux', 'Destinataires'), h('dd', { style: { margin: 0 }, text: c.nDestinataires + ' · ' + c.envoyes + ' envoyé' + (c.envoyes > 1 ? 's' : '') + ' · ' + c.reponses + ' réponse' + (c.reponses > 1 ? 's' : '') + (c.echecs ? ' · ' + c.echecs + ' échec' + (c.echecs > 1 ? 's' : '') : '') + (c.exclus ? ' · ' + c.exclus + ' exclu' + (c.exclus > 1 ? 's' : '') + ' (STOP)' : '') + (c.attente ? ' · ' + c.attente + ' à envoyer (' + c.lot + ' / minute)' : '') }),
      h('dt.doux', 'Audience'), h('dd', { style: { margin: 0 }, text: c.audience && c.audience.source === 'liste' ? 'liste de numéros collée' : Object.keys(c.audience || {}).filter(function (k) { return c.audience[k] && k !== 'source'; }).map(function (k) { return k + ' = ' + c.audience[k]; }).join(' · ') || 'tous les clients de la concession' })
    ]);
    var dest = h('div.liste-mini', { style: { maxHeight: '220px', overflow: 'auto', fontSize: '12.5px' } });
    (c.destinataires || []).slice().sort(function (a, b) { return (a.statut === 'repondu' ? 0 : 1) - (b.statut === 'repondu' ? 0 : 1); }).slice(0, 300).forEach(function (d) { dest.appendChild(h('div', { style: { padding: '3px 0', borderBottom: '1px solid var(--ligne)', display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [h('b', { text: d.client || telJoli(d.tel) }), h('span.doux', { text: telJoli(d.tel) + (d.vehicule ? ' · ' + d.vehicule : '') }), h('span', { text: { attente: 'à envoyer', envoye: 'envoyé', repondu: 'a répondu', echec: 'échec' + (d.erreur ? ' (' + d.erreur + ')' : ''), stop: 'STOP', exclu: 'exclu' }[d.statut] || d.statut }), d.reponse ? h('span', { style: { color: 'var(--vert)' }, text: '« ' + d.reponse + ' »' }) : null, d.statut === 'repondu' ? h('a', { text: 'ouvrir', style: { cursor: 'pointer' }, onclick: function () { modale.fermer(); self.vue = 'conversations'; self.ouvrirTel = d.tel; self.rendre(); } }) : null])); });
    var journal = h('div', { style: { fontSize: '11.5px', color: 'var(--encre-3)', maxHeight: '110px', overflow: 'auto' } });
    (c.journal || []).slice().reverse().forEach(function (j) { journal.appendChild(h('div', [h('b', { style: { fontFamily: 'var(--mono)', fontSize: '11px' }, text: quand(j.le) }), ' ', j.quoi, j.par ? h('span.doux', { text: ' · ' + nomCourt(j.par) }) : null])); });
    var actions = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } });
    if (peut) {
      if (['brouillon', 'planifiee', 'pause'].indexOf(c.etat) >= 0) actions.appendChild(h('button.btn.petit.fantome', { type: 'button', text: 'Modifier', onclick: function () { modale.fermer(); self.formCampagne(c); } }));
      if (['brouillon', 'planifiee', 'pause'].indexOf(c.etat) >= 0) actions.appendChild(h('button.btn.petit.fantome', { type: 'button', text: 'Tester sur mon cellulaire', onclick: function () { var tel = AMX.session.telephone || ''; self.demanderTexte('Texto de test', 'Un seul texto, au numéro donné.', '514 555-1234', tel ? telJoli(tel) : '').then(function (t) { if (t === null) return; self.action({ action: 'campagneTest', id: c.id, telephone: telChiffres(t) }, 'Texto de test envoyé'); }); } }));
      if (c.etat === 'brouillon' || c.etat === 'pause') actions.appendChild(h('button.btn.petit', { type: 'button', text: c.etat === 'pause' ? 'Reprendre' : 'Lancer maintenant', onclick: function () { AMX.confirmer(c.etat === 'pause' ? 'Reprendre la campagne' : 'Lancer la campagne', (c.attente || c.nDestinataires) + ' texto(s) partiront par lots de ' + c.lot + ' par minute, entre 9 h et 20 h.', { ok: 'Lancer' }).then(function (oui) { if (oui) etat('encours', null, 'Campagne lancée'); }); } }));
      if (c.etat === 'brouillon' || c.etat === 'pause') actions.appendChild(h('button.btn.petit.fantome', { type: 'button', text: 'Planifier…', onclick: function () { var inD = h('input.saisie', { type: 'datetime-local' }); AMX.modale({ titre: 'Planifier la campagne', corps: h('div.champ', [h('label', 'Date et heure de départ (9 h – 20 h)'), inD]), boutons: [{ texte: 'Annuler' }, { texte: 'Planifier', classe: 'primaire', action: function () { if (!inD.value) { AMX.toast('Choisissez une date', 'erreur'); return false; } return etat('planifiee', { planifieLe: new Date(inD.value).toISOString() }, 'Campagne planifiée').then(function () { return true; }); } }] }); } }));
      if (c.etat === 'encours') actions.appendChild(h('button.btn.petit.fantome', { type: 'button', text: 'Mettre en pause', onclick: function () { etat('pause', null, 'Campagne en pause'); } }));
      if (c.etat === 'planifiee') actions.appendChild(h('button.btn.petit.fantome', { type: 'button', text: 'Remettre en brouillon', onclick: function () { etat('brouillon', null, 'Remise en brouillon'); } }));
      if (['brouillon', 'planifiee', 'encours', 'pause'].indexOf(c.etat) >= 0) actions.appendChild(h('button.btn.petit.fantome.danger', { type: 'button', text: 'Annuler', onclick: function () { AMX.confirmer('Annuler ' + c.nom, 'Les textos non envoyés ne partiront pas.', { ok: 'Annuler la campagne', danger: true }).then(function (oui) { if (oui) etat('annulee', null, 'Campagne annulée'); }); } }));
    }
    var corps = h('div.txt-fiche-client', [dl, actions, h('h4', 'Destinataires'), dest, (c.journal || []).length ? h('details', [h('summary', { style: { cursor: 'pointer', fontSize: '12px', color: 'var(--encre-3)' }, text: 'Journal' }), journal]) : null]);
    var modale = AMX.modale({ titre: c.nom + ' — ' + nomCie(c.compagnie), corps: corps, large: true, boutons: [{ texte: 'Fermer' }] });
  };
  V.prototype.formCampagne = function (c) {
    var self = this, cie = (c && c.compagnie) || this.compagnie || AMX.codesPour('service')[0], codes = AMX.codesPour('service'), a = (c && c.audience) || {};
    var selCie = h('select.saisie', codes.map(function (k) { return h('option', { value: k, selected: k === cie ? true : undefined, text: nomCie(k) }); })); if (c) selCie.disabled = true;
    var inNom = h('input.saisie', { type: 'text', value: (c && c.nom) || '', placeholder: 'ex. Pneus d\'hiver 2026' });
    var inTexte = zoneTexte({ placeholder: 'Bonjour {prenom}, … — {prenom} {client} {vehicule} {concession} sont remplacés. « Répondez STOP… » est ajouté automatiquement.', style: { minHeight: '80px' } }, (c && c.texte) ? c.texte.replace(/\s*Répondez STOP pour ne plus recevoir de textos\.\s*$/, '') : '');
    var compte = h('div.doux.petit'); var majCompte = function () { var n = inTexte.value.length + 46; compte.textContent = n + ' caractères avec la mention STOP' + (n > 160 ? ' · ' + Math.ceil(n / 153) + ' textos par client' : ''); }; inTexte.addEventListener('input', majCompte); majCompte();
    var selSource = h('select.saisie', [h('option', { value: 'clients', selected: a.source !== 'liste' ? true : undefined, text: 'Clients de la concession (filtrés)' }), h('option', { value: 'liste', selected: a.source === 'liste' ? true : undefined, text: 'Liste de numéros collée' })]);
    var inMarque = h('input.saisie', { type: 'text', value: a.marque || '', placeholder: 'ex. BMW, X3, Golf' }), inSans = h('input.saisie', { type: 'number', value: a.sansVisiteMois || '', placeholder: 'mois' }), inAvec = h('input.saisie', { type: 'number', value: a.avecVisiteMois || '', placeholder: 'mois' });
    var inAvant = h('input.saisie', { type: 'date', value: a.visiteAvant || '' }), inApres = h('input.saisie', { type: 'date', value: a.visiteApres || '' }), inAnMin = h('input.saisie', { type: 'number', value: a.anneeMin || '', placeholder: '2015' }), inAnMax = h('input.saisie', { type: 'number', value: a.anneeMax || '', placeholder: '2024' });
    var selLangue = h('select.saisie', [h('option', { value: '', text: 'Toutes les langues' }), h('option', { value: 'fr', selected: a.langue === 'fr' ? true : undefined, text: 'Français' }), h('option', { value: 'en', selected: a.langue === 'en' ? true : undefined, text: 'English' })]);
    var inNumeros = zoneTexte({ placeholder: 'Un numéro par ligne : 514 555-1234;Prénom Nom;2021 BMW X3', style: { minHeight: '90px', fontFamily: 'var(--mono)', fontSize: '12px' } }, a.numeros || '');
    var inLot = h('input.saisie', { type: 'number', min: 1, max: 60, value: (c && c.lot) || 25, style: { width: '80px' } });
    var apercu = h('div.apercu-aud', { text: 'Cliquez « Compter » pour voir combien de clients reçoivent le message.' });
    var blocClients = h('div.grille', [h('div.champ', [h('label', 'Véhicule contient'), inMarque]), h('div.champ', [h('label', 'Langue'), selLangue]), h('div.champ', [h('label', 'Sans visite depuis (mois)'), inSans]), h('div.champ', [h('label', 'Visite dans les derniers (mois)'), inAvec]), h('div.champ', [h('label', 'Dernière visite avant le'), inAvant]), h('div.champ', [h('label', 'Dernière visite après le'), inApres]), h('div.champ', [h('label', 'Année min'), inAnMin]), h('div.champ', [h('label', 'Année max'), inAnMax])]);
    var blocListe = h('div.champ', [h('label', 'Numéros'), inNumeros]);
    var majSource = function () { var l = selSource.value === 'liste'; blocClients.classList.toggle('cache', l); blocListe.classList.toggle('cache', !l); }; selSource.addEventListener('change', majSource); majSource();
    var audience = function () { return selSource.value === 'liste' ? { source: 'liste', numeros: inNumeros.value } : { source: 'clients', marque: inMarque.value.trim(), langue: selLangue.value, sansVisiteMois: num(inSans.value) || '', avecVisiteMois: num(inAvec.value) || '', visiteAvant: inAvant.value, visiteApres: inApres.value, anneeMin: num(inAnMin.value) || '', anneeMax: num(inAnMax.value) || '' }; };
    var btnCompter = h('button.btn.petit', { type: 'button', text: 'Compter', onclick: function () { btnCompter.classList.add('occupe'); AMX.post({ action: 'campagneAudience', compagnie: selCie.value, audience: audience() }).then(function (d) { btnCompter.classList.remove('occupe'); if (!d || !d.ok) { apercu.textContent = (d && (d.erreur || d.message)) || 'Erreur'; return; } var ex = d.exclus || {}; apercu.textContent = d.total + ' client' + (d.total > 1 ? 's' : '') + ' recevront le message (' + d.minutes + ' min à 25 / min)' + (ex.consentement ? ' · ' + ex.consentement + ' sans consentement « offres »' : '') + (ex.stop ? ' · ' + ex.stop + ' STOP' : '') + (ex.sansCellulaire ? ' · ' + ex.sansCellulaire + ' sans cellulaire' : '') + (ex.doublons ? ' · ' + ex.doublons + ' doublon' + (ex.doublons > 1 ? 's' : '') : '') + (d.echantillon.length ? '. Ex. : ' + d.echantillon.slice(0, 5).map(function (x) { return x.client || telJoli(x.tel); }).join(', ') + '…' : ''); }).catch(function (e) { btnCompter.classList.remove('occupe'); apercu.textContent = AMX.erreurTexte(e); }); } });
    var corps = h('div.txt-camp-form', [
      h('div.grille', [h('div.champ', [h('label', 'Concession'), selCie]), h('div.champ', [h('label', 'Nom de la campagne'), inNom])]),
      h('div.champ', { style: { marginTop: '8px' } }, [h('label', 'Message'), inTexte, compte]),
      h('div.champ', { style: { marginTop: '8px' } }, [h('label', 'Audience'), selSource]),
      blocClients, blocListe,
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' } }, [btnCompter, h('span.doux.petit', 'Textos par minute :'), inLot]),
      apercu
    ]);
    AMX.modale({ titre: c ? 'Modifier la campagne' : 'Nouvelle campagne', corps: corps, large: true, boutons: [{ texte: 'Annuler' }, { texte: c ? 'Enregistrer' : 'Créer (brouillon)', classe: 'primaire', action: function () {
      if (!inNom.value.trim()) { AMX.toast('Nom requis', 'erreur'); return false; }
      if (!inTexte.value.trim()) { AMX.toast('Message requis', 'erreur'); return false; }
      return self.action({ action: 'campagneEnregistrer', campagne: { id: c ? c.id : undefined, compagnie: selCie.value, nom: inNom.value.trim(), texte: inTexte.value.trim(), audience: audience(), lot: num(inLot.value) || 25 } }, null).then(function (d) { if (!d || !d.ok) return false; AMX.toast('Campagne enregistrée — ' + d.campagne.nDestinataires + ' destinataire(s)', 'ok'); if (self.vue === 'campagnes') self.rendreCorps(); self.ficheCampagne(d.campagne); return true; });
    } }] });
  };

  /* ================================================================== automatisations */
  V.prototype.rendreAutos = function () {
    var self = this, zone = h('div.txt-autos'), corps = h('div');
    this.elCompte.textContent = '';
    zone.appendChild(corps); this.elCorps.appendChild(zone);
    corps.appendChild(AMX.chargeur('Automatisations', { compact: true }));
    var cie = this.compagnie || AMX.codesPour('service')[0];
    var p = { textoAutomations: 1, compagnie: cie };
    AMX.get(p, { secours: false, essais: 1 }).then(function (d) {
      AMX.vider(corps);
      if (!d || !d.ok) { corps.appendChild(h('div.vide', [h('h3', (d && (d.erreur || d.message)) || 'Automatisations indisponibles')])); return; }
      var reg = d.reglages[cie] || { automations: {} }, autos = reg.automations, peut = !!d.peutConfigurer, etatCourant = {};
      var nOn = Object.keys(autos).filter(function (k) { return autos[k].actif; }).length;
      corps.appendChild(h('div.txt-plus-barre', [h('span.doux.petit', { style: { marginLeft: 0 }, html: 'Textos envoyés tout seuls pour <b>' + AMX.esc(nomCie(cie)) + '</b>, entre ' + d.heures.debut + ' h et ' + d.heures.fin + ' h, jamais deux fois pour le même événement, jamais après un STOP ni sans consentement. ' + (nOn ? nOn + ' active' + (nOn > 1 ? 's' : '') : 'Toutes désactivées (règle : rien d\'automatique sans la direction).') + (d.etat && d.etat.le ? ' Dernier passage ' + quand(d.etat.le) + '.' : '') }), !self.compagnie && AMX.codesPour('service').length > 1 ? h('span.doux.petit', 'Choisissez une concession ci-dessus pour régler les autres.') : null]));
      var liste = h('div');
      Object.keys(autos).forEach(function (k) {
        var a = autos[k], on = !!a.actif;
        var sw = h('button.interrupteur' + (on ? '.on' : ''), { type: 'button', title: on ? 'Désactiver' : 'Activer', disabled: peut ? undefined : true, onclick: function () { on = !on; sw.classList.toggle('on', on); el.classList.toggle('on', on); } });
        var inTexte = zoneTexte({ disabled: peut ? undefined : true }, a.texte), regl = h('div.regl');
        var inDelai = a.delai !== undefined ? h('input.saisie', { type: 'number', min: 0, value: a.delai, disabled: peut ? undefined : true }) : null, inHeure = a.heure !== undefined ? h('input.saisie', { type: 'time', value: a.heure, disabled: peut ? undefined : true, style: { width: '110px' } }) : null;
        if (inDelai) { regl.appendChild(h('span', 'Délai :')); regl.appendChild(inDelai); regl.appendChild(h('span', { text: a.mois ? 'mois' : 'jour(s)' })); }
        if (inHeure) { regl.appendChild(h('span', 'Heure d\'envoi :')); regl.appendChild(inHeure); }
        var el = h('div.auto' + (on ? '.on' : ''), [h('div.t', [sw, h('b', { text: a.titre }), d.compteurs30j && d.compteurs30j[k] ? h('span.badge.gris', { text: d.compteurs30j[k] + ' en 30 j' }) : null, h('span.q', { text: a.quand })]), regl, inTexte, a.texte !== a.texteDefaut && peut ? h('button.btn.petit.fantome', { type: 'button', text: 'Texte par défaut', onclick: function () { inTexte.value = a.texteDefaut; } }) : null]);
        etatCourant[k] = function () { var o = { actif: on, texte: inTexte.value.trim() }; if (inDelai) o.delai = num(inDelai.value); if (inHeure) o.heure = inHeure.value; return o; };
        liste.appendChild(el);
      });
      corps.appendChild(liste);
      if (reg.courtoisie) corps.appendChild(h('div.doux.petit', { style: { margin: '4px 0 10px' }, text: 'Le suivi de courtoisie des estimés (note après les travaux) se règle dans Réglages : ' + (reg.courtoisie.auto ? 'automatique, ' + reg.courtoisie.delaiJours + ' jour(s) après ' + (reg.courtoisie.apres === 'paye' ? 'le paiement' : 'les travaux terminés') : 'manuel (bouton ★ sur l\'estimé)') + '.' }));
      if (peut) corps.appendChild(h('div', { style: { display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' } }, [h('button.btn.primaire', { type: 'button', text: 'Enregistrer', onclick: function () { var o = {}; Object.keys(etatCourant).forEach(function (k) { o[k] = etatCourant[k](); }); self.action({ action: 'textoAutomations', compagnie: cie, automations: o }, 'Automatisations enregistrées').then(function (r) { if (r && r.ok) { AMX.texto.invalider(); self.rendreCorps(); } }); } }), AMX.estAdmin() ? h('button.btn.fantome', { type: 'button', text: 'Passer maintenant', title: 'Lance tout de suite le passage des automatisations et des campagnes (sinon : aux 5 minutes)', onclick: function () { self.action({ action: 'textoAutomationsPasser' }, null).then(function (r) { if (r && r.ok) { var e = r.etat || {}, n = (e.automatisations && e.automatisations.envoyes) || 0, nc = (e.campagnes && e.campagnes.envoyes) || 0; AMX.toast(n + ' texto(s) automatique(s), ' + nc + ' de campagne' + ((e.automatisations && e.automatisations.erreurs || []).length ? ' — ' + e.automatisations.erreurs.slice(0, 2).join(' ; ') : ''), 'ok', 7000); self.rendreCorps(); } }); } }) : null]));
      /* journal */
      if ((d.journal || []).length) {
        var tbody = h('tbody');
        d.journal.forEach(function (j) { tbody.appendChild(h('tr.cliquable', { onclick: function () { if (j.telephone) { self.vue = 'conversations'; self.ouvrirTel = j.telephone; self.rendre(); } } }, [h('td', { text: quand(j.le) }), h('td', { text: j.titre }), h('td', [h('b', { text: j.client || j.telephoneJoli }), j.client ? h('span.sous', { text: j.telephoneJoli }) : null]), h('td', { text: j.statut + (j.note !== null && j.note !== undefined ? ' · note ' + j.note + '/5' : '') + (j.detail && j.statut === 'echec' ? ' · ' + j.detail : '') }), h('td', { text: (j.texte || '').slice(0, 90) })])); });
        corps.appendChild(h('div', [h('h4', { style: { margin: '10px 0 6px', fontSize: '13px' }, text: 'Derniers envois automatiques' }), h('table.tableau', [h('thead', [h('tr', [h('th', 'Quand'), h('th', 'Règle'), h('th', 'Client'), h('th', 'État'), h('th', 'Texte')])]), tbody])]));
      } else corps.appendChild(h('div.vide-petit', 'Aucun texto automatique envoyé pour l\'instant.'));
    }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('div.vide', [h('h3', 'Automatisations indisponibles'), h('div.doux', { text: AMX.erreurTexte(e) })])); });
  };

  /* ================================================================== statistiques : par employé (ajouté aux statistiques existantes) */
  var rendreStatsBase = V.prototype.rendreStats;
  V.prototype.rendreStats = function () {
    var self = this;
    rendreStatsBase.apply(this, arguments);
    var zone = this.elCorps.querySelector('.txt-stats') || this.elCorps, bloc = h('div.emp', [h('h4', 'Par employé (30 jours)'), AMX.chargeur('Métriques', { compact: true })]);
    zone.insertBefore(bloc, zone.firstChild);
    var p = { textoStats: 1, jours: 30 }; if (this.compagnie) p.compagnie = this.compagnie;
    AMX.get(p, { secours: false, essais: 1 }).then(function (d) {
      AMX.vider(bloc); bloc.appendChild(h('h4', 'Par employé (30 jours)'));
      if (!d || !d.ok) { bloc.appendChild(h('div.doux.petit', { text: (d && (d.erreur || d.message)) || 'Métriques indisponibles' })); return; }
      if (!d.employes.length) { bloc.appendChild(h('div.doux.petit', 'Aucun texto envoyé par un employé depuis 30 jours.')); return; }
      var tbody = h('tbody');
      d.employes.forEach(function (e) { tbody.appendChild(h('tr', [h('td', { text: self.nomConseiller(self.compagnie, e.id) || e.nom }), h('td.num', { text: e.messages }), h('td.num', { text: e.conversations }), h('td.num', { text: e.photos }), h('td.num', { text: e.videos }), h('td.num', { text: e.estimes }), h('td.num', { text: e.paiements }), h('td.num', { text: e.medianeMin === null ? '—' : duree(e.medianeMin) + ' (' + e.reponses + ')' })])); });
      var t = d.totaux;
      tbody.appendChild(h('tr', { style: { fontWeight: 700 } }, [h('td', 'Total'), h('td.num', { text: t.messages }), h('td.num', ''), h('td.num', { text: t.photos }), h('td.num', { text: t.videos }), h('td.num', { text: t.estimes }), h('td.num', { text: t.paiements }), h('td.num', { text: t.medianeMin === null ? '—' : duree(t.medianeMin) })]));
      bloc.appendChild(h('table.tableau', [h('thead', [h('tr', [h('th', 'Employé'), h('th.num', 'Textos'), h('th.num', 'Conversations'), h('th.num', 'Photos'), h('th.num', 'Vidéos'), h('th.num', 'Estimés'), h('th.num', 'Paiements'), h('th.num', 'Réponse médiane')])]), tbody]));
      var autos = Object.keys(d.automatisations || {}).map(function (k) { return d.automatisations[k] + ' ' + k; });
      bloc.appendChild(h('div.doux.petit', { style: { marginTop: '4px' }, text: t.entrants + ' texto' + (t.entrants > 1 ? 's' : '') + ' reçu' + (t.entrants > 1 ? 's' : '') + ' · ' + t.automatiques + ' automatique' + (t.automatiques > 1 ? 's' : '') + (autos.length ? ' (' + autos.join(', ') + ')' : '') + ' · ' + t.campagnes + ' de campagne' }));
    }).catch(function (e) { AMX.vider(bloc); bloc.appendChild(h('div.doux.petit', { text: AMX.erreurTexte(e) })); });
  };
})();
