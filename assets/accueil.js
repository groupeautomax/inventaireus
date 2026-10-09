/* Accueil (9 octobre 2026) — la première page du site.

   Maxime : « la page d'accueil du site ne devrait pas être par défaut l'inventaire
   US ; je ferais une belle page d'accueil et laisserais le choix aux utilisateurs
   de choisir où ils commencent ».

   - Section « Accueil » (ordre 1) : bonjour, recherche d'un véhicule, une tuile par
     section visible (icône, résumé, onglets avec leurs compteurs), dernière nouveauté.
   - Page de départ : chaque utilisateur choisit où le site s'ouvre (Accueil par
     défaut, ou n'importe quelle section / onglet). Gardé dans ce navigateur
     (AMX.memo 'accueil_depart') ; le routeur (app.js) l'applique quand l'adresse
     est vide (connexion, ouverture du site, clic sur le logo → toujours l'Accueil).
   - AMX.accueil.depart() / AMX.accueil.choisirDepart(section, onglet). */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var CLE_DEPART = 'accueil_depart';

  var RESUMES = {
    inventaire: 'Les véhicules des registres É.-U., Canada et Detail, et le suivi des neufs.',
    service: 'Reconditionnement des véhicules au détail : autorisation, bons de travail, livraison.',
    offres: 'Véhicules en vente, offres reçues, acheteurs externes, leads.',
    achat: 'La fiche d\'achat d\'un véhicule : prix, km, dommages, rapports.',
    outils: 'Évaluation marché, registre d\'évaluations, Torque, fiches eBlock, valeurs OpenLane, CARFAX.',
    avis: 'Les avis Google des concessions et les sondages aux clients.',
    resultat: 'Profits et résultats par période, par concession, par acheteur.',
    admin: 'Comptes, droits, concessions et réglages du site.',
    aide: 'Guide de toutes les fonctions, nouveautés, suggestions.'
  };

  function injecterCss() {
    if (document.getElementById('css-accueil')) return;
    var s = document.createElement('style');
    s.id = 'css-accueil';
    s.textContent = [
      '.acc-page { max-width: 1180px; }',
      '.acc-tete { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 14px 24px; margin-bottom: 18px; }',
      '.acc-tete h1 { font-size: 26px; margin: 0 0 4px; } .acc-tete .sous { color: var(--encre-3); font-size: 13.5px; }',
      '.acc-recherche { position: relative; flex: 1 1 320px; max-width: 520px; display: flex; align-items: center; gap: 8px; background: var(--carte); border: 1px solid var(--ligne); border-radius: 12px; padding: 8px 12px; box-shadow: var(--ombre); }',
      '.acc-recherche svg { width: 18px; height: 18px; color: var(--encre-3); flex: none; } .acc-recherche input { flex: 1; border: 0; background: transparent; font: inherit; font-size: 14.5px; color: var(--encre); outline: none; min-width: 0; }',
      '.acc-tuiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 12px; margin-bottom: 14px; }',
      '.acc-tuile { position: relative; display: flex; flex-direction: column; gap: 8px; background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); padding: 14px 14px 12px; box-shadow: var(--ombre); color: inherit; text-decoration: none; transition: transform .12s, box-shadow .12s; }',
      '.acc-tuile:hover { text-decoration: none; transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,.08); border-color: var(--ligne-forte); }',
      '.acc-tuile .haut { display: flex; align-items: center; gap: 10px; } .acc-tuile .ic { width: 38px; height: 38px; border-radius: 10px; background: var(--gris-bg); display: flex; align-items: center; justify-content: center; color: var(--encre); flex: none; } .acc-tuile .ic svg { width: 20px; height: 20px; }',
      '.acc-tuile h2 { font-size: 16px; margin: 0; } .acc-tuile .resume { color: var(--encre-2); font-size: 12.5px; line-height: 1.4; min-height: 34px; }',
      '.acc-tuile .onglets { display: flex; flex-wrap: wrap; gap: 6px; } .acc-tuile .onglets a { font-size: 12px; padding: 3px 9px; border-radius: 999px; background: var(--gris-bg); color: var(--encre-2); text-decoration: none; display: inline-flex; gap: 5px; align-items: center; } .acc-tuile .onglets a:hover { background: var(--ligne); color: var(--encre); } .acc-tuile .onglets a b { font-weight: 700; color: var(--encre); }',
      '.acc-tuile .depart { position: absolute; top: 10px; right: 10px; border: 0; background: transparent; color: var(--encre-4); cursor: pointer; padding: 4px; border-radius: 6px; line-height: 0; } .acc-tuile .depart:hover { background: var(--gris-bg); color: var(--encre); } .acc-tuile .depart.actif { color: var(--ambre); } .acc-tuile .depart svg { width: 18px; height: 18px; }',
      '.acc-tuile.depart-actif { border-color: var(--ambre-bord, #E8C56E); }',
      '.acc-bas { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; } @media (max-width: 820px) { .acc-bas { grid-template-columns: 1fr; } }',
      '.acc-depart-ligne { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; } .acc-depart-ligne select { max-width: 100%; }',
      '.acc-nouveaute .date { color: var(--encre-3); font-size: 12px; } .acc-nouveaute .titre { font-weight: 600; margin: 2px 0 4px; } .acc-nouveaute p { margin: 0; color: var(--encre-2); font-size: 12.5px; line-height: 1.45; }',
      '@media (max-width: 640px) { .acc-tete h1 { font-size: 22px; } .acc-tuiles { grid-template-columns: 1fr; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ Départ ------------------------------- */
  function departLu() {
    var d = AMX.memo.lire(CLE_DEPART, null);
    if (!d || typeof d !== 'object' || !d.section) return null;
    var sec = AMX.sections[d.section];
    if (!sec || (sec.visible && !sec.visible())) return null;
    var onglets = (sec.onglets || []).filter(function (o) { return !o.visible || o.visible(); });
    var ong = onglets.filter(function (o) { return o.id === d.onglet; })[0] || onglets[0] || null;
    return { section: d.section, onglet: ong ? ong.id : '' };
  }
  function departTexte(d) {
    if (!d) return 'Accueil';
    var sec = AMX.sections[d.section]; if (!sec) return 'Accueil';
    var ong = (sec.onglets || []).filter(function (o) { return o.id === d.onglet; })[0];
    return sec.titre + (ong && (sec.onglets || []).length > 1 ? ' › ' + ong.titre : '');
  }
  AMX.accueil = {
    /** { section, onglet } choisi par l'utilisateur, ou null = Accueil. */
    depart: departLu,
    departTexte: function () { return departTexte(departLu()); },
    choisirDepart: function (section, onglet) {
      if (!section || section === 'accueil') AMX.memo.ecrire(CLE_DEPART, '');
      else AMX.memo.ecrire(CLE_DEPART, { section: section, onglet: onglet || '' });
      document.dispatchEvent(new CustomEvent('amx:accueil-depart'));
      AMX.toast('Le site s\'ouvrira sur ' + departTexte(departLu()) + '.', 'ok');
    }
  };

  /* ------------------------------- La vue -------------------------------- */
  function Accueil(conteneur, ctx) {
    injecterCss();
    var self = this;
    this.conteneur = conteneur;
    this.el = h('div.page.acc-page');
    conteneur.appendChild(this.el);
    this.rendre();
    this.sur = function () { if (self.el.isConnected) self.rendre(); };
    ['amx:profil', 'amx:accueil-depart', 'amx:eblock', 'amx:openlane', 'amx:demandes', 'amx:suggestions'].forEach(function (ev) { document.addEventListener(ev, self.sur); });
    // Les compteurs des onglets (inventaire, service…) arrivent après le premier rendu.
    if (AMX.inventaire && AMX.inventaire.tout) AMX.inventaire.tout().then(this.sur, function () {});
  }
  Accueil.prototype.demonter = function () { var self = this; ['amx:profil', 'amx:accueil-depart', 'amx:eblock', 'amx:openlane', 'amx:demandes', 'amx:suggestions'].forEach(function (ev) { document.removeEventListener(ev, self.sur); }); };
  Accueil.prototype.naviguer = function () { this.rendre(); };

  function prenom() { var n = String(AMX.session.nom || '').trim(); return n ? n.split(/\s+/)[0] : ''; }
  function salutation() { var hr = new Date().getHours(); return hr < 5 ? 'Bonne nuit' : (hr < 12 ? 'Bonjour' : (hr < 18 ? 'Bon après-midi' : 'Bonsoir')); }
  function dateLongue() { try { return new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } }

  Accueil.prototype.rendre = function () {
    var self = this;
    AMX.vider(this.el);
    var p = AMX.session.perms || {};
    var ROLES = { proprietaire: 'Propriétaire', admin: 'Administrateur', gestionnaire: 'Gestionnaire', utilisateur: 'Utilisateur', service: 'Service', marketing: 'Marketing', comptabilite: 'Comptabilité', ventes: 'Ventes', direction: 'Direction' };
    var role = String(AMX.session.role || ''); role = ROLES[role] || (role ? role.charAt(0).toUpperCase() + role.slice(1) : '');
    var sousTexte = [dateLongue(), p.nomConcession || '', role].filter(Boolean).join(' · ');
    var input = h('input', { type: 'search', id: 'accueil-recherche', placeholder: 'Trouver un véhicule : NIV, # stock, modèle…', autocomplete: 'off' });
    var recherche = h('div.acc-recherche', [h('span', { html: I.recherche }), input]);
    this.el.appendChild(h('div.acc-tete', [
      h('div', [h('h1', { text: salutation() + (prenom() ? ', ' + prenom() : '') }), h('div.sous', { text: sousTexte })]),
      recherche
    ]));
    if (AMX.brancherRecherche) AMX.brancherRecherche(input);

    var depart = departLu();
    var tuiles = h('div.acc-tuiles');
    AMX.listeSections().filter(function (s) { return s.id !== 'accueil'; }).forEach(function (s) {
      var onglets = (s.onglets || []).filter(function (o) { return !o.visible || o.visible(); });
      var premier = onglets[0] ? onglets[0].id : '';
      var estDepart = !!depart && depart.section === s.id;
      var btnDepart = h('button.depart' + (estDepart ? '.actif' : ''), { type: 'button', title: estDepart ? 'Le site s\'ouvre ici — cliquez pour revenir à l\'Accueil' : 'Ouvrir le site ici par défaut', 'aria-label': 'Page de départ', html: estDepart ? ETOILE_PLEINE : ETOILE, onclick: function (e) { e.preventDefault(); e.stopPropagation(); AMX.accueil.choisirDepart(estDepart ? '' : s.id, premier); } });
      var tuile = h('a.acc-tuile' + (estDepart ? '.depart-actif' : ''), { href: AMX.lien(s.id, premier), 'data-section': s.id }, [
        h('div.haut', [h('span.ic', { html: I[s.icone] || I.inventaire }), h('h2', { text: s.titre })]),
        h('div.resume', { text: RESUMES[s.id] || '' }),
        onglets.length > 1 ? h('div.onglets', onglets.map(function (o) {
          var c = o.compteur ? o.compteur() : null;
          return h('a', { href: AMX.lien(s.id, o.id), onclick: function (e) { e.stopPropagation(); } }, [o.titre, (c !== null && c !== undefined && c !== '') ? h('b', { text: String(c) }) : null]);
        })) : null,
        btnDepart
      ]);
      tuiles.appendChild(tuile);
    });
    this.el.appendChild(tuiles);

    // Bas : page de départ + dernière nouveauté
    var options = [{ v: '', t: 'Accueil (cette page)' }];
    AMX.listeSections().filter(function (s) { return s.id !== 'accueil'; }).forEach(function (s) {
      var onglets = (s.onglets || []).filter(function (o) { return !o.visible || o.visible(); });
      if (onglets.length > 1) onglets.forEach(function (o) { options.push({ v: s.id + '/' + o.id, t: s.titre + ' › ' + o.titre }); });
      else options.push({ v: s.id + '/' + (onglets[0] ? onglets[0].id : ''), t: s.titre });
    });
    var actuel = depart ? depart.section + '/' + depart.onglet : '';
    var sel = h('select.saisie#accueil-depart', options.map(function (o) { return h('option', { value: o.v, selected: o.v === actuel ? true : undefined, text: o.t }); }));
    sel.addEventListener('change', function () { var v = sel.value.split('/'); AMX.accueil.choisirDepart(v[0] || '', v[1] || ''); });
    var carteDepart = h('div.carte', [h('div.carte-corps', [
      h('div.section-titre', { style: { marginBottom: '6px' } }, 'Page de départ'),
      h('div.acc-depart-ligne', [h('span.doux', 'À la connexion, le site s\'ouvre sur'), sel]),
      h('div.mini.doux', { style: { marginTop: '6px' } }, 'Choix gardé sur cet appareil. Le logo Groupe Automax ramène toujours ici.')
    ])]);
    var nouv = (AMX.AIDE_CONTENU && AMX.AIDE_CONTENU.nouveautes && AMX.AIDE_CONTENU.nouveautes[0]) || null;
    var carteNouv = h('div.carte.acc-nouveaute', [h('div.carte-corps', [
      h('div.section-titre', { style: { marginBottom: '6px' } }, 'Nouveautés'),
      nouv ? h('div', [h('div.date', { text: nouv.date }), h('div.titre', { text: nouv.titre }), h('p', { text: String(nouv.texte || '').slice(0, 260) + (String(nouv.texte || '').length > 260 ? '…' : '') })]) : h('p.doux', 'Rien de neuf.'),
      AMX.sections.aide ? h('div', { style: { marginTop: '8px' } }, [h('a.btn.petit', { href: AMX.lien('aide', 'nouveautes'), text: 'Toutes les nouveautés' }), ' ', h('a.btn.petit.fantome', { href: AMX.lien('aide', 'questions'), text: 'Guide et aide' })]) : null
    ])]);
    this.el.appendChild(h('div.acc-bas', [carteDepart, carteNouv]));
  };
  var ETOILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/></svg>';
  var ETOILE_PLEINE = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/></svg>';

  AMX.section('accueil', {
    titre: 'Accueil', icone: 'accueil', ordre: 1,
    monter: function (conteneur, ctx) { return new Accueil(conteneur, ctx); }
  });
})();
