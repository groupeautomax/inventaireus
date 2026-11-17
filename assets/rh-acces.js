/* =====================================================================================================
   rh-acces.js — Ressources humaines › Contacts d'urgence et Accès RH (17 nov. 2026)

   Frédéric Beauvais (VW, S07A013B13B), demandé par Maxime :
   « Les DG ne doivent pas pouvoir attribuer des droits RH : Sylvianne et toi devriez être les seuls à pouvoir le faire. […] Si on
     donne un droit RH à un directeur, il ne doit pouvoir faire QUE l'embauche et soumettre le document, puis ne pourra plus avoir
     accès ensuite qu'aux contacts d'urgence. Idéalement, n'ouvrir qu'un volet embauche pour le moment. »

   - Contacts d'urgence (section « rhurgences ») : les employés actifs de sa concession, leur poste et leurs contacts d'urgence —
     rien d'autre. GET ?employesUrgence=1 (EmployesDossier.gs). DG, directeurs qui ont le droit RH, la RH, les propriétaires.
   - Accès RH (section « rhacces ») : la RH (rôle « Ressources humaines ») et les propriétaires donnent ou retirent le droit
     « Ressources humaines » à un compte (embauche + contacts d'urgence), et ouvrent des volets aux DG et directeurs.
     GET ?rhAcces=1 · POST rhAcces { compte, rh } · POST rhVolets { volets } (RhAcces.gs).
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez la version qui contient RhAcces.gs et EmployesDossier.gs.';
  var CSS = [
    '.rha-page .rha-intro { color: var(--encre-3); font-size: 14px; margin: 0 0 12px; max-width: 760px; line-height: 1.5; }',
    '.rha-urg { display: flex; flex-direction: column; gap: 8px; }',
    '.rha-urg .carte-emp { border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 12px 16px; display: grid; grid-template-columns: minmax(180px, 1fr) 2fr; gap: 8px 18px; align-items: start; }',
    '.rha-urg .carte-emp b { font-size: 15px; } .rha-urg .carte-emp .q { display: block; color: var(--encre-3); font-size: 13px; }',
    '.rha-urg .contact { font-size: 14px; } .rha-urg .contact a { color: var(--vert-fonce); font-weight: 700; text-decoration: none; white-space: nowrap; }',
    '.rha-urg .aucun { color: var(--rouge); font-size: 13px; font-weight: 600; }',
    '@media (max-width: 640px) { .rha-urg .carte-emp { grid-template-columns: 1fr; } }',
    '.rha-filtres { display: flex; gap: 10px; flex-wrap: wrap; margin: 0 0 12px; } .rha-filtres .saisie.recherche { flex: 1 1 260px; max-width: 520px; }',
    '.rha-table td { vertical-align: middle; } .rha-table .s { display: block; color: var(--encre-3); font-size: 12.5px; }',
    '.rha-niv { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 700; }',
    '.rha-niv.complet { background: var(--vert-bg); color: var(--vert-fonce); } .rha-niv.dg { background: var(--bleu-bg); color: var(--bleu); }',
    '.rha-niv.limite { background: var(--ambre-bg, #FFF4D6); color: var(--ambre); } .rha-niv.aucun { background: var(--gris-bg); color: var(--encre-3); }',
    '.rha-volets { display: flex; flex-direction: column; gap: 8px; } .rha-volets label { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; cursor: pointer; }',
    '.rha-volets input { margin-top: 3px; width: 18px; height: 18px; }',
    '.rha-bloc { margin: 0 0 18px; } .rha-bloc > h2 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--encre-2); margin: 0 0 8px; }'
  ].join('\n');
  function css() { if (!document.getElementById('css-rh-acces')) { var s = document.createElement('style'); s.id = 'css-rh-acces'; s.textContent = CSS; document.head.appendChild(s); } }
  function nomCie(c) { return c === '*' || !c ? 'Tout le groupe' : ((AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c); }
  function tel(t) { t = String(t || '').replace(/\D/g, ''); return t.length === 10 ? t.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2-$3') : t; }
  function lienTel(t) { var c = String(t || '').replace(/\D/g, ''); return c ? h('a', { href: 'tel:' + (c.length === 10 ? '+1' + c : c), text: tel(t) }) : null; }

  /* ------------------------------------------------------------------------------- Contacts d'urgence */
  function VueUrgences(conteneur, ctx) {
    css();
    var self = this;
    this.conteneur = conteneur; this.detruit = false; this.q = (ctx && ctx.params && ctx.params.q) || '';
    this.compagnie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
    AMX.vider(conteneur);
    var page = h('div.page.rha-page'); conteneur.appendChild(page);
    page.appendChild(h('div.entete-page', [h('div', [h('h1', 'Contacts d\'urgence'),
      h('p', { text: 'Qui appeler si un employé a un accident ou un malaise. Seulement les employés actifs de votre concession.' })])]));
    this.elCies = h('div.barre-cies'); page.appendChild(this.elCies);
    this.inQ = h('input.saisie.recherche', { type: 'search', value: this.q, placeholder: 'Chercher un employé ou un poste…', autocomplete: 'off', 'aria-label': 'Chercher un employé' });
    page.appendChild(h('div.rha-filtres', [this.inQ]));
    this.elCorps = h('div', [AMX.chargeur('Contacts d\'urgence', { compact: true })]); page.appendChild(this.elCorps);
    this.inQ.addEventListener('input', AMX.debounce(function () { self.q = self.inQ.value; self.rendre(); }, 150));
    this.surCie = function (e) { self.compagnie = (e.detail && e.detail.compagnie) || ''; self.rendre(); };
    document.addEventListener('amx:compagnie', this.surCie);
    AMX.get({ employesUrgence: '1' }, { delai: 60000, secours: false }).then(function (d) {
      if (self.detruit) return;
      if (d && d.refuse) throw new Error(d.erreur || 'Accès refusé.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!Array.isArray(d.employes)) throw new Error(SCRIPT_PAS_A_JOUR);
      self.rep = d; self.rendre();
    }).catch(function (er) { if (self.detruit) return; AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.cex-avis', { text: AMX.erreurTexte(er) })); });
  }
  VueUrgences.prototype.demonter = function () { this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); };
  VueUrgences.prototype.naviguer = function () {};
  VueUrgences.prototype.rendre = function () {
    var self = this; if (!this.rep) return;
    var tous = this.rep.employes, cie = this.compagnie;
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: cie, compte: function (c) { return tous.filter(function (e) { return !c || e.compagnie === c; }).length; },
      onchange: function (c) { self.compagnie = c; self.rendre(); } });
    var l = tous.filter(function (e) { return (!cie || e.compagnie === cie) && (!self.q || AMX.correspond([e.nomComplet, e.poste, e.departement], self.q)); });
    AMX.vider(this.elCorps);
    if (!l.length) { this.elCorps.appendChild(h('div.carte', [h('div.ref-vide', { style: { padding: '24px', textAlign: 'center', color: 'var(--encre-3)' }, text: tous.length ? 'Aucun employé avec cette recherche.' : 'Aucun employé actif pour votre concession.' })])); return; }
    var liste = h('div.rha-urg');
    l.slice(0, 400).forEach(function (e) {
      var contacts = (e.urgence || []).length ? h('div', e.urgence.map(function (u) {
        return h('div.contact', [h('b', { text: u.nom || '—' }), u.relation ? h('span', { text: ' (' + u.relation + ')' }) : null, ' ', lienTel(u.telephone), u.autreTel ? h('span', [' · ', lienTel(u.autreTel)]) : null]);
      })) : h('div.aucun', { text: 'Aucun contact d\'urgence au dossier — à demander à l\'employé.' });
      liste.appendChild(h('div.carte-emp', [h('div', [h('b', { text: e.nomComplet }), h('span.q', { text: [e.poste, e.departement, cie ? '' : nomCie(e.compagnie)].filter(Boolean).join(' · ') })]), contacts]));
    });
    this.elCorps.appendChild(liste);
  };
  AMX.section('rhurgences', { titre: 'Contacts d\'urgence', icone: 'alerte', ordre: 59,
    visible: function () { return !!(AMX.rhNiveau && AMX.rhNiveau()); },
    monter: function (conteneur, ctx) { return new VueUrgences(conteneur, ctx); } });

  /* ------------------------------------------------------------------------------- Accès RH */
  var NIVEAUX = { complet: 'Tout le module RH', dg: 'DG : embauche et contacts d\'urgence', limite: 'Embauche et contacts d\'urgence', '': 'Aucun accès RH' };
  function VueAcces(conteneur) {
    css();
    var self = this;
    this.conteneur = conteneur; this.detruit = false; this.q = ''; this.filtre = 'avec';
    AMX.vider(conteneur);
    var page = h('div.page.rha-page'); conteneur.appendChild(page);
    page.appendChild(h('div.entete-page', [h('div', [h('h1', 'Accès RH'),
      h('p', { text: 'Seuls les ressources humaines et les propriétaires donnent ou retirent ces accès.' })])]));
    page.appendChild(h('p.rha-intro', { text: 'Le rôle « Ressources humaines » et les propriétaires ont tout le module. Les DG ont l\'embauche de leur concession (ils approuvent) et les contacts d\'urgence. '
      + 'Cochez « Accès RH » pour un directeur : il pourra remplir une fiche d\'embauche et l\'envoyer à son DG — ensuite il ne la voit plus — et consulter les contacts d\'urgence de sa concession.' }));
    this.elVolets = h('div.rha-bloc'); page.appendChild(this.elVolets);
    this.inQ = h('input.saisie.recherche', { type: 'search', placeholder: 'Chercher un compte : nom, courriel, rôle…', autocomplete: 'off', 'aria-label': 'Chercher un compte' });
    this.selF = h('select', [h('option', { value: 'avec', text: 'Ceux qui ont un accès RH' }), h('option', { value: 'tous', text: 'Tous les comptes actifs' })]);
    page.appendChild(h('div.rha-bloc', [h('h2', 'Qui a accès'), h('div.rha-filtres', [this.inQ, this.selF])]));
    this.elCorps = h('div', [AMX.chargeur('Accès RH', { compact: true })]); page.appendChild(this.elCorps);
    this.inQ.addEventListener('input', AMX.debounce(function () { self.q = self.inQ.value; if (self.q && self.filtre === 'avec') { self.filtre = 'tous'; self.selF.value = 'tous'; } self.rendre(); }, 150));
    this.selF.addEventListener('change', function () { self.filtre = self.selF.value; self.rendre(); });
    this.charger();
  }
  VueAcces.prototype.demonter = function () { this.detruit = true; };
  VueAcces.prototype.naviguer = function () {};
  VueAcces.prototype.charger = function () {
    var self = this;
    return AMX.get({ rhAcces: '1' }, { delai: 60000, secours: false }).then(function (d) {
      if (self.detruit) return;
      if (d && d.refuse) throw new Error(d.erreur || 'Accès refusé.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!Array.isArray(d.comptes)) throw new Error(SCRIPT_PAS_A_JOUR);
      self.rep = d; self.rendre();
    }).catch(function (er) { if (self.detruit) return; AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.cex-avis', { text: AMX.erreurTexte(er) })); });
  };
  VueAcces.prototype.rendreVolets = function () {
    var self = this, v = this.rep.volets || {}, lib = this.rep.voletsLibelles || {};
    AMX.vider(this.elVolets);
    this.elVolets.appendChild(h('h2', 'Ce que voient les DG et les directeurs'));
    var cases = {};
    var boite = h('div.carte', { style: { padding: '14px 16px' } }, [h('div.rha-volets', [
      h('label', [h('input', { type: 'checkbox', checked: true, disabled: true }), h('span', [h('b', 'Embauche'), h('span', { text: ' — toujours (Frédéric : « n\'ouvrir qu\'un volet embauche pour le moment »)' })])]),
      h('label', [h('input', { type: 'checkbox', checked: true, disabled: true }), h('span', [h('b', 'Contacts d\'urgence'), h('span', { text: ' — toujours' })])])
    ].concat(Object.keys(lib).map(function (k) {
      cases[k] = h('input', { type: 'checkbox', checked: v[k] === true });
      return h('label', [cases[k], h('span', { text: lib[k] })]);
    })))]);
    var btn = h('button.btn.primaire', { type: 'button', text: 'Enregistrer les volets', style: { marginTop: '10px' }, onclick: function () {
      var volets = {}; Object.keys(cases).forEach(function (k) { volets[k] = cases[k].checked; });
      btn.classList.add('occupe');
      AMX.post({ action: 'rhVolets', volets: volets }, { secours: false }).then(function (r) {
        btn.classList.remove('occupe');
        if (!r || r.ok === false || !r.volets) throw new Error((r && r.erreur) || SCRIPT_PAS_A_JOUR);
        self.rep.volets = r.volets; AMX.toast('Volets enregistrés — les DG et directeurs les voient à leur prochaine connexion ou après un rafraîchissement', 'ok', 7000);
      }).catch(function (er) { btn.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(er), 'erreur'); });
    } });
    boite.appendChild(btn);
    this.elVolets.appendChild(boite);
  };
  VueAcces.prototype.rendre = function () {
    var self = this; if (!this.rep) return;
    this.rendreVolets();
    var l = this.rep.comptes.filter(function (c) {
      if (self.filtre === 'avec' && !c.niveau) return false;
      return !self.q || AMX.correspond([c.nom, c.courriel, c.roleLibelle, nomCie(c.concession)], self.q);
    });
    var ordre = { complet: 0, dg: 1, limite: 2, '': 3 };
    l.sort(function (a, b) { return (ordre[a.niveau] - ordre[b.niveau]) || String(a.nom).localeCompare(String(b.nom), 'fr'); });
    AMX.vider(this.elCorps);
    if (!l.length) { this.elCorps.appendChild(h('div.carte', [h('p', { style: { padding: '20px', color: 'var(--encre-3)' }, text: 'Aucun compte.' })])); return; }
    var corps = h('tbody');
    l.slice(0, 300).forEach(function (c) {
      var action;
      if (c.parRole) action = h('span.s', { text: 'par son rôle' });
      else {
        var cb = h('input', { type: 'checkbox', checked: !!c.rh, 'aria-label': 'Accès RH pour ' + c.nom });
        cb.addEventListener('change', function () {
          var veut = cb.checked; cb.disabled = true;
          var texte = veut ? 'Donner l\'accès RH à ' + c.nom + ' ?' : 'Retirer l\'accès RH de ' + c.nom + ' ?';
          var msg = veut ? (c.role === 'admin' ? 'Un DG a déjà l\'embauche de sa concession et les contacts d\'urgence ; ce droit ne lui donne rien de plus aujourd\'hui.' : 'Il pourra remplir une fiche d\'embauche et l\'envoyer à son DG (ensuite il ne la voit plus), et voir les contacts d\'urgence de sa concession.')
            : 'Il ne pourra plus commencer d\'embauche. Ses fiches déjà envoyées continuent leur chemin.';
          AMX.confirmer(texte, msg, { ok: veut ? 'Donner l\'accès' : 'Retirer l\'accès', danger: !veut }).then(function (oui) {
            if (!oui) { cb.checked = !veut; cb.disabled = false; return; }
            return AMX.post({ action: 'rhAcces', compte: c.courriel, rh: veut }, { secours: false }).then(function (r) {
              cb.disabled = false;
              if (!r || r.ok === false || r.rh === undefined) throw new Error((r && r.erreur) || SCRIPT_PAS_A_JOUR);
              c.rh = r.rh; c.niveau = c.role === 'admin' ? 'dg' : (r.rh ? 'limite' : '');
              AMX.toast(veut ? 'Accès RH donné à ' + c.nom : 'Accès RH retiré de ' + c.nom, 'ok'); self.rendre();
            });
          }).catch(function (er) { cb.checked = !veut; cb.disabled = false; AMX.toast(AMX.erreurTexte(er), 'erreur'); });
        });
        action = h('label.case', [cb, h('span', { text: 'Accès RH' })]);
      }
      corps.appendChild(h('tr', [
        h('td', [h('b', { text: c.nom }), h('span.s', { text: c.courriel })]),
        h('td', [h('span', { text: c.roleLibelle }), h('span.s', { text: nomCie(c.concession) })]),
        h('td', [h('span.rha-niv.' + (c.niveau || 'aucun'), { text: NIVEAUX[c.niveau || ''] })]),
        h('td', [action])
      ]));
    });
    this.elCorps.appendChild(h('div.carte', [h('div', { style: { overflowX: 'auto' } }, [h('table.tableau.rha-table', [
      h('thead', [h('tr', [h('th', 'Compte'), h('th', 'Rôle'), h('th', 'Accès'), h('th', '')])]), corps])])]));
  };
  AMX.section('rhacces', { titre: 'Accès RH', icone: 'cadenas', ordre: 60,
    visible: function () { return !!(AMX.rhNiveau && AMX.rhNiveau() === 'complet'); },
    monter: function (conteneur) { return new VueAcces(conteneur); } });
})();
