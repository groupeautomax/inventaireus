/* MAX ai — la bulle et la fenêtre de discussion (22 oct. 2026)
   Maxime : « mettre cette photo pour représenter l'IA » et « faire en sorte qu'on clique sur l'image pour
   ouvrir le dialogue ». Une bulle ronde en bas à droite de toutes les pages (une fois connecté) ; l'avatar
   de MAX ai dans Aide › Suggestions et dans Admin ouvre la même fenêtre (AMX.maxai.avatar(taille)).
   POST iaDiscuter { messages, contexte: { page, source, articles } } → { texte, reste } (Ia.gs) ;
   { mode: 'suggestion' } → { suggestion: { titre, description, pourquoi, exemple } }, qui ouvre le formulaire
   des Suggestions déjà rempli. MAX ai ne voit pas les données : il répond avec les 5 articles de l'aide les
   plus proches de la question (choisis ici, selon le rôle de la personne), et la page ouverte.
   La discussion vit dans l'onglet (sessionStorage) ; le serveur n'en garde que le coût. */
(function () {
  'use strict';
  var AMX = window.AMX, h = AMX.h;
  var IMAGE = 'assets/max-ai.png?v=125';
  var CLE = 'amx_maxai_v1';
  var MAX_ENVOYES = 16;
  var etat = { messages: lire(), enCours: false, reste: null };
  var el = {};

  function lire() { try { var x = JSON.parse(sessionStorage.getItem(CLE) || '[]'); return Array.isArray(x) ? x : []; } catch (e) { return []; } }
  function garder() { try { sessionStorage.setItem(CLE, JSON.stringify(etat.messages.slice(-40))); } catch (e) {} }

  /* ------------------------------ Avatar ------------------------------ */
  function avatar(taille, opts) {
    opts = opts || {};
    var bouton = opts.bouton !== false;
    var a = h((bouton ? 'button' : 'span') + '.maxai-avatar', bouton ? { type: 'button', title: 'MAX ai — cliquez pour lui parler', 'aria-label': 'Discuter avec MAX ai' } : { 'aria-hidden': 'true' });
    a.style.width = a.style.height = taille + 'px';
    var img = h('img', { src: IMAGE, alt: '' });
    img.addEventListener('error', function () { img.remove(); a.classList.add('sans-image'); a.appendChild(h('span.mono', { text: 'MAX' })); });
    a.appendChild(img);
    if (bouton) a.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); ouvrir(); });
    return a;
  }

  /* ------------------------------ Aide : les articles les plus proches ------------------------------ */
  function sansAccents(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  var VIDES = { les: 1, des: 1, une: 1, est: 1, que: 1, qui: 1, pour: 1, dans: 1, par: 1, sur: 1, avec: 1, comment: 1, quoi: 1, faire: 1, mon: 1, mes: 1, pas: 1, plus: 1, son: 1, ses: 1, aux: 1, cette: 1, cet: 1, quel: 1, quelle: 1, peut: 1, peux: 1, veux: 1, vous: 1, nous: 1, elle: 1, ils: 1, mais: 1, car: 1, donc: 1, tout: 1, tous: 1 };
  function mots(t) { return sansAccents(t).split(/[^a-z0-9]+/).filter(function (m) { return m.length >= 3 && !VIDES[m]; }).map(function (m) { return m.length > 5 ? m.slice(0, m.length - 1) : m; }); }
  function rang() {
    var r = AMX.session.role || '';
    if (r === 'proprietaire' || AMX.perm('gererAdmins')) return 4;
    if (r === 'admin' || AMX.perm('gererUtilisateurs')) return 3;
    if (r === 'gestionnaire' || AMX.perm('modifierMontants') || AMX.perm('voirResultats')) return 2;
    return 1;
  }
  var RANGS = { directeur: 2, admin: 3, proprietaire: 4 };
  function texteHtml(html) { var d = document.createElement('div'); d.innerHTML = String(html || ''); return (d.textContent || '').replace(/\s+/g, ' ').trim(); }
  function articlesProches(question) {
    var c = AMX.AIDE_CONTENU;
    if (!c || !c.sections) return [];
    var q = mots(question);
    if (!q.length) return [];
    var r = rang(), liste = [];
    c.sections.forEach(function (s) {
      if (s.roles && r < (RANGS[s.roles] || 1)) return;
      (s.articles || []).forEach(function (a) {
        if (a.roles && r < (RANGS[a.roles] || 1)) return;
        var tete = mots(a.q + ' ' + (a.mots || '') + ' ' + s.titre).join(' '), corps = mots(texteHtml(a.r)).join(' ');
        var score = 0;
        q.forEach(function (m) { if (tete.indexOf(m) >= 0) score += 3; if (corps.indexOf(m) >= 0) score += 1; });
        if (score > 0) liste.push({ score: score, a: a, s: s });
      });
    });
    liste.sort(function (x, y) { return y.score - x.score; });
    return liste.slice(0, 5).map(function (x) { return { titre: x.s.titre + ' — ' + x.a.q, texte: texteHtml(x.a.r).slice(0, 1500) }; });
  }
  function pageOuverte() {
    var c = AMX.courante || {};
    var s = c.section && c.section.titre, o = c.onglet && c.onglet.titre;
    return [s, o].filter(Boolean).join(' › ') || document.title.replace(/\s+—.*$/, '');
  }

  /* ------------------------------ Mise en forme des réponses ------------------------------ */
  function echapper(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function enLigne(s) { return echapper(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'); }
  function rendreTexte(t) {
    var out = [], liste = null;
    String(t || '').split('\n').forEach(function (l) {
      var puce = /^\s*[-•*]\s+(.*)$/.exec(l), num = /^\s*(\d+)[.)]\s+(.*)$/.exec(l);
      if (puce || num) {
        var type = puce ? 'ul' : 'ol';
        if (!liste || liste.type !== type) { if (liste) out.push('</' + liste.type + '>'); liste = { type: type }; out.push('<' + type + '>'); }
        out.push('<li>' + enLigne(puce ? puce[1] : num[2]) + '</li>');
        return;
      }
      if (liste) { out.push('</' + liste.type + '>'); liste = null; }
      if (l.trim()) out.push('<p>' + enLigne(l) + '</p>');
    });
    if (liste) out.push('</' + liste.type + '>');
    return out.join('');
  }

  /* ------------------------------ Fenêtre ------------------------------ */
  function prenom() { var n = String(AMX.session.nom || '').trim().split(/\s+/)[0]; return n || ''; }
  function construire() {
    if (el.panneau) return;
    el.fil = h('div.maxai-fil', { 'aria-live': 'polite' });
    el.saisie = h('textarea.maxai-saisie', { rows: '2', placeholder: 'Posez votre question à MAX ai…', 'aria-label': 'Votre message à MAX ai' });
    el.saisie.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); } });
    el.saisie.addEventListener('input', function () { el.saisie.style.height = 'auto'; el.saisie.style.height = Math.min(140, el.saisie.scrollHeight) + 'px'; });
    el.envoyer = h('button.btn.primaire.maxai-envoyer', { type: 'button', 'aria-label': 'Envoyer', title: 'Envoyer (Entrée)', html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>', onclick: function () { envoyer(); } });
    el.rediger = h('button.btn.petit.maxai-rediger', { type: 'button', text: 'Rédiger une suggestion', title: 'MAX ai rédige une suggestion d\'amélioration à partir de la discussion ; vous la relisez avant de l\'envoyer.', onclick: function () { redigerSuggestion(); } });
    el.info = h('span.maxai-info');
    el.panneau = h('div.maxai-panneau#maxai-panneau', { role: 'dialog', 'aria-label': 'Discussion avec MAX ai' }, [
      h('div.maxai-tete', [
        avatar(40, { bouton: false }),
        h('div.maxai-nom', [h('b', 'MAX ai'), h('span', { text: 'L\'assistant de ScanAutomax' })]),
        h('button.btn.petit.fantome', { type: 'button', text: 'Nouvelle', title: 'Effacer la discussion', onclick: function () { nouvelle(); } }),
        h('button.maxai-fermer', { type: 'button', 'aria-label': 'Fermer', html: AMX.icones.fermer || '×', onclick: function () { fermer(); } })
      ]),
      el.fil,
      h('div.maxai-pied', [
        h('div.maxai-ecrire', [el.saisie, el.envoyer]),
        h('div.maxai-bas', [el.rediger, el.info])
      ])
    ]);
    document.body.appendChild(el.panneau);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('maxai-ouvert')) fermer(); });
  }
  function bulleMessage(m) {
    if (m.role === 'user') return h('div.maxai-msg.moi', [h('div.maxai-bulle-texte', { text: m.content })]);
    var b = h('div.maxai-bulle-texte' + (m.erreur ? '.erreur' : ''));
    if (m.erreur) b.textContent = m.content; else b.innerHTML = rendreTexte(m.content);
    return h('div.maxai-msg.lui', [avatar(28, { bouton: false }), b]);
  }
  var QUESTIONS = ['Comment changer le statut d\'un véhicule ?', 'Comment prendre un rendez-vous au service ?', 'Comment demander un avis Google à un client ?'];
  function rendre() {
    if (!el.panneau) return;
    AMX.vider(el.fil);
    var p = prenom();
    el.fil.appendChild(bulleMessage({ role: 'assistant', content: 'Bonjour' + (p ? ' ' + p : '') + ' ! Je suis **MAX ai**. Demandez-moi comment faire quelque chose dans ScanAutomax, ou décrivez une amélioration : je peux la rédiger en suggestion pour vous.' }));
    if (!etat.messages.length) {
      el.fil.appendChild(h('div.maxai-idees', QUESTIONS.map(function (q) { return h('button.puce.maxai-idee', { type: 'button', text: q, onclick: function () { el.saisie.value = q; envoyer(); } }); })));
    }
    etat.messages.forEach(function (m) { el.fil.appendChild(bulleMessage(m)); });
    if (etat.enCours) el.fil.appendChild(h('div.maxai-msg.lui', [avatar(28, { bouton: false }), h('div.maxai-bulle-texte.attente', [h('span'), h('span'), h('span')])]));
    el.envoyer.disabled = etat.enCours;
    el.rediger.disabled = etat.enCours || !etat.messages.some(function (m) { return m.role === 'user'; });
    el.info.textContent = etat.reste !== null && etat.reste < 15 ? etat.reste + ' message' + (etat.reste > 1 ? 's' : '') + ' restant' + (etat.reste > 1 ? 's' : '') + ' aujourd\'hui' : '';
    el.fil.scrollTop = el.fil.scrollHeight;
  }
  function ouvrir(question) {
    construire();
    document.body.classList.add('maxai-ouvert');
    rendre();
    if (question) { el.saisie.value = question; envoyer(); } else setTimeout(function () { try { el.saisie.focus(); } catch (e) {} }, 60);
  }
  function fermer() { document.body.classList.remove('maxai-ouvert'); }
  function nouvelle() { etat.messages = []; garder(); rendre(); try { el.saisie.focus(); } catch (e) {} }

  function messagesPourServeur() {
    return etat.messages.filter(function (m) { return !m.erreur; }).slice(-MAX_ENVOYES).map(function (m) { return { role: m.role, content: m.content }; });
  }
  function scriptPasAJour(r) { return r && r.vehicules && r.texte === undefined && r.suggestion === undefined; }
  function envoyer() {
    var t = el.saisie.value.trim();
    if (!t || etat.enCours) return;
    el.saisie.value = ''; el.saisie.style.height = 'auto';
    etat.messages.push({ role: 'user', content: t.slice(0, 4000) });
    etat.enCours = true; garder(); rendre();
    var contexte = { page: pageOuverte(), source: 'site', articles: articlesProches(t) };
    AMX.post({ action: 'iaDiscuter', messages: messagesPourServeur(), contexte: contexte }, { delai: 120000 }).then(function (r) {
      if (scriptPasAJour(r)) throw new Error('Le script n\'est pas à jour : redéployez-le (Ia.gs, MAX ai).');
      if (!r || r.ok === false || r.refuse) throw new Error((r && r.erreur) || 'MAX ai n\'a pas pu répondre.');
      etat.messages.push({ role: 'assistant', content: r.texte });
      if (typeof r.reste === 'number') etat.reste = r.reste;
    }).catch(function (e) {
      etat.messages.push({ role: 'assistant', content: AMX.erreurTexte(e), erreur: true });
    }).then(function () { etat.enCours = false; garder(); rendre(); });
  }
  function redigerSuggestion() {
    if (etat.enCours) return;
    etat.enCours = true; rendre();
    var dernier = etat.messages.filter(function (m) { return m.role === 'user'; }).map(function (m) { return m.content; }).join(' ');
    AMX.post({ action: 'iaDiscuter', mode: 'suggestion', messages: messagesPourServeur(), contexte: { page: pageOuverte(), source: 'site', articles: articlesProches(dernier) } }, { delai: 120000 }).then(function (r) {
      etat.enCours = false; rendre();
      if (scriptPasAJour(r)) throw new Error('Le script n\'est pas à jour : redéployez-le (Ia.gs, MAX ai).');
      if (!r || r.ok === false || r.refuse || !r.suggestion) throw new Error((r && r.erreur) || 'MAX ai n\'a pas pu rédiger la suggestion.');
      if (typeof r.reste === 'number') etat.reste = r.reste;
      fermer();
      if (AMX.suggestions && AMX.suggestions.nouvelle) AMX.suggestions.nouvelle(Object.assign({ source: 'maxai' }, r.suggestion));
    }).catch(function (e) { etat.enCours = false; rendre(); AMX.toast(AMX.erreurTexte(e), 'erreur', 9000); });
  }

  /* ------------------------------ La bulle ------------------------------ */
  function poserBulle() {
    if (document.getElementById('maxai-bulle')) return;
    var b = avatar(58);
    b.id = 'maxai-bulle';
    b.classList.add('maxai-flottant');
    document.body.appendChild(b);
  }
  function styles() {
    var css = [
      '.maxai-avatar { display: inline-flex; align-items: center; justify-content: center; flex: none; padding: 0; border-radius: 50%; overflow: hidden; background: #fff; border: 2px solid var(--vert); cursor: pointer; vertical-align: middle; }',
      'span.maxai-avatar { cursor: default; }',
      '.maxai-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }',
      '.maxai-avatar.sans-image { background: var(--vert); }',
      '.maxai-avatar .mono { color: #fff; font-weight: 800; font-size: 11px; letter-spacing: .04em; }',
      'button.maxai-avatar:hover { box-shadow: 0 0 0 3px var(--vert-clair); }',
      '.maxai-flottant { position: fixed; right: 18px; bottom: 18px; z-index: 95; box-shadow: var(--ombre-2); border-width: 3px; transition: transform .15s; }',
      '.maxai-flottant:hover { transform: scale(1.06); }',
      '#appli:not(.pret) ~ .maxai-flottant, #appli:not(.pret) ~ .maxai-panneau, body.maxai-ouvert .maxai-flottant { display: none; }',
      'body:has(.maxai-flottant) #toasts { bottom: 90px; }',
      '.maxai-panneau { display: none; position: fixed; right: 18px; bottom: 18px; z-index: 96; width: 400px; max-width: calc(100vw - 32px); height: min(640px, calc(100vh - 100px)); background: var(--carte); border: 1px solid var(--ligne); border-radius: 16px; box-shadow: 0 16px 48px rgba(16, 24, 40, .22); flex-direction: column; overflow: hidden; }',
      'body.maxai-ouvert .maxai-panneau { display: flex; }',
      '.maxai-tete { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--ligne); background: linear-gradient(120deg, var(--noir) 0%, #12402A 100%); color: #fff; }',
      '.maxai-tete .btn.fantome { color: #fff; border-color: rgba(255,255,255,.35); background: transparent; }',
      '.maxai-nom { flex: 1; display: flex; flex-direction: column; line-height: 1.2; }',
      '.maxai-nom b { font-size: 16px; } .maxai-nom span { font-size: 12px; opacity: .8; }',
      '.maxai-fermer { background: none; border: 0; color: #fff; width: 32px; height: 32px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; }',
      '.maxai-fermer:hover { background: rgba(255,255,255,.12); } .maxai-fermer svg { width: 18px; height: 18px; }',
      '.maxai-fil { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: var(--carte-2); }',
      '.maxai-msg { display: flex; gap: 8px; align-items: flex-end; max-width: 100%; }',
      '.maxai-msg.moi { justify-content: flex-end; }',
      '.maxai-bulle-texte { padding: 9px 12px; border-radius: 14px; font-size: 14px; line-height: 1.45; max-width: 85%; overflow-wrap: anywhere; }',
      '.maxai-msg.lui .maxai-bulle-texte { background: var(--carte); border: 1px solid var(--ligne); color: var(--encre); border-bottom-left-radius: 4px; }',
      '.maxai-msg.moi .maxai-bulle-texte { background: var(--vert); color: #fff; border-bottom-right-radius: 4px; white-space: pre-wrap; }',
      '.maxai-bulle-texte.erreur { background: var(--rouge-bg) !important; border-color: var(--rouge-bord) !important; color: var(--rouge) !important; }',
      '.maxai-bulle-texte p { margin: 0 0 6px; } .maxai-bulle-texte p:last-child { margin: 0; }',
      '.maxai-bulle-texte ul, .maxai-bulle-texte ol { margin: 4px 0 6px; padding-left: 20px; } .maxai-bulle-texte li { margin: 2px 0; }',
      '.maxai-bulle-texte.attente { display: inline-flex; gap: 4px; padding: 12px 14px; }',
      '.maxai-bulle-texte.attente span { width: 7px; height: 7px; border-radius: 50%; background: var(--encre-4); animation: maxaiPoint 1s infinite ease-in-out; }',
      '.maxai-bulle-texte.attente span:nth-child(2) { animation-delay: .15s; } .maxai-bulle-texte.attente span:nth-child(3) { animation-delay: .3s; }',
      '@keyframes maxaiPoint { 0%, 80%, 100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }',
      '.maxai-idees { display: flex; flex-wrap: wrap; gap: 6px; padding-left: 36px; }',
      '.maxai-idee { cursor: pointer; border: 1px solid var(--vert); color: var(--vert-fonce); background: var(--vert-clair); }',
      '.maxai-pied { border-top: 1px solid var(--ligne); padding: 10px 12px; background: var(--carte); }',
      '.maxai-ecrire { display: flex; gap: 8px; align-items: flex-end; }',
      '.maxai-saisie { flex: 1; resize: none; min-height: 40px; max-height: 140px; padding: 9px 11px; border: 1px solid var(--ligne-forte); border-radius: 10px; font: inherit; font-size: 14px; }',
      '.maxai-saisie:focus { outline: none; border-color: var(--vert); box-shadow: 0 0 0 3px rgba(0, 136, 64, .15); }',
      '.maxai-envoyer { height: 40px; width: 44px; padding: 0; justify-content: center; }',
      '.maxai-bas { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }',
      '.maxai-info { font-size: 12px; color: var(--encre-3); }',
      '.maxai-redige { display: flex; align-items: center; gap: 8px; color: var(--vert-fonce); font-weight: 500; }',
      '@media (max-width: 640px) { .maxai-panneau { right: 0; bottom: 0; width: 100vw; max-width: 100vw; height: 100dvh; border-radius: 0; } .maxai-flottant { right: 14px; bottom: 14px; } }',
      '@media print { .maxai-flottant, .maxai-panneau { display: none !important; } }'
    ].join('\n');
    document.head.appendChild(h('style#maxai-style', { text: css }));
  }

  // Déconnexion (AMX.deconnecter) : la discussion de l'ancienne personne disparaît de l'onglet.
  function vider() { etat.messages = []; etat.reste = null; try { sessionStorage.removeItem(CLE); } catch (e) {} fermer(); if (el.panneau) rendre(); }
  AMX.maxai = { avatar: avatar, ouvrir: ouvrir, fermer: fermer, vider: vider, articlesProches: articlesProches };
  styles();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poserBulle); else poserBulle();
})();
