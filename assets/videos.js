/* Marketing › Vidéos (26 nov. 2026) — script Videos.gs, clé d'onglet marketing/video.
   Décisions de Maxime (26 nov.) : deux façons de faire une vidéo — (1) filmer dans l'app avec la caméra guidée de 60 à 90 s ;
   (2) monter une vidéo à partir des photos du site de la concession (D2C). Rendu par Creatomate (clé dans Admin › Vidéos).
   On commence par BMW Sherbrooke : occasions et offres de location d'occasion.
   Einstein écrit le script, choisit les photos, le gabarit, la durée et le format, fait 3 versions par véhicule et choisit les
   véhicules de la semaine. Une personne regarde les aperçus et la direction approuve : RIEN NE SE PUBLIE TOUT SEUL. Une fois la
   vidéo publiée à la main (Meta : étiquette « Contenu IA » obligatoire), on la marque « publiée » et on note ses résultats.
   Formats : 9:16 1080 × 1920 (zone sûre 14 % haut, 35 % bas, 6 % côtés — dessinée sur l'aperçu), 4:5 pour le fil ; 15 à 30 s.
   Rien ne se garde dans le navigateur. */
(function () {
  'use strict';
  var A = AMX, h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez la version qui contient Videos.gs.';

  var CSS = [
    '.vid-page { max-width: 1180px; }',
    '.vid-cies { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; } .vid-cies button { border: 1px solid var(--ligne); background: var(--carte); border-radius: 999px; padding: 7px 14px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; } .vid-cies button.actif { background: var(--encre); color: #fff; border-color: var(--encre); }',
    '.vid-bande { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 12px 16px; margin: 0 0 14px; font-size: 14px; } .vid-bande .t { flex: 1 1 320px; } .vid-bande .t b { font-size: 16px; } .vid-bande .m { color: var(--encre-3); margin-top: 2px; }',
    '.vid-titre { margin: 18px 0 8px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--encre-2); }',
    '.vid-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }',
    '.vid-carte { display: flex; gap: 10px; text-align: left; border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 10px; font: inherit; color: var(--encre); cursor: pointer; width: 100%; }',
    '.vid-carte:hover { border-color: var(--encre-3); } .vid-carte img, .vid-carte .ph { width: 64px; height: 64px; border-radius: 8px; object-fit: cover; background: var(--fond); flex: 0 0 64px; }',
    '.vid-carte .c { min-width: 0; flex: 1; } .vid-carte b { display: block; font-size: 14px; } .vid-carte .m { font-size: 13px; color: var(--encre-3); margin-top: 2px; } .vid-carte .pz { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }',
    '.vid-p { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 2px 9px; white-space: nowrap; } .vid-p.ambre { background: #fff1d6; color: #8a4b00; } .vid-p.bleu { background: #e7f0fb; color: #0b5cad; } .vid-p.vert { background: #e3f4ea; color: var(--vert-fonce); } .vid-p.gris { background: var(--fond); color: var(--encre-3); } .vid-p.rouge { background: #fde2e2; color: var(--rouge); } .vid-p.violet { background: #efe7fb; color: #5b2a9c; }',
    '.vid-vide { padding: 22px; text-align: center; color: var(--encre-3); border: 1px dashed var(--ligne); border-radius: 12px; }',
    '.vid-boite { border-radius: 10px; padding: 10px 12px; margin: 0 0 10px; font-size: 14px; line-height: 1.45; } .vid-boite ul { margin: 6px 0 0 18px; padding: 0; } .vid-boite.rouge { background: #fde2e2; border: 1px solid #f3b4b4; } .vid-boite.ambre { background: #fff6e5; border: 1px solid #f0c36d; } .vid-boite.bleu { background: #eef5fd; border: 1px solid #b9d3f2; }',
    /* fiche : les 3 versions côte à côte */
    '.vid-versions { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 14px; }',
    '.vid-version { border: 2px solid var(--ligne); border-radius: 14px; padding: 10px; background: var(--carte); display: flex; flex-direction: column; gap: 8px; } .vid-version.choisie { border-color: var(--vert); box-shadow: 0 0 0 1px var(--vert) inset; }',
    '.vid-version .haut { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; } .vid-version .haut b { font-size: 15px; } .vid-version .pq { font-size: 13px; color: var(--encre-3); }',
    '.vid-tel { position: relative; width: 100%; max-width: 230px; margin: 0 auto; aspect-ratio: 9 / 16; border-radius: 18px; overflow: hidden; background: #141A1F; }',
    '.vid-tel.f45 { aspect-ratio: 4 / 5; max-width: 260px; } .vid-tel video, .vid-tel img { width: 100%; height: 100%; object-fit: cover; display: block; }',
    '.vid-tel .zone { position: absolute; left: 6%; right: 6%; top: 14%; bottom: 35%; border: 1px dashed rgba(255,255,255,.55); border-radius: 6px; pointer-events: none; } .vid-tel.f45 .zone { top: 8%; bottom: 10%; }',
    '.vid-tel .st { position: absolute; left: 8%; right: 8%; bottom: 43%; text-align: center; color: #fff; font-weight: 700; font-size: 14px; line-height: 1.25; background: rgba(0,0,0,.55); border-radius: 8px; padding: 4px 6px; }',
    '.vid-tel .acc { position: absolute; left: 8%; right: 8%; top: 20%; text-align: center; color: #fff; font-weight: 800; font-size: 16px; text-transform: uppercase; text-shadow: 0 1px 4px rgba(0,0,0,.6); }',
    '.vid-tel .etat { position: absolute; left: 8px; top: 8px; } .vid-tel .nav { position: absolute; bottom: 8px; left: 0; right: 0; display: flex; justify-content: center; gap: 6px; } .vid-tel .nav button { border: 0; border-radius: 999px; background: rgba(255,255,255,.85); padding: 3px 10px; font: inherit; font-size: 12px; cursor: pointer; }',
    '.vid-scenes { margin: 0; padding: 0 0 0 18px; font-size: 13px; } .vid-scenes li { margin: 2px 0; } .vid-scenes .d { color: var(--encre-3); }',
    '.vid-version .act { display: flex; flex-wrap: wrap; gap: 6px; }',
    '.vid-mention { font-size: 12px; color: var(--encre-2); background: var(--fond); border-radius: 8px; padding: 8px 10px; line-height: 1.45; }',
    '.vid-ed { display: flex; flex-direction: column; gap: 8px; } .vid-ed label { display: flex; flex-direction: column; gap: 3px; font-size: 13px; font-weight: 700; } .vid-ed .sc { display: grid; grid-template-columns: 1fr 76px 70px; gap: 6px; align-items: end; } .vid-ed .cpt { font-weight: 400; color: var(--encre-3); } .vid-ed .cpt.trop { color: var(--rouge); font-weight: 700; }',
    '.vid-types { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; margin: 0 0 12px; } .vid-type { text-align: left; border: 2px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 10px; font: inherit; cursor: pointer; color: var(--encre); } .vid-type b { display: block; } .vid-type span { display: block; font-size: 13px; color: var(--encre-3); margin-top: 3px; line-height: 1.35; } .vid-type.actif { border-color: var(--vert); box-shadow: 0 0 0 1px var(--vert) inset; }',
    '.vid-champs { display: flex; flex-direction: column; gap: 10px; } .vid-champs label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; font-weight: 600; } .vid-champs .aide { font-weight: 400; font-size: 13px; color: var(--encre-3); } .vid-champs textarea { min-height: 80px; }',
    '.vid-cases label { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; margin: 6px 0; line-height: 1.4; }',
    '.vid-legende { white-space: pre-wrap; font-size: 13px; background: var(--fond); border-radius: 8px; padding: 10px; max-height: 220px; overflow: auto; }',
    '@media (max-width: 640px) { .vid-tel { max-width: 200px; } .vid-ed .sc { grid-template-columns: 1fr 64px 60px; } }'
  ].join('\n');
  function css() { if (!document.getElementById('css-videos')) { var s = document.createElement('style'); s.id = 'css-videos'; s.textContent = CSS; document.head.appendChild(s); } }
  function perms() { return (A.session && A.session.perms) || {}; }
  function role() { var p = perms(); return String(p.role || (A.session && A.session.role) || ''); }
  function peutVoir() { var p = perms(), r = role(); return ['proprietaire', 'admin', 'gestionnaire', 'direction_ventes', 'direction_service', 'marketing'].indexOf(r) >= 0 || !!(p.gererUtilisateurs || p.gererAdmins); }
  function estProprio() { var p = perms(); return role() === 'proprietaire' || !!p.gererAdmins; }

  var ETATS = { script: ['Script à relire', 'ambre'], rendu: ['Aperçus', 'bleu'], approuvee: ['Approuvée — à publier', 'violet'], publiee: ['Publiée', 'vert'], retiree: ['Retirée', 'gris'] };
  var GAB_ORDRE = ['tour', 'location', 'arrivage', 'educatif', 'temoignage'];
  function pastille(t, c) { return h('span.vid-p.' + c, { text: t }); }
  function etatP(e) { var x = ETATS[e] || [e, 'gris']; return pastille(x[0], x[1]); }
  function sec(n) { return String(Math.round(n * 10) / 10).replace('.', ',') + ' s'; }

  /* ---- Données ---- */
  var cache = { rep: null, le: 0, cie: '' };
  function charger(force, cie) {
    if (!force && cache.rep && cache.cie === (cie || cache.cie) && Date.now() - cache.le < A.dureeCopie(60000)) return Promise.resolve(cache.rep);
    var q = { videos: '1' }; if (cie) q.compagnie = cie;
    return A.get(q, { delai: 90000, secours: false }).then(function (d) {
      if (d && d.refuse) throw new Error(d.erreur || 'Accès refusé.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!Array.isArray(d.videos)) throw new Error(SCRIPT_PAS_A_JOUR);
      cache = { rep: d, le: Date.now(), cie: d.compagnie };
      return d;
    });
  }
  function lireVideo(id) {
    return A.get({ videoFiche: id }, { delai: 90000, secours: false }).then(function (d) {
      if (!d || d.ok === false || !d.video) throw new Error((d && d.erreur) || 'Vidéo introuvable.');
      return d;
    });
  }
  function poster(corps, delai) {
    return A.post(corps, { delai: delai || 120000 }).then(function (r) {
      if (r && r.vehicules && r.ok !== false && !r.video && !r.message) throw new Error(SCRIPT_PAS_A_JOUR);
      if (!r || r.ok === false || r.refuse) throw new Error((r && r.erreur) || 'Refusé.');
      cache.le = 0;
      return r;
    });
  }
  function compteur() {
    var d = cache.rep; if (!d) return '';
    var n = d.videos.filter(function (v) { return v.etat === 'script' || (v.etat === 'rendu' && v.apercusPrets > 0); }).length;
    return n ? String(n) : '';
  }

  /* ---- La page ---- */
  function VueVideos(conteneur) {
    css();
    var self = this;
    this.conteneur = conteneur; this.detruit = false;
    A.vider(conteneur);
    this.btnNouvelle = h('button.btn.primaire', { type: 'button', text: 'Nouvelle vidéo', onclick: function () { self.nouvelle(); } });
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    conteneur.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Vidéos'), h('p', { text: 'Einstein écrit trois versions par véhicule à partir des photos du site ou du clip filmé dans l\'app ; vous regardez les aperçus, la direction approuve. Rien ne se publie tout seul.' })]),
      h('div.actions', A.actionsEntete ? A.actionsEntete([this.btnRafraichir, this.btnNouvelle], [this.btnNouvelle]) : [this.btnRafraichir, this.btnNouvelle])
    ]));
    this.elCies = h('div.vid-cies'); conteneur.appendChild(this.elCies);
    this.elCorps = h('div.vid-page'); conteneur.appendChild(this.elCorps);
    this.charger(false);
  }
  VueVideos.prototype.demonter = function () { this.detruit = true; };
  VueVideos.prototype.charger = function (force) {
    var self = this;
    if (!cache.rep) { A.vider(this.elCorps); this.elCorps.appendChild(A.chargeur('Vidéos')); }
    return charger(force, this.cie).then(function (d) { if (self.detruit) return; self.rep = d; self.cie = d.compagnie; self.rendre(); }).catch(function (e) {
      if (self.detruit) return; A.vider(self.elCorps); self.elCorps.appendChild(h('div.vid-vide', { text: A.erreurTexte(e) }));
    });
  };
  VueVideos.prototype.rendre = function () {
    var self = this, d = this.rep, r = d.reglages || {};
    A.vider(this.elCies);
    if (d.compagnies.length > 1) d.compagnies.forEach(function (c) { self.elCies.appendChild(h('button' + (c.cle === d.compagnie ? '.actif' : ''), { type: 'button', text: c.nom, onclick: function () { self.cie = c.cle; self.charger(true); } })); });
    var c = this.elCorps; A.vider(c);
    /* état des outils */
    var nom = (d.compagnies.filter(function (x) { return x.cle === d.compagnie; })[0] || {}).nom || d.compagnie;
    c.appendChild(h('div.vid-bande', [
      h('div.t', [h('b', { text: nom }), h('div.m', { text: (r.present ? 'Creatomate branché' : 'Creatomate pas encore branché (Admin › Vidéos)') + ' · ' + (r.voix && r.voix.actif ? 'voix : ' + r.voix.nom : 'sous-titres seulement') + ' · ' + ((r.musiques || []).length ? r.musiques.length + ' musique(s) sous licence' : 'aucune musique') + ' · aperçus ce mois-ci : ' + (r.rendusCeMois || 0) + ' / ' + (r.maxRendusMois || 0) })]),
      d.ia ? null : pastille('Einstein absent du script', 'rouge'),
      r.present ? pastille('Rendu prêt', 'vert') : pastille('Clé à coller', 'ambre')
    ]));
    if (!r.present) c.appendChild(h('div.vid-boite.ambre', { text: 'Einstein peut déjà écrire les scripts. Pour voir les aperçus, le propriétaire colle la clé API de Creatomate dans Admin › Vidéos.' }));
    /* proposés et file */
    c.appendChild(h('div.vid-titre', { text: 'Proposés cette semaine par Einstein' }));
    var prop = d.proposes || [], file = d.file || [];
    if (!prop.length && !file.length) c.appendChild(h('div.vid-vide', { text: 'Rien à proposer : chaque véhicule arrivé depuis 24 h, en stock depuis 30 jours et plus, mis de l\'avant chez Google ou en offre de location a déjà sa vidéo ce mois-ci.' }));
    else {
      var g = h('div.vid-grille');
      prop.forEach(function (x) {
        var enFile = file.some(function (f) { return f.vin === x.vin && f.gabarit === x.gabarit; });
        g.appendChild(h('button.vid-carte', { type: 'button', onclick: function () { self.nouvelle({ vin: x.vin, gabarit: x.gabarit, raisons: x.raisons }); } }, [
          x.photo ? h('img', { src: x.photo, alt: '', loading: 'lazy' }) : h('div.ph'),
          h('div.c', [h('b', { text: x.nom || x.vin }), h('div.m', { text: (x.stock ? '# ' + x.stock + ' · ' : '') + ((d.gabarits[x.gabarit] || {}).nom || x.gabarit) }),
            h('div.pz', x.raisons.map(function (t) { return pastille(t, 'bleu'); }).concat(enFile ? [pastille('En file pour Einstein', 'gris')] : []))])
        ]));
      });
      c.appendChild(g);
      c.appendChild(h('div', { style: { marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, [
        h('button.btn.petit', { type: 'button', text: 'Mettre les proposés dans la file d\'Einstein', onclick: function (e) { var b = e.currentTarget; b.disabled = true; poster({ action: 'videoSemaine', compagnie: d.compagnie }).then(function (rr) { A.toast(rr.message, 'ok', 8000); self.charger(true); }).catch(function (er) { b.disabled = false; A.toast(A.erreurTexte(er), 'erreur', 9000); }); } }),
        h('span.petit.doux', { text: file.length ? file.length + ' en file : Einstein en écrit une par passage de l\'horloge (de 7 h à 21 h).' : 'Le lundi, l\'horloge le fait d\'elle-même.' })
      ]));
    }
    /* les vidéos */
    var groupes = [['À relire', function (v) { return v.etat === 'script' || v.etat === 'rendu'; }], ['Approuvées — à publier', function (v) { return v.etat === 'approuvee'; }], ['Publiées', function (v) { return v.etat === 'publiee'; }], ['Retirées', function (v) { return v.etat === 'retiree'; }]];
    groupes.forEach(function (gr) {
      var l = d.videos.filter(gr[1]); if (!l.length) return;
      c.appendChild(h('div.vid-titre', { text: gr[0] + ' (' + l.length + ')' }));
      var g2 = h('div.vid-grille');
      l.forEach(function (v) {
        var pz = [etatP(v.etat), pastille(v.gabaritNom, 'gris')];
        if (v.source === 'camera') pz.push(pastille('Filmée dans l\'app', 'violet'));
        if (v.apercusPrets) pz.push(pastille(v.apercusPrets + ' aperçu' + (v.apercusPrets > 1 ? 's' : ''), 'vert'));
        if (v.rendusEnCours) pz.push(pastille('rendu en cours', 'bleu'));
        if (v.versionsAvecProbleme) pz.push(pastille(v.versionsAvecProbleme + ' à corriger', 'rouge'));
        if (v.resultats && v.resultats.leads !== undefined) pz.push(pastille(v.resultats.leads + ' lead(s)', 'vert'));
        g2.appendChild(h('button.vid-carte', { type: 'button', onclick: function () { self.ouvrir(v.id); } }, [
          v.photo ? h('img', { src: v.photo, alt: '', loading: 'lazy' }) : h('div.ph'),
          h('div.c', [h('b', { text: v.id + ' · ' + (v.vehicule || v.titre || v.gabaritNom) }), h('div.m', { text: (v.stock ? '# ' + v.stock + ' · ' : '') + A.fmtDate(v.creeLe) + (v.creePar ? ' · ' + v.creePar : '') }), h('div.pz', pz)])
        ]));
      });
      c.appendChild(g2);
    });
    if (!d.videos.length) c.appendChild(h('div.vid-vide', { style: { marginTop: '12px' }, text: 'Aucune vidéo encore. « Nouvelle vidéo », ou touchez un véhicule proposé.' }));
    /* ce qu'Einstein a appris */
    var ap = d.apprentissage || {};
    if (ap.videosPubliees) c.appendChild(h('details.vid-boite.bleu', { style: { marginTop: '14px' } }, [h('summary', { style: { cursor: 'pointer', fontWeight: 700 }, text: 'Ce qu\'Einstein retient des ' + ap.videosPubliees + ' vidéo(s) publiée(s)' }),
      h('ul', (ap.meilleures || []).map(function (x) { return h('li', { text: (d.gabarits[x.gabarit] || {}).nom + ' · « ' + (x.accroche || '') + ' » · ' + (x.vues || 0) + ' vues · ' + (x.completionPct || 0) + ' % regardée au complet · ' + (x.leads || 0) + ' lead(s)' + (x.clicsGoogleApres !== undefined ? ' · clics Google ' + x.clicsGoogleAvant + ' → ' + x.clicsGoogleApres : '') }); }))]));
  };

  /* ---- Nouvelle vidéo ---- */
  VueVideos.prototype.nouvelle = function (pre) {
    var self = this, d = this.rep; pre = pre || {};
    var gab = pre.gabarit || 'tour';
    var elTypes = h('div.vid-types'), champs = h('div.vid-champs');
    var vin = h('input', { type: 'text', value: pre.vin || '', placeholder: 'NIV (17 caractères)', autocomplete: 'off', spellcheck: 'false', maxlength: '17' });
    var sujet = h('input', { type: 'text', placeholder: 'Ex. : louer une BMW d\'occasion plutôt qu\'une neuve' });
    var faits = h('textarea', { placeholder: 'Les faits que l\'équipe confirme (un par ligne). Einstein n\'invente rien d\'autre.' });
    var demande = h('input', { type: 'text', placeholder: 'Facultatif : ce qu\'Einstein doit savoir (ton, public…)' });
    var tPrenom = h('input', { type: 'text', placeholder: 'Prénom et initiale (ex. Julie B.)' }), tCit = h('textarea', { placeholder: 'Les mots exacts du client, tels qu\'écrits sur son accord (220 caractères au plus)', maxlength: '220' });
    var tAccord = h('input', { type: 'text', placeholder: 'Où est l\'accord écrit signé (ex. Drive › Consentements › 2026-11-20 Julie B.pdf)' }), tLe = h('input', { type: 'date' });
    function dessiner() {
      A.vider(elTypes); A.vider(champs);
      GAB_ORDRE.forEach(function (k) { var G = d.gabarits[k]; elTypes.appendChild(h('button.vid-type' + (k === gab ? '.actif' : ''), { type: 'button', onclick: function () { gab = k; dessiner(); } }, [h('b', { text: G.nom }), h('span', { text: G.desc })])); });
      var G = d.gabarits[gab];
      champs.appendChild(h('label', [h('span', { text: G.vehicule ? 'Le véhicule' : 'Le véhicule (facultatif, pour les images)' }), vin, h('span.aide', { text: 'Il doit être sur le site de la concession : la vidéo prend ses photos, son prix et son km. Pour un clip filmé, passez par l\'app (Marketing › Filmer un véhicule).' })]));
      if (gab === 'educatif') champs.appendChild(h('label', [h('span', { text: 'Le sujet du conseil' }), sujet]));
      if (gab === 'educatif' || gab === 'tour' || gab === 'arrivage') champs.appendChild(h('label', [h('span', { text: 'Faits de l\'équipe' }), faits]));
      if (gab === 'temoignage') {
        champs.appendChild(h('div.vid-boite.ambre', { text: 'Loi 25 : un témoignage demande l\'accord écrit du client, daté, qui couvre ces mots et leur diffusion. Sans accord, pas de témoignage. Pas de photo ni de voix du client sans un accord pour son image.' }));
        champs.appendChild(h('label', [h('span', { text: 'Prénom affiché' }), tPrenom]));
        champs.appendChild(h('label', [h('span', { text: 'La citation' }), tCit]));
        champs.appendChild(h('label', [h('span', { text: 'Accord écrit du client' }), tAccord]));
        champs.appendChild(h('label', [h('span', { text: 'Date de l\'accord' }), tLe]));
      }
      if (gab === 'location') champs.appendChild(h('div.vid-boite.bleu', { text: 'L\'offre vient de la page des offres de location (Inventaire › Location BMW › Offres du site). La mention complète (durée, 0 $ comptant, taux, km, obligation totale, option d\'achat, validité) est écrite par le système.' }));
      champs.appendChild(h('label', [h('span', { text: 'Pour Einstein' }), demande]));
      if (pre.raisons && pre.raisons.length) champs.appendChild(h('div.petit.doux', { text: 'Proposé parce que : ' + pre.raisons.join(', ') + '.' }));
    }
    dessiner();
    A.modale({ titre: 'Nouvelle vidéo', corps: h('div', [elTypes, champs]), boutons: [{ texte: 'Annuler' }, { texte: 'Écrire les 3 versions', classe: 'primaire', action: function (f, b) {
      var corps = { action: 'videoGenerer', compagnie: d.compagnie, gabarit: gab, source: 'photos', vin: vin.value.trim().toUpperCase(), sujet: sujet.value.trim(), faits: faits.value.trim(), demande: demande.value.trim(), raisons: pre.raisons || [] };
      if (gab === 'temoignage') corps.temoignage = { prenom: tPrenom.value.trim(), citation: tCit.value.trim(), accordEcrit: tAccord.value.trim(), accordLe: tLe.value };
      b.disabled = true; b.textContent = 'Einstein écrit… (30 à 60 s)';
      poster(corps, 150000).then(function (r) { f(); A.toast(r.message, 'ok', 7000); self.charger(true); self.ouvrir(r.id); }).catch(function (e) { b.disabled = false; b.textContent = 'Écrire les 3 versions'; A.toast(A.erreurTexte(e), 'erreur', 10000); });
      return false;
    } }] });
  };

  /* ---- La fiche d'une vidéo ---- */
  VueVideos.prototype.ouvrir = function (id) {
    var self = this, p = null, peutApprouver = false, corps = h('div', [A.chargeur('Vidéo ' + id, { compact: true })]), minuterie = null, modale = null;
    function apres(r) { if (r && r.video) { p = r.video; dessiner(); } self.charger(true); }
    function charger() { return lireVideo(id).then(function (d) { p = d.video; peutApprouver = !!d.peutApprouver; dessiner(); }).catch(function (e) { A.vider(corps); corps.appendChild(h('div.vid-vide', { text: A.erreurTexte(e) })); }); }
    function enCours() { return p && p.versions.some(function (v) { return Object.keys(v.rendus || {}).some(function (f) { var s = v.rendus[f].statut; return s !== 'succeeded' && s !== 'failed'; }); }); }
    function surveiller() { clearTimeout(minuterie); if (enCours() && corps.isConnected) minuterie = setTimeout(function () { charger().then(surveiller); }, 15000); }
    function act(texte, classe, fn) { return h('button.btn.petit' + (classe ? '.' + classe : ''), { type: 'button', text: texte, onclick: function (e) { var b = e.currentTarget; b.disabled = true; Promise.resolve(fn()).then(function () { b.disabled = false; }, function (er) { b.disabled = false; A.toast(A.erreurTexte(er), 'erreur', 10000); }); } }); }
    function telephone(v, format) {
      var r = (v.rendus || {})[format], el = h('div.vid-tel' + (format === '4:5' ? '.f45' : ''));
      if (r && r.statut === 'succeeded' && r.url) { el.appendChild(h('video', { src: r.url, controls: true, playsinline: true, preload: 'metadata' })); return el; }
      /* storyboard : les images d'Einstein, ses sous-titres, la zone sûre */
      var i = 0, img = h('img', { alt: '' }), st = h('div.st'), acc = h('div.acc', { text: v.accroche || '' });
      function montrer() {
        var s = v.scenes[i] || {}; img.src = s.photo !== undefined ? (p.photos[s.photo] || '') : (p.photos[0] || '');
        st.textContent = s.texte || ''; acc.style.display = i === 0 ? '' : 'none';
      }
      el.appendChild(img); el.appendChild(h('div.zone')); el.appendChild(acc); el.appendChild(st);
      el.appendChild(h('div.etat', [r ? (r.statut === 'failed' ? pastille('Rendu refusé', 'rouge') : pastille('Rendu en cours…', 'bleu')) : pastille('Script', 'ambre')]));
      el.appendChild(h('div.nav', [h('button', { type: 'button', text: '‹', onclick: function () { i = (i + v.scenes.length - 1) % v.scenes.length; montrer(); } }), h('button', { type: 'button', text: (v.etape ? '' : '') + '›', onclick: function () { i = (i + 1) % v.scenes.length; montrer(); } })]));
      montrer();
      return el;
    }
    function version(v) {
      var choisie = p.choix && p.choix.version === v.n, r916 = (v.rendus || {})['9:16'], r45 = (v.rendus || {})['4:5'];
      var bloc = h('div.vid-version' + (choisie ? '.choisie' : ''));
      bloc.appendChild(h('div.haut', [h('b', { text: 'Version ' + v.n + ' — ' + (v.angle || '') }), h('span.pq', { text: sec(v.duree) + ' · ' + v.format })]));
      bloc.appendChild(telephone(v, '9:16'));
      if (r916 && r916.statut === 'failed') bloc.appendChild(h('div.vid-boite.rouge', { text: 'Creatomate : ' + (r916.erreur || 'rendu refusé') }));
      if ((v.problemes || []).length) bloc.appendChild(h('div.vid-boite.rouge', [h('b', { text: 'À corriger avant l\'aperçu' }), h('ul', v.problemes.map(function (t) { return h('li', { text: t }); }))]));
      bloc.appendChild(h('div.petit', [h('b', { text: v.titre || '' }), v.pourquoi ? h('div.doux', { text: v.pourquoi }) : null]));
      bloc.appendChild(h('ol.vid-scenes', v.scenes.map(function (s) { return h('li', [document.createTextNode(s.texte || '—'), h('span.d', { text: ' · ' + sec(s.duree) + (s.etape ? ' · clip « ' + s.etape + ' »' : s.photo !== undefined ? ' · photo ' + (s.photo + 1) : '') })]); })));
      bloc.appendChild(h('div.petit.doux', { text: 'Appel : ' + v.cta + ' · Musique : ' + (v.musique === 'aucune' ? 'aucune' : v.musique) + (v.narration ? ' · Voix : « ' + v.narration.slice(0, 80) + (v.narration.length > 80 ? '…' : '') + ' »' : ' · sous-titres seulement') }));
      var a = h('div.act');
      if (p.etat !== 'publiee' && p.etat !== 'retiree') {
        if (!(v.problemes || []).length) a.appendChild(act(r916 ? 'Refaire l\'aperçu' : 'Faire l\'aperçu', r916 ? '' : 'primaire', function () { return poster({ action: 'videoRendre', id: p.id, version: v.n, format: '9:16' }).then(function (r) { A.toast(r.message, 'ok', 7000); apres(r); surveiller(); }); }));
        a.appendChild(act('Modifier', '', function () { return modifier(v); }));
        a.appendChild(act('Demander à Einstein', '', function () { return einstein(v); }));
        if (peutApprouver && r916 && r916.statut === 'succeeded' && !(v.problemes || []).length) a.appendChild(act('Approuver celle-ci…', 'primaire', function () { return approuver(v); }));
      }
      if (choisie) {
        if (!r45) a.appendChild(act('Faire aussi le 4:5 (fil)', '', function () { return poster({ action: 'videoRendre', id: p.id, version: v.n, format: '4:5' }).then(function (r) { A.toast(r.message, 'ok'); apres(r); surveiller(); }); }));
        else if (r45.statut === 'succeeded') a.appendChild(h('a.btn.petit', { href: r45.url, target: '_blank', rel: 'noopener', text: 'Télécharger le 4:5' }));
        if (r916 && r916.url) a.appendChild(h('a.btn.petit', { href: r916.url, target: '_blank', rel: 'noopener', text: 'Télécharger le 9:16' }));
      }
      bloc.appendChild(a);
      if (choisie || p.etat === 'approuvee' || p.etat === 'publiee') bloc.appendChild(h('details', [h('summary.petit', { style: { cursor: 'pointer', fontWeight: 700 }, text: 'Texte du message (à coller sous la vidéo)' }), h('div.vid-legende', { text: v.legende }), act('Copier le texte', '', function () { A.copier(v.legende, 'Texte copié.'); })]));
      return bloc;
    }
    function dessiner() {
      A.vider(corps);
      var veh = p.vehicule || {};
      corps.appendChild(h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', margin: '0 0 10px' } }, [etatP(p.etat), pastille(p.gabaritNom, 'gris'), p.source === 'camera' ? pastille('Clip de ' + Math.round((p.clip || {}).duree || 0) + ' s filmé dans l\'app', 'violet') : pastille((p.photos || []).length + ' photos du site', 'gris'),
        h('span.petit.doux', { text: (veh.nom ? veh.nom + (p.stock ? ' · # ' + p.stock : '') + ' · ' : '') + 'créée le ' + A.fmtDate(p.creeLe) + (p.creePar ? ' par ' + p.creePar : '') + (p.approuveLe ? ' · approuvée le ' + A.fmtDate(p.approuveLe) + ' par ' + p.approuvePar : '') }),
        veh.url ? h('a.petit', { href: veh.url, target: '_blank', rel: 'noopener', text: 'Fiche du site' }) : null]));
      if ((p.aVerifier || []).length) corps.appendChild(h('div.vid-boite.bleu', [h('b', { text: 'À confirmer avant d\'approuver' }), h('ul', p.aVerifier.map(function (t) { return h('li', { text: t }); }))]));
      if (p.etat === 'approuvee') corps.appendChild(h('div.vid-boite.ambre', { text: 'Approuvée : rien n\'est publié. Téléchargez la version choisie, publiez-la vous-même (sur Facebook et Instagram, activez l\'étiquette « Contenu IA »), puis « Marquer publiée ».' }));
      corps.appendChild(h('div.vid-versions', p.versions.map(version)));
      corps.appendChild(h('div.vid-titre', { text: 'Mention à l\'écran (écrite par le système, jamais par Einstein)' }));
      corps.appendChild(h('div.vid-mention', { text: p.mention || '—' }));
      if (p.cartePrix) corps.appendChild(h('div.petit.doux', { style: { marginTop: '4px' }, text: 'Carte du prix : ' + p.cartePrix.titre + ' · ' + p.cartePrix.lignes.join(' · ') }));
      if (p.publication) corps.appendChild(h('div.vid-boite.bleu', { style: { marginTop: '10px' }, text: 'Publiée le ' + A.fmtDate(p.publication.le) + ' sur ' + p.publication.plateformes.map(function (k) { return p.plateformes[k]; }).join(', ') + (p.publication.etiquetteIA ? ' · étiquette « Contenu IA » activée' : '') + (p.publication.lien ? ' · ' + p.publication.lien : '') }));
      if (modale && modale.boutons) modale.boutons(boutons());
    }
    function boutons() {
      var l = [{ texte: 'Fermer' }];
      function b(texte, classe, fn) { l.push({ texte: texte, classe: classe, action: function (f, btn) { btn.disabled = true; Promise.resolve(fn()).then(function () { btn.disabled = false; }, function (e) { btn.disabled = false; A.toast(A.erreurTexte(e), 'erreur', 9000); }); return false; } }); }
      if (!p) return l;
      if (p.etat === 'retiree') return l;
      b('Retirer', 'danger', function () { return A.confirmer('Retirer ' + p.id + ' ?', p.publication ? 'Retirez-la aussi des plateformes où elle est en ligne.' : 'Elle ne sera plus proposée.', { ok: 'Retirer', danger: true }).then(function (oui) { return oui ? poster({ action: 'videoEtat', id: p.id, etat: 'retiree' }).then(apres) : null; }); });
      if (p.etat === 'script' || p.etat === 'rendu') b('Faire les 3 aperçus', '', function () { return poster({ action: 'videoRendre', id: p.id, version: 'toutes', format: '9:16' }).then(function (r) { A.toast(r.message, 'ok', 7000); apres(r); surveiller(); }); });
      if (enCours()) b('Actualiser', '', function () { return poster({ action: 'videoActualiser', id: p.id }).then(apres); });
      if (p.etat === 'approuvee' && peutApprouver) { b('Remettre à relire', '', function () { return poster({ action: 'videoEtat', id: p.id, etat: 'brouillon' }).then(apres); }); b('Marquer publiée…', 'primaire', publier); }
      if (p.etat === 'publiee') b('Noter les résultats…', 'primaire', resultats);
      return l;
    }
    function modifier(v) {
      return new Promise(function (res) {
        var titre = h('input', { type: 'text', value: v.titre || '', maxlength: '80' }), accroche = h('input', { type: 'text', value: v.accroche || '', maxlength: '40' });
        var cta = h('select', p.ctas.map(function (t) { return h('option', { value: t, text: t, selected: t === v.cta ? 'selected' : undefined }); }));
        var lignes = v.scenes.map(function (s) {
          var t = h('input', { type: 'text', value: s.texte || '', maxlength: '60' }), cpt = h('span.cpt'), du = h('input', { type: 'number', min: '1.5', max: '5', step: '0.5', value: String(s.duree) });
          var im = h('select', (p.source === 'camera' ? (p.clip.reperes || []).map(function (r) { return h('option', { value: 'e:' + r.cle, text: r.titre, selected: s.etape === r.cle ? 'selected' : undefined }); }) : p.photos.map(function (u, k) { return h('option', { value: 'p:' + k, text: 'Photo ' + (k + 1), selected: s.photo === k ? 'selected' : undefined }); })));
          function compte() { var n = t.value.length; cpt.textContent = n + ' / 42'; cpt.classList.toggle('trop', n > 42); } t.addEventListener('input', compte); compte();
          return { el: h('div.sc', [h('label', [h('span', ['Sous-titre ', cpt]), t]), h('label', [h('span', { text: 'Durée' }), du]), h('label', [h('span', { text: 'Image' }), im])]), lire: function () { var x = im.value.split(':'); var o = { texte: t.value.trim(), duree: Number(du.value) || 2.5 }; if (x[0] === 'e') o.etape = x[1]; else o.photo = Number(x[1]); return o; } };
        });
        var ed = h('div.vid-ed', [h('label', ['Titre', titre]), h('label', ['Accroche (2 premières secondes)', accroche])].concat(lignes.map(function (x) { return x.el; })).concat([h('label', ['Appel à l\'action', cta]), h('div.petit.doux', { text: 'Pas de prix, de paiement ni de pourcentage ici : la carte du prix et la mention viennent du système. 15 à 30 s en tout.' })]));
        A.modale({ titre: 'Modifier la version ' + v.n, corps: ed, boutons: [{ texte: 'Annuler', action: function (f) { f(); res(); return false; } }, { texte: 'Enregistrer', classe: 'primaire', action: function (f, b) {
          b.disabled = true;
          poster({ action: 'videoModifier', id: p.id, version: v.n, titre: titre.value.trim(), accroche: accroche.value.trim(), cta: cta.value, scenes: lignes.map(function (x) { return x.lire(); }) }).then(function (r) { f(); A.toast(r.message, 'ok'); apres(r); res(); }).catch(function (e) { b.disabled = false; A.toast(A.erreurTexte(e), 'erreur', 9000); });
          return false;
        } }], onFermer: function () { res(); } });
      });
    }
    function einstein(v) {
      return new Promise(function (res) {
        var t = h('textarea', { placeholder: 'Ex. : plus d\'énergie au début, montrer le coffre, ton plus familial…' });
        A.modale({ titre: 'Demander à Einstein — version ' + v.n, corps: h('div.vid-champs', [h('label', [h('span', { text: 'Ce qu\'il faut changer' }), t])]), boutons: [{ texte: 'Annuler', action: function (f) { f(); res(); return false; } }, { texte: 'Refaire cette version', classe: 'primaire', action: function (f, b) {
          b.disabled = true; b.textContent = 'Einstein écrit…';
          poster({ action: 'videoEinstein', id: p.id, version: v.n, demande: t.value.trim() }, 150000).then(function (r) { f(); A.toast(r.message, 'ok'); apres(r); res(); }).catch(function (e) { b.disabled = false; b.textContent = 'Refaire cette version'; A.toast(A.erreurTexte(e), 'erreur', 9000); });
          return false;
        } }], onFermer: function () { res(); } });
      });
    }
    function approuver(v) {
      return new Promise(function (res) {
        var relu = h('input', { type: 'checkbox' }), cases = {};
        Object.keys(p.verifs).forEach(function (k) { cases[k] = h('input', { type: 'checkbox' }); });
        var c = h('div', [
          h('p', { style: { margin: '0 0 8px' }, text: 'Vous approuvez la version ' + v.n + ' (9:16) au nom de la concession. Rien ne sera publié : vous la publiez ensuite vous-même.' }),
          h('div.vid-mention', { text: p.mention }),
          (p.aVerifier || []).length ? h('div.vid-boite.bleu', { style: { marginTop: '8px' } }, [h('b', { text: 'À confirmer' }), h('ul', p.aVerifier.map(function (t) { return h('li', { text: t }); }))]) : null,
          h('div.vid-cases', [h('label', [relu, h('span', { text: 'J\'ai regardé la vidéo au complet, avec le son.' })])].concat(Object.keys(p.verifs).map(function (k) { return h('label', [cases[k], h('span', { text: p.verifs[k] })]); })))
        ]);
        A.modale({ titre: 'Approuver ' + p.id, corps: c, proteger: false, boutons: [{ texte: 'Annuler', action: function (f) { f(); res(); return false; } }, { texte: 'Approuver', classe: 'primaire', action: function (f, b) {
          if (!relu.checked) { A.toast('Cochez « J\'ai regardé la vidéo au complet ».', 'attention'); return false; }
          var verifs = {}; Object.keys(cases).forEach(function (k) { verifs[k] = cases[k].checked; });
          b.disabled = true;
          poster({ action: 'videoEtat', id: p.id, etat: 'approuvee', version: v.n, format: '9:16', relu: true, verifs: verifs }).then(function (r) { f(); A.toast(r.message, 'ok', 10000); apres(r); res(); }).catch(function (e) { b.disabled = false; A.toast(A.erreurTexte(e), 'erreur', 10000); });
          return false;
        } }], onFermer: function () { res(); } });
      });
    }
    function publier() {
      return new Promise(function (res) {
        var pl = {}, ia = h('input', { type: 'checkbox' }), lien = h('input', { type: 'url', placeholder: 'https://… (lien de la publication, facultatif)' });
        Object.keys(p.plateformes).forEach(function (k) { pl[k] = h('input', { type: 'checkbox' }); });
        var c = h('div', [
          h('p', { style: { margin: '0 0 8px' }, text: 'Après l\'avoir mise en ligne vous-même, dites où. ScanAutomax ne publie rien.' }),
          h('div.vid-cases', Object.keys(p.plateformes).map(function (k) { return h('label', [pl[k], h('span', { text: p.plateformes[k] })]); })),
          h('div.vid-boite.ambre', [h('label', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } }, [ia, h('span', { text: 'Sur Facebook et Instagram, j\'ai activé l\'étiquette « Contenu IA » (Paramètres avancés › Ajouter une étiquette IA). Obligatoire pour Meta.' })])]),
          h('div.vid-champs', [h('label', [h('span', { text: 'Lien' }), lien])])
        ]);
        A.modale({ titre: 'Marquer ' + p.id + ' publiée', corps: c, proteger: false, boutons: [{ texte: 'Annuler', action: function (f) { f(); res(); return false; } }, { texte: 'Marquer publiée', classe: 'primaire', action: function (f, b) {
          var l = Object.keys(pl).filter(function (k) { return pl[k].checked; });
          b.disabled = true;
          poster({ action: 'videoEtat', id: p.id, etat: 'publiee', plateformes: l, etiquetteIA: ia.checked, lien: lien.value.trim() }).then(function (r) { f(); A.toast(r.message, 'ok', 9000); apres(r); res(); }).catch(function (e) { b.disabled = false; A.toast(A.erreurTexte(e), 'erreur', 10000); });
          return false;
        } }], onFermer: function () { res(); } });
      });
    }
    function resultats() {
      return new Promise(function (res) {
        var r0 = p.resultats || {}, ch = {};
        var defs = [['vues', 'Vues'], ['vues3s', 'Vues de 3 s'], ['completion', '% regardée au complet'], ['clics', 'Clics sur le lien'], ['leads', 'Leads (demandes, appels)']];
        var c = h('div.vid-champs', [h('p.petit.doux', { style: { margin: 0 }, text: 'Lus dans Meta Business Suite (ou la plateforme) après 7 jours. Einstein s\'en sert pour les prochaines vidéos, avec les clics Google Ads du véhicule (Marketing › Analyse).' })].concat(defs.map(function (x) { ch[x[0]] = h('input', { type: 'number', min: '0', value: r0[x[0]] !== undefined ? String(r0[x[0]]) : '' }); return h('label', [h('span', { text: x[1] }), ch[x[0]]]); })));
        A.modale({ titre: 'Résultats de ' + p.id, corps: c, boutons: [{ texte: 'Annuler', action: function (f) { f(); res(); return false; } }, { texte: 'Enregistrer', classe: 'primaire', action: function (f, b) {
          var corpsR = { action: 'videoResultats', id: p.id }; Object.keys(ch).forEach(function (k) { if (ch[k].value !== '') corpsR[k] = Number(ch[k].value); });
          b.disabled = true; poster(corpsR).then(function (r) { f(); A.toast(r.message, 'ok'); apres(r); res(); }).catch(function (e) { b.disabled = false; A.toast(A.erreurTexte(e), 'erreur', 9000); });
          return false;
        } }], onFermer: function () { res(); } });
      });
    }
    modale = A.modale({ titre: 'Vidéo ' + id, classe: 'large', corps: corps, boutons: [{ texte: 'Fermer' }], onFermer: function () { clearTimeout(minuterie); } });
    charger().then(surveiller);
  };

  /* ---- Admin › Vidéos (propriétaire) : clé Creatomate, voix, musiques, porte-parole ---- */
  function carteAdmin() {
    var etat = h('div.petit.doux', { text: 'Chargement…' }), r = null;
    var cle = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'Collez la clé API Creatomate (Project settings › API key)' });
    var voixActif = h('input', { type: 'checkbox' }), voixId = h('input', { type: 'text', placeholder: 'Voice ID ElevenLabs (voix générique québécoise)' }), voixNom = h('input', { type: 'text', placeholder: 'Nom affiché (ex. Voix québécoise — homme)' });
    var musiques = h('textarea', { placeholder: 'Une musique par ligne : titre | adresse https du fichier | licence (ex. Hiver | https://…/hiver.mp3 | Epidemic Sound, abonnement commercial BMW Sherbrooke)', style: { minHeight: '80px' } });
    var logo = h('input', { type: 'url', placeholder: 'https://… logo PNG de la concession (carte de fin)' });
    var maxS = h('input', { type: 'number', min: '0', max: '30' }), maxM = h('input', { type: 'number', min: '0', max: '2000' }), auto = h('input', { type: 'checkbox' });
    var ppListe = h('div');
    function remplir(x) {
      r = x; A.vider(etat);
      etat.appendChild(h('div', [x.present ? h('span.badge.vert.sans-point', { text: 'Clé enregistrée (…' + x.fin + ')' }) : h('span.badge.ambre.sans-point', { text: 'Aucune clé : pas d\'aperçu possible' }), h('span', { style: { marginLeft: '8px' }, text: 'Aperçus ce mois-ci : ' + (x.rendusCeMois || 0) + ' / ' + x.maxRendusMois })]));
      voixActif.checked = !!(x.voix && x.voix.actif); voixId.value = (x.voix && x.voix.voiceId) || ''; voixNom.value = (x.voix && x.voix.nom) || '';
      musiques.value = (x.musiques || []).map(function (m) { return [m.titre, m.url, m.licence].join(' | '); }).join('\n');
      logo.value = x.logo || ''; maxS.value = String(x.maxSemaine); maxM.value = String(x.maxRendusMois); auto.checked = !!x.rendreAuto;
      A.vider(ppListe);
      (x.porteParole.length ? x.porteParole : []).forEach(function (pp) { ppListe.appendChild(h('div.petit', { text: pp.nom + ' — ' + (pp.utilisable ? (pp.actif ? 'activée' : 'prête, désactivée') : 'pas utilisable : accord écrit daté et vérification ElevenLabs par la personne requis') })); });
      if (!x.porteParole.length) ppListe.appendChild(h('div.petit.doux', { text: 'Aucune. Les voix d\'Isabelle Gauvin ou de Bruny Surin ne s\'ajoutent qu\'avec leur accord écrit et leur propre vérification chez ElevenLabs (Professional Voice Clone vérifiée par eux). Jamais une voix ni un visage pris sur le Web.' }));
    }
    function envoyer(corps, msg, btn) {
      if (btn) btn.disabled = true;
      return poster(corps, 60000).then(function (x) { if (btn) btn.disabled = false; cle.value = ''; if (x.reglages) remplir(x.reglages); A.toast(x.message || msg, 'ok', 7000); }).catch(function (e) { if (btn) btn.disabled = false; A.toast(A.erreurTexte(e), 'erreur', 9000); });
    }
    var bEnr = h('button.btn.primaire', { type: 'button', text: 'Enregistrer', onclick: function () {
      var ms = musiques.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l, i) { var x = l.split('|').map(function (s) { return s.trim(); }); return { id: 'm' + (i + 1), titre: x[0], url: x[1] || '', licence: x[2] || '' }; });
      var corps = { action: 'videoReglages', voix: { actif: voixActif.checked, voiceId: voixId.value.trim(), nom: voixNom.value.trim() }, musiques: ms, logo: logo.value.trim(), maxSemaine: maxS.value, maxRendusMois: maxM.value, rendreAuto: auto.checked };
      if (cle.value.trim()) corps.cle = cle.value.trim();
      envoyer(corps, 'Réglages enregistrés.', bEnr);
    } });
    var bTest = h('button.btn.petit', { type: 'button', text: 'Tester la connexion', onclick: function () { envoyer({ action: 'videoTester' }, 'Creatomate répond.', bTest); } });
    var bRet = h('button.btn.danger.petit', { type: 'button', text: 'Retirer la clé', onclick: function () { A.confirmer('Retirer la clé Creatomate', 'Plus aucun aperçu ne pourra être fait. Révoquez aussi la clé chez Creatomate si elle a fuité.', { ok: 'Retirer', danger: true }).then(function (ok) { if (ok) envoyer({ action: 'videoReglages', retirerCle: true }, 'Clé retirée.', bRet); }); } });
    var carte = h('div.carte.admin-parametres', [h('div.carte-entete', [h('h2', 'Vidéos — Creatomate')]), h('div.carte-corps', [
      h('p.doux.petit', { style: { margin: 0 }, text: 'Marketing › Vidéos : Einstein écrit les scripts, Creatomate fait les aperçus, la direction approuve, une personne publie. La clé n\'est jamais réaffichée.' }),
      h('div.champ', [h('label', { text: 'Clé API Creatomate' }), cle]), h('div.ligne-cle', [bEnr, bTest, bRet]), etat,
      h('div.champ', [h('label', { text: 'Voix générique (facultative)' }), h('label.petit', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [voixActif, h('span', { text: 'Ajouter la voix aux sous-titres (ElevenLabs relié dans Creatomate › Integrations)' })]), voixId, voixNom]),
      h('div.champ', [h('label', { text: 'Musiques sous licence' }), musiques, h('div.mini.doux', { text: 'Sans licence, pas de musique : Einstein ne choisit que dans cette liste.' })]),
      h('div.champ', [h('label', { text: 'Porte-parole' }), ppListe]),
      h('div.admin-export-grille', [h('div.champ', [h('label', { text: 'Logo (carte de fin)' }), logo]), h('div.champ', [h('label', { text: 'Véhicules par semaine' }), maxS]), h('div.champ', [h('label', { text: 'Aperçus par mois (plafond)' }), maxM])]),
      h('label.petit', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [auto, h('span', { text: 'Faire les aperçus 9:16 dès qu\'Einstein a écrit (ça consomme des rendus ; rien n\'est publié)' })])
    ])]);
    A.get({ videos: '1' }, { delai: 60000, secours: false }).then(function (d) { if (d && d.reglages) remplir(d.reglages); else { A.vider(etat); etat.appendChild(h('span.badge.ambre.sans-point', { text: d && d.erreur ? d.erreur : SCRIPT_PAS_A_JOUR })); } }).catch(function (e) { A.vider(etat); etat.appendChild(h('span.badge.ambre.sans-point', { text: A.erreurTexte(e) })); });
    return carte;
  }

  AMX.videos = { charger: charger, peutVoir: peutVoir, compteur: compteur, carteAdmin: carteAdmin, vider: function () { cache = { rep: null, le: 0, cie: '' }; } };
  AMX.section('videos', {
    titre: 'Vidéos', icone: 'marketing', ordre: 38,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new VueVideos(conteneur, ctx); }
  });
})();
