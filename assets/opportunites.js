/* =========================================================================
   Outils › Opportunités d'achat (24 octobre 2026) — AMX.vues.Opportunites

   Maxime : « un outil qui sert à trouver les opportunités d'achat de véhicules de mes marques en comparant les prix
   avec OpenLane et les autres outils à notre disposition […] partout au Canada, il faut juste tenir compte des frais
   de transport ; 2023 et plus, maximum 100 000 km (modifiable) » ; puis « tu peux aussi aller sur gmfdealersource.ca ».

   Le serveur (Occasions.gs) balaie de lui-même, aux 2 heures, les annonces des concessionnaires du Canada
   (MarketCheck, ≈ 1 000 appels par mois) et lit la prévision OpenLane de chacune au km de l'annonce ; le favori
   « Automax ← DealerSource » ajoute les véhicules de fin de bail de la Financière GM. Pour chaque annonce et chaque
   concession de la marque : transport au barème, coût rendu, profit au GROS (prévision OpenLane − coût rendu) et au
   DÉTAIL (prix médian du même modèle-année au Canada, ajusté au km, − recon − coût rendu) ; « Achat max. » comme dans
   l'évaluation. Règle de Maxime (24 oct.) : un BON ACHAT = prix demandé égal ou plus bas que la prévision de gros
   OpenLane ; « rentable rendu » = bon achat qui laisse au moins le seuil après transport et frais. Le détail est indicatif.

   Page (règle v138) : filtres → « Chiffres et liste » → chiffres calculés sur la liste filtrée → liste. La concession
   choisie (en haut du site) filtre les marques et donne le transport vers elle ; « Toutes » prend la plus avantageuse.
   GET ?occasions=1 (copie du navigateur « occasions », v105) ; POST occasionStatut, occasionsParams, occasionsBalayer,
   occasionOpenlane. Toutes les données serveur passent par textContent.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;

  /* Favori autonome (DealerSource interdit les scripts venus d'ailleurs) — généré par mock/signet-gmf-build.py. */
  var CODE_SIGNET_GMF = "javascript:(function () { var SITE = " + JSON.stringify(AMX.SITE) + "; var ORIGINE_SITE = SITE.replace(/^(https?:\\/\\/[^\\/]+).*$/, '$1'); var PASSAGE = new Date().toISOString(), TAILLE_LOT = 200, PAGES_MAX = 80; if (!/gmfdealersource\\.ca$/.test(location.hostname)) { alert('Cliquez ce favori sur DealerSource (gmfdealersource.ca), connect\u00e9, sur la page \u00ab Acheter \u00bb (r\u00e9sultats de recherche).'); return; } if (window.__amxGmf) { alert('Une lecture est d\u00e9j\u00e0 en cours dans cette page.'); return; } window.__amxGmf = true; var bande = document.createElement('div'); bande.setAttribute('style', 'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;background:#0F7B4F;color:#fff;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;padding:12px 16px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;'); var etiquette = document.createElement('div'); etiquette.style.flex = '1'; var fermer = document.createElement('button'); fermer.textContent = 'Fermer'; fermer.setAttribute('style', 'background:rgba(255,255,255,.18);border:0;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit;'); var arrete = false; fermer.onclick = function () { arrete = true; bande.remove(); window.__amxGmf = false; try { if (pont && !pont.closed) pont.close(); } catch (e) {} }; bande.appendChild(etiquette); bande.appendChild(fermer); document.body.appendChild(bande); function dire(t) { etiquette.textContent = 'DealerSource \u2014 ' + t; } function erreur(t) { bande.style.background = '#B42318'; dire(t); window.__amxGmf = false; try { if (pont && !pont.closed) pont.close(); } catch (e) {} } var pont = window.open(SITE + 'pont.html?v=' + Date.now(), 'amxPont', 'width=460,height=240,menubar=no,toolbar=no,location=no,status=no'); if (!pont) { erreur('Chrome a bloqu\u00e9 la petite fen\u00eatre du site : autorisez les fen\u00eatres pop-up pour gmfdealersource.ca, puis recliquez le favori.'); return; } var attentes = {}, compteur = 0, pret = null; window.addEventListener('message', function (ev) { if (ev.source !== pont) return; var m = ev.data || {}; if (m.type === 'amx:pret' && pret) { pret(m); pret = null; } if (m.type === 'amx:resultat' && attentes[m.id]) { attentes[m.id](m.resultat); delete attentes[m.id]; } }); function attendrePont() { return new Promise(function (res, rej) { var fini = false, essais = 0; pret = function (m) { fini = true; res(m); }; (function ping() { if (fini) return; essais++; try { pont.postMessage({ type: 'amx:ping' }, ORIGINE_SITE); } catch (e) {} if (pont.closed) { rej(new Error('La petite fen\u00eatre du site a \u00e9t\u00e9 ferm\u00e9e : recliquez le favori et laissez-la ouverte.')); return; } if (essais > 60) { rej(new Error('Le site d\\'inventaire ne r\u00e9pond pas.')); return; } setTimeout(ping, 500); })(); }); } function envoyer(corps) { return new Promise(function (res) { var id = 'lot' + (++compteur); attentes[id] = res; pont.postMessage({ type: 'amx:lot', id: id, corps: corps }, ORIGINE_SITE); setTimeout(function () { if (attentes[id]) { delete attentes[id]; res({ ok: false, erreur: 'Pas de r\u00e9ponse du site (d\u00e9lai).' }); } }, 240000); }); } function tous(racine, acc) { racine.querySelectorAll('*').forEach(function (e) { acc.push(e); if (e.shadowRoot) tous(e.shadowRoot, acc); }); return acc; } function cartes() { return tous(document, []).filter(function (e) { return e.tagName && e.tagName.toLowerCase() === 'ol-vehicle-card' && e.data && e.data.vin; }); } function premierVin() { var c = cartes(); return c.length ? String(c[0].data.vin) : ''; } function suivant() { var l = tous(document, []).filter(function (e) { if (!(e.tagName === 'BUTTON' || (e.getAttribute && e.getAttribute('role') === 'button'))) return false; var t = ((e.getAttribute && e.getAttribute('aria-label')) || '') + ' ' + (e.textContent || ''); if (!/suivant|next/i.test(t)) return false; if (e.disabled || (e.getAttribute && e.getAttribute('aria-disabled') === 'true')) return false; return true; }); return l.length ? l[l.length - 1] : null; } function boutonPage1() { var l = tous(document, []).filter(function (e) { return (e.tagName === 'BUTTON' || (e.getAttribute && e.getAttribute('role') === 'button')) && String(e.textContent || '').trim() === '1' && !(e.getAttribute && e.getAttribute('aria-current')); }); return l.length ? l[0] : null; } function totalAffiche() { var l = tous(document, []).filter(function (e) { return e.childElementCount === 0 && /R[\u00e9e]sultats\\s*:\\s*[\\d\\s\u00a0\u202f]+/i.test(e.textContent || ''); }); var m = l.length ? /R[\u00e9e]sultats\\s*:\\s*([\\d\\s\u00a0\u202f]+)/i.exec(l[0].textContent) : null; return m ? parseInt(m[1].replace(/\\D/g, ''), 10) : null; } function lien(c) { var a = tous(c.shadowRoot || c, []).filter(function (x) { return x.tagName === 'A' && /gmfdealersource\\.ca\\/oliq\\//.test(x.href || ''); })[0]; return a ? a.href : ''; } function photo(c) { var i = tous(c.shadowRoot || c, []).filter(function (x) { return x.tagName === 'IMG' && /^https:\\/\\//.test(x.src || ''); })[0]; return i ? i.src : ''; } function nombre(v) { if (v === null || v === undefined || v === '') return null; var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\\-]/g, '')); return isFinite(n) ? n : null; } function annonce(c) { var d = c.data || {}; return { vin: String(d.vin || '').toUpperCase(), annee: nombre(d.year), marque: d.make || '', modele: d.model || '', version: d.trim || '', km: nombre(d.odometer), prixAchat: nombre(d.buyNowPrice), mise: nombre(d.startPrice), pdsf: nombre(d.msrp), dommages: nombre(d.damageCost), cote: String(d.gradeValue || d.autoGradeValue || ''), typeInv: d.inventoryType || '', statutVente: d.vehicleStatus || '', ville: d.locationCity || '', province: d.stateAbbreviation || '', codePostal: d.zipcode || '', finVente: d.auctionEndTime ? new Date(d.auctionEndTime).toISOString() : '', offres: nombre(d.bidCount), motricite: d.driveTrain || '', couleur: d.origExteriorColor || '', vendeur: d.origSellerOrganizationName || '', lien: lien(c), photo: photo(c) }; } function attendre(cond, ms) { return new Promise(function (res) { var t0 = Date.now(); (function boucle() { if (arrete) { res(false); return; } if (cond()) { res(true); return; } if (Date.now() - t0 > ms) { res(false); return; } setTimeout(boucle, 300); })(); }); } function lots(liste, taille) { var out = []; for (var i = 0; i < liste.length; i += taille) out.push(liste.slice(i, i + taille)); return out; } (async function () { try { dire('ouverture du pont vers le site\u2026'); var p = await attendrePont(); if (!p.connecte) { erreur('Vous n\\'\u00eates pas connect\u00e9 au site d\\'inventaire dans ce navigateur : ouvrez ' + SITE + ' dans un onglet, connectez-vous, puis recliquez le favori.'); return; } if (!(await attendre(function () { return cartes().length > 0; }, 20000))) { erreur('Aucun v\u00e9hicule sur cette page : ouvrez \u00ab Acheter \u00bb (r\u00e9sultats de recherche), puis recliquez le favori.'); return; } var p1 = /[?&]from=[1-9]/.test(location.href) ? boutonPage1() : null; if (p1) { var av = premierVin(); dire('retour \u00e0 la premi\u00e8re page\u2026'); p1.click(); await attendre(function () { var v = premierVin(); return v && v !== av; }, 20000); } var total = totalAffiche(), vus = {}, annonces = [], page = 1; while (!arrete && page <= PAGES_MAX) { cartes().forEach(function (c) { var a = annonce(c); if (a.vin && !vus[a.vin]) { vus[a.vin] = true; annonces.push(a); } }); dire('page ' + page + ' lue \u2014 ' + annonces.length + (total ? ' / ' + total : '') + ' v\u00e9hicules'); var b = suivant(); if (!b) break; var avant = premierVin(); b.click(); if (!(await attendre(function () { var v = premierVin(); return v && v !== avant; }, 20000))) break; await attendre(function () { return false; }, 400); page++; } if (arrete) return; if (!annonces.length) { erreur('Aucun v\u00e9hicule lu.'); return; } var paquets = lots(annonces, TAILLE_LOT), cumul = { gardees: 0, nouvelles: 0, horsCriteres: 0, ol: 0 }; for (var i = 0; i < paquets.length && !arrete; i++) { dire('envoi au site \u2014 lot ' + (i + 1) + ' / ' + paquets.length + '\u2026'); var rep = await envoyer({ action: 'occasionsImporter', source: 'gmf', passage: PASSAGE, total: total || annonces.length, dernier: i === paquets.length - 1, annonces: paquets[i] }); if (rep && rep.refuse && !rep.erreur) throw new Error('Votre session du site d\\'inventaire a expir\u00e9 : reconnectez-vous, puis recliquez le favori.'); if (!rep || rep.ok === false || rep.refuse) throw new Error('Le site a refus\u00e9 l\\'envoi : ' + ((rep && rep.erreur) || 'erreur inconnue')); ['gardees', 'nouvelles', 'horsCriteres', 'ol'].forEach(function (k) { cumul[k] += rep[k] || 0; }); } dire('termin\u00e9 : ' + annonces.length + ' v\u00e9hicules lus sur ' + page + ' page' + (page > 1 ? 's' : '') + ', ' + cumul.gardees + ' gard\u00e9s (' + cumul.nouvelles + ' nouveaux) \u2014 ' + cumul.horsCriteres + ' hors crit\u00e8res. Voir ScanAutomax \u203a Outils \u203a Opportunit\u00e9s d\\'achat.'); window.__amxGmf = false; setTimeout(function () { try { if (!pont.closed) pont.close(); } catch (e) {} }, 1500); } catch (e) { erreur('Arr\u00eat : ' + (e && e.message || e)); } })(); })();";

  var STATUTS = [['', 'À voir'], ['suivie', 'Suivies'], ['ecartee', 'Écartées'], ['achetee', 'Achetées'], ['tous', 'Toutes']];
  var STATUT_LIB = { '': 'À voir', suivie: 'Suivie', ecartee: 'Écartée', achetee: 'Achetée' };
  var TRIS = [['score', 'Meilleur profit'], ['gros', 'Profit au gros'], ['detail', 'Profit au détail'], ['cote', 'Meilleure cote CarGurus'], ['marche', 'Plus sous le marché'], ['prix', 'Prix le plus bas'], ['km', 'Km le plus bas'], ['nouveau', 'Plus récentes'], ['distance', 'Plus proches']];
  /* Cote CarGurus (sites d'annonces, Apify) : du meilleur au pire. */
  var COTES = { great: { t: 'Excellent prix', c: 'cg-great', r: 5 }, good: { t: 'Bon prix', c: 'cg-good', r: 4 }, fair: { t: 'Prix juste', c: 'cg-fair', r: 3 }, high: { t: 'Prix élevé', c: 'cg-high', r: 2 }, overpriced: { t: 'Trop cher', c: 'cg-over', r: 1 } };
  var FILTRES_COTE = [['', 'Toutes les cotes'], ['great', 'Excellent prix'], ['good', 'Bon prix ou mieux'], ['fair', 'Prix juste ou mieux'], ['sans', 'Sans cote']];
  function rangCote(o) { return COTES[o.coteCg] ? COTES[o.coteCg].r : 0; }
  function puceCote(o) {
    var c = COTES[o.coteCg]; if (!c) return null;
    var v = num(o.valeurMarche), e = num(o.ecartMarche);
    return h('span.puce.' + c.c, { text: c.t, title: 'Cote CarGurus' + (nb(v) ? ' · valeur du marché ' + AMX.fmtArgent(v) : '') + (nb(e) ? ' · ' + (e > 0 ? '+' : e < 0 ? '−' : '') + AMX.fmtArgent(Math.abs(e)) + ' par rapport au marché' : '') });
  }
  var SOURCES = [['', 'Toutes les sources'], ['marketcheck', 'Concessionnaires (MarketCheck)'], ['gmf', 'GM Financial DealerSource'], ['particulier', 'Particuliers (tous les sites)'],
    ['autotrader', 'AutoTrader.ca'], ['kijiji', 'Kijiji'], ['cargurus', 'CarGurus.ca'], ['carpages', 'Carpages.ca']];
  var SITES_ANNONCES = { autotrader: 'AutoTrader.ca', kijiji: 'Kijiji', cargurus: 'CarGurus.ca', carpages: 'Carpages.ca' };
  function estParticulier(o) { return o.typeInv === 'Particulier' || o.vendeur === 'Particulier'; }
  function libelleSource(o) { return o.source === 'gmf' ? 'GM Financial DealerSource' : (SITES_ANNONCES[o.source] ? SITES_ANNONCES[o.source] + (estParticulier(o) ? ' (particulier)' : '') : 'Concessionnaire (MarketCheck)'); }
  var COURTS = { STM: 'Ste Marie', HAWKS: 'Hawkesbury', BMW: 'BMW Sherbrooke', VW: 'VW Brossard', HYUNDAI: 'Hyundai Longueuil' };
  var LIMITE = 150;

  function nb(v) { return typeof v === 'number' && isFinite(v); }
  function num(v) { if (v === null || v === undefined || v === '') return null; var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; }
  function argent(v) { return nb(v) ? AMX.fmtArgent(Math.round(v)) : '—'; }
  function signe(v) { return nb(v) ? (v > 0 ? '+' : (v < 0 ? '−' : '')) + AMX.fmtArgent(Math.abs(Math.round(v))) : '—'; }
  function km(v) { return nb(num(v)) ? AMX.fmtNombre(Math.round(num(v))) + ' km' : '—'; }
  function ageJ(iso) { if (!iso) return Infinity; var t = new Date(iso).getTime(); return isFinite(t) ? (Date.now() - t) / 86400000 : Infinity; }
  function vehicule(o) { return [o.annee, o.marque, o.modele, o.version].filter(Boolean).join(' '); }
  function nomMarque(m) { var x = String(m || ''); if (/^(GMC|BMW|VW)$/i.test(x)) return x.toUpperCase(); return x.charAt(0).toUpperCase() + x.slice(1).toLowerCase(); }
  /* Même score que le serveur (OCC_score_) : les bons achats (prix ≤ gros OpenLane) d'abord, par profit rendu chez nous ;
     puis les autres avec prévision ; puis sans prévision ; un prix à vérifier en dernier. */
  function scoreDe(k, marge) {
    if (!k || k.suspect) return -1e12;
    if (!nb(k.profitGros)) return nb(k.profitDetail) ? k.profitDetail - marge - 1e6 : -1e8;
    return k.sousGros ? 1e6 + k.profitGros : k.profitGros;
  }
  /* Modèle d'une annonce : « CHEVROLET|TRAX » (clé), « Chevrolet Trax » (libellé). */
  function cleModele(o) { return (AMX.texteCherche ? AMX.texteCherche(o.marque) : String(o.marque || '').toLowerCase()) + '|' + (AMX.texteCherche ? AMX.texteCherche(o.modele) : String(o.modele || '').toLowerCase()); }
  function nomModele(o) { return nomMarque(o.marque) + ' ' + (o.modele || '?'); }
  function modelesMemo() { try { var m = JSON.parse(AMX.memo.lire('occ_modeles', '') || 'null'); if (m && Array.isArray(m.liste)) return { mode: m.mode === 'inclure' ? 'inclure' : 'exclure', liste: m.liste.slice(0, 200), noms: m.noms || {} }; } catch (e) {} return { mode: 'exclure', liste: [], noms: {} }; }
  var VUES = [['top', '20 meilleures par marque'], ['bons', 'Bons achats'], ['toutes', 'Toutes les annonces']];
  function vueMemo() { var v = AMX.memo.lire('occ_vue', ''); if (v === 'top' || v === 'bons' || v === 'toutes') return v; return 'top'; }
  /* 24 oct. (Maxime : « les 50 meilleures autres marques que les miennes, aux 5 dealers, en bas de 60 000 $ ») : deux groupes —
     nos marques (chacune vers ses concessions) et les autres marques (les 50 meilleures, vers la concession la plus proche). */
  function groupeMemo() { return AMX.memo.lire('occ_groupe', '') === 'autres' ? 'autres' : 'nos'; }
  var VUES_AUTRES = [['top', 'Les 50 meilleures'], ['bons', 'Bons achats']];
  function ton(v) { return !nb(v) ? 'neutre' : (v > 0 ? 'pos' : (v < 0 ? 'neg' : 'neutre')); }

  /* ------------------------------ Données ------------------------------ */
  var cache = { rep: null, quand: 0, promesse: null };
  function charger(force) {
    if (!force && cache.rep && Date.now() - cache.quand < 2 * 60000) return Promise.resolve(cache.rep);
    if (cache.promesse) return cache.promesse;
    cache.promesse = AMX.get({ occasions: 1 }, { gz: true, copie: 'occasions', secours: false, delai: 60000 }).then(function (d) {
      cache.promesse = null;
      if (d && d.refuse) return d;
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Réponse inattendue du serveur');
      if (!Array.isArray(d.occasions)) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (Occasions.gs).');
      cache.rep = d; cache.quand = Date.now();
      return d;
    }, function (e) { cache.promesse = null; throw e; });
    return cache.promesse;
  }

  /* ------------------------------ La vue ------------------------------ */
  function Opportunites(ctx) {
    injecterCss();
    this.generation = 0; this.donnees = null; this.erreur = ''; this.copieLe = 0;
    this.compagnie = AMX.compagnieChoisie('inventaire') || '';
    this.f = this.filtresDefaut();
    this.limite = LIMITE;
    this.construire();
    this.rendre();
    this.naviguer(ctx || {});
    this.charger(false);
    var self = this;
    this.surCie = function () { self.compagnie = AMX.compagnieChoisie('inventaire') || ''; self.rendre(); };
    document.addEventListener('amx:compagnie', this.surCie);
  }
  Opportunites.prototype.filtresDefaut = function () { return { q: '', marque: '', statut: '', source: '', province: '', cote: '', prixMax: 0, kmMax: 0, anneeMin: 0, distMax: 0, groupe: groupeMemo(), vue: vueMemo(), modeles: modelesMemo(), tri: AMX.memo.lire('occ_tri', 'score') }; };
  Opportunites.prototype.demonter = function () { this.generation++; document.removeEventListener('amx:compagnie', this.surCie); };
  Opportunites.prototype.naviguer = function (ctx) {
    var p = (ctx && ctx.params) || {};
    if (p.vin) { this.f.q = String(p.vin).toUpperCase(); this.f.statut = 'tous'; this.f.vue = 'toutes'; if (this.elQ) this.elQ.value = this.f.q; this.rendre(); }
  };

  Opportunites.prototype.construire = function () {
    var self = this;
    this.elEtat = h('p', { text: 'Chargement des opportunités…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.btnReglages = h('button.btn', { type: 'button', text: 'Réglages', onclick: function () { self.reglages(); } });
    this.btnBalayer = h('button.btn', { type: 'button', text: 'Balayer maintenant', title: 'Un passage tout de suite, dans le budget d\'appels du jour', onclick: function () { self.balayer(); } });
    this.btnSources = h('button.btn.primaire', { type: 'button', text: 'Sources', onclick: function () { self.elSources.open = !self.elSources.open; if (self.elSources.open) self.elSources.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Opportunités d\'achat'), this.elEtat]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnExport, this.btnBalayer, this.btnReglages, this.btnSources], [this.btnReglages, this.btnSources]))
    ]);
    this.elCies = h('div.barre-cies');
    this.elSources = this.construireSources();
    this.elSuggestions = h('datalist#occ-suggestions');
    this.elQ = h('input.saisie#occ-recherche', { type: 'search', list: 'occ-suggestions', placeholder: 'Chercher : modèle, version, NIV, vendeur, ville… (Entrée = voir la liste)', autocomplete: 'off',
      onkeydown: function (e) {
        if (e.key === 'Enter') { e.preventDefault(); self.f.q = self.elQ.value; self.rafraichir(); self.elPortee.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        else if (e.key === 'Escape' && self.elQ.value) { e.stopPropagation(); self.elQ.value = ''; self.f.q = ''; self.limite = LIMITE; self.rafraichir(); }
      }, oninput: AMX.debounce(function (e) { self.f.q = e.target.value; self.limite = LIMITE; self.rafraichir(); }, 150) });
    this.elMarques = h('div.occ-pastilles#occ-marques');
    this.elStatuts = h('div.segment#occ-statuts');
    this.elSeul = h('div.segment#occ-vue');
    this.elGroupe = h('div.segment.occ-groupe#occ-groupe');
    this.construireModeles();
    this.elSource = h('select.saisie#occ-source', { onchange: function () { self.f.source = self.elSource.value; self.rafraichir(); } }, SOURCES.map(function (s) { return h('option', { value: s[0], text: s[1] }); }));
    this.elProv = h('select.saisie#occ-province', { onchange: function () { self.f.province = self.elProv.value; self.rafraichir(); } });
    this.elCote = h('select.saisie#occ-cote', { onchange: function () { self.f.cote = self.elCote.value; self.rafraichir(); } }, FILTRES_COTE.map(function (t) { return h('option', { value: t[0], text: t[1] }); }));
    this.elTri = h('select.saisie#occ-tri', { onchange: function () { self.f.tri = self.elTri.value; AMX.memo.ecrire('occ_tri', self.f.tri); self.rafraichir(); } }, TRIS.map(function (t) { return h('option', { value: t[0], text: t[1] }); }));
    this.construirePlus();
    this.construireRecherches();
    var filtres = h('div.carte.occ-filtres', [h('div.carte-corps', [
      h('div.occ-ligne', [this.elGroupe, h('div.recherche', [h('span', { html: I.recherche }), this.elQ, this.elSuggestions]), this.elPlusEnv, this.elModelesEnv, this.elRechEnv, h('label.occ-select', [h('span', 'Trier par'), this.elTri])]),
      h('div.occ-ligne', [this.elSeul, this.elStatuts]),
      h('div.occ-ligne', [this.elMarques])
    ])]);
    this.elPortee = h('div.portee-chiffres');
    this.elKpis = h('div.kpis.occ-kpis');
    this.elListe = h('div.occ-liste');
    this.el = h('div.page.occ-page', [entete, this.elCies, this.elSources, filtres, this.elPortee, this.elKpis, this.elListe]);
    this.conteneur = null;
  };

  /* --------------------------- Filtre des modèles ---------------------------
     24 oct. (Maxime : « mets un filtre pour inclure / exclure des modèles ») : « Exclure ces modèles » ou « Seulement ces
     modèles », cases par modèle (nombre avec les autres filtres), mémorisé sur l'appareil. La direction peut aussi les
     retirer des recherches (balayage MarketCheck et import DealerSource : réglage `modelesExclus` du serveur). */
  Opportunites.prototype.construireModeles = function () {
    var self = this;
    this.btnModeles = h('button.btn.inv2-plus#occ-modeles', { type: 'button', 'aria-expanded': 'false' });
    this.elModeMod = h('div.segment.occ-mode');
    this.elChercheMod = h('input.saisie', { type: 'search', placeholder: 'Chercher un modèle…', autocomplete: 'off', oninput: function () { self.rendreModeles(); } });
    this.elListeMod = h('div.occ-mod-liste');
    this.elPiedMod = h('div.occ-mod-pied');
    this.popModeles = h('div.inv2-pop.occ-pop-modeles', { hidden: true, role: 'dialog', 'aria-label': 'Modèles' }, [this.elModeMod, this.elChercheMod, this.elListeMod, this.elPiedMod]);
    var dehors = function (e) { if (!self.elModelesEnv.contains(e.target)) { self.popModeles.hidden = true; self.btnModeles.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', dehors, true); } };
    this.btnModeles.addEventListener('click', function () {
      self.popModeles.hidden = !self.popModeles.hidden; self.btnModeles.setAttribute('aria-expanded', self.popModeles.hidden ? 'false' : 'true');
      if (!self.popModeles.hidden) { self.rendreModeles(); document.addEventListener('mousedown', dehors, true); self.elChercheMod.focus(); }
    });
    this.elModelesEnv = h('div.inv2-plus-env.occ-modeles-env', [this.btnModeles, this.popModeles]);
  };
  /* « Filtres » : source, province, cote CarGurus, prix, km, année, distance — dans un panneau, pour une barre plus simple. */
  Opportunites.prototype.construirePlus = function () {
    var self = this;
    var champNb = function (id, place, pas, cle) {
      return h('input.saisie#' + id, { type: 'number', min: '0', step: String(pas), placeholder: place, oninput: AMX.debounce(function (e) { var v = num(e.target.value); self.f[cle] = v && v > 0 ? v : 0; self.limite = LIMITE; self.rafraichir(); }, 250) });
    };
    this.elPrixMax = champNb('occ-prixmax', 'aucun', 1000, 'prixMax');
    this.elKmMax = champNb('occ-kmmax', 'aucun', 5000, 'kmMax');
    this.elDistMax = champNb('occ-distmax', 'aucune', 50, 'distMax');
    this.elAnneeMin = h('select.saisie#occ-anneemin', { onchange: function () { self.f.anneeMin = num(self.elAnneeMin.value) || 0; self.limite = LIMITE; self.rafraichir(); } });
    this.btnPlus = h('button.btn.inv2-plus#occ-plus', { type: 'button', 'aria-expanded': 'false' });
    var ligne = function (titre, el) { return h('label.occ-plus-champ', [h('span', { text: titre }), el]); };
    this.popPlus = h('div.inv2-pop.occ-pop-plus', { hidden: true, role: 'dialog', 'aria-label': 'Filtres' }, [
      h('div.occ-plus-grille', [ligne('Prix demandé maximal ($)', this.elPrixMax), ligne('Kilométrage maximal', this.elKmMax), ligne('Année-modèle minimale', this.elAnneeMin),
        ligne('Distance maximale (km de route)', this.elDistMax), ligne('Source', this.elSource), ligne('Province', this.elProv), ligne('Cote CarGurus', this.elCote)]),
      h('div.occ-mod-pied', [h('button.btn.petit.fantome', { type: 'button', text: 'Effacer ces filtres', onclick: function () {
        ['prixMax', 'kmMax', 'anneeMin', 'distMax'].forEach(function (k) { self.f[k] = 0; }); self.f.source = ''; self.f.province = ''; self.f.cote = ''; self.limite = LIMITE; self.synchroniserChamps(); self.rafraichir();
      } })])
    ]);
    var dehors = function (e) { if (!self.elPlusEnv.contains(e.target)) { self.popPlus.hidden = true; self.btnPlus.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', dehors, true); } };
    this.btnPlus.addEventListener('click', function () {
      self.popPlus.hidden = !self.popPlus.hidden; self.btnPlus.setAttribute('aria-expanded', self.popPlus.hidden ? 'false' : 'true');
      if (!self.popPlus.hidden) { document.addEventListener('mousedown', dehors, true); self.elPrixMax.focus(); }
    });
    this.elPlusEnv = h('div.inv2-plus-env.occ-plus-env', [this.btnPlus, this.popPlus]);
  };
  Opportunites.prototype.nbPlus = function () { var f = this.f; return ['prixMax', 'kmMax', 'anneeMin', 'distMax', 'source', 'province', 'cote'].filter(function (k) { return !!f[k]; }).length; };
  Opportunites.prototype.synchroniserChamps = function () {
    var f = this.f, val = function (el, v) { var t = v ? String(v) : ''; if (el.value !== t) el.value = t; };
    if (this.elQ.value !== (f.q || '')) this.elQ.value = f.q || '';
    val(this.elPrixMax, f.prixMax); val(this.elKmMax, f.kmMax); val(this.elDistMax, f.distMax);
    this.elAnneeMin.value = f.anneeMin ? String(f.anneeMin) : '';
    this.elSource.value = f.source || ''; this.elCote.value = f.cote || ''; this.elTri.value = f.tri;
    if ([].some.call(this.elProv.options, function (o) { return o.value === (f.province || ''); })) this.elProv.value = f.province || '';
  };
  /* « Mes recherches » : la recherche et les filtres en cours, gardés sous un nom sur cet appareil, rappelés d'un clic. */
  var CHAMPS_RECHERCHE = ['q', 'marque', 'statut', 'source', 'province', 'cote', 'prixMax', 'kmMax', 'anneeMin', 'distMax', 'groupe', 'vue', 'tri', 'modeles'];
  function recherchesMemo() { try { var l = JSON.parse(AMX.memo.lire('occ_recherches', '') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function recherchesEcrire(l) { try { AMX.memo.ecrire('occ_recherches', JSON.stringify(l.slice(0, 20))); } catch (e) {} }
  Opportunites.prototype.construireRecherches = function () {
    var self = this;
    this.btnRech = h('button.btn.inv2-plus#occ-mes-recherches', { type: 'button', 'aria-expanded': 'false', text: 'Mes recherches' });
    this.elRechListe = h('div.occ-rech-liste');
    this.elRechNom = h('input.saisie#occ-rech-nom', { type: 'text', placeholder: 'Nom de cette recherche', maxlength: '60',
      onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); self.enregistrerRecherche(); } } });
    this.popRech = h('div.inv2-pop.occ-pop-rech', { hidden: true, role: 'dialog', 'aria-label': 'Mes recherches' }, [
      this.elRechListe,
      h('div.occ-rech-nouvelle', [this.elRechNom, h('button.btn.petit.primaire#occ-rech-garder', { type: 'button', text: 'Garder', onclick: function () { self.enregistrerRecherche(); } })]),
      h('p.mini.doux', 'Gardées sur cet appareil.')
    ]);
    var dehors = function (e) { if (!self.elRechEnv.contains(e.target)) { self.popRech.hidden = true; self.btnRech.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', dehors, true); } };
    this.btnRech.addEventListener('click', function () {
      self.popRech.hidden = !self.popRech.hidden; self.btnRech.setAttribute('aria-expanded', self.popRech.hidden ? 'false' : 'true');
      if (!self.popRech.hidden) { self.rendreRecherches(); document.addEventListener('mousedown', dehors, true); }
    });
    this.elRechEnv = h('div.inv2-plus-env.occ-rech-env', [this.btnRech, this.popRech]);
  };
  Opportunites.prototype.rendreRecherches = function () {
    var self = this, l = recherchesMemo();
    AMX.vider(this.elRechListe);
    if (!l.length) this.elRechListe.appendChild(h('p.mini.doux', 'Aucune recherche gardée. Réglez vos filtres, donnez un nom ci-dessous et cliquez « Garder ».'));
    l.forEach(function (r, i) {
      self.elRechListe.appendChild(h('div.occ-rech-item', [
        h('button.lien.occ-rech-appliquer', { type: 'button', text: r.nom, title: r.resume || '', onclick: function () { self.appliquerRecherche(r); self.popRech.hidden = true; self.btnRech.setAttribute('aria-expanded', 'false'); } }),
        h('button.lien.occ-rech-suppr', { type: 'button', 'aria-label': 'Retirer « ' + r.nom + ' »', html: '&times;', onclick: function () { var l2 = recherchesMemo(); l2.splice(i, 1); recherchesEcrire(l2); self.rendreRecherches(); } })
      ]));
    });
    if (!this.elRechNom.value) this.elRechNom.value = this.resumeFiltres().slice(0, 60);
  };
  Opportunites.prototype.enregistrerRecherche = function () {
    var nom = String(this.elRechNom.value || '').trim() || this.resumeFiltres().slice(0, 60) || 'Ma recherche';
    var f = this.f, garde = {}; CHAMPS_RECHERCHE.forEach(function (k) { garde[k] = f[k]; });
    var l = recherchesMemo().filter(function (r) { return r.nom !== nom; });
    l.unshift({ nom: nom, f: JSON.parse(JSON.stringify(garde)), resume: this.resumeFiltres() });
    recherchesEcrire(l); this.elRechNom.value = '';
    AMX.toast('Recherche gardée : « ' + nom + ' »', 'ok'); this.rendreRecherches();
  };
  Opportunites.prototype.appliquerRecherche = function (r) {
    var self = this, d = this.filtresDefaut();
    CHAMPS_RECHERCHE.forEach(function (k) { self.f[k] = (r.f && r.f[k] !== undefined) ? r.f[k] : d[k]; });
    if (!this.f.modeles || !Array.isArray(this.f.modeles.liste)) this.f.modeles = { mode: 'exclure', liste: [], noms: {} };
    try { AMX.memo.ecrire('occ_modeles', JSON.stringify(this.f.modeles)); AMX.memo.ecrire('occ_groupe', this.f.groupe); AMX.memo.ecrire('occ_tri', this.f.tri); } catch (e) {}
    this.limite = LIMITE; this.rendre();
    AMX.toast('Recherche « ' + r.nom + ' » appliquée', 'ok');
  };
  /* Les filtres actifs, chacun avec de quoi le retirer (puces cliquables de « Chiffres et liste »). */
  Opportunites.prototype.filtresActifs = function () {
    var self = this, f = this.f, l = [];
    var ajout = function (t, retirer) { l.push({ t: t, retirer: function () { retirer(); self.limite = LIMITE; self.synchroniserChamps(); self.rafraichir(); } }); };
    if (f.q) ajout('« ' + f.q + ' »', function () { f.q = ''; });
    if (f.marque) ajout(nomMarque(f.marque), function () { f.marque = ''; });
    if (f.modeles && f.modeles.liste.length) ajout(this.texteModeles(), function () { f.modeles = { mode: 'exclure', liste: [], noms: {} }; AMX.memo.ecrire('occ_modeles', ''); });
    if (f.prixMax) ajout(AMX.fmtArgent(f.prixMax) + ' au plus', function () { f.prixMax = 0; });
    if (f.kmMax) ajout(AMX.fmtNombre(f.kmMax) + ' km au plus', function () { f.kmMax = 0; });
    if (f.anneeMin) ajout(f.anneeMin + ' et plus', function () { f.anneeMin = 0; });
    if (f.distMax) ajout('à ' + AMX.fmtNombre(f.distMax) + ' km au plus', function () { f.distMax = 0; });
    if (f.source) ajout(SOURCES.filter(function (s) { return s[0] === f.source; })[0][1], function () { f.source = ''; });
    if (f.province) ajout(f.province, function () { f.province = ''; });
    if (f.cote) ajout(FILTRES_COTE.filter(function (x) { return x[0] === f.cote; })[0][1], function () { f.cote = ''; });
    if (f.statut) ajout(STATUTS.filter(function (s) { return s[0] === f.statut; })[0][1], function () { f.statut = ''; });
    return l;
  };
  Opportunites.prototype.resumeFiltres = function () { return this.filtresActifs().map(function (x) { return x.t; }).join(' · '); };
  Opportunites.prototype.ecrireModeles = function () {
    var m = this.f.modeles;
    try { AMX.memo.ecrire('occ_modeles', JSON.stringify({ mode: m.mode, liste: m.liste, noms: m.noms })); } catch (e) {}
    this.limite = LIMITE; this.rafraichir();
  };
  Opportunites.prototype.texteModeles = function () {
    var m = this.f.modeles; if (!m.liste.length) return '';
    var noms = m.liste.map(function (k) { return m.noms[k] || k.replace('|', ' '); });
    return (m.mode === 'inclure' ? 'Seulement : ' : 'Sans : ') + noms.slice(0, 3).join(', ') + (noms.length > 3 ? ' + ' + (noms.length - 3) : '');
  };
  Opportunites.prototype.rendreModeles = function () {
    var self = this, m = this.f.modeles, d = this.donnees || {}, p = d.params || {};
    var n = m.liste.length;
    this.btnModeles.innerHTML = I.filtre + '<span>' + (n ? (m.mode === 'inclure' ? 'Modèles : ' + n + ' seulement' : 'Modèles : ' + n + ' exclu' + (n > 1 ? 's' : '')) : 'Modèles') + '</span>';
    this.btnModeles.classList.toggle('actif', n > 0);
    if (this.popModeles.hidden) return;
    AMX.vider(this.elModeMod);
    [['exclure', 'Exclure ces modèles'], ['inclure', 'Seulement ces modèles']].forEach(function (x) {
      self.elModeMod.appendChild(h('button' + (m.mode === x[0] ? '.actif' : ''), { type: 'button', 'data-mode': x[0], text: x[1], onclick: function () { m.mode = x[0]; self.ecrireModeles(); } }));
    });
    // Modèles présents (nombre avec les autres filtres) + ceux déjà choisis
    var pour = d.occasions ? this.filtrerBase('modeles') : [], par = {};   // toutes les annonces des autres filtres, quelle que soit la vue
    pour.forEach(function (o) { var k = cleModele(o); if (!par[k]) par[k] = { cle: k, nom: nomModele(o), marque: nomMarque(o.marque), n: 0 }; par[k].n++; });
    (d.occasions || []).forEach(function (o) { var k = cleModele(o); if (!par[k] && m.liste.indexOf(k) >= 0) par[k] = { cle: k, nom: nomModele(o), marque: nomMarque(o.marque), n: 0 }; });
    m.liste.forEach(function (k) { if (!par[k]) par[k] = { cle: k, nom: m.noms[k] || k.replace('|', ' '), marque: '', n: 0 }; });
    var q = this.elChercheMod.value;
    var lst = Object.keys(par).map(function (k) { return par[k]; }).filter(function (x) { return !q || AMX.correspond([x.nom], q); });
    lst.sort(function (a, b) { return a.marque.localeCompare(b.marque, 'fr') || a.nom.localeCompare(b.nom, 'fr'); });
    var haut = this.elListeMod.scrollTop;
    AMX.vider(this.elListeMod);
    if (!lst.length) this.elListeMod.appendChild(h('div.mini.doux', { text: q ? 'Aucun modèle pour « ' + q + ' ».' : 'Aucune annonce pour ces filtres.' }));
    var marque = null;
    lst.forEach(function (x) {
      if (x.marque !== marque) { marque = x.marque; if (marque) self.elListeMod.appendChild(h('div.occ-mod-marque', { text: marque })); }
      var coche = m.liste.indexOf(x.cle) >= 0;
      var cb = h('input', { type: 'checkbox', 'data-modele': x.cle });
      cb.checked = coche;
      cb.addEventListener('change', function () {
        var i = m.liste.indexOf(x.cle);
        if (cb.checked && i < 0) { m.liste.push(x.cle); m.noms[x.cle] = x.nom; }
        if (!cb.checked && i >= 0) { m.liste.splice(i, 1); delete m.noms[x.cle]; }
        self.ecrireModeles();
      });
      self.elListeMod.appendChild(h('label.occ-mod' + (coche ? '.coche' : ''), [cb, h('span', { text: x.nom }), h('b', { text: String(x.n) })]));
    });
    this.elListeMod.scrollTop = haut;
    AMX.vider(this.elPiedMod);
    if (n) this.elPiedMod.appendChild(h('button.btn.petit.fantome', { type: 'button', text: 'Tout décocher', onclick: function () { m.liste = []; m.noms = {}; self.ecrireModeles(); } }));
    var serveur = p.modelesExclus || [];
    if (d.peutRegler && m.mode === 'exclure' && n) {
      this.elPiedMod.appendChild(h('button.btn.petit#occ-mod-serveur', { type: 'button', text: 'Ne plus les chercher', title: 'Retire ces modèles du balayage MarketCheck et de l\'import DealerSource, pour tout le monde', onclick: function () { self.exclureServeur(); } }));
    }
    if (serveur.length) this.elPiedMod.appendChild(h('div.mini.doux', { text: 'Plus cherchés (Réglages) : ' + serveur.join(', ') }));
  };
  Opportunites.prototype.exclureServeur = function () {
    var self = this, m = this.f.modeles, d = this.donnees || {}, p = d.params || {};
    var noms = m.liste.map(function (k) { return m.noms[k] || k.replace('|', ' '); });
    var deja = (p.modelesExclus || []).map(function (t) { return AMX.texteCherche(t); });
    var ajout = noms.filter(function (t) { return deja.indexOf(AMX.texteCherche(t)) < 0; });
    if (!ajout.length) { AMX.toast('Ces modèles ne sont déjà plus cherchés.', 'ok'); return; }
    AMX.confirmer('Ne plus chercher ces modèles ?', ajout.join(', ') + ' — plus balayés par MarketCheck, ignorés à l\'import DealerSource et retirés de la liste, pour tout le monde. On les remet dans Réglages.', { ok: 'Ne plus les chercher' }).then(function (ok) {
      if (!ok) return;
      return AMX.post({ action: 'occasionsParams', params: { modelesExclus: (p.modelesExclus || []).concat(ajout) } }).then(function (r) {
        if (!r || r.ok === false || r.refuse) { AMX.toast((r && r.erreur) || 'Refusé', 'erreur'); return; }
        if (!r.params || !Array.isArray(r.params.modelesExclus)) { AMX.toast('Le script n\'est pas à jour : déployez une nouvelle version (Occasions.gs).', 'erreur'); return; }
        m.liste = []; m.noms = {}; self.ecrireModeles();
        AMX.toast(ajout.length + ' modèle' + (ajout.length > 1 ? 's' : '') + ' retiré' + (ajout.length > 1 ? 's' : '') + ' des recherches', 'ok');
        self.charger(true);
      });
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };

  /* --------------------------- Carte des sources --------------------------- */
  Opportunites.prototype.construireSources = function () {
    var signet = CODE_SIGNET_GMF ? h('a.btn.primaire', { href: CODE_SIGNET_GMF, text: 'Automax ← DealerSource', title: 'Glissez ce bouton dans votre barre de favoris', draggable: 'true' }) : h('span.doux', 'Favori en préparation');
    if (CODE_SIGNET_GMF) signet.addEventListener('click', function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B pour l\'afficher), puis cliquez-le sur DealerSource › Acheter.', 'attention', 8000); });
    this.elEtatMc = h('div.occ-src-etat'); this.elEtatGmf = h('div.occ-src-etat'); this.elEtatApify = h('div.occ-src-etat');
    var d = h('details.carte#occ-sources', [
      h('summary.carte-entete', { style: { cursor: 'pointer' } }, [h('h2', 'Sources des annonces')]),
      h('div.carte-corps.occ-sources', [
        h('div.occ-source', [h('div.section-titre', 'Concessionnaires de tout le Canada — automatique'),
          h('p', 'MarketCheck : les annonces des concessionnaires (celles qu\'on voit aussi sur AutoTrader, Kijiji…), lues aux 2 heures, modèle par modèle, les moins chères d\'abord, avec le prix médian du marché. Les annonces de nos concessions et les véhicules déjà dans nos registres sont exclus.'), this.elEtatMc]),
        h('div.occ-source', [h('div.section-titre', 'GM Financial DealerSource — favori'),
          h('p', 'Les véhicules de fin de bail et de location de la Financière GM : achat immédiat, mise, dommages estimés, cote. 1. Glissez le bouton dans la barre de favoris (une fois). 2. Sur gmfdealersource.ca, ouvrez « Acheter ». 3. Cliquez le favori : il lit toutes les pages de résultats et les envoie ici (rien n\'est acheté ni offert).'), signet, this.elEtatGmf]),
        h('div.occ-source', [h('div.section-titre', 'Sites d\'annonces : AutoTrader.ca, Kijiji, CarGurus.ca, Carpages.ca — automatique (Apify)'),
          h('p', 'Les annonces des particuliers et des concessionnaires de ces quatre sites, lues par un robot Apify (un service payant à part) une fois par jour à partir de 7 h : seulement les annonces nouvelles depuis la lecture précédente, avec NIV, dans le rayon choisi. Une annonce vue sur plusieurs sites compte une fois ; celle d\'un particulier ne garde ni son nom ni son téléphone (le lien de l\'annonce suffit pour le joindre). Facebook Marketplace n\'y est pas.'),
          this.elEtatApify])
      ])
    ]);
    d.open = false;
    return d;
  };

  Opportunites.prototype.charger = function (manuel) {
    var self = this, gen = ++this.generation;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    if (!this.donnees) {
      if (cache.rep) { this.donnees = cache.rep; this.rendre(); }
      else AMX.cacheLocal.lireGz('occasions', 7 * 86400000).then(function (o) {
        if (gen !== self.generation || self.donnees || !o || !o.donnees || !Array.isArray(o.donnees.occasions)) return;
        self.donnees = o.donnees; self.copieLe = o.quand; self.rendre();
      }).catch(function () {});
    }
    return charger(!!manuel).then(function (d) {
      if (gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      self.donnees = d; self.erreur = ''; self.copieLe = 0;
      self.rendre();
      if (manuel && !d.refuse) AMX.toast(d.occasions.length + ' annonce' + (d.occasions.length > 1 ? 's' : '') + ' suivie' + (d.occasions.length > 1 ? 's' : ''), 'ok');
    }, function (e) {
      if (gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e); self.rendre();
      AMX.toast((self.donnees ? 'Opportunités : mise à jour impossible (copie du navigateur affichée) — ' : 'Impossible de charger les opportunités — ') + self.erreur, 'erreur');
    });
  };

  /* Le calcul retenu pour une annonce : la concession choisie, sinon la plus avantageuse (celle du serveur). */
  Opportunites.prototype.calc = function (o) {
    if (this.compagnie) return (o.par && o.par[this.compagnie]) || null;
    return o.calc || null;
  };
  /* Règle de Maxime (24 oct.) : bon achat = prix demandé égal ou plus bas que le gros OpenLane. */
  Opportunites.prototype.estOpp = function (o) { var k = this.calc(o); return !!(k && k.sousGros); };
  /* `sauf` = le filtre qu'on ne compte pas (pour le nombre d'une pastille : ce qu'on verrait en cliquant).
     Vue « 20 meilleures par marque » (24 oct., Maxime) : tous les bons achats et les annonces suivies, complétés jusqu'à
     `topParMarque` (20) par marque avec les meilleures des autres — une marque sans bon achat garde ses 20 meilleures. */
  Opportunites.prototype.filtrer = function (sauf) {
    var self = this, d = this.donnees, f = this.f;
    if (!d || !d.occasions) return [];
    var base = this.filtrerBase(sauf);
    if (f.groupe === 'autres') {
      // Autres marques : le serveur envoie déjà les 50 meilleures ; « Bons achats » n'en garde que les prix ≤ gros OpenLane.
      if (sauf === 'vue' || f.vue !== 'bons') return base;
      return base.filter(function (o) { return self.estOpp(o) || o.statut === 'suivie'; });
    }
    if (sauf === 'vue' || f.vue === 'toutes') return base;
    if (f.vue === 'bons') return base.filter(function (o) { return self.estOpp(o) || o.statut === 'suivie'; });
    var top = nb((d.params || {}).topParMarque) ? d.params.topParMarque : 20, marge = (d.params || {}).marge || 0, par = {}, garder = [];
    base.forEach(function (o) { var m = String(o.marque || '').toUpperCase(); (par[m] = par[m] || []).push(o); });
    Object.keys(par).forEach(function (m) {
      var l = par[m].slice().sort(function (x, y) { return scoreDe(self.calc(y), marge) - scoreDe(self.calc(x), marge); });
      l.forEach(function (o, i) { if (i < top || self.estOpp(o) || o.statut === 'suivie') garder.push(o); });
    });
    return garder;
  };
  Opportunites.prototype.filtrerBase = function (sauf) {
    var self = this, d = this.donnees, f = this.f, mods = f.modeles || { liste: [] };
    var autres = f.groupe === 'autres';
    return d.occasions.filter(function (o) {
      if (sauf !== 'groupe' && !!o.autre !== autres) return false;
      if (!self.calc(o)) return false;
      if (sauf !== 'statut') { if (f.statut === '' && (o.statut === 'ecartee' || o.statut === 'achetee')) return false; if (f.statut && f.statut !== 'tous' && o.statut !== f.statut) return false; }
      if (sauf !== 'modeles' && mods.liste.length) { var dans = mods.liste.indexOf(cleModele(o)) >= 0; if (mods.mode === 'inclure' ? !dans : dans) return false; }
      if (sauf !== 'marque' && f.marque && String(o.marque || '').toUpperCase() !== f.marque) return false;
      if (sauf !== 'source' && f.source && (f.source === 'particulier' ? !estParticulier(o) : (o.source || 'marketcheck') !== f.source)) return false;
      if (sauf !== 'province' && f.province && String(o.province || '').toUpperCase() !== f.province) return false;
      if (sauf !== 'cote' && f.cote) { if (f.cote === 'sans' ? !!COTES[o.coteCg] : rangCote(o) < COTES[f.cote].r) return false; }
      if (f.prixMax && !(num(o.prix) <= f.prixMax)) return false;
      if (f.kmMax && nb(num(o.km)) && num(o.km) > f.kmMax) return false;
      if (f.anneeMin && !(num(o.annee) >= f.anneeMin)) return false;
      if (f.distMax) { var kd = self.calc(o); if (!kd || !nb(kd.distance) || kd.distance > f.distMax) return false; }
      if (sauf !== 'q' && f.q && !AMX.correspond([o.annee, o.marque, o.modele, o.version, o.vin, o.vendeur, o.ville, o.province, o.couleur, o.typeInv], f.q)) return false;
      return true;
    });
  };
  Opportunites.prototype.trier = function (l) {
    var self = this, t = this.f.tri;
    var v = function (o) {
      var k = self.calc(o) || {};
      if (t === 'gros') return nb(k.profitGros) ? k.profitGros : -1e12;
      if (t === 'detail') return nb(k.profitDetail) ? k.profitDetail : -1e12;
      if (t === 'cote') return rangCote(o) * 1e7 - (nb(num(o.ecartMarche)) ? num(o.ecartMarche) : 0);
      if (t === 'marche') return nb(num(o.ecartMarche)) ? -num(o.ecartMarche) : -1e12;
      if (t === 'prix') return -(num(o.prix) || 1e12);
      if (t === 'km') return -(num(o.km) || 1e12);
      if (t === 'nouveau') return new Date(o.premiereVue || 0).getTime();
      if (t === 'distance') return -(nb(k.distance) ? k.distance : 1e12);
      return scoreDe(k, (self.donnees.params || {}).marge || 0);
    };
    return l.slice().sort(function (x, y) { return v(y) - v(x); });
  };

  Opportunites.prototype.rendre = function () {
    var self = this, d = this.donnees;
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.compagnie, onchange: function (c) { self.compagnie = c; self.rendre(); } });
    if (!d) {
      this.elEtat.textContent = this.erreur ? 'Serveur injoignable : ' + this.erreur : 'Chargement des opportunités…';
      AMX.vider(this.elListe); AMX.vider(this.elKpis); AMX.vider(this.elPortee);
      if (!this.erreur) this.elListe.appendChild(AMX.chargeur('Opportunités d\'achat'));
      return;
    }
    if (d.refuse) { this.elEtat.textContent = d.erreur || 'Accès refusé.'; AMX.vider(this.elListe); this.elListe.appendChild(h('div.vide', [h('div', { html: I.cadenas }), h('h3', 'Accès non autorisé'), h('div', { text: d.erreur || '' })])); return; }
    this.btnReglages.style.display = d.peutRegler ? '' : 'none';
    this.btnBalayer.style.display = d.admin ? '' : 'none';
    var e = d.etat || {}, dern = e.dernier || {}, p = d.params || {}, ea = (this.f.groupe === 'autres' && d.autres) ? d.autres : null;
    if (ea) { e = ea; dern = ea.dernier || {}; }
    this.elEtat.textContent = (this.copieLe ? 'Copie du ' + AMX.copieTexte(this.copieLe) + (this.erreur ? ' — mise à jour impossible : ' + this.erreur : ' — mise à jour en cours…') + ' · ' : '') +
      p.anneeMin + ' et plus, ' + AMX.fmtNombre(p.kmMax) + ' km au plus' + (ea ? ', ' + AMX.fmtArgent(ea.prixMax || p.autresPrixMax || 60000) + ' au plus (autres marques)' : '') + ' · ' + (dern.le ? 'dernier balayage ' + AMX.fmtDate(dern.le, true) : 'pas encore balayé') +
      ' · ' + AMX.fmtNombre(e.appelsMois || 0) + ' / ' + AMX.fmtNombre(e.budgetMois || 0) + ' appels MarketCheck ce mois-ci';
    this.rendreSources();
    // Provinces présentes
    var provs = {}; (d.occasions || []).forEach(function (o) { if (o.province) provs[String(o.province).toUpperCase()] = true; });
    var pv = this.f.province;
    AMX.vider(this.elProv); this.elProv.appendChild(h('option', { value: '', text: 'Tout le Canada' }));
    Object.keys(provs).sort().forEach(function (x) { self.elProv.appendChild(h('option', { value: x, text: x })); });
    this.elProv.value = provs[pv] ? pv : ''; this.f.province = this.elProv.value;
    var annees = {}; (d.occasions || []).forEach(function (o) { var a = num(o.annee); if (a) annees[a] = true; });
    AMX.vider(this.elAnneeMin); this.elAnneeMin.appendChild(h('option', { value: '', text: 'Toutes' }));
    Object.keys(annees).sort().forEach(function (a) { self.elAnneeMin.appendChild(h('option', { value: a, text: a + ' et plus' })); });
    // Suggestions de la recherche : les modèles présents (marque + modèle), puis les villes.
    var sugg = {}, villes = {};
    (d.occasions || []).forEach(function (o) { var mm = (nomMarque(o.marque) + ' ' + (o.modele || '')).trim(); if (mm) sugg[mm] = (sugg[mm] || 0) + 1; if (o.ville) villes[o.ville] = true; });
    AMX.vider(this.elSuggestions);
    Object.keys(sugg).sort(function (a, b) { return sugg[b] - sugg[a]; }).slice(0, 150).concat(Object.keys(villes).sort().slice(0, 80))
      .forEach(function (t) { self.elSuggestions.appendChild(h('option', { value: t })); });
    this.synchroniserChamps();
    this.rafraichir();
  };

  Opportunites.prototype.rendreSources = function () {
    var d = this.donnees || {}, e = d.etat || {}, dern = e.dernier || {}, g = d.gmf;
    AMX.vider(this.elEtatMc); AMX.vider(this.elEtatGmf); this.rendreApify();
    var mc = [];
    if (!e.cle) mc.push('Clé MarketCheck absente : Admin › Données de marché.');
    mc.push(AMX.fmtNombre(e.unites || 0) + ' modèles-années suivis' + (e.cycleJours ? ' · tour complet en ≈ ' + e.cycleJours + ' jours' : ''));
    if (dern.le) mc.push('Dernier passage ' + AMX.fmtDate(dern.le, true) + ' : ' + (dern.appels || 0) + ' appels, ' + (dern.gardees || 0) + ' annonces gardées, ' + (dern.ol || 0) + ' prévisions OpenLane' + (dern.erreur ? ' — erreur : ' + dern.erreur : ''));
    if (dern.erreurs && dern.erreurs.length) mc.push('À noter : ' + dern.erreurs.slice(0, 3).join(' · '));
    var ea = d.autres;
    if (ea) mc.push('Autres marques (' + (ea.marques || []).length + ', ' + AMX.fmtArgent(ea.prixMax || 60000) + ' au plus) : ' + AMX.fmtNombre(ea.unites || 0) + ' modèles-années suivis · ' + AMX.fmtNombre(ea.appelsMois || 0) + ' / ' + AMX.fmtNombre(ea.budgetMois || 0) + ' appels ce mois-ci' +
      (ea.dernier && ea.dernier.le ? ' · dernier passage ' + AMX.fmtDate(ea.dernier.le, true) + ' (' + (ea.dernier.gardees || 0) + ' annonces gardées)' : ' · pas encore balayé') + (ea.cycleJours ? ' · tour complet en ≈ ' + ea.cycleJours + ' jours' : ''));
    if (e.openlane && !e.openlane.connecte) mc.push('OpenLane n\'est pas connecté au site : les profits au gros attendent (favori « Automax ← OpenLane », compte Hawkesbury).');
    mc.forEach(function (t) { this.elEtatMc.appendChild(h('div.mini', { text: t })); }, this);
    this.elEtatGmf.appendChild(h('div.mini', { text: g && g.le ? 'Dernière lecture ' + AMX.fmtDate(g.le, true) + ' par ' + (g.par || '?') + ' : ' + (g.recues || 0) + ' véhicules lus, ' + (g.gardees || 0) + ' gardés (' + (g.nouvelles || 0) + ' nouveaux)' : 'Pas encore lu : cliquez le favori sur DealerSource › Acheter.' }));
    if (!(d.occasions || []).length) this.elSources.open = true;
  };

  /* Filtres, « Chiffres et liste », chiffres, liste — sans reconstruire la recherche (le curseur reste). */
  /* Sites d'annonces (Apify) : état, lecture manuelle (admin), clé (propriétaire, jamais affichée). */
  Opportunites.prototype.rendreApify = function () {
    var self = this, d = this.donnees || {}, a = d.apify, el = this.elEtatApify;
    if (!el) return;
    AMX.vider(el);
    if (!a) { el.appendChild(h('div.mini', { text: 'Le script n\'est pas à jour : déployez une nouvelle version (Occasions.gs).' })); return; }
    var lignes = [];
    if (!a.present) lignes.push('Pas encore branché : il faut un compte Apify (apify.com, forfait Starter ≈ 19 $ US par mois) et sa clé d\'API, collée ci-dessous par le propriétaire.');
    else {
      lignes.push('Branché (clé …' + a.fin + ') · ' + (a.parJour || 0) + ' lecture' + (a.parJour > 1 ? 's' : '') + ' par jour · ' + (a.rayon ? a.rayon + ' km autour de ' + a.codePostal : 'tout le Canada') +
        ' · ' + (a.vendeurs === 'private' ? 'particuliers seulement' : (a.vendeurs === 'dealer' ? 'concessionnaires seulement' : 'particuliers et concessionnaires')) + ' · sites : ' + (a.sources || []).map(function (s) { return SITES_ANNONCES[s] || s; }).join(', '));
      lignes.push(texteFiltresApify(a));
      lignes.push('Ce mois-ci : ' + (a.courses || 0) + ' lecture' + (a.courses > 1 ? 's' : '') + ', ≈ ' + AMX.fmtNombre(Math.round((a.depense || 0) * 100) / 100) + ' $ US sur ' + AMX.fmtNombre(a.budget || 0) + ' $ US permis (une lecture coûte au plus ≈ ' + AMX.fmtNombre(a.estime || 0) + ' $ US)');
      if (a.enCours) lignes.push('Lecture en cours chez Apify depuis ' + AMX.fmtDate(a.enCours.le, true) + ' : les annonces arrivent au relevé suivant (aux 10 minutes).');
      var dn = a.derniere;
      if (dn && dn.le) lignes.push('Dernière lecture ' + AMX.fmtDate(dn.le, true) + (dn.statut && dn.statut !== 'SUCCEEDED' ? ' (' + dn.statut + ')' : '') + ' : ' + (dn.recus || 0) + ' annonces, ' + (dn.gardees || 0) + ' gardées (' + (dn.nouvelles || 0) + ' nouvelles), ' + (dn.sansVin || 0) + ' sans NIV, ' + (dn.horsCriteres || 0) + ' hors critères' + (dn.erreur ? ' — ' + dn.erreur : ''));
      else if (!a.enCours) lignes.push('Pas encore lu : la première lecture part à la prochaine heure après 7 h' + (d.admin ? ', ou tout de suite avec « Lire maintenant »' : '') + '.');
      if (a.erreur) lignes.push('Erreur : ' + a.erreur);
    }
    lignes.forEach(function (t) { el.appendChild(h('div.mini', { text: t })); });
    var boutons = [];
    if (d.peutRegler) boutons.push(h('button.btn.petit#occ-apify-filtres', { type: 'button', text: 'Filtres de recherche', onclick: function () { self.filtresApify(); } }));
    if (a.present && d.admin && a.filtres) boutons.push(h('button.btn.petit.fantome#occ-apify-zero', { type: 'button', text: 'Repartir à zéro', title: 'La prochaine lecture rend toutes les annonces qui correspondent aux filtres, pas seulement les nouvelles', onclick: function () { self.zeroApify(); } }));
    if (a.present && d.admin) {
      var b = h('button.btn.petit#occ-apify-lire', { type: 'button', text: a.enCours ? 'Relever la lecture' : 'Lire maintenant', onclick: function () { self.lireApify(a.enCours ? 'relever' : 'lancer', b); } });
      boutons.push(b);
    }
    if (a.peutCle) {
      if (a.present) boutons.push(h('button.btn.petit.fantome#occ-apify-retirer', { type: 'button', text: 'Retirer la clé', onclick: function () { self.cleApify(true); } }));
      else {
        var champ = h('input.saisie#occ-apify-cle', { type: 'password', placeholder: 'apify_api_…', autocomplete: 'off', style: { maxWidth: '280px' } });
        boutons.push(champ, h('button.btn.petit.primaire#occ-apify-poser', { type: 'button', text: 'Enregistrer la clé', onclick: function () { self.cleApify(false, champ); } }),
          h('a.btn.petit.fantome', { href: 'https://console.apify.com/settings/integrations', target: '_blank', rel: 'noopener', text: 'Où trouver la clé' }));
      }
    }
    if (boutons.length) el.appendChild(h('div.occ-apify-actions', boutons));
  };
  function texteFiltresApify(a) {
    var f = a.filtres;
    if (!f) return 'Filtres : ceux de l\'outil (déployez Occasions.gs pour les filtres de recherche).';
    var quoi = f.modeles && f.modeles.length ? f.modeles.join(', ') : (f.marques === 'nos' ? 'nos marques' : (f.marques === 'autres' ? 'les autres marques' : 'nos marques et les autres marques'));
    var prix = f.prixMax ? AMX.fmtArgent(f.prixMin) + ' à ' + AMX.fmtArgent(f.prixMax) : AMX.fmtArgent(f.prixMin) + ' et plus';
    return 'Filtres : ' + quoi + ' · ' + f.anneeMin + ' et plus · ' + AMX.fmtNombre(f.kmMax) + ' km au plus · ' + prix + ' · ' + AMX.fmtNombre(a.max || 0) + ' annonces au plus par lecture';
  }
  /* Fenêtre « Filtres des sites d'annonces » (direction) : ce que le robot cherche, où, et combien. */
  Opportunites.prototype.filtresApify = function () {
    var self = this, d = this.donnees || {}, p = d.params || {};
    var nb = function (id, val, place, pas) { return h('input.saisie#' + id, { type: 'number', step: String(pas || 1), value: val ? String(val) : '', placeholder: place || '' }); };
    var marques = h('select.saisie#occ-af-marques', [['toutes', 'Nos marques et les autres marques'], ['nos', 'Nos marques seulement'], ['autres', 'Les autres marques seulement']].map(function (x) { var op = h('option', { value: x[0], text: x[1] }); if ((p.apifyMarques || 'toutes') === x[0]) op.selected = true; return op; }));
    var modeles = h('textarea.saisie#occ-af-modeles', { rows: 3, placeholder: 'Facultatif, un par ligne : « Toyota RAV4 », « Chevrolet Silverado 1500 », ou une marque seule (« Kia »). Vide = toutes les marques choisies ci-dessus.' });
    modeles.value = (p.apifyModeles || []).join('\n');
    var annee = nb('occ-af-annee', p.apifyAnneeMin, String(p.anneeMin || 2023) + ' (outil)'), km = nb('occ-af-km', p.apifyKmMax, AMX.fmtNombre(p.kmMax || 100000) + ' (outil)', 1000);
    var pmin = nb('occ-af-prixmin', p.apifyPrixMin, AMX.fmtNombre(p.prixMin || 5000) + ' (outil)', 500), pmax = nb('occ-af-prixmax', p.apifyPrixMax, 'aucun', 500);
    var rayon = nb('occ-af-rayon', p.apifyRayonKm, '0 = tout le Canada', 50), cp = h('input.saisie#occ-af-cp', { type: 'text', value: p.apifyCodePostal || 'H3B', placeholder: 'H3B' });
    var vend = h('select.saisie#occ-af-vendeurs', [['any', 'Particuliers et concessionnaires'], ['private', 'Particuliers seulement'], ['dealer', 'Concessionnaires seulement']].map(function (x) { var op = h('option', { value: x[0], text: x[1] }); if ((p.apifyVendeurs || 'any') === x[0]) op.selected = true; return op; }));
    var sites = {}, sitesEl = h('div.occ-apify-sites', Object.keys(SITES_ANNONCES).map(function (k) { var c = h('input', { type: 'checkbox' }); c.checked = (p.apifySources || Object.keys(SITES_ANNONCES)).indexOf(k) >= 0; sites[k] = c; return h('label.case', [c, ' ' + SITES_ANNONCES[k]]); }));
    var max = nb('occ-af-max', p.apifyMax, '300', 25), parJour = nb('occ-af-parjour', p.apifyParJour, '1'), budget = nb('occ-af-budget', p.apifyBudgetMois, '30');
    var cout = h('p.mini#occ-af-cout');
    var majCout = function () { var m = num(max.value) || 0, j = num(parJour.value); j = j === null ? 1 : j; cout.textContent = 'Coût prévu : au plus ≈ ' + AMX.fmtNombre(Math.round(m * (p.apifyPrix1000 || 1.7) / 10) / 100) + ' $ US par lecture, ≈ ' + AMX.fmtNombre(Math.round(m * (p.apifyPrix1000 || 1.7) * j * 30 / 10) / 100) + ' $ US par mois à ' + j + ' lecture' + (j > 1 ? 's' : '') + ' par jour (Apify facture chaque véhicule rendu ; une annonce vue sur plusieurs sites compte une fois). Le forfait gratuit d\'Apify s\'arrête à 25 véhicules par lecture.'; };
    [max, parJour].forEach(function (x) { x.addEventListener('input', majCout); }); majCout();
    var champ = function (titre, el) { return h('label', [h('span', { text: titre }), el]); };
    var corps = h('div', [
      h('div.section-titre', 'Quoi chercher'),
      h('div.occ-reglages', [champ('Marques', marques), champ('Année-modèle minimale', annee), champ('Kilométrage maximal (km)', km), champ('Prix minimal ($)', pmin), champ('Prix maximal ($)', pmax)]),
      h('label.occ-prov', [h('span', 'Seulement ces modèles'), modeles]),
      h('div.section-titre', { style: { marginTop: '14px' } }, 'Où et chez qui'),
      h('div.occ-reglages', [champ('Rayon (km, 0 = tout le Canada)', rayon), champ('Centre du rayon (code postal)', cp), champ('Vendeurs', vend)]),
      h('div.occ-prov', [h('span', 'Sites'), sitesEl]),
      h('div.section-titre', { style: { marginTop: '14px' } }, 'Combien'),
      h('div.occ-reglages', [champ('Annonces au plus par lecture', max), champ('Lectures par jour (0 = arrêt)', parJour), champ('Dépense permise par mois ($ US)', budget)]),
      cout,
      h('p.mini.doux', 'Une case vide reprend le réglage de l\'outil. Les modèles exclus de l\'outil restent exclus. Après un changement de filtres, « Repartir à zéro » fait rendre à la lecture suivante toutes les annonces qui correspondent, pas seulement les nouvelles.')
    ]);
    AMX.modale({ titre: 'Filtres des sites d\'annonces', corps: corps, large: true, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      var v = function (el) { var x = num(el.value); return x === null ? 0 : x; };
      var params = { apifyMarques: marques.value, apifyModeles: modeles.value, apifyAnneeMin: v(annee), apifyKmMax: v(km), apifyPrixMin: v(pmin), apifyPrixMax: v(pmax),
        apifyRayonKm: v(rayon), apifyCodePostal: cp.value, apifyVendeurs: vend.value, apifySources: Object.keys(sites).filter(function (k) { return sites[k].checked; }),
        apifyMax: num(max.value) === null ? (p.apifyMax || 300) : num(max.value), apifyParJour: num(parJour.value) === null ? (p.apifyParJour || 1) : num(parJour.value), apifyBudgetMois: num(budget.value) === null ? (p.apifyBudgetMois || 30) : num(budget.value) };
      if (!params.apifySources.length) { AMX.toast('Cochez au moins un site.', 'attention'); return false; }
      return AMX.post({ action: 'occasionsParams', params: params }).then(function (r) {
        if (!r || r.ok === false || r.refuse) { AMX.toast((r && r.erreur) || 'Refusé', 'erreur'); return false; }
        if (!r.params || !('apifyMarques' in r.params)) { AMX.toast('Le script n\'est pas à jour : déployez une nouvelle version (Occasions.gs).', 'erreur'); return false; }
        AMX.toast('Filtres enregistrés : ils servent à la prochaine lecture.', 'ok'); self.charger(true); return true;
      }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
    } }] });
  };
  Opportunites.prototype.zeroApify = function () {
    var self = this;
    AMX.confirmer('Repartir à zéro ?', 'La prochaine lecture rendra toutes les annonces qui correspondent aux filtres (jusqu\'au maximum par lecture), pas seulement les nouvelles. Utile après un changement de filtres ou de forfait Apify.', { ok: 'Repartir à zéro' }).then(function (oui) {
      if (!oui) return;
      AMX.post({ action: 'occasionsApify', mode: 'zero' }, { secours: false }).then(function (r) {
        if (!r || r.refuse || r.ok === false) { AMX.toast((r && r.erreur) || 'Refusé', 'erreur'); return; }
        if (!r.zero) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (Occasions.gs).');
        AMX.toast('C\'est fait : la prochaine lecture repart de zéro.', 'ok'); self.charger(true);
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
    });
  };
  Opportunites.prototype.lireApify = function (mode, b) {
    var self = this;
    if (b) b.classList.add('occupe');
    AMX.post({ action: 'occasionsApify', mode: mode }, { delai: 300000, secours: false }).then(function (r) {
      if (b) b.classList.remove('occupe');
      if (!r || r.refuse || r.ok === false) { AMX.toast((r && r.erreur) || 'Refusé', 'attention', 9000); return; }
      if (r.vehicules) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (Occasions.gs).');
      if (r.lance) AMX.toast('Lecture lancée chez Apify : les annonces arrivent dans 5 à 30 minutes (relevé automatique aux 10 minutes).', 'ok', 9000);
      else if (r.attente) AMX.toast('La lecture est encore en cours chez Apify (' + (r.statut || '') + ').', 'attention', 7000);
      else AMX.toast('Lecture relevée : ' + (r.recus || 0) + ' annonces, ' + (r.gardees || 0) + ' gardées (' + (r.nouvelles || 0) + ' nouvelles)' + (r.erreurs && r.erreurs.length ? ' — ' + r.erreurs[0] : ''), r.erreurs && r.erreurs.length ? 'attention' : 'ok', 9000);
      self.charger(true);
    }).catch(function (e) { if (b) b.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  Opportunites.prototype.cleApify = function (retirer, champ) {
    var self = this;
    var envoyer = function () {
      var corps = retirer ? { action: 'occasionsApifyCle', retirer: true } : { action: 'occasionsApifyCle', cleApify: String(champ.value || '').trim() };
      if (!retirer && !corps.cleApify) { AMX.toast('Collez d\'abord la clé d\'API d\'Apify.', 'attention'); return; }
      AMX.post(corps, { secours: false }).then(function (r) {
        if (champ) champ.value = '';
        if (!r || r.refuse || r.ok === false) { AMX.toast((r && r.erreur) || 'Refusé', 'erreur', 9000); return; }
        if (!('present' in r)) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (Occasions.gs).');
        AMX.toast(retirer ? 'Clé Apify retirée' : 'Clé Apify vérifiée et enregistrée' + (r.compte ? ' (compte ' + r.compte + ')' : ''), 'ok');
        self.charger(true);
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
    };
    if (retirer) AMX.confirmer('Retirer la clé Apify ?', 'Les sites d\'annonces ne seront plus lus. Les annonces déjà reçues restent.', { ok: 'Retirer' }).then(function (oui) { if (oui) envoyer(); });
    else envoyer();
  };

  Opportunites.prototype.rafraichir = function () {
    var self = this, d = this.donnees; if (!d || d.refuse) return;
    var f = this.f, p = d.params || {};
    // Marques (pastilles) — nombre avec les autres filtres
    AMX.vider(this.elMarques);
    var pourMarque = this.filtrer('marque'), parM = {};
    pourMarque.forEach(function (o) { var m = String(o.marque || '').toUpperCase(); parM[m] = (parM[m] || 0) + 1; });
    var marques = Object.keys(parM).sort();
    if (f.marque && !parM[f.marque]) marques.push(f.marque);
    [['', 'Toutes', pourMarque.length]].concat(marques.map(function (m) { return [m, nomMarque(m), parM[m] || 0]; })).forEach(function (x) {
      self.elMarques.appendChild(h('button.occ-pastille' + (f.marque === x[0] ? '.actif' : ''), { type: 'button', 'data-marque': x[0], onclick: function () { f.marque = x[0]; self.limite = LIMITE; self.rafraichir(); } }, [h('span', { text: x[1] }), h('b', { text: String(x[2]) })]));
    });
    // Statuts
    AMX.vider(this.elStatuts);
    var pourStatut = this.filtrer('statut');
    STATUTS.forEach(function (s) {
      var n = s[0] === 'tous' ? pourStatut.length : pourStatut.filter(function (o) { return s[0] === '' ? !o.statut : o.statut === s[0]; }).length;
      self.elStatuts.appendChild(h('button' + (f.statut === s[0] ? '.actif' : ''), { type: 'button', 'data-statut': s[0], onclick: function () { f.statut = s[0]; self.limite = LIMITE; self.rafraichir(); } }, [s[1] + ' ', h('b', { text: String(n) })]));
    });
    // Nos marques / autres marques
    AMX.vider(this.elGroupe);
    var groupeAvant = f.groupe, vueAvantG = f.vue;
    [['nos', 'Nos marques'], ['autres', 'Autres marques']].forEach(function (x) {
      f.groupe = x[0]; f.vue = x[0] === 'autres' ? 'top' : vueAvantG; var n = self.filtrer().length;
      self.elGroupe.appendChild(h('button' + (groupeAvant === x[0] ? '.actif' : ''), { type: 'button', 'data-groupe': x[0], title: x[0] === 'autres' ? 'Marques que nous ne vendons pas en neuf, ' + AMX.fmtArgent((p.autresPrixMax || 60000)) + ' au plus, vers la concession la plus proche' : '',
        onclick: function () { f.groupe = x[0]; AMX.memo.ecrire('occ_groupe', x[0]); f.marque = ''; self.limite = LIMITE; self.rendre(); } }, [x[1] + ' ', h('b', { text: String(n) })]));
    });
    f.groupe = groupeAvant; f.vue = vueAvantG;
    // 20 meilleures par marque / bons achats / toutes les annonces — le nombre = ce qu'on verra en cliquant
    AMX.vider(this.elSeul);
    var vueAvant = f.vue, vuesG = f.groupe === 'autres' ? VUES_AUTRES : VUES;
    if (f.groupe === 'autres' && f.vue !== 'bons') vueAvant = 'top';
    vuesG.forEach(function (x) {
      f.vue = x[0]; var n = self.filtrer().length;
      self.elSeul.appendChild(h('button' + (vueAvant === x[0] ? '.actif' : ''), { type: 'button', 'data-vue': x[0], onclick: function () { f.vue = x[0]; if (f.groupe !== 'autres') AMX.memo.ecrire('occ_vue', x[0]); self.limite = LIMITE; self.rafraichir(); } }, [x[1] + ' ', h('b', { text: String(n) })]));
    });
    f.vue = vueAvant;
    this.rendreModeles();
    // Liste filtrée
    var liste = this.trier(this.filtrer());
    var actifsObj = this.filtresActifs(), actifs = actifsObj.map(function (x) { return x.t; });
    var nP = this.nbPlus();
    this.btnPlus.innerHTML = I.filtre ? I.filtre + '<span>Filtres' + (nP ? ' · ' + nP : '') + '</span>' : 'Filtres' + (nP ? ' · ' + nP : '');
    this.btnPlus.classList.toggle('actif', nP > 0);
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['annonce', 'annonces'], contexte: [this.compagnie ? 'transport vers ' + (COURTS[this.compagnie] || this.compagnie) : (f.groupe === 'autres' ? 'concession la plus proche' : 'concession la plus avantageuse'),
        f.groupe === 'autres' ? (f.vue === 'bons' ? 'autres marques · bons achats' : 'autres marques · les ' + (p.autresTop || 50) + ' meilleures, ' + AMX.fmtArgent(p.autresPrixMax || 60000) + ' au plus') :
        (f.vue === 'top' ? 'bons achats + ' + ((p.topParMarque || 20)) + ' meilleures par marque' : (f.vue === 'bons' ? 'bons achats (prix ≤ gros OpenLane)' : 'toutes les annonces'))],
      filtres: actifs, effacer: function () { var v = f.vue, t = f.tri, g = f.groupe; self.f = self.filtresDefaut(); self.f.vue = v; self.f.tri = t; self.f.groupe = g; self.f.modeles = { mode: 'exclure', liste: [], noms: {} }; AMX.memo.ecrire('occ_modeles', ''); self.elQ.value = ''; self.rendre(); } });
    // Chaque filtre de « Chiffres et liste » devient une puce qu'on retire d'un clic.
    [].forEach.call(this.elPortee.querySelectorAll('span.filtre'), function (sp, i) {
      var a = actifsObj[i]; if (!a) return;
      var b = h('button.filtre.occ-puce-filtre', { type: 'button', title: 'Retirer ce filtre', 'aria-label': 'Retirer le filtre ' + a.t, onclick: a.retirer }, [h('span', { text: a.t }), h('span.x', { html: '&times;' })]);
      sp.parentNode.replaceChild(b, sp);
    });
    // Une concession choisie en haut ne voit que les marques qu'elle vend (24 oct. : « je ne vois aucun BMW » — Hawkesbury
    // était choisie). On le dit, avec un bouton pour voir toutes les concessions.
    if (this.compagnie) {
      var autres = {}, nAutres = 0;
      (d.occasions || []).forEach(function (o) { if (!o.autre && f.groupe !== 'autres' && !self.calc(o)) { var m = nomMarque(o.marque); autres[m] = (autres[m] || 0) + 1; nAutres++; } });
      if (nAutres) this.elPortee.appendChild(h('div.occ-autres', [h('span', { text: AMX.fmtNombre(nAutres) + ' annonce' + (nAutres > 1 ? 's' : '') + ' d\'autres marques (' + Object.keys(autres).sort().join(', ') + ') : ' + (COURTS[this.compagnie] || this.compagnie) + ' ne les vend pas.' }),
        h('button.btn.petit#occ-toutes-cies', { type: 'button', text: 'Voir toutes les concessions', onclick: function () { AMX.choisirCompagnie(''); self.compagnie = ''; self.rendre(); } })]));
    }
    this.rendreKpis(liste, p);
    this.rendreListe(liste, p);
  };

  Opportunites.prototype.rendreKpis = function (liste, p) {
    var self = this;
    AMX.vider(this.elKpis);
    var ks = liste.map(function (o) { return self.calc(o) || {}; });
    var bons = ks.filter(function (k) { return k.sousGros; }), rentables = ks.filter(function (k) { return k.rentable; });
    var meilleur = null; liste.forEach(function (o, i) {
      var k = ks[i]; if (!k.sousGros || !nb(k.profitGros)) return;
      if (!meilleur || k.profitGros > meilleur.profit) meilleur = { o: o, profit: k.profitGros, ecart: k.ecartGros };
    });
    var sansOl = liste.filter(function (o) { return !nb(num(o.olPrix)); }).length;
    var suspects = ks.filter(function (k) { return k.suspect; }).length;
    var nouv = liste.filter(function (o) { return ageJ(o.premiereVue) < 2; }).length, baisses = liste.filter(function (o) { return o.baisseLe && ageJ(o.baisseLe) < 7; }).length;
    var tuile = function (valeur, libelle, sous, cls) { return h('div.kpi.inv2-fixe' + (cls ? '.' + cls : ''), [h('div.valeur', { text: valeur }), h('div.libelle', { text: libelle }), h('div.sous', { text: sous })]); };
    this.elKpis.appendChild(tuile(AMX.fmtNombre(bons.length), 'Bons achats', 'prix demandé égal ou plus bas que le gros OpenLane', 'pos'));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(rentables.length), 'Rentables rendus', 'bons achats qui laissent ≥ ' + argent(p.seuilGros) + ' après transport et frais', 'pos'));
    this.elKpis.appendChild(tuile(meilleur ? signe(meilleur.profit) : '—', 'Meilleur', meilleur ? 'rendu chez nous · ' + vehicule(meilleur.o) + ' · ' + (meilleur.o.ville || '') : 'aucun bon achat pour ces filtres'));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(nouv), 'Nouvelles', 'vues depuis 48 h · ' + baisses + ' baisse' + (baisses > 1 ? 's' : '') + ' de prix (7 j)' + (suspects ? ' · ' + suspects + ' prix à vérifier' : '') + (sansOl ? ' · ' + sansOl + ' sans prévision OpenLane' : '')));
  };

  Opportunites.prototype.rendreListe = function (liste, p) {
    var self = this;
    AMX.vider(this.elListe);
    var d = this.donnees;
    if (!liste.length) {
      var vide = !(d.occasions || []).length;
      this.elListe.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', vide ? 'Pas encore d\'annonces' : 'Aucune annonce pour ces filtres'),
        h('div', { text: vide ? 'Le serveur balaie les annonces aux 2 heures (6 h à 22 h) : les premières arrivent au prochain passage. Vous pouvez aussi cliquer le favori sur DealerSource.' : (this.f.seulement ? 'Essayez « Toutes les annonces » : la liste montre les annonces dont le prix bat le gros ou le détail.' : 'Rien ne correspond.') })]));
      return;
    }
    var tete = h('div.occ-rangee.occ-tete', ['Véhicule', 'Vendeur', 'Prix', 'Transport', 'Gros OpenLane', 'Détail', ''].map(function (t) { return h('div', { text: t }); }));
    this.elListe.appendChild(tete);
    liste.slice(0, this.limite).forEach(function (o) { self.elListe.appendChild(self.rangee(o, p)); });
    if (liste.length > this.limite) this.elListe.appendChild(h('button.btn.occ-plus', { type: 'button', text: 'Afficher ' + Math.min(LIMITE, liste.length - this.limite) + ' annonces de plus (' + (liste.length - this.limite) + ' restantes)', onclick: function () { self.limite += LIMITE; self.rafraichir(); } }));
  };

  Opportunites.prototype.rangee = function (o, p) {
    var self = this, k = this.calc(o) || {}, gmf = o.source === 'gmf';
    var nouv = ageJ(o.premiereVue) < 2, baisse = o.baisseLe && ageJ(o.baisseLe) < 7 && nb(num(o.prixPrecedent));
    var veh = h('div.occ-veh', [AMX.logoMarque(o.marque, 'petit'), h('div', [
      h('div.nom', [h('span', { text: vehicule(o) }), nouv ? h('span.puce.nouv', { text: 'Nouvelle' }) : null, o.statut ? h('span.puce.st-' + o.statut, { text: STATUT_LIB[o.statut] }) : null]),
      h('div.mini', { text: [km(o.km), o.couleur, o.motricite].filter(Boolean).join(' · ') }),
      h('div.vin', { text: o.vin })])]);
    var vend = h('div.occ-vend', [h('div', { text: o.vendeur || '—' }), h('div.mini', { text: [o.ville, o.province].filter(Boolean).join(', ') }),
      h('div.mini', gmf ? [h('span.puce.gmf', { text: 'DealerSource' }), ' ', [o.typeInv, o.cote ? 'cote ' + o.cote : '', nb(num(o.dommages)) ? 'dommages ' + argent(num(o.dommages)) : '', o.finVente ? 'fin ' + AMX.fmtDate(o.finVente, true) : '', nb(num(o.offres)) ? num(o.offres) + ' offre' + (num(o.offres) > 1 ? 's' : '') : ''].filter(Boolean).join(' · ')]
        : [SITES_ANNONCES[o.source] ? h('span.puce.' + (estParticulier(o) ? 'part' : 'site'), { text: SITES_ANNONCES[o.source] + (estParticulier(o) ? ' · particulier' : '') }) : h('span.puce.mc', { text: 'Concessionnaire' }),
          nb(num(o.jours)) ? ' en ligne depuis ' + num(o.jours) + ' j' : '',
          num(o.nbSites) > 1 ? ' · sur ' + num(o.nbSites) + ' sites' + (num(o.ecartSites) ? ' (' + AMX.fmtArgent(num(o.ecartSites)) + ' d\'écart)' : '') : ''])]);
    var prix = h('div.occ-prix', [h('b', { text: argent(num(o.prix)) }),
      k.suspect ? h('span.puce.suspect', { text: 'Prix à vérifier', title: 'Très bas devant la prévision OpenLane ou le marché : souvent un acompte, un paiement ou une erreur d\'annonce' }) : null,
      baisse ? h('div.mini.pos', { text: '↓ était ' + argent(num(o.prixPrecedent)) }) : null,
      !baisse && nb(num(o.baissePrix)) ? h('div.mini.pos', { text: '↓ baisse de ' + argent(num(o.baissePrix)) }) : null,
      puceCote(o) ? h('div', [puceCote(o)]) : null,
      nb(num(o.valeurMarche)) ? h('div.mini', { text: 'marché ' + argent(num(o.valeurMarche)) + (nb(num(o.ecartMarche)) && num(o.ecartMarche) !== 0 ? ' (' + (num(o.ecartMarche) > 0 ? '+' : '−') + argent(Math.abs(num(o.ecartMarche))) + ')' : ''), title: 'Valeur du marché selon CarGurus' }) : null,
      gmf && nb(num(o.mise)) ? h('div.mini', { text: 'mise ' + argent(num(o.mise)) + (nb(num(o.pdsf)) ? ' · PDSF ' + argent(num(o.pdsf)) : '') }) : null]);
    var trans = h('div.occ-trans', [h('div', { text: (k.approx ? '≈ ' : '') + argent(k.transport) }), h('div.mini', { text: (COURTS[k.dest] || k.dest || '') + (nb(k.distance) ? ' · ' + AMX.fmtNombre(k.distance) + ' km' : '') + (k.approx ? ' (ville approx.)' : '') })]);
    var gros = h('div.occ-gros', nb(num(o.olPrix)) ? [h('div', { text: argent(num(o.olPrix)) }),
      h('b.' + (k.suspect ? 'neutre' : (k.sousGros ? 'pos.opp' : 'neg')), { text: k.suspect ? 'prix à vérifier' : (k.sousGros ? (k.ecartGros ? argent(k.ecartGros) + ' sous le gros' : 'au prix du gros') : argent(-k.ecartGros) + ' au-dessus du gros'), title: 'Prix demandé comparé à la prévision de gros OpenLane' }),
      h('div.mini.' + (k.suspect ? 'neutre' : ton(k.profitGros)), { text: 'rendu : ' + signe(k.profitGros), title: 'Prévision OpenLane − (prix + transport + frais)' })]
      : [h('span.doux', { text: o.olErreur ? 'pas de prévision' : 'à lire' }), o.olErreur ? h('div.mini.doux', { text: Number(o.annee) >= new Date().getFullYear() ? 'trop récent pour OpenLane' : '' }) : null]);
    var det = h('div.occ-det', nb(k.refAjuste) ? [h('div', { text: argent(k.refAjuste), title: 'Prix médian du ' + o.annee + ' ' + o.marque + ' ' + o.modele + ' au Canada (' + (o.refN || '?') + ' annonces, toutes versions), ajusté au km' }),
      h('b.' + (nb(k.profitDetail) && k.profitDetail < 0 ? 'neg' : 'neutre'), { text: signe(k.profitDetail) }),
      h('div.mini', { text: 'achat max. ' + argent(k.achatMax) }),
      h('div.mini.doux', { text: k.plafonne ? 'gros OpenLane + ' + (p.detailMaxSurOl || 15) + ' % (marché ' + argent(k.refMarche) + ', toutes versions)' : 'marché, toutes versions' })]
      : [h('span.doux', { text: 'pas de référence' })]);
    var actions = h('div.occ-act', [
      o.lien ? h('a.btn.petit', { href: o.lien, target: '_blank', rel: 'noopener', text: 'Annonce ↗' }) : null,
      AMX.menuActions([
        { texte: 'Évaluer ce véhicule', action: function () { AMX.aller('outils', 'evaluation', { vin: o.vin, km: num(o.km) || '' }); } },
        { texte: 'Relire la prévision OpenLane', action: function () { self.relireOl(o); } },
        { texte: o.statut === 'suivie' ? 'Ne plus suivre' : 'Suivre', action: function () { self.statut(o, o.statut === 'suivie' ? '' : 'suivie'); } },
        { texte: 'Écarter', action: function () { self.statut(o, 'ecartee'); } },
        { texte: 'Achetée', action: function () { self.statut(o, 'achetee'); } },
        o.statut ? { texte: 'Remettre à voir', action: function () { self.statut(o, ''); } } : null,
        { texte: 'Note…', action: function () { self.note(o); } }
      ].filter(Boolean), { titre: 'Actions' })]);
    var r = h('div.occ-rangee' + (k.sousGros ? '.opp' : '') + (o.statut === 'ecartee' ? '.ecartee' : ''), { 'data-vin': o.vin }, [veh, vend, prix, trans, gros, det, actions]);
    if (o.note) r.appendChild(h('div.occ-note', { text: 'Note : ' + o.note + (o.statutPar ? ' — ' + o.statutPar : '') }));
    return r;
  };

  /* ------------------------------ Gestes ------------------------------ */
  Opportunites.prototype.statut = function (o, st, note) {
    var self = this, corps = { action: 'occasionStatut', vin: o.vin, statut: st };
    if (note !== undefined) corps.note = note;
    var ancien = { statut: o.statut, note: o.note };
    o.statut = st; if (note !== undefined) o.note = note; this.rafraichir();
    return AMX.post(corps, { rejouer: true }).then(function (r) {
      if (!r || r.ok === false || r.refuse) throw new Error((r && r.erreur) || 'Refusé');
      if (!r.vin && r.vehicules) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (Occasions.gs).');
      o.statutPar = r.statutPar; o.statutLe = r.statutLe; o.note = r.note;
      AMX.toast(vehicule(o) + ' — ' + (STATUT_LIB[st] || 'À voir'), 'ok'); self.rafraichir();
    }).catch(function (e) { o.statut = ancien.statut; o.note = ancien.note; self.rafraichir(); AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  Opportunites.prototype.note = function (o) {
    var self = this, zone = h('textarea.saisie', { rows: '3', maxlength: '500', placeholder: 'Ex. : appelé le vendeur, prix final 23 500 $' });
    zone.value = o.note || '';
    AMX.modale({ titre: 'Note — ' + vehicule(o), corps: zone, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () { return self.statut(o, o.statut || '', zone.value.trim()); } }] });
    setTimeout(function () { zone.focus(); }, 50);
  };
  Opportunites.prototype.relireOl = function (o) {
    var self = this;
    AMX.toast('Lecture de la prévision OpenLane…', 'info');
    AMX.post({ action: 'occasionOpenlane', vin: o.vin }, { delai: 60000 }).then(function (r) {
      if (!r || r.ok === false || r.refuse) { AMX.toast((r && r.erreur) || 'Refusé', r && r.nonConnecte ? 'attention' : 'erreur', 8000); return; }
      if (!('olPrix' in r)) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (Occasions.gs).');
      ['olPrix', 'olBas', 'olHaut', 'olKm', 'olLe', 'olErreur'].forEach(function (c) { o[c] = r[c]; });
      if (r.par) { o.par = r.par; o.calc = r.calc; o.dest = r.dest; o.score = r.score; }
      AMX.toast(nb(num(r.olPrix)) ? 'Prévision OpenLane : ' + argent(num(r.olPrix)) : 'OpenLane n\'a pas de prévision pour ce véhicule.', 'ok');
      self.rafraichir();
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  Opportunites.prototype.balayer = function () {
    var self = this, b = this.btnBalayer;
    b.classList.add('occupe');
    var groupe = this.f.groupe === 'autres' ? 'autres' : 'nos';
    AMX.post({ action: 'occasionsBalayer', groupe: groupe }, { delai: 300000, secours: false }).then(function (r) {
      b.classList.remove('occupe');
      if (!r || r.ok === false || r.refuse) { AMX.toast((r && r.erreur) || 'Refusé', 'attention', 8000); return; }
      if (!('appels' in r)) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (Occasions.gs).');
      AMX.toast('Balayage' + (groupe === 'autres' ? ' des autres marques' : '') + ' : ' + r.appels + ' appels MarketCheck, ' + r.unites + ' modèles-années, ' + r.gardees + ' annonces, ' + r.ol + ' prévisions OpenLane' + (r.erreurs && r.erreurs.length ? ' — ' + r.erreurs[0] : ''), r.erreurs && r.erreurs.length ? 'attention' : 'ok', 9000);
      self.charger(true);
    }).catch(function (e) { b.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };

  /* ------------------------------ Réglages ------------------------------ */
  var CHAMPS = [
    ['anneeMin', 'Année-modèle minimale', '', 1], ['kmMax', 'Kilométrage maximal', 'km', 1000], ['prixMin', 'Prix minimal d\'une annonce', '$', 500],
    ['transportBase', 'Transport : montant de base', '$', 25], ['transportKm', 'Transport : par km de route', '$/km', 0.05], ['facteurRoute', 'Distance de route ÷ vol d\'oiseau', '×', 0.05],
    ['recon', 'Reconditionnement prévu (détail)', '$', 100], ['frais', 'Frais d\'achat (inspection, immatriculation, encan…)', '$', 50], ['marge', 'Marge visée au détail', '$', 250],
    ['tauxKm', 'Ajustement du prix au km', '$/km', 0.01], ['seuilGros', 'Profit minimal rendu (« rentable »)', '$', 100],
    ['detailMaxSurOl', 'Détail (indicatif) : au plus le gros OpenLane +', '%', 1], ['suspectPct', 'Prix à vérifier sous ce % de la prévision OpenLane', '%', 5],
    ['topParMarque', 'Vue « meilleures par marque » : annonces par marque', '', 1],
    ['autresTop', 'Autres marques : nombre de meilleures montrées', '', 1], ['autresPrixMax', 'Autres marques : prix maximal', '$', 1000],
    ['autresBudgetMois', 'Autres marques : appels MarketCheck par mois', 'appels', 50], ['autresNMin', 'Autres marques : annonces minimum pour balayer un modèle', '', 1],
    ['budgetMois', 'Appels MarketCheck par mois (outil)', 'appels', 50], ['garderParUnite', 'Annonces gardées par modèle-année', '', 1], ['olParPassage', 'Prévisions OpenLane par passage', '', 1]
  ];
  Opportunites.prototype.reglages = function () {
    var self = this, d = this.donnees || {}, p = d.params || {}, champs = {};
    var grille = h('div.occ-reglages', CHAMPS.map(function (c) {
      var inp = h('input.saisie', { type: 'number', step: String(c[3]), value: nb(p[c[0]]) ? String(p[c[0]]) : '', 'data-cle': c[0] });
      champs[c[0]] = inp;
      return h('label', [h('span', { text: c[1] + (c[2] ? ' (' + c[2] + ')' : '') }), inp]);
    }));
    var prov = h('input.saisie', { type: 'text', value: (p.provinces || []).join(', '), placeholder: 'vide = tout le Canada (ex. QC, ON)' });
    var exclus = h('textarea.saisie#occ-modeles-exclus', { rows: 3, placeholder: 'Un par ligne : « Chevrolet Trax », ou le modèle seul (« Trax ») pour toutes les marques' });
    exclus.value = (p.modelesExclus || []).join('\n');
    var autresM = h('textarea.saisie#occ-autres-marques', { rows: 3, placeholder: 'Une par ligne : Toyota, Honda, Ford…' });
    autresM.value = (p.autresMarques || []).join('\n');
    var marques = h('p.mini', { text: 'Marques suivies : ' + Object.keys(p.marques || {}).map(function (m) { return m + ' → ' + (p.marques[m] || []).map(function (c) { return COURTS[c] || c; }).join(', '); }).join(' · ') });
    var corps = h('div', [grille, h('label.occ-prov', [h('span', 'Provinces (sigles, séparés par des virgules)'), prov]),
      h('label.occ-prov', [h('span', 'Modèles à ne plus chercher (balayage, DealerSource et liste)'), exclus]),
      h('label.occ-prov', [h('span', 'Autres marques cherchées (vers la concession la plus proche)'), autresM]), marques,
      h('p.mini', 'Les sites d\'annonces (AutoTrader.ca, Kijiji, CarGurus.ca, Carpages.ca) ont leurs propres filtres : carte « Sources des annonces » › « Filtres de recherche ».'),
      h('p.mini.doux', 'Bon achat = prix demandé égal ou plus bas que la prévision de gros OpenLane. Rendu = prévision OpenLane − (prix + transport + frais) ; « rentable » = bon achat dont le rendu atteint le profit minimal. Le détail (prix médian du modèle-année au Canada, toutes versions, ajusté au km, au plus le gros OpenLane + le % indiqué) est indicatif. Un prix sous le % indiqué de la prévision OpenLane est marqué « à vérifier » (acompte, paiement ou erreur). Une année ou un km changé relance la découverte des modèles au prochain passage.')]);
    AMX.modale({ titre: 'Réglages — opportunités d\'achat', corps: corps, large: true, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      var params = {}; Object.keys(champs).forEach(function (k) { var v = num(champs[k].value); if (v !== null) params[k] = v; });
      params.provinces = prov.value;
      params.modelesExclus = exclus.value;
      params.autresMarques = autresM.value;
      return AMX.post({ action: 'occasionsParams', params: params }).then(function (r) {
        if (!r || r.ok === false || r.refuse) { AMX.toast((r && r.erreur) || 'Refusé', 'erreur'); return false; }
        if (!r.params) { AMX.toast('Le script n\'est pas à jour : déployez une nouvelle version (Occasions.gs).', 'erreur'); return false; }
        AMX.toast('Réglages enregistrés', 'ok'); self.charger(true); return true;
      }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
    } }] });
  };

  /* ------------------------------ Export ------------------------------ */
  Opportunites.prototype.exporter = function () {
    var self = this, liste = this.trier(this.filtrer());
    if (!liste.length) { AMX.toast('Rien à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var lignes = liste.map(function (o) {
      var k = self.calc(o) || {};
      return { 'Année': o.annee, 'Marque': o.marque, 'Modèle': o.modele, 'Version': o.version, 'NIV': o.vin, 'Km': num(o.km), 'Prix': num(o.prix), 'Prix précédent': num(o.prixPrecedent),
        'Source': libelleSource(o), 'Vendeur': o.vendeur, 'Ville': o.ville, 'Province': o.province,
        'Concession d\'arrivée': COURTS[k.dest] || k.dest, 'Distance (km)': k.distance, 'Transport': k.transport, 'Coût rendu': k.cout,
        'Prévision OpenLane': num(o.olPrix), 'Profit au gros': k.profitGros, 'Prix médian ajusté': k.refAjuste, 'Annonces de référence': num(o.refN), 'Recon': k.recon, 'Profit au détail': k.profitDetail, 'Achat max.': k.achatMax,
        'Cote CarGurus': COTES[o.coteCg] ? COTES[o.coteCg].t : '', 'Valeur du marché (CarGurus)': num(o.valeurMarche), 'Écart au marché': num(o.ecartMarche), 'Baisse de prix': num(o.baissePrix), 'Sites': num(o.nbSites),
        'Mise (DealerSource)': num(o.mise), 'Dommages estimés': num(o.dommages), 'Cote': o.cote, 'Fin de vente': o.finVente, 'Statut': STATUT_LIB[o.statut || ''], 'Note': o.note, 'Vue la première fois': o.premiereVue, 'Annonce': o.lien };
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Opportunités');
    XLSX.writeFile(wb, 'opportunites-achat-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export Excel — ' + lignes.length + ' annonces', 'ok');
  };

  AMX.vues.Opportunites = Opportunites;
  AMX.opportunites = { charger: charger, enCache: function () { return cache.rep; }, vider: function () { cache.rep = null; cache.quand = 0; } };

  function injecterCss() {
    if (document.getElementById('css-occ')) return;
    var s = document.createElement('style'); s.id = 'css-occ';
    s.textContent = [
      '.occ-page .carte { margin-bottom: 14px; }',
      '.occ-page .mini { font-size: 12px; color: var(--encre-3); }',
      '.occ-ligne { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; }',
      '.occ-ligne + .occ-ligne { margin-top: 10px; }',
      '.occ-ligne .recherche { flex: 1 1 260px; min-width: 200px; }',
      '.occ-pastilles { display: flex; flex-wrap: wrap; gap: 6px; flex: 1 1 auto; }',
      '.occ-pastille { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--trait); background: var(--carte, #fff); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 13px; cursor: pointer; color: var(--encre-2); }',
      '.occ-pastille b { font-weight: 700; color: var(--encre-1); }',
      '.occ-pastille.actif { background: var(--vert-clair); border-color: var(--vert); color: var(--vert-fonce); }',
      '.occ-select { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: var(--encre-3); }',
      '.occ-select > span { font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }',
      '.occ-kpis { margin-bottom: 14px; }',
      '.occ-groupe button { font-weight: 600; }',
      '.occ-autres { flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 4px; padding: 6px 10px; border-radius: 8px; background: var(--ambre-bg, #FFF4E0); color: var(--ambre); font-size: 13px; }',
      '.occ-modeles-env { margin-left: 0; }',
      '.occ-pop-modeles { width: 320px; left: 0; right: auto; }',
      '.occ-pop-plus { width: 360px; left: 0; right: auto; } .occ-plus-grille { display: grid; gap: 10px; } .occ-plus-champ { display: grid; gap: 4px; font-size: 12.5px; color: var(--encre-2); } .occ-plus-champ .saisie { width: 100%; }',
      '.occ-pop-rech { width: 320px; left: 0; right: auto; } .occ-rech-liste { display: grid; gap: 4px; max-height: 260px; overflow: auto; margin-bottom: 10px; }',
      '.occ-rech-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 6px; } .occ-rech-item:hover { background: var(--fond); }',
      '.occ-rech-appliquer { text-align: left; font-weight: 600; } .occ-rech-suppr { font-size: 18px; line-height: 1; color: var(--encre-3); } .occ-rech-nouvelle { display: flex; gap: 6px; }',
      '.occ-rech-nouvelle .saisie { flex: 1; min-width: 0; }',
      '.portee-chiffres .occ-puce-filtre { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; border: 1px solid var(--bordure); background: var(--vert-clair); color: var(--vert-fonce); border-radius: 999px; padding: 2px 6px 2px 10px; font: inherit; font-size: 12.5px; }',
      '.portee-chiffres .occ-puce-filtre .x { font-size: 15px; line-height: 1; } .portee-chiffres .occ-puce-filtre:hover { border-color: var(--vert-fonce); }',
      '#occ-plus.actif { border-color: var(--vert-fonce); color: var(--vert-fonce); }',
      '.occ-mode { display: flex; }',
      '.occ-mode button { flex: 1 1 0; }',
      '.occ-mod-liste { max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; margin: 0 -4px; padding: 0 4px; }',
      '.occ-mod-marque { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--encre-3); margin: 8px 0 2px; }',
      '.occ-mod { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 6px; cursor: pointer; font-size: 13px; }',
      '.occ-mod:hover { background: var(--fond); }',
      '.occ-mod span { flex: 1 1 auto; }',
      '.occ-mod b { font-weight: 600; color: var(--encre-3); font-variant-numeric: tabular-nums; }',
      '.occ-mod.coche span { font-weight: 600; }',
      '.occ-mod-pied { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }',
      '.occ-prov textarea { width: 100%; resize: vertical; }',
      '.occ-kpis .kpi.pos .valeur { color: var(--vert-fonce); }',
      '.occ-sources { display: grid; gap: 14px; }',
      '.occ-source p { margin: 4px 0 8px; color: var(--encre-2); }',
      '.occ-src-etat { margin-top: 6px; }',
      '.occ-liste { background: var(--carte, #fff); border: 1px solid var(--trait); border-radius: 12px; overflow: hidden; }',
      '.occ-rangee { display: grid; grid-template-columns: minmax(220px, 2.2fr) minmax(170px, 1.6fr) 120px 130px 120px 140px 150px; gap: 10px; padding: 10px 14px; border-top: 1px solid var(--trait); align-items: start; font-size: 13.5px; }',
      '.occ-rangee.occ-tete { border-top: 0; background: var(--fond); font-size: 12px; font-weight: 600; color: var(--encre-3); text-transform: uppercase; letter-spacing: .04em; }',
      '.occ-rangee.opp { box-shadow: inset 3px 0 0 var(--vert); }',
      '.occ-rangee.ecartee { opacity: .6; }',
      '.occ-veh { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }',
      '.occ-veh .nom { font-weight: 600; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }',
      '.occ-veh .vin { font-family: var(--mono, ui-monospace, monospace); font-size: 12px; color: var(--encre-3); }',
      '.occ-rangee b.pos { color: var(--vert-fonce); } .occ-rangee b.neg { color: var(--rouge); } .occ-rangee b.opp { background: var(--vert-clair); padding: 0 4px; border-radius: 4px; }',
      '.occ-prix b { font-size: 15px; }',
      '.occ-act { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }',
      '.occ-note { grid-column: 1 / -1; font-size: 12.5px; color: var(--encre-2); background: var(--fond); border-radius: 6px; padding: 4px 8px; }',
      '.occ-page .puce.nouv { background: var(--bleu-bg, #E6F0FB); color: var(--bleu); }',
      '.occ-page .puce.gmf { background: #EEF2FF; color: #3730A3; } .occ-page .puce.mc { background: var(--fond); color: var(--encre-2); }',
      '.occ-page .puce.part { background: #FCE7F3; color: #9D174D; } .occ-page .puce.site { background: #E0F2FE; color: #075985; }',
      '.occ-prix .puce { display: inline-block; margin-top: 4px; } .occ-page .puce.cg-great { background: #D1FAE5; color: #065F46; } .occ-page .puce.cg-good { background: var(--vert-clair); color: var(--vert-fonce); }',
      '.occ-page .puce.cg-fair { background: var(--fond); color: var(--encre-2); } .occ-page .puce.cg-high { background: #FEF3C7; color: var(--ambre); } .occ-page .puce.cg-over { background: #FEE2E2; color: #991B1B; }',
      '.occ-apify-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; } .occ-apify-sites { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 6px; }',
      '.occ-page .puce.st-suivie { background: var(--vert-clair); color: var(--vert-fonce); } .occ-page .puce.st-ecartee { background: var(--fond); color: var(--encre-3); } .occ-page .puce.st-achetee { background: #FEF3C7; color: var(--ambre); }',
      '.occ-plus { margin: 10px 14px; }',
      '.occ-page .puce.suspect { display: inline-block; margin-top: 4px; background: #FEF3C7; color: var(--ambre); }',
      '.occ-reglages { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px 14px; }',
      '.occ-reglages label, .occ-prov { display: grid; gap: 4px; font-size: 12.5px; color: var(--encre-2); } .occ-prov { margin-top: 12px; }',
      '@media (max-width: 1100px) { .occ-rangee { grid-template-columns: 1fr 1fr; } .occ-rangee.occ-tete { display: none; } .occ-act { justify-content: flex-start; } }'
    ].join('\n');
    document.head.appendChild(s);
  }
})();
