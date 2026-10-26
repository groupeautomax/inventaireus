/* =========================================================================
   Lecture hebdomadaire du marché (24 octobre 2026) — AMX.occMarche. Depuis le 26 oct., les onglets « Prix du marché » et
   « Concurrents » ne sont plus montrés dans Opportunités d'achat (VueMarche / VueConcurrents restent pour un retour) : les
   données servent à Inventaire › Analyse usagé et au bloc « Prix du marché » du panneau Usagé.

   Maxime (24 oct.) : « 1-2 c'est bon » — une lecture par semaine (le lundi) des annonces des concessionnaires dans
   200 km de Montréal, pour les modèles de nos usagés en stock (serveur : OccMarche.gs, robot Apify). Deux onglets de la
   page Opportunités d'achat :
     · Prix du marché : chacun de nos usagés au détail comparé aux annonces des concurrents (même modèle, année ± 1,
       km ± 30 000, prix ajusté à notre km) — médiane, rang de notre annonce (« 4e sur 15 »), écart, âge des annonces ;
       verdicts Trop cher / Dans le marché / Pas assez cher / Sans prix affiché / Peu de comparables.
     · Concurrents : les concessionnaires voisins (rayon autour de la concession choisie) — annonces, modèles, prix et
       âge médians, nouvelles de la semaine — parmi les modèles que nous avons en stock.
   Et AMX.occMarche.bloc(vin, conteneur) : le bloc « Prix du marché » du panneau d'un usagé (inventaire.js).
   Règle v138 : filtres → « Chiffres et liste » → chiffres sur la liste filtrée → liste. Données du serveur en textContent.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var COURTS = { STM: 'Ste Marie', HAWKS: 'Hawkesbury', BMW: 'BMW Sherbrooke', VW: 'VW Brossard', HYUNDAI: 'Hyundai Longueuil' };
  var VERDICTS = [['cher', 'Trop chers', 'Trop cher', 'rouge'], ['marche', 'Dans le marché', 'Dans le marché', 'vert'], ['bas', 'Pas assez chers', 'Pas assez cher', 'bleu'],
    ['inconnu', 'Sans prix affiché', 'Prix affiché introuvable', 'gris'], ['peu', 'Peu de comparables', 'Peu d\'annonces de la même version', 'gris'],
    ['version', 'Version à préciser', 'Version à préciser (Analyse usagé)', 'ambre'], ['tous', 'Tous', '', '']];   /* 25 oct. : comparé seulement à la même version */
  var V_LIB = {}; VERDICTS.forEach(function (v) { V_LIB[v[0]] = { t: v[2], c: v[3] }; });
  var TRIS_M = [['ecart', 'Écart au marché'], ['jours', 'Jours en stock'], ['comps', 'Nombre de comparables'], ['modele', 'Modèle']];
  var RAYONS = [[25, '25 km'], [50, '50 km'], [100, '100 km'], [0, 'Tout le rayon lu']];
  var SITES = { autotrader: 'AutoTrader.ca', cargurus: 'CarGurus.ca', kijiji: 'Kijiji', carpages: 'Carpages.ca', site: 'site de la concession' };
  /* Notre prix : notre annonce trouvée par le robot, sinon le prix du site de la concession (import D2C Media). */
  function sourceNotre(n) { return n.source === 'site' ? 'site de la concession' + (n.le ? ' (D2C, ' + AMX.fmtDate(n.le) + ')' : '') : (SITES[n.site] || 'annonce'); }
  function texteComps(v) { return v.n + ' comparable' + (v.n > 1 ? 's' : '') + (v.elargi ? ' (élargi)' : ''); }
  var LIMITE = 100;

  function nb(v) { return typeof v === 'number' && isFinite(v); }
  function argent(v) { return nb(v) ? AMX.fmtArgent(Math.round(v)) : '—'; }
  function signe(v) { return nb(v) ? (v > 0 ? '+' : (v < 0 ? '−' : '')) + AMX.fmtArgent(Math.abs(Math.round(v))) : '—'; }
  function pct(v) { return nb(v) ? (v > 0 ? '+' : (v < 0 ? '−' : '')) + String(Math.abs(v)).replace('.', ',') + ' %' : '—'; }
  function km(v) { return nb(v) ? AMX.fmtNombre(Math.round(v)) + ' km' : 'km inconnu'; }
  function rangTexte(r, n) { return nb(r) ? (r === 1 ? '1er' : r + 'e') + ' sur ' + n : ''; }
  function mediane(l) { if (!l.length) return null; var s = l.slice().sort(function (a, b) { return a - b; }), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function distance(a, b) {
    if (!a || !b || !nb(a.lat) || !nb(a.lon) || !nb(b.lat) || !nb(b.lon)) return null;
    var R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  function nomMarque(m) { var x = String(m || '').replace(/-/g, ' '); if (/^(gmc|bmw|ram|mini)$/i.test(x)) return x.toUpperCase(); return x.replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function vehicule(v) { return [v.annee, nomMarque(v.marque), v.modele, v.versionLibelle || v.version].filter(Boolean).join(' '); }
  function cleVendeur(nom) { return String(nom || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\b(inc|ltee|ltd|limitee|enr|the)\b/g, '').replace(/\s+/g, ' ').trim(); }
  function puceVerdict(v, grand) { var x = V_LIB[v] || V_LIB.peu; return h('span.puce.occm-v.' + (x.c || 'gris') + (grand ? '.grand' : ''), { text: x.t }); }
  function lien(url, texte) { return /^https:\/\//.test(url || '') ? h('a', { href: url, target: '_blank', rel: 'noopener', text: texte || 'Annonce ↗' }) : null; }

  /* ------------------------------ Données ------------------------------ */
  var cache = { rep: null, quand: 0, promesse: null, copieLe: 0 };
  function charger(force) {
    if (!force && cache.rep && Date.now() - cache.quand < 5 * 60000) return Promise.resolve(cache.rep);
    if (cache.promesse) return cache.promesse;
    // Sans les annonces (10 000 depuis le 25 oct.) : l'onglet Concurrents les demande à part, quand il s'ouvre.
    cache.promesse = AMX.get({ occasionsMarche: 1, sansAnnonces: 1 }, { gz: true, copie: 'occ_marche', secours: false, delai: 90000 }).then(function (d) {
      cache.promesse = null;
      if (d && d.refuse) return d;
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Réponse inattendue du serveur');
      if (!Array.isArray(d.vehicules)) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (OccMarche.gs, RoutesAjout.gs).');
      cache.rep = d; cache.quand = Date.now(); cache.copieLe = 0;
      try { document.dispatchEvent(new CustomEvent('amx:occmarche')); } catch (e) {}
      return d;
    }, function (e) { cache.promesse = null; throw e; });
    return cache.promesse;
  }
  /* Annonces des concurrents (onglet Concurrents) : demandées à part, gardées pour la lecture du marché en cours. */
  var cacheA = { le: '', annonces: null, promesse: null };
  function annonces(d) {
    if (d && Array.isArray(d.annonces)) return Promise.resolve(d.annonces);          // ancien script : déjà dans la réponse
    var le = (d && d.le) || '';
    if (cacheA.annonces && cacheA.le === le) return Promise.resolve(cacheA.annonces);
    if (cacheA.promesse) return cacheA.promesse;
    cacheA.promesse = AMX.get({ occasionsMarche: 1, annoncesSeules: 1 }, { gz: true, copie: 'occ_marche_annonces', secours: false, delai: 90000 }).then(function (r) {
      cacheA.promesse = null;
      if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Réponse inattendue du serveur');
      if (!Array.isArray(r.annonces)) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (OccMarche.gs).');
      cacheA.annonces = r.annonces; cacheA.le = r.le || le;
      return r.annonces;
    }, function (e) { cacheA.promesse = null; throw e; });
    return cacheA.promesse;
  }
  function annoncesEnMain(d) {
    if (d && Array.isArray(d.annonces)) return d.annonces;
    return cacheA.annonces && cacheA.le === ((d && d.le) || '') ? cacheA.annonces : null;
  }
  /* Le registre Detail fait foi : un véhicule supprimé, vendu ou transféré depuis la lecture du marché n'y est plus.
     Sans registre en mémoire, la liste du serveur reste telle quelle (le serveur la filtre déjà depuis le 25 oct.). */
  var STOCK_DETAIL = ['achete', 'transitqc', 'stock'];
  function vehiculesActuels(d) {
    var l = (d && d.vehicules) || [], reg = AMX.inventaire && AMX.inventaire.enCache ? AMX.inventaire.enCache('DETAIL') : null;
    if (!Array.isArray(reg) || !reg.length) return l;
    var ok = {};
    reg.forEach(function (r) { if (r && r.vin && STOCK_DETAIL.indexOf(String(r.statut || '')) >= 0) ok[String(r.vin).toUpperCase()] = true; });
    return l.filter(function (v) { return v && ok[String(v.vin || '').toUpperCase()]; });
  }
  /* La copie du navigateur d'abord (affichage immédiat), sans attendre le serveur. */
  function copie() {
    if (cache.rep) return Promise.resolve(cache.rep);
    return AMX.cacheLocal.lireGz('occ_marche', 14 * 86400000).then(function (o) {
      if (cache.rep || !o || !o.donnees || !Array.isArray(o.donnees.vehicules)) return cache.rep;
      cache.rep = o.donnees; cache.quand = 0; cache.copieLe = o.quand; return cache.rep;
    }).catch(function () { return cache.rep; });
  }
  function texteLecture(d) {
    if (!d) return '';
    var e = d.etat || {};
    if (!d.le) return e.enCours ? 'Première lecture du marché en cours chez Apify (lancée ' + AMX.fmtDate(e.enCours.le, true) + ').' : 'Pas encore lu : la première lecture part ' + (e.jour === 1 ? 'lundi' : 'le jour prévu') + ' à partir de 6 h.';
    var dn = e.derniere || {};
    var nA = Array.isArray(d.annonces) ? d.annonces.length : (d.nAnnonces || 0);
    return 'Lecture du ' + AMX.fmtDate(d.le, true) + ' · ' + AMX.fmtNombre(nA) + ' annonces de concessionnaires' + (dn.vendeurs ? ' (' + AMX.fmtNombre(dn.vendeurs) + ' concessionnaires)' : '') + ' dans ' + (d.rayon || 200) + ' km de ' + (d.centre || 'Montréal') +
      (e.enCours ? ' · nouvelle lecture en cours' : '');
  }
  function lancer(bouton, apres) {
    if (bouton) bouton.classList.add('occupe');
    return AMX.post({ action: 'occasionsMarche', mode: 'lancer' }, { delai: 300000, secours: false }).then(function (r) {
      if (bouton) bouton.classList.remove('occupe');
      if (!r || r.refuse || r.ok === false) { AMX.toast((r && r.erreur) || 'Refusé', 'attention', 9000); return; }
      if (r.vehicules) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (OccMarche.gs).');
      if (r.lance) AMX.toast('Lecture du marché lancée chez Apify (' + (r.lignes || 0) + ' modèles) : les annonces arrivent dans 15 à 60 minutes, relevées aux 10 minutes.', 'ok', 9000);
      else if (r.attente) AMX.toast('La lecture du marché est encore en cours chez Apify (' + (r.statut || '') + ').', 'attention', 7000);
      else AMX.toast('Lecture relevée : ' + (r.gardees || 0) + ' annonces de concessionnaires.', 'ok', 7000);
      if (apres) apres();
    }).catch(function (e) { if (bouton) bouton.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  }

  /* ------------------------------ Prix du marché (nos usagés) ------------------------------ */
  function VueMarche(page) {
    injecterCss();
    this.page = page; this.d = null; this.ouverts = {}; this.limite = LIMITE;
    this.f = { q: '', verdict: AMX.memo.lire('occm_verdict', '') || '', tri: AMX.memo.lire('occm_tri', 'ecart') };
    this.construire();
  }
  VueMarche.prototype.construire = function () {
    var self = this;
    this.elEtat = h('div.occm-etat');
    this.elQ = h('input.saisie#occm-recherche', { type: 'search', placeholder: 'Chercher : # stock, modèle, NIV…', autocomplete: 'off',
      oninput: AMX.debounce(function (e) { self.f.q = e.target.value; self.limite = LIMITE; self.rafraichir(); }, 150),
      onkeydown: function (e) { if (e.key === 'Escape' && self.elQ.value) { e.stopPropagation(); self.elQ.value = ''; self.f.q = ''; self.rafraichir(); } } });
    this.elVerdicts = h('div.segment.occm-verdicts#occm-verdicts');
    this.elTri = h('select.saisie#occm-tri', { 'aria-label': 'Trier', onchange: function () { self.f.tri = self.elTri.value; AMX.memo.ecrire('occm_tri', self.f.tri); self.rafraichir(); } },
      TRIS_M.map(function (t) { return h('option', { value: t[0], text: 'Tri : ' + t[1] }); }));
    this.elTri.value = this.f.tri;
    this.elPortee = h('div.portee-chiffres'); this.elKpis = h('div.kpis.occ-kpis'); this.elListe = h('div.occm-liste');
    // 26 oct. : « Sélectionner » puis Supprimer (droit « Supprimer ») ; un usagé supprimé ailleurs disparaît d'ici aussi.
    this.sel = AMX.modeSelection({ liste: this.elListe, selecteur: '.occm-rangee', actions: [
      AMX.perm('supprimer') ? { texte: 'Supprimer', icone: I.corbeille, danger: true, action: function (vins, vider) {
        AMX.inventaire.supprimer(vins, { feuille: 'DETAIL' }).then(function (faits) { if (faits) vider(); });
      } } : null] });
    this.surInventaire = function (e) { if (self.d && (!e || !e.detail || e.detail.feuille === 'DETAIL')) self.rafraichir(); };
    document.addEventListener('amx:inventaire', this.surInventaire);
    this.el = h('div.occm', [this.elEtat,
      h('div.carte.occ-filtres', [h('div.carte-corps', [
        h('div.occ-ligne', [h('div.recherche', [h('span', { html: I.recherche }), this.elQ]), this.elTri, this.sel.bouton]),
        h('div.occ-ligne', [this.elVerdicts])])]),
      this.elPortee, this.elKpis, this.elListe]);
  };
  VueMarche.prototype.demonter = function () { if (this.sel) this.sel.quitter(); document.removeEventListener('amx:inventaire', this.surInventaire); };
  VueMarche.prototype.vehicules = function () {
    var d = this.d || {}, cie = this.page.compagnie;
    return vehiculesActuels(d).filter(function (v) { return !cie || v.compagnie === cie; });
  };
  VueMarche.prototype.filtrer = function (sauf) {
    var f = this.f;
    return this.vehicules().filter(function (v) {
      if (sauf !== 'verdict' && f.verdict && f.verdict !== 'tous' && v.verdict !== f.verdict) return false;
      if (f.q && !AMX.correspond([v.stock, v.vin, v.annee, v.marque, v.modele, v.version, v.texte, COURTS[v.compagnie]], f.q)) return false;
      return true;
    });
  };
  VueMarche.prototype.trier = function (l) {
    var t = this.f.tri;
    var val = function (v) {
      if (t === 'jours') return AMX.joursDepuis(v.dateAjout) || 0;
      if (t === 'comps') return v.n || 0;
      if (t === 'modele') return 0;
      return nb(v.ecartPct) ? v.ecartPct : -1e6;
    };
    var c = l.slice();
    if (t === 'modele') c.sort(function (a, b) { return vehicule(a).localeCompare(vehicule(b), 'fr'); });
    else c.sort(function (a, b) { return val(b) - val(a); });
    return c;
  };
  VueMarche.prototype.rendre = function (d) {
    this.d = d;
    this.elEtat.textContent = texteLecture(d) + (cache.copieLe ? ' · copie du ' + AMX.copieTexte(cache.copieLe) : '');
    if (d && d.admin && !(d.etat || {}).enCours) {
      var self = this, b = h('button.btn.petit.fantome#occm-lire', { type: 'button', text: d.le ? 'Relire maintenant' : 'Lire maintenant', title: '≈ ' + AMX.fmtNombre((d.etat || {}).estime || 4) + ' $ US (Apify)', onclick: function () { lancer(b, function () { self.page.chargerMarche(true); }); } });
      this.elEtat.appendChild(h('span', ' ')); this.elEtat.appendChild(b);
    }
    // Verdict par défaut : les trop chers s'il y en a, sinon tous.
    if (!this.f.verdict) { var nCher = this.vehicules().filter(function (v) { return v.verdict === 'cher'; }).length; this.f.verdict = nCher ? 'cher' : 'tous'; }
    this.rafraichir();
  };
  VueMarche.prototype.rafraichir = function () {
    var self = this, f = this.f, d = this.d;
    if (!d) return;
    AMX.vider(this.elVerdicts);
    var pour = this.filtrer('verdict');
    VERDICTS.forEach(function (v) {
      var n = v[0] === 'tous' ? pour.length : pour.filter(function (x) { return x.verdict === v[0]; }).length;
      if (!n && v[0] !== 'tous' && f.verdict !== v[0] && (v[0] === 'peu' || v[0] === 'inconnu' || v[0] === 'version')) return;
      self.elVerdicts.appendChild(h('button' + (f.verdict === v[0] ? '.actif' : ''), { type: 'button', 'data-verdict': v[0], onclick: function () { f.verdict = v[0]; AMX.memo.ecrire('occm_verdict', v[0]); self.limite = LIMITE; self.rafraichir(); } },
        [v[3] ? h('i.pt.' + v[3]) : null, v[1] + ' ', h('b', { text: String(n) })]));
    });
    var liste = this.trier(this.filtrer());
    var actifs = []; if (f.q) actifs.push('« ' + f.q + ' »'); if (f.verdict && f.verdict !== 'tous') actifs.push(VERDICTS.filter(function (v) { return v[0] === f.verdict; })[0][1]);
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['usagé', 'usagés'], contexte: [this.page.compagnie ? COURTS[this.page.compagnie] || this.page.compagnie : 'toutes les concessions', 'registre Detail'],
      filtres: actifs, effacer: function () { f.q = ''; f.verdict = 'tous'; self.elQ.value = ''; self.rafraichir(); } });
    this.rendreKpis(liste);
    this.rendreListe(liste);
  };
  VueMarche.prototype.rendreKpis = function (liste) {
    AMX.vider(this.elKpis);
    var avecPrix = liste.filter(function (v) { return v.notre && nb(v.notre.prix); });
    var chers = liste.filter(function (v) { return v.verdict === 'cher'; }), bas = liste.filter(function (v) { return v.verdict === 'bas'; });
    var moy = function (l) { var x = l.map(function (v) { return v.ecartPct; }).filter(nb); return x.length ? Math.round(x.reduce(function (a, b) { return a + b; }, 0) / x.length * 10) / 10 : null; };
    var laisse = bas.reduce(function (s, v) { return s + (nb(v.ecart) ? -v.ecart : 0); }, 0);
    var jours = mediane(liste.map(function (v) { return v.joursMed; }).filter(nb));
    var tuile = function (val, lib, sous, cls) { return h('div.kpi.inv2-fixe' + (cls ? '.' + cls : ''), [h('div.valeur', { text: val }), h('div.libelle', { text: lib }), h('div.sous', { text: sous })]); };
    this.elKpis.appendChild(tuile(AMX.fmtNombre(liste.length), 'Usagés', AMX.fmtNombre(avecPrix.length) + ' avec notre prix affiché'));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(chers.length), 'Trop chers', chers.length ? 'écart moyen ' + pct(moy(chers)) : 'au-dessus du marché + ' + ((this.d.etat || {}).seuilPct || 5) + ' %', chers.length ? 'neg' : ''));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(bas.length), 'Pas assez chers', bas.length ? '≈ ' + argent(laisse) + ' sous la médiane' : 'sous le marché − ' + ((this.d.etat || {}).seuilPct || 5) + ' %', bas.length ? 'bleu' : ''));
    this.elKpis.appendChild(tuile(nb(jours) ? jours + ' j' : '—', 'Âge des annonces', 'médiane chez les concurrents (mêmes modèles)'));
  };
  VueMarche.prototype.rendreListe = function (liste) {
    var self = this;
    AMX.vider(this.elListe);
    if (!this.d.le && !vehiculesActuels(this.d).some(function (v) { return v.n; })) {
      this.elListe.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Pas encore de prix du marché'), h('div', { text: 'La lecture des annonces des concessionnaires se fait une fois par semaine (le lundi, à partir de 6 h). Un administrateur peut la lancer tout de suite avec « Lire maintenant ».' })]));
      return;
    }
    if (!liste.length) { this.elListe.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucun usagé pour ces filtres'), h('div', { text: 'Essayez « Tous ».' })])); return; }
    this.elListe.appendChild(h('div.occm-rangee.occ-tete', ['Usagé', 'Notre prix', 'Marché (ajusté au km)', 'Écart', 'Concurrents', ''].map(function (t) { return h('div', { text: t }); })));
    liste.slice(0, this.limite).forEach(function (v) { self.elListe.appendChild(self.rangee(v)); });
    if (liste.length > this.limite) this.elListe.appendChild(h('button.btn.occ-plus', { type: 'button', text: 'Afficher ' + Math.min(LIMITE, liste.length - this.limite) + ' de plus', onclick: function () { self.limite += LIMITE; self.rafraichir(); } }));
  };
  VueMarche.prototype.rangee = function (v) {
    var self = this, jours = AMX.joursDepuis(v.dateAjout), ouvert = !!this.ouverts[v.vin];
    var usage = h('div.occ-veh', [AMX.logoMarque(nomMarque(v.marque), 'petit'), h('div', [
      h('div.nom', [h('span', { text: vehicule(v), title: v.vin })]),
      h('div.mini', { text: [v.stock ? '# ' + v.stock : '', km(v.km), COURTS[v.compagnie] || v.compagnie, nb(jours) ? jours + ' j en stock' : ''].filter(Boolean).join(' · ') })])]);
    var notre = h('div.occm-notre', v.notre && nb(v.notre.prix) ? [h('b', { text: argent(v.notre.prix) }),
      h('div.mini', [sourceNotre(v.notre), nb(v.notre.jours) ? ' · en ligne ' + v.notre.jours + ' j' : '', ' ', v.notre.lien ? lien(v.notre.lien, '↗') : null])]
      : [h('span.doux', { text: 'inconnu' }), h('div.mini.doux', { text: 'ni dans les sites lus ni dans D2C' })]);
    var marche = h('div.occm-marche', nb(v.mediane) ? [h('b', { text: argent(v.mediane) }),
      h('div.mini', { text: texteComps(v) + (v.n >= 4 ? ' · ' + argent(v.p25) + ' à ' + argent(v.p75) : ''), title: v.elargi ? 'Moins de 3 comparables à l\'année ± 1 et km ± 30 000 : élargi à l\'année ± 2, tout km (prix toujours ajusté à notre km).' : '' })]
      : [h('span.doux', { text: 'aucun comparable' })]);
    var ecart = h('div.occm-ecart', [puceVerdict(v.verdict),
      nb(v.ecartPct) ? h('div.' + (v.verdict === 'cher' ? 'neg' : (v.verdict === 'bas' ? 'bleu' : 'doux')), { text: pct(v.ecartPct) + ' · ' + signe(v.ecart) }) : null,
      nb(v.rang) ? h('div.mini', { text: rangTexte(v.rang, v.n + 1) + ' (du moins cher)' }) : null]);
    var conc = h('div.occm-conc', [h('div', { text: nb(v.joursMed) ? 'annonces en ligne ' + v.joursMed + ' j' : '—' }),
      nb(v.margePot) && this.page.voitCouts() ? h('div.mini', { text: 'marge potentielle ' + signe(v.margePot), title: 'Médiane du marché − notre coût' }) : null]);
    var btn = h('button.btn.petit', { type: 'button', 'aria-expanded': ouvert ? 'true' : 'false', text: ouvert ? 'Masquer' : 'Comparables', disabled: !v.n, onclick: function () { self.ouverts[v.vin] = !self.ouverts[v.vin]; self.rafraichir(); } });
    var r = h('div.occm-rangee.' + 'v-' + v.verdict, { 'data-vin': v.vin }, [usage, notre, marche, ecart, conc, h('div.occ-act', [btn])]);
    if (ouvert) r.appendChild(tableComparables(v, (this.d || {}).tauxKm));
    return r;
  };
  function tableComparables(v, taux) {
    var lignes = (v.comps || []).map(function (c) {
      return h('tr', [h('td', { text: [c.a, c.mo, c.ve].filter(Boolean).join(' ') }), h('td.num', { text: nb(c.k) ? AMX.fmtNombre(c.k) : '—' }), h('td.num', { text: argent(c.p) }),
        h('td.num', [h('b', { text: argent(c.aj) })]), h('td', { text: [c.s, c.vi].filter(Boolean).join(', ') }), h('td.num', { text: nb(c.j) ? c.j + ' j' : '—' }), h('td', [lien(c.l, 'Annonce ↗')])]);
    });
    return h('div.occm-comps', [
      h('table.occm-table', [h('thead', [h('tr', ['Comparable', 'Km', 'Prix', 'Ajusté à ' + (nb(v.km) ? AMX.fmtNombre(v.km) + ' km' : 'notre km'), 'Concessionnaire', 'En ligne', ''].map(function (t) { return h('th', { text: t }); }))]), h('tbody', lignes)]),
      h('div.mini.doux', { text: 'Les ' + (v.comps || []).length + ' moins chers' + (v.n > (v.comps || []).length ? ' sur ' + v.n : '') + ' · même modèle, ' + (v.elargi ? 'année ± 2, tout km (élargi : trop peu à l\'année ± 1 et km ± 30 000)' : 'année ± 1, km ± 30 000') + ' · prix ajusté à notre km (' + String(nb(taux) ? taux : 0.1).replace('.', ',') + ' $ par km d\'écart).' })
    ]);
  }

  /* ------------------------------ Concurrents ------------------------------ */
  function VueConcurrents(page) {
    injecterCss();
    this.page = page; this.d = null; this.ouverts = {}; this.limite = 40;
    var r = Number(AMX.memo.lire('occc_rayon', ''));
    this.f = { q: '', rayon: isFinite(r) && AMX.memo.lire('occc_rayon', '') !== '' ? r : 50, tri: AMX.memo.lire('occc_tri', 'n') };
    this.construire();
  }
  VueConcurrents.prototype.construire = function () {
    var self = this;
    this.elEtat = h('div.occm-etat');
    this.elQ = h('input.saisie#occc-recherche', { type: 'search', placeholder: 'Chercher : concessionnaire, ville, modèle…', autocomplete: 'off',
      oninput: AMX.debounce(function (e) { self.f.q = e.target.value; self.rafraichir(); }, 150) });
    this.elRayons = h('div.segment#occc-rayons');
    this.elTri = h('select.saisie#occc-tri', { 'aria-label': 'Trier', onchange: function () { self.f.tri = self.elTri.value; AMX.memo.ecrire('occc_tri', self.f.tri); self.rafraichir(); } },
      [['n', 'Plus d\'annonces'], ['proche', 'Plus proches'], ['nouv', 'Plus de nouvelles'], ['jours', 'Annonces les plus vieilles']].map(function (t) { return h('option', { value: t[0], text: 'Tri : ' + t[1] }); }));
    this.elTri.value = this.f.tri;
    this.elPortee = h('div.portee-chiffres'); this.elKpis = h('div.kpis.occ-kpis'); this.elListe = h('div.occm-liste');
    this.el = h('div.occm', [this.elEtat,
      h('div.carte.occ-filtres', [h('div.carte-corps', [h('div.occ-ligne', [h('div.recherche', [h('span', { html: I.recherche }), this.elQ]), this.elRayons, this.elTri])])]),
      this.elPortee, this.elKpis, this.elListe]);
  };
  /* Les concessions de référence : celle choisie en haut, sinon toutes celles qu'on voit. */
  VueConcurrents.prototype.cies = function () {
    var d = this.d || {}, lieux = d.lieux || {}, c = this.page.compagnie;
    if (c && lieux[c]) return [c];
    var codes = AMX.codesPour ? AMX.codesPour('inventaire') : '*';
    return Object.keys(lieux).filter(function (k) { return codes === '*' || !Array.isArray(codes) || codes.indexOf(k) >= 0; });
  };
  VueConcurrents.prototype.groupes = function () {
    var d = this.d || {}, lieux = d.lieux || {}, cies = this.cies(), par = {};
    if (this._cle === (d.le || '') + '|' + cies.join()) return this._groupes;
    (d.annonces || []).forEach(function (c) {
      var k = cleVendeur(c.s); if (!k) return;
      var g = par[k] = par[k] || { cle: k, nom: c.s, ville: c.vi, pr: c.pr, la: null, lo: null, l: [] };
      g.l.push(c); if (g.la === null && nb(c.la) && nb(c.lo)) { g.la = c.la; g.lo = c.lo; g.ville = c.vi || g.ville; g.pr = c.pr || g.pr; }
    });
    var maintenant = Date.now();
    var groupes = Object.keys(par).map(function (k) {
      var g = par[k], mods = {}, marques = {};
      g.l.forEach(function (c) { var m = nomMarque(c.m) + ' ' + c.mo; mods[m] = (mods[m] || 0) + 1; marques[nomMarque(c.m)] = (marques[nomMarque(c.m)] || 0) + 1; });
      g.n = g.l.length; g.prixMed = mediane(g.l.map(function (c) { return c.p; }).filter(nb)); g.joursMed = mediane(g.l.map(function (c) { return c.j; }).filter(nb));
      g.nouv = g.l.filter(function (c) { return (c.ml && (maintenant - new Date(c.ml).getTime()) < 7 * 86400000) || (nb(c.j) && c.j <= 7); }).length;
      g.modeles = Object.keys(mods).sort(function (a, b) { return mods[b] - mods[a]; }).map(function (m) { return { nom: m, n: mods[m] }; });
      g.marques = Object.keys(marques).sort(function (a, b) { return marques[b] - marques[a]; });
      g.dist = null; g.versCie = '';
      cies.forEach(function (c) { var x = distance({ lat: g.la, lon: g.lo }, lieux[c]); if (x !== null && (g.dist === null || x < g.dist)) { g.dist = Math.round(x); g.versCie = c; } });
      return g;
    });
    this._cle = (d.le || '') + '|' + cies.join(); this._groupes = groupes;
    return groupes;
  };
  VueConcurrents.prototype.filtrer = function (sauf) {
    var f = this.f;
    return this.groupes().filter(function (g) {
      if (sauf !== 'rayon' && f.rayon && (g.dist === null || g.dist > f.rayon)) return false;
      if (f.q && !AMX.correspond([g.nom, g.ville, g.pr].concat(g.modeles.map(function (m) { return m.nom; })), f.q)) return false;
      return true;
    });
  };
  VueConcurrents.prototype.rendre = function (d) {
    var self = this;
    this._cle = null;
    this.elEtat.textContent = texteLecture(d) + ' — parmi les modèles que nous avons en stock.';
    var a = annoncesEnMain(d);
    this.d = a ? Object.assign({}, d, { annonces: a }) : d;
    this.pret = !!a || !(d && d.le);
    if (this.pret) { this.rafraichir(); return; }
    // Les annonces ne viennent que si l'onglet est ouvert (la page À acheter ne les attend pas).
    if (this.page && this.page.onglet !== 'concurrents') return;
    AMX.vider(this.elKpis); AMX.vider(this.elRayons); AMX.vider(this.elListe);
    this.elListe.appendChild(AMX.chargeur ? AMX.chargeur('Annonces des concurrents', { compact: true }) : h('div.vide', { text: 'Chargement des annonces…' }));
    annonces(d).then(function () { if (self.d === d) { self.rendre(d); if (self.page && self.page.rendreOnglets) self.page.rendreOnglets(); } }, function (e) {
      if (self.d !== d) return;
      AMX.vider(self.elListe); self.elListe.appendChild(h('div.vide', [h('h3', 'Annonces des concurrents indisponibles'), h('div', { text: AMX.erreurTexte(e) })]));
    });
  };
  VueConcurrents.prototype.rafraichir = function () {
    var self = this, f = this.f; if (!this.d || this.pret === false) return;
    AMX.vider(this.elRayons);
    var pour = this.filtrer('rayon');
    RAYONS.forEach(function (r) {
      var n = r[0] ? pour.filter(function (g) { return g.dist !== null && g.dist <= r[0]; }).length : pour.length;
      self.elRayons.appendChild(h('button' + (f.rayon === r[0] ? '.actif' : ''), { type: 'button', 'data-rayon': String(r[0]), onclick: function () { f.rayon = r[0]; AMX.memo.ecrire('occc_rayon', String(r[0])); self.rafraichir(); } }, [r[1] + ' ', h('b', { text: String(n) })]));
    });
    var t = f.tri, liste = this.filtrer().slice().sort(function (a, b) {
      if (t === 'proche') return (a.dist === null ? 1e9 : a.dist) - (b.dist === null ? 1e9 : b.dist);
      if (t === 'nouv') return b.nouv - a.nouv || b.n - a.n;
      if (t === 'jours') return (b.joursMed || 0) - (a.joursMed || 0);
      return b.n - a.n;
    });
    var cies = this.cies(), ctx = cies.length === 1 ? 'autour de ' + (COURTS[cies[0]] || cies[0]) : 'autour de nos concessions';
    var actifs = []; if (f.q) actifs.push('« ' + f.q + ' »');
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['concessionnaire', 'concessionnaires'], contexte: [ctx, f.rayon ? f.rayon + ' km au plus' : 'tout le rayon lu'], filtres: actifs, effacer: function () { f.q = ''; self.elQ.value = ''; self.rafraichir(); } });
    AMX.vider(this.elKpis);
    var tot = liste.reduce(function (s, g) { return s + g.n; }, 0), nouv = liste.reduce(function (s, g) { return s + g.nouv; }, 0);
    var jours = mediane([].concat.apply([], liste.map(function (g) { return g.l.map(function (c) { return c.j; }).filter(nb); })));
    var tuile = function (val, lib, sous) { return h('div.kpi.inv2-fixe', [h('div.valeur', { text: val }), h('div.libelle', { text: lib }), h('div.sous', { text: sous })]); };
    this.elKpis.appendChild(tuile(AMX.fmtNombre(liste.length), 'Concessionnaires', ctx));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(tot), 'Annonces', 'des modèles que nous avons en stock'));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(nouv), 'Nouvelles (7 j)', 'mises en ligne depuis une semaine'));
    this.elKpis.appendChild(tuile(nb(jours) ? Math.round(jours) + ' j' : '—', 'Âge des annonces', 'médiane'));
    AMX.vider(this.elListe);
    if (!this.d.le) { this.elListe.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Pas encore lu'), h('div', { text: 'Les concessionnaires voisins arrivent avec la lecture du marché du lundi.' })])); return; }
    if (!liste.length) { this.elListe.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucun concessionnaire pour ces filtres'), h('div', { text: 'Élargissez le rayon.' })])); return; }
    this.elListe.appendChild(h('div.occc-rangee.occ-tete', ['Concessionnaire', 'Annonces', 'Modèles principaux', 'Prix médian', 'En ligne', ''].map(function (x) { return h('div', { text: x }); })));
    liste.slice(0, this.limite).forEach(function (g) { self.elListe.appendChild(self.rangee(g)); });
    if (liste.length > this.limite) this.elListe.appendChild(h('button.btn.occ-plus', { type: 'button', text: 'Afficher 40 de plus', onclick: function () { self.limite += 40; self.rafraichir(); } }));
  };
  VueConcurrents.prototype.rangee = function (g) {
    var self = this, ouvert = !!this.ouverts[g.cle];
    var nom = h('div', [h('div.nom', [h('b', { text: g.nom })]), h('div.mini', { text: [[g.ville, g.pr].filter(Boolean).join(', '), g.dist !== null ? g.dist + ' km de ' + (COURTS[g.versCie] || g.versCie) : ''].filter(Boolean).join(' · ') })]);
    var n = h('div', [h('b', { text: AMX.fmtNombre(g.n) }), g.nouv ? h('div.mini.pos', { text: g.nouv + ' nouvelle' + (g.nouv > 1 ? 's' : '') + ' (7 j)' }) : null]);
    var mods = h('div.occc-mods', g.modeles.slice(0, 4).map(function (m) { return h('span.puce', { text: m.nom + ' ×' + m.n }); }).concat(g.modeles.length > 4 ? [h('span.mini.doux', { text: '+ ' + (g.modeles.length - 4) })] : []));
    var btn = h('button.btn.petit', { type: 'button', 'aria-expanded': ouvert ? 'true' : 'false', text: ouvert ? 'Masquer' : 'Annonces', onclick: function () { self.ouverts[g.cle] = !self.ouverts[g.cle]; self.rafraichir(); } });
    var r = h('div.occc-rangee', [nom, n, mods, h('div', { text: argent(g.prixMed) }), h('div', { text: nb(g.joursMed) ? Math.round(g.joursMed) + ' j (médiane)' : '—' }), h('div.occ-act', [btn])]);
    if (ouvert) {
      var l = g.l.slice().sort(function (a, b) { return (a.j === null ? 1e6 : a.j) - (b.j === null ? 1e6 : b.j); });
      r.appendChild(h('div.occm-comps', [h('table.occm-table', [h('thead', [h('tr', ['Véhicule', 'Km', 'Prix', 'En ligne', 'Cote CarGurus', ''].map(function (t) { return h('th', { text: t }); }))]),
        h('tbody', l.map(function (c) {
          return h('tr', [h('td', { text: [c.a, nomMarque(c.m), c.mo, c.ve].filter(Boolean).join(' ') }), h('td.num', { text: nb(c.k) ? AMX.fmtNombre(c.k) : '—' }), h('td.num', { text: argent(c.p) }),
            h('td.num', { text: nb(c.j) ? c.j + ' j' : '—' }), h('td', { text: ({ great: 'Excellent prix', good: 'Bon prix', fair: 'Prix juste', high: 'Prix élevé', overpriced: 'Trop cher' })[c.cg] || '' }), h('td', [lien(c.l, 'Annonce ↗')])]);
        }))])]));
    }
    return r;
  };

  /* ------------------------------ Bloc du panneau d'un usagé (inventaire.js) ------------------------------ */
  function bloc(vin, conteneur, opts) {
    opts = opts || {};
    if (!conteneur) return;
    var poser = function (d) {
      AMX.vider(conteneur);
      var v = d && (d.vehicules || []).filter(function (x) { return x.vin === vin; })[0];
      if (!v) { conteneur.appendChild(h('div.mini.doux', { text: d && d.le ? 'Pas dans la lecture du marché du ' + AMX.fmtDate(d.le) + ' (véhicule ajouté depuis, ou modèle non reconnu).' : 'Lecture du marché pas encore faite (le lundi).' })); return; }
      conteneur.appendChild(h('div.occm-bloc', [
        h('div.occm-bloc-ligne', [puceVerdict(v.verdict, true),
          v.notre && nb(v.notre.prix) ? h('span', [h('span.doux', { text: 'Notre prix ' }), h('b', { text: argent(v.notre.prix) }), v.notre.lien ? h('span', [' ', lien(v.notre.lien, '↗')]) : h('span.doux', { text: ' (' + sourceNotre(v.notre) + ')' })]) : h('span.doux', { text: 'Notre prix affiché : inconnu' }),
          nb(v.mediane) ? h('span', [h('span.doux', { text: 'Marché ' }), h('b', { text: argent(v.mediane) }), h('span.doux', { text: ' (' + texteComps(v) + ', ajusté au km)' })]) : null,
          nb(v.ecartPct) ? h('span.' + (v.verdict === 'cher' ? 'neg' : (v.verdict === 'bas' ? 'bleu' : 'doux')), { text: pct(v.ecartPct) + (nb(v.rang) ? ' · ' + rangTexte(v.rang, v.n + 1) : '') }) : null]),
        nb(v.joursMed) ? h('div.mini.doux', { text: 'Les annonces comparables sont en ligne depuis ' + v.joursMed + ' j (médiane) · lecture du ' + AMX.fmtDate(d.le) }) : null,
        h('button.lien', { type: 'button', text: 'Voir les comparables ›', onclick: function () { AMX.aller('analyse', '', { q: v.stock || v.vin }); } })   // 26 oct. : dans l'Analyse usagé
      ]));
    };
    if (cache.rep) { poser(cache.rep); if (Date.now() - cache.quand < 5 * 60000) return; }
    else conteneur.appendChild(h('div.mini.doux', { text: 'Lecture des prix du marché…' }));
    copie().then(function (d) { if (d && !cache.quand) poser(d); return charger(false); }).then(function (d) { if (d && !d.refuse) poser(d); }).catch(function () { if (!cache.rep) { AMX.vider(conteneur); conteneur.appendChild(h('div.mini.doux', { text: 'Prix du marché indisponibles pour l\'instant.' })); } });
  }

  AMX.occMarche = { charger: charger, copie: copie, vehiculesActuels: vehiculesActuels, enCache: function () { return cache.rep; }, copieLe: function () { return cache.copieLe; }, vider: function () { cache.rep = null; cache.quand = 0; cacheA.annonces = null; cacheA.le = ''; }, annonces: annonces,
    VueMarche: VueMarche, VueConcurrents: VueConcurrents, bloc: bloc, lancer: lancer, texteLecture: texteLecture };

  function injecterCss() {
    if (document.getElementById('css-occm')) return;
    var s = document.createElement('style'); s.id = 'css-occm';
    s.textContent = [
      '.occm-etat { font-size: 13px; color: var(--encre-3); margin: 0 0 10px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }',
      '.occm-verdicts .pt { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; }',
      '.occm-verdicts .pt.rouge { background: var(--rouge); } .occm-verdicts .pt.vert { background: var(--vert); } .occm-verdicts .pt.bleu { background: var(--bleu); } .occm-verdicts .pt.gris { background: var(--encre-4); } .occm-verdicts .pt.ambre { background: var(--ambre); }',
      '.occm-liste { background: var(--carte, #fff); border: 1px solid var(--trait); border-radius: 12px; overflow: hidden; }',
      '.occm-rangee, .occc-rangee { display: grid; gap: 10px; padding: 10px 14px; border-top: 1px solid var(--trait); align-items: start; font-size: 13.5px; }',
      '.occm-rangee { grid-template-columns: minmax(230px, 2.2fr) 130px minmax(150px, 1.2fr) 160px minmax(120px, 1fr) 110px; }',
      '.occc-rangee { grid-template-columns: minmax(220px, 2fr) 110px minmax(220px, 2.4fr) 110px 130px 100px; }',
      '.occm-rangee.occ-tete, .occc-rangee.occ-tete { border-top: 0; background: var(--fond); font-size: 12px; font-weight: 600; color: var(--encre-3); text-transform: uppercase; letter-spacing: .04em; }',
      '.occm-rangee.v-cher { box-shadow: inset 3px 0 0 var(--rouge); } .occm-rangee.v-bas { box-shadow: inset 3px 0 0 var(--bleu); } .occm-rangee.v-marche { box-shadow: inset 3px 0 0 var(--vert); }',
      '.occm-notre b, .occm-marche b { font-size: 15px; } .occm .pos, .occm-bloc .pos { color: var(--vert-fonce); } .occm .neg, .occm-bloc .neg { color: var(--rouge); } .occm .bleu, .occm-bloc .bleu { color: var(--bleu); } .occm .doux, .occm-bloc .doux { color: var(--encre-3); }',
      '.occm-ecart { display: grid; gap: 3px; justify-items: start; }',
      '.puce.occm-v.rouge { background: #FEE2E2; color: #991B1B; } .puce.occm-v.vert { background: var(--vert-clair); color: var(--vert-fonce); } .puce.occm-v.bleu { background: var(--bleu-bg, #E6F0FB); color: var(--bleu); } .puce.occm-v.gris { background: var(--fond); color: var(--encre-3); } .puce.occm-v.ambre { background: #FFF4DB; color: var(--ambre); }',
      '.puce.occm-v.grand { font-size: 13px; padding: 3px 10px; }',
      '.occm-comps { grid-column: 1 / -1; background: var(--fond); border-radius: 8px; padding: 8px 10px; overflow-x: auto; }',
      '.occm-table { width: 100%; border-collapse: collapse; font-size: 13px; } .occm-table th { text-align: left; font-size: 12px; color: var(--encre-3); font-weight: 600; padding: 4px 8px; }',
      '.occm-table td { padding: 4px 8px; border-top: 1px solid var(--trait); } .occm-table td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }',
      '.occc-mods { display: flex; flex-wrap: wrap; gap: 4px; } .occc-mods .puce { background: var(--fond); color: var(--encre-2); }',
      '.occm-bloc { display: grid; gap: 6px; } .occm-bloc-ligne { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; font-size: 13.5px; }',
      '@media (max-width: 1100px) { .occm-rangee, .occc-rangee { grid-template-columns: 1fr 1fr; } .occm-rangee.occ-tete, .occc-rangee.occ-tete { display: none; } }',
      '@media (max-width: 640px) { .occm-rangee > .occ-veh, .occc-rangee > :first-child { grid-column: 1 / -1; } }'
    ].join('\n');
    document.head.appendChild(s);
  }
})();
