/* =========================================================================
   Section « CSI » — satisfaction client des constructeurs (10 octobre 2026)

   Maxime : « tu vas voir si tu peux faire un onglet CSI aussi » (BoostCX,
   hacc.boostcx.com — le programme CSI de Hyundai Canada).

   Données : GET ?csi=1 (Constructeur.gs) — ce que le signet « Automax ←
   Hyundai » a lu sur BoostCX : les scores NPS ventes / service / combiné
   (mois en cours, 3 mois, 12 mois ; district, zone, national, rangs, taux de
   réponse, promoteurs / passifs / détracteurs, KPI de base) et la liste des
   sondages ventes + service des 12 derniers mois (client, conseiller,
   directeur F&I ou technicien, NPS, commentaire, alerte). La concession suit
   le choix du site. Le signet se trouve dans Inventaire › Neufs › « Portail
   Hyundai » (même favori pour le portail des ventes et pour BoostCX).
   21 oct. : BMW Sherbrooke par Forsta (horizons.confirmit.ca), échelle « npsc »
   — NPS comparé au composite BMW, région BMW-Eastern et national.

   Toutes les données serveur sont rendues via textContent (jamais innerHTML).
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  AMX.icones.csi = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.4l-5.3 2.8 1.1-5.9L3.5 9.2l5.9-.8z"/></svg>';

  var PERIODES = [['MTD', 'Mois en cours'], ['3M', '3 mois'], ['12M', '12 mois']];
  var TYPES = [['ventes', 'Ventes'], ['service', 'Service']];
  var FENETRES = [[30, '30 jours'], [90, '3 mois'], [365, '12 mois']];
  // Site CSI de chaque constructeur (le favori « Automax ← Constructeur », dans Inventaire › Neufs, se clique là).
  var SITES_CSI = {
    HYUNDAI: { nom: 'BoostCX', url: 'https://hacc.boostcx.com/bcx/dashboard/combined', echelle: 'nps' },
    STM: { nom: 'ISC (InMoment)', url: 'https://field-reporting.inmoment.com/program/clt3hf6a4u9r91e88k56m1b7z/report/272998', echelle: 'index' },
    HAWKS: { nom: 'ISC (InMoment)', url: 'https://field-reporting.inmoment.com/program/clt3hf6a4u9r91e88k56m1b7z/report/272998', echelle: 'index' },
    // BMW (21 oct.) : Forsta, rapport « Ventes et service après-vente VoC » ; NPS comparé au composite BMW (pas de cible).
    BMW: { nom: 'Forsta (CSI BMW)', url: 'https://horizons.confirmit.ca/apps/dashboard/2250', echelle: 'npsc' }
  };
  // Favori autonome « Automax ← CSI BMW » : Forsta bloque les scripts chargés d'un autre site, le favori Constructeur n'y démarre pas.
  // Généré par mock/signet-forsta-build.py — ne pas éditer à la main.
  var CODE_SIGNET_FORSTA = "javascript:(function () { var SITE = " + JSON.stringify(AMX.SITE) + "; var ORIGINE_SITE = SITE.replace(/^(https?:\\/\\/[^\\/]+).*$/, '$1'); var DELAI_MS = 60000, TAILLE_LOT = 400, PAGE_CSI = 500; var hote = location.hostname; var PASSAGE = new Date().toISOString(); var mode = /hyundai-corp\\.io$/.test(hote) ? 'portail' : (/boostcx\\.com$/.test(hote) ? 'csi' : (/owb\\.vsp\\.autopartners\\.net$/.test(hote) ? 'owb' : (/field-reporting\\.inmoment\\.com$/.test(hote) ? 'inmoment' : (/salesreporting\\.bmwgroup\\.ca$/.test(hote) ? 'rdr' : (/^ivsrfe(-[a-z]+)?\\.bmwgroup\\.com$/.test(hote) ? 'ivsr' : (/(^|\\.)confirmit\\.ca$/.test(hote) ? 'forsta' : '')))))); if (!mode) { alert('Cliquez ce signet, connect\u00e9, sur un portail du constructeur : portail des ventes Hyundai, BoostCX, L\\'utilitaire des commandes GM (owb.vsp.autopartners.net), l\\'ISC GM (field-reporting.inmoment.com), le portail RDR BMW (salesreporting.bmwgroup.ca), IVS-R Ordering BMW (ivsrfe.bmwgroup.com, Order Locator) ou le CSI BMW Forsta (horizons.confirmit.ca).'); return; } if (window.__amxHyundai) { alert('Une lecture est d\u00e9j\u00e0 en cours dans cette page.'); return; } window.__amxHyundai = true; var passage = (window.__amxHyundaiPassage = (window.__amxHyundaiPassage || 0) + 1); var bande = document.createElement('div'); bande.setAttribute('style', 'position:fixed;left:16px;right:16px;bottom:16px;top:auto;width:auto;height:auto;max-height:40vh;box-sizing:border-box;z-index:2147483647;background:#0F7B4F;color:#fff;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;padding:12px 16px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.35);display:flex;gap:14px;align-items:center;'); var etiquette = document.createElement('div'); etiquette.style.flex = '1'; var barre = document.createElement('div'); barre.setAttribute('style', 'height:6px;background:rgba(255,255,255,.25);border-radius:3px;margin-top:6px;overflow:hidden;'); var rempli = document.createElement('div'); rempli.setAttribute('style', 'height:100%;width:0;background:#fff;transition:width .3s;'); barre.appendChild(rempli); var boite = document.createElement('div'); boite.style.flex = '1'; boite.appendChild(etiquette); boite.appendChild(barre); var fermer = document.createElement('button'); fermer.textContent = 'Fermer'; fermer.setAttribute('style', 'background:rgba(255,255,255,.18);border:0;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit;'); var arrete = false; fermer.onclick = function () { arrete = true; bande.remove(); window.__amxHyundai = false; try { if (window.__amxPont && !window.__amxPont.closed) window.__amxPont.close(); } catch (e) {} }; bande.appendChild(boite); bande.appendChild(fermer); document.body.appendChild(bande); var titre = { portail: 'Portail Hyundai', csi: 'CSI Hyundai', owb: 'Portail GM', inmoment: 'CSI GM', rdr: 'Portail BMW', ivsr: 'IVS-R BMW', forsta: 'CSI BMW' }[mode]; function dire(t, pct) { etiquette.textContent = titre + ' \u2014 ' + t; if (pct !== undefined) rempli.style.width = Math.max(0, Math.min(100, pct)) + '%'; } function erreur(t) { bande.style.background = '#B42318'; dire(t, 100); window.__amxHyundai = false; try { if (window.__amxPont && !window.__amxPont.closed) window.__amxPont.close(); } catch (e) {} } var pont = window.open(SITE + 'pont.html?v=' + Date.now(), 'amxPont', 'width=460,height=240,menubar=no,toolbar=no,location=no,status=no'); if (!pont) { erreur('Chrome a bloqu\u00e9 la petite fen\u00eatre du site : autorisez les fen\u00eatres pop-up pour ' + hote + ' (ic\u00f4ne \u00e0 droite de la barre d\\'adresse), puis recliquez le signet.'); return; } window.__amxPont = pont; var attentes = {}, compteur = 0, pret = null; window.addEventListener('message', function (ev) { if (ev.source !== pont) return; var m = ev.data || {}; if (m.type === 'amx:pret' && pret) { pret(m); pret = null; } if (m.type === 'amx:resultat' && attentes[m.id]) { attentes[m.id](m.resultat); delete attentes[m.id]; } }); function attendrePont() { return new Promise(function (res, rej) { var fini = false; pret = function (m) { fini = true; res(m); }; var essais = 0; (function ping() { if (fini) return; essais++; try { pont.postMessage({ type: 'amx:ping' }, ORIGINE_SITE); } catch (e) {} if (pont.closed) { rej(new Error('La petite fen\u00eatre du site a \u00e9t\u00e9 ferm\u00e9e : recliquez le signet et laissez-la ouverte.')); return; } if (essais > 60) { rej(new Error('Le site d\\'inventaire ne r\u00e9pond pas.')); return; } setTimeout(ping, 500); })(); }); } function fermerPontPlusTard() { setTimeout(function () { try { if (window.__amxHyundaiPassage === passage && !pont.closed) pont.close(); } catch (e) {} }, 1500); } function lecture(requete) { return new Promise(function (res) { var id = 'lec' + (++compteur); attentes[id] = res; pont.postMessage({ type: 'amx:lecture', id: id, requete: requete }, ORIGINE_SITE); setTimeout(function () { if (attentes[id]) { delete attentes[id]; res({ ok: false, erreur: 'Pas de r\u00e9ponse du site (d\u00e9lai).' }); } }, 60000); }); } function envoyer(corps) { return new Promise(function (res) { var id = 'lot' + (++compteur); attentes[id] = res; pont.postMessage({ type: 'amx:lot', id: id, corps: corps }, ORIGINE_SITE); setTimeout(function () { if (attentes[id]) { delete attentes[id]; res({ ok: false, erreur: 'Pas de r\u00e9ponse du site (d\u00e9lai).' }); } }, 240000); }); } function verifier(rep, quoi) { if (rep && rep.refuse && !rep.erreur) throw new Error('Votre session du site d\\'inventaire a expir\u00e9 : reconnectez-vous sur ' + SITE + ' dans un onglet, puis recliquez le signet.'); if (!rep || rep.ok === false || rep.refuse) throw new Error('Le site a refus\u00e9 ' + quoi + ' : ' + ((rep && rep.erreur) || 'erreur inconnue')); return rep; } function appel(url, opts) { opts = opts || {}; var ctl = (typeof AbortController === 'function') ? new AbortController() : null; var minuterie = ctl ? setTimeout(function () { ctl.abort(); }, DELAI_MS) : null; var entetes = opts.entetes || { Accept: 'application/json' }; return fetch(url, { method: opts.corps ? 'POST' : 'GET', credentials: opts.credentials || 'include', headers: entetes, body: opts.corps, signal: ctl ? ctl.signal : undefined }) .then(function (r) { if (minuterie) clearTimeout(minuterie); if (r.status === 401 || r.status === 403) { var e = new Error('session refus\u00e9e (' + r.status + ') : reconnectez-vous, puis recliquez le signet'); e.session = true; throw e; } if (!r.ok) throw new Error('HTTP ' + r.status); return r.text().then(function (t) { if (/<html/i.test(t.slice(0, 200))) { var e2 = new Error('la page de connexion a r\u00e9pondu \u00e0 la place des donn\u00e9es : reconnectez-vous, puis recliquez le signet'); e2.session = true; throw e2; } try { return t ? JSON.parse(t) : null; } catch (e3) { throw new Error('r\u00e9ponse illisible'); } }); }, function (e) { if (minuterie) clearTimeout(minuterie); throw new Error(e && e.name === 'AbortError' ? 'd\u00e9lai d\u00e9pass\u00e9' : (e && e.message || String(e))); }); } function texte(v) { return v === null || v === undefined ? '' : String(v).trim(); } function nombre(v) { if (v === null || v === undefined || v === '') return null; if (typeof v === 'number') return isNaN(v) ? null : v; var n = parseFloat(String(v).replace(/[^0-9.\\-]/g, '')); return isNaN(n) ? null : n; } function dateSap(v) { var s = texte(v); if (!s || /^0000/.test(s)) return ''; var m = /\\/Date\\((-?\\d+)\\)\\//.exec(s); if (m) return iso(new Date(parseInt(m[1], 10))); return s.slice(0, 10); } function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); } function yyyymmdd(d) { return iso(d).replace(/-/g, ''); } function ilYa(jours) { return new Date(Date.now() - jours * 86400000); } function alerteVentes(rv) { var r = rv && rv.resume; return r && r.retraitRefuse ? ' \u26a0 Lecture partielle des ventes : ' + r.retraitRefuse + ' RDR connus du site n\\'ont pas \u00e9t\u00e9 revus \u2014 ils sont conserv\u00e9s ; relancez le favori plus tard.' : ''; } function lots(liste, taille) { var out = []; for (var i = 0; i < liste.length; i += taille) out.push(liste.slice(i, i + taille)); return out; } var FS_PERIODES = [['MTD', 0], ['3M', 3], ['12M', 12]]; function fsPause(ms) { return new Promise(function (r) { setTimeout(r, ms); }); } function fsAttendre(test, delai) { return new Promise(function (res) { var t0 = Date.now(); (function sonder() { var ok = false; try { ok = !!test(); } catch (e) {} if (ok || arrete || Date.now() - t0 > (delai || 30000)) { res(ok); return; } setTimeout(sonder, 300); })(); }); } function fsTexte() { return (document.querySelector('main') || document.body).innerText || ''; } function fsPeriodeTexte() { var m = /(P\u00e9riode couverte par le rapport|Report period)\\s*:\\s*([^\\n]*)/i.exec(fsTexte()); return m ? texte(m[2]).replace(/[\u200e\u200f]/g, '') : ''; } function fsFeuilles(re) { return Array.prototype.filter.call(document.querySelectorAll('h1, h2, h3, h4, h5, span, div, p'), function (e) { return e.children.length === 0 && re.test(texte(e.textContent)); }); } function fsTableApres(el) { if (!el) return null; return Array.prototype.filter.call(document.querySelectorAll('table'), function (t) { return el.compareDocumentPosition(t) & 4; })[0] || null; } function fsTableau(re) { var t = fsTableApres(fsFeuilles(re)[0]); return t && t.rows.length > 2 ? t : null; } var FS_VENTES = /(niveau hi\u00e9rarchique|hierarchy level)\\s*[-\u2013]\\s*(Ventes|Sales)$/i, FS_SERVICE = /(niveau hi\u00e9rarchique|hierarchy level)\\s*[-\u2013]\\s*(Service|Apr\u00e8s-vente|After ?sales)$/i; var FS_TOUT_NPS = /^NPS\\s*[-\u2013]\\s*(Tout|All)$/i, FS_TOUT_CSAT = /^CSAT\\s*[-\u2013]\\s*(Tout|All)$/i; function fsOnglet(re, quoi) { var a = Array.prototype.filter.call(document.querySelectorAll('a, [role=tab], [role=link], button'), function (x) { return re.test(texte(x.textContent)); })[0]; if (!a) throw new Error('onglet \u00ab ' + quoi + ' \u00bb introuvable : ouvrez le rapport \u00ab Ventes et service apr\u00e8s-vente VoC \u00bb dans Forsta, puis recliquez le signet'); a.click(); } function fsSignature() { return Array.prototype.map.call(document.querySelectorAll('table'), function (t) { return texte(t.textContent); }).join('|'); } async function fsReference() { if (!/HierarchyTables/i.test(location.pathname)) fsOnglet(/^(R\u00e9f\u00e9rence|Reference|Benchmark)s?$/i, 'R\u00e9f\u00e9rence'); var ok = await fsAttendre(function () { return /HierarchyTables/i.test(location.pathname) && fsTableau(FS_VENTES) && fsTableau(FS_SERVICE); }, 45000); if (!ok) throw new Error('la page \u00ab R\u00e9f\u00e9rence \u00bb de Forsta ne s\\'est pas charg\u00e9e'); } async function fsPeriode(n) { var voulu = n ? new RegExp('(Pr\u00e9c\u00e9dent|Previous|Last)\\\\s*' + n + '\\\\s*(mois|months?)', 'i') : /(Mois en cours|Current month|Month to date)/i; if (voulu.test(fsPeriodeTexte())) return; var avant = fsSignature(); var puce = Array.prototype.filter.call(document.querySelectorAll('button, [role=button], div, span'), function (e) { return /^[\\s\u200e]*(P\u00e9riode couverte par le rapport|Report period)/i.test(e.textContent) && e.textContent.length < 120; }).pop(); if (!puce) throw new Error('filtre \u00ab P\u00e9riode couverte par le rapport \u00bb introuvable dans Forsta'); (puce.closest('button, [role=button]') || puce).click(); var radio = null; await fsAttendre(function () { radio = document.querySelector('input[type=radio][value=' + (n ? 'previousmonths' : 'currentmonth') + ']'); return !!radio; }, 10000); if (!radio) throw new Error('choix de p\u00e9riode introuvable dans Forsta'); radio.click(); await fsPause(400); if (n) { var champ = document.querySelector('input[type=number]'); if (!champ) throw new Error('nombre de mois introuvable dans le filtre de Forsta'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(champ, String(n)); champ.dispatchEvent(new Event('input', { bubbles: true })); champ.dispatchEvent(new Event('change', { bubbles: true })); await fsPause(300); var cb = Array.prototype.filter.call(document.querySelectorAll('input[type=checkbox]'), function (c) { return /aujourd|today/i.test(c.getAttribute('aria-label') || ''); })[0]; if (cb && !cb.checked) { cb.click(); await fsPause(300); } } var b = Array.prototype.filter.call(document.querySelectorAll('button'), function (x) { return /^(appliquer|apply)$/i.test(texte(x.textContent)); })[0]; if (b && !b.disabled) b.click(); if (!(await fsAttendre(function () { return voulu.test(fsPeriodeTexte()); }, 20000))) throw new Error('Forsta n\\'a pas appliqu\u00e9 la p\u00e9riode ' + (n ? 'des ' + n + ' derniers mois' : 'du mois en cours')); await fsAttendre(function () { return fsSignature() !== avant; }, 20000); await fsPause(2000); } function fsLire(tb) { if (!tb) return []; var entete = Array.prototype.map.call(tb.rows[0].cells, function (c) { return texte(c.textContent); }); var ix = function (re) { for (var i = 1; i < entete.length; i++) if (re.test(entete[i])) return i; return -1; }; var iN = ix(/r\u00e9ponses|responses/i), iNps = ix(/^NPS$/i), iD = ix(/tract/i), iP = ix(/passi/i), iPr = ix(/promo/i), iC = ix(/^CSAT$/i), iT = ix(/^Total$/i); var out = []; for (var r = 1; r < tb.rows.length; r++) { var c = tb.rows[r].cells, nom = c[0] ? texte(c[0].textContent) : ''; if (!nom) continue; var v = function (i) { return i >= 0 && c[i] ? nombre(c[i].textContent) : null; }; out.push({ nom: nom, n: v(iN), nps: v(iNps), detracteurs: v(iD), passifs: v(iP), promoteurs: v(iPr), csat: v(iC), total: v(iT) }); } return out; } function fsNiveaux(liste) { var conc = liste[liste.length - 1] || null, nat = null, marque = null, region = null; liste.forEach(function (r) { if (r === conc) return; if (/^(national|canada)$/i.test(r.nom)) nat = r; else if (!marque && /^(BMW|MINI|BMW Motorrad)$/i.test(r.nom)) marque = r; }); liste.forEach(function (r) { if (!region && r !== conc && r !== nat && r !== marque) region = r; }); return { conc: conc, nat: nat, marque: marque, region: region }; } function fsUn(x) { return x === null || x === undefined ? null : Math.round(x * 10) / 10; } function fsComposites(N, champ) { var bloc = function (r) { return r ? { score: r[champ], n: r.n, nps: r[champ], recommandation: r.promoteurs } : null; }; var marques = {}; if (N.marque) marques[N.marque.nom] = bloc(N.marque); return { region: bloc(N.region), marques: marques, marquePrincipale: N.marque ? N.marque.nom : '', concession: {}, national: bloc(N.nat), regionNom: N.region ? N.region.nom : '' }; } function fsKpis(c, ref) { var k = []; if (c.csat !== null && c.csat !== undefined) k.push({ titre: 'CSAT \u2014 note moyenne sur 10 (en %)', valeur: fsUn(c.csat * 10), cible: ref && ref.csat !== null ? fsUn(ref.csat * 10) : null, n: c.n, changement: null }); if (c.promoteurs !== null && c.promoteurs !== undefined) k.push({ titre: 'Promoteurs (9-10)', valeur: c.promoteurs, cible: ref ? ref.promoteurs : null, n: c.n, changement: null }); if (c.detracteurs !== null && c.detracteurs !== undefined) k.push({ titre: 'Sans d\u00e9tracteur (notes 7 \u00e0 10)', valeur: fsUn(100 - c.detracteurs), cible: ref && ref.detracteurs !== null ? fsUn(100 - ref.detracteurs) : null, n: c.n, changement: null }); return k; } function fsScores(periode) { var out = [], nom = '', nTotal = 0; [['ventes', FS_VENTES], ['service', FS_SERVICE]].forEach(function (t) { var N = fsNiveaux(fsLire(fsTableau(t[1]))), c = N.conc; if (!c) return; nom = nom || c.nom; nTotal += c.n || 0; var ref = N.marque || N.region; out.push({ periode: periode, type: t[0], score: c.nps, cibleEcart: c.nps !== null && ref && ref.nps !== null ? fsUn(c.nps - ref.nps) : null, district: N.region ? N.region.nps : null, zone: null, national: N.nat ? N.nat.nps : null, rangDistrict: '', rangZone: '', rangNational: '', changement: null, sondages: c.n, tauxReponse: null, promoteurs: c.promoteurs, passifs: c.passifs, detracteurs: c.detracteurs, nps: c.nps, recommandation: c.promoteurs, kpis: fsKpis(c, ref), composites: fsComposites(N, 'nps'), echelle: 'npsc' }); }); var T = fsNiveaux(fsLire(fsTableau(FS_TOUT_NPS))), TC = fsNiveaux(fsLire(fsTableau(FS_TOUT_CSAT))); if (T.conc && T.conc.total !== null) { var refT = T.marque || T.region, csatC = TC.conc ? TC.conc.total : null, csatRef = TC.marque ? TC.marque.total : (TC.region ? TC.region.total : null); var kT = csatC !== null ? [{ titre: 'CSAT \u2014 note moyenne sur 10 (en %)', valeur: fsUn(csatC * 10), cible: csatRef !== null ? fsUn(csatRef * 10) : null, n: nTotal || null, changement: null }] : []; out.push({ periode: periode, type: 'combine', score: T.conc.total, cibleEcart: refT && refT.total !== null ? fsUn(T.conc.total - refT.total) : null, district: T.region ? T.region.total : null, zone: null, national: T.nat ? T.nat.total : null, rangDistrict: '', rangZone: '', rangNational: '', changement: null, sondages: nTotal || null, tauxReponse: null, promoteurs: null, passifs: null, detracteurs: null, nps: T.conc.total, recommandation: null, kpis: kT, composites: fsComposites(T, 'total'), echelle: 'npsc' }); } return { nom: nom, scores: out }; } function fsDate(v) { var s = texte(v), m = /^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})/.exec(s); if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2); if (/^\\d{5}$/.test(s)) { var d = new Date(Date.UTC(1899, 11, 30) + parseInt(s, 10) * 86400000); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); } return /^\\d{4}-\\d{2}-\\d{2}/.test(s) ? s.slice(0, 10) : ''; } function fsTableReponses() { return Array.prototype.filter.call(document.querySelectorAll('table'), function (t) { return t.tHead && t.tBodies[0] && t.tBodies[0].rows.length && Array.prototype.some.call(t.tHead.querySelectorAll('th, td'), function (c) { return /^VIN$/i.test(texte(c.textContent)); }); })[0] || null; } function fsLireReponses(tb) { if (!tb) return []; var h = Array.prototype.map.call(tb.tHead.rows[tb.tHead.rows.length - 1].cells, function (c) { return texte(c.textContent).toLowerCase().replace(/_/g, ' '); }); var ix = function (re) { for (var i = 0; i < h.length; i++) if (re.test(h[i])) return i; return -1; }; var iFin = ix(/ach\u00e8vement|completion|completed/), iEv = ix(/\u00e9v\u00e9nement|event/), iCh = ix(/cha\u00eene|channel/), iVin = ix(/^vin$/), iPre = ix(/pr\u00e9nom|first/), iNom = ix(/nom de famille|last name/), iAss = ix(/associ\u00e9|associate/), iMod = ix(/mod\u00e8le|model/), iRo = ix(/^ro\\b/), iNps = ix(/^nps$/), iCn = ix(/commentaire nps|nps comment/), iCc = ix(/commentaire csat|csat comment/); return Array.prototype.map.call(tb.tBodies[0].rows, function (tr) { var c = Array.prototype.map.call(tr.cells, function (td) { return texte(td.textContent); }); var v = function (i) { return i >= 0 ? (c[i] || '') : ''; }; var courriel = c.filter(function (x) { return /^[^\\s@]+@[^\\s@]+\\.[a-z]{2,}$/i.test(x); })[0] || ''; var type = /serv/i.test(v(iCh)) ? 'service' : 'ventes', fin = fsDate(v(iFin)), vin = v(iVin).toUpperCase(); return { type: type, id: ['fs', type, vin || (v(iPre) + v(iNom)).replace(/\\s+/g, ''), fin, v(iRo)].join('-'), client: (v(iPre) + ' ' + v(iNom)).trim(), courriel: courriel, nps: nombre(v(iNps)), completeLe: fin, directeurVentes: '', conseiller: v(iAss), directeurFI: '', vin: vin, modele: v(iMod), annee: '', dateRdr: fsDate(v(iEv)), reference: v(iRo), montant: null, alerte: '', commentaire: [v(iCn), v(iCc)].filter(Boolean).join(' / '), invitationLe: '' }; }).filter(function (s) { return s.completeLe && (s.vin || s.client); }); } async function fsReponses() { if (!/\\/Response/i.test(location.pathname)) fsOnglet(/^(Liste des r\u00e9ponses|Response list|Responses)$/i, 'Liste des r\u00e9ponses'); if (!(await fsAttendre(function () { return /\\/Response/i.test(location.pathname) && fsTableReponses(); }, 45000))) throw new Error('la page \u00ab Liste des r\u00e9ponses \u00bb de Forsta ne s\\'est pas charg\u00e9e'); var m = /(Liste des r\u00e9ponses|Response list)\\s*\\((\\d[\\d\\s,]*)\\)/i.exec(fsTexte()), attendu = m ? nombre(m[2]) : null; var prec = -1, stables = 0; for (var tour = 0; tour < 200 && !arrete; tour++) { var tb = fsTableReponses(); if (!tb) { await fsPause(1000); continue; } var n = tb.tBodies[0].rows.length, boite = tb; dire('liste des r\u00e9ponses (12 mois) : ' + n + (attendu ? ' / ' + attendu : '') + '\u2026', 50 + 30 * Math.min(1, n / Math.max(1, attendu || n))); if (attendu && n >= attendu) break; if (n === prec) { stables++; if (stables >= 5) break; } else stables = 0; prec = n; while (boite && !(boite.scrollHeight > boite.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(boite).overflowY))) boite = boite.parentElement; if (boite) { boite.scrollTop = boite.scrollHeight; boite.dispatchEvent(new Event('scroll')); } else window.scrollTo(0, document.body.scrollHeight); await fsPause(2000); } return { sondages: fsLireReponses(fsTableReponses()), attendu: attendu }; } async function passageForsta() { if (!/\\/apps\\/dashboard\\//.test(location.pathname)) { erreur('Ouvrez le rapport \u00ab Ventes et service apr\u00e8s-vente VoC \u00bb (Studio reports) dans Forsta, puis recliquez le signet.'); return; } var depart = fsPeriodeTexte(), mDepart = /(Pr\u00e9c\u00e9dent|Previous|Last)\\s*(\\d+)/i.exec(depart), nDepart = mDepart ? parseInt(mDepart[2], 10) : 0; var scores = [], nom = '', lu = null, rep = null, nS = 0; try { dire('page \u00ab R\u00e9f\u00e9rence \u00bb\u2026', 3); await fsReference(); for (var i = 0; i < FS_PERIODES.length; i++) { if (arrete) return; dire('scores \u00b7 ' + FS_PERIODES[i][0] + ' (Forsta recalcule la page)\u2026', 6 + 12 * i); await fsPeriode(FS_PERIODES[i][1]); lu = fsScores(FS_PERIODES[i][0]); nom = nom || lu.nom; scores = scores.concat(lu.scores); } if (!scores.length || !nom) throw new Error('aucun score lu dans la page \u00ab R\u00e9f\u00e9rence \u00bb de Forsta'); verifier(await envoyer({ action: 'csiImporter', source: 'bmw', vue: nom, nomConcession: nom, phase: 'scores', lignes: scores }), 'les scores'); rep = await fsReponses(); var lotsS = lots(rep.sondages, TAILLE_LOT); for (var k = 0; k < lotsS.length; k++) { if (arrete) return; verifier(await envoyer({ action: 'csiImporter', source: 'bmw', vue: nom, nomConcession: nom, phase: 'sondages', lignes: lotsS[k] }), 'un lot de r\u00e9ponses'); nS += lotsS[k].length; dire('r\u00e9ponses : ' + nS + ' / ' + rep.sondages.length + ' transmises', 82 + 14 * nS / Math.max(1, rep.sondages.length)); } } finally { try { if (!arrete) { dire('remise de la p\u00e9riode d\\'origine\u2026', 97); await fsPeriode(nDepart); } } catch (e) {} } var mtd = scores.filter(function (s) { return s.periode === 'MTD' && s.type !== 'combine'; }); dire('termin\u00e9 : ' + nom + ' \u2014 NPS ' + mtd.map(function (s) { return s.type + ' ' + (s.score === null ? '\u2014' : s.score) + (s.composites && s.composites.marquePrincipale ? ' (' + s.composites.marquePrincipale + ' ' + s.composites.marques[s.composites.marquePrincipale].score + ')' : ''); }).join(', ') + ' (mois en cours) \u00b7 3 et 12 mois lus aussi \u00b7 ' + nS + ' r\u00e9ponses sur 12 mois' + (rep && rep.attendu && nS < rep.attendu ? ' (sur ' + rep.attendu + ' annonc\u00e9es)' : '') + '. Voir l\\'onglet CSI sur le site.', 100); } (async function () { try { if (mode !== 'forsta') { erreur('Ce favori sert seulement au CSI BMW dans Forsta (horizons.confirmit.ca).'); return; } dire('ouverture du pont vers le site\u2026', 2); var p = await attendrePont(); if (!p.connecte) { erreur('Vous n\\'\u00eates pas connect\u00e9 au site d\\'inventaire dans ce navigateur : ouvrez ' + SITE + ' dans un onglet, connectez-vous, puis recliquez le signet.'); return; } await passageForsta(); window.__amxHyundai = false; fermerPontPlusTard(); } catch (e) { erreur('Arr\u00eat : ' + (e && e.message || e)); } })(); })();";
  var ECHELLES = { nps:{ nom: 'NPS', long: 'NPS (BoostCX)', ref: 'cible', refLong: 'cible du constructeur' }, npsc: { nom: 'NPS', long: 'NPS (Forsta)', ref: 'composite', refLong: 'composite de la marque' },index: { nom: 'Index', long: 'index de satisfaction (ISC InMoment)', ref: 'composite', refLong: 'composite de la marque' } };
  function echelleDe(s) { return ECHELLES[(s && s.echelle) || 'nps'] || ECHELLES.nps; }
  function compositeDe(s) { var c = s && s.composites; if (!c) return null; var m = c.marquePrincipale && c.marques && c.marques[c.marquePrincipale]; return m ? { nom: c.marquePrincipale, score: m.score, n: m.n, region: c.region } : (c.region ? { nom: 'Région', score: c.region.score, n: c.region.n, region: c.region } : null); }

  function nomCie(c) { return AMX.COMPAGNIES_TOUTES[c] || c || ''; }
  function pct(x, dec) { return x === null || x === undefined || isNaN(x) ? '—' : Number(x).toLocaleString('fr-CA', { minimumFractionDigits: dec === undefined ? 1 : dec, maximumFractionDigits: dec === undefined ? 1 : dec }) + ' %'; }
  function nb(x, dec) { return x === null || x === undefined || isNaN(x) ? '—' : Number(x).toLocaleString('fr-CA', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
  function signe(x, dec) { if (x === null || x === undefined || isNaN(x)) return '—'; var n = Number(x); return (n > 0 ? '+' : (n < 0 ? '−' : '')) + Math.abs(n).toLocaleString('fr-CA', { minimumFractionDigits: dec === undefined ? 1 : dec, maximumFractionDigits: dec === undefined ? 1 : dec }); }
  function isoJoursAvant(n) { var d = new Date(Date.now() - n * 86400000); return d.toISOString().slice(0, 10); }
  function classeNps(n) { if (n === null || n === undefined || isNaN(n)) return 'gris'; return n >= 9 ? 'vert' : (n >= 7 ? 'ambre' : 'rouge'); }
  function nomCourt(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
  // Entités HTML restées dans les sondages lus avant le 10 oct. (BoostCX renvoie &#xE9; dans les listes) ; jamais via innerHTML.
  function propre(t) { t = String(t === null || t === undefined ? '' : t); if (t.indexOf('&') < 0) return t; return t.replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); }).replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
  function commentaireDe(s) { var t = propre(s.commentaire).trim(); return /^(no comment|aucun commentaire|n\/a|-)$/i.test(t) ? '' : t; }
  function alerteOuverte(s) { var a = String(s.alerte || '').trim(); return !!a && a !== '-' && !/resolved|closed|fermé|résolu/i.test(a); }

  function injecterCss() {
    if (document.getElementById('css-csi')) return;
    var s = document.createElement('style'); s.id = 'css-csi';
    s.textContent = [
      '.csi-page .carte { margin-bottom: 14px; }',
      '.csi-page h1 .csi-h1-sous { display: block; font-size: 12.5px; font-weight: 400; color: var(--encre-3); letter-spacing: 0; margin-top: 2px; }',
      '.csi-page .csi-neg { color: var(--rouge); } .csi-page .csi-pos { color: var(--vert); } .csi-page tr.csi-actuelle td { background: var(--vert-clair); }',
      '.csi-page .csi-sous-titre { font-size: 13px; font-weight: 600; margin: 0 0 6px; }',
      '.csi-page .carte-entete h2 { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; } .csi-page .carte-entete h2 .sous { font-weight: 400; font-size: 12px; color: var(--encre-3); }',
      '.csi-page .carte-entete { flex-wrap: wrap; } .csi-page .csi-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }',
      '.csi-scores { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; margin-bottom: 14px; }',
      '.csi-score { background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); box-shadow: var(--ombre); padding: 12px 14px; position: relative; overflow: hidden; }',
      '.csi-score::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--ligne-forte); } .csi-score.vert::before { background: var(--vert); } .csi-score.rouge::before { background: var(--rouge); } .csi-score.gris::before { background: var(--ligne-forte); }',
      '.csi-score .nom { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); }',
      '.csi-score .val { font-size: 30px; font-weight: 700; line-height: 1.1; margin: 4px 0 2px; font-variant-numeric: tabular-nums; } .csi-score .val small { font-size: 13px; font-weight: 600; margin-left: 8px; } .csi-score.vert .val small { color: var(--vert); } .csi-score.rouge .val small { color: var(--rouge); }',
      '.csi-score .comp { display: flex; gap: 10px; font-size: 12px; color: var(--encre-2); margin-top: 6px; flex-wrap: wrap; } .csi-score .comp b { display: block; font-size: 14px; } .csi-score .comp span { min-width: 54px; }',
      '.csi-score .rangs { font-size: 11.5px; color: var(--encre-3); margin-top: 6px; line-height: 1.5; }',
      '.csi-repartition { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--gris-bg); margin-top: 8px; } .csi-repartition i { display: block; height: 100%; } .csi-repartition .vert { background: var(--vert); } .csi-repartition .ambre { background: var(--ambre); } .csi-repartition .rouge { background: var(--rouge); }',
      '.csi-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; } .csi-kpis h3 { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin: 0 0 8px; }',
      '.csi-kpi { display: grid; grid-template-columns: 1fr 120px 64px; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--ligne); font-size: 12.5px; } .csi-kpi:last-child { border-bottom: 0; }',
      '.csi-kpi .csi-jauge { height: 10px; background: var(--gris-bg); border-radius: 5px; overflow: hidden; position: relative; } .csi-kpi .csi-jauge i { display: block; height: 100%; background: var(--vert); } .csi-kpi .csi-jauge i.sous { background: var(--rouge); } .csi-kpi .csi-jauge b { position: absolute; top: -2px; width: 2px; height: 14px; background: var(--encre); }',
      '.csi-kpi .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; } .csi-kpi .num small { display: block; font-weight: 400; color: var(--encre-3); font-size: 11px; }',
      '.csi-page .tableau td.num, .csi-page .tableau th.num { text-align: right; font-variant-numeric: tabular-nums; } .csi-page .csi-defilant { overflow-x: auto; } .csi-page .tableau td.date, .csi-page .tableau .mini { white-space: nowrap; }',
      '.csi-page .badge.nps { min-width: 28px; justify-content: center; font-weight: 700; }',
      '.csi-commentaire { font-size: 12.5px; line-height: 1.45; color: var(--encre-2); max-width: 520px; }',
      '.csi-page .vide { border: none; background: transparent; padding: 28px 16px; }',
      '@media (max-width: 760px) { .csi-kpi { grid-template-columns: 1fr 80px 56px; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ Calculs ------------------------------ */
  // Sondages → par personne : n, moyenne, promoteurs (9-10), passifs (7-8), détracteurs (0-6), alertes.
  function parPersonne(sondages, champ) {
    var par = {};
    sondages.forEach(function (s) {
      var k = nomCourt(propre(s[champ])) || '(non indiqué)';
      var p = par[k] || (par[k] = { nom: k, n: 0, somme: 0, prom: 0, pass: 0, detr: 0, alertes: 0, commentaires: 0 });
      if (s.nps !== null && s.nps !== undefined && !isNaN(s.nps)) { p.n++; p.somme += s.nps; if (s.nps >= 9) p.prom++; else if (s.nps >= 7) p.pass++; else p.detr++; }
      if (alerteOuverte(s)) p.alertes++;
      if (commentaireDe(s)) p.commentaires++;
    });
    return Object.keys(par).map(function (k) { var p = par[k]; p.moyenne = p.n ? p.somme / p.n : null; p.pctProm = p.n ? 100 * p.prom / p.n : null; p.pctDetr = p.n ? 100 * p.detr / p.n : null; p.nps = p.n ? p.pctProm - p.pctDetr : null; return p; }).sort(function (a, b) { return b.n - a.n || (b.pctProm || 0) - (a.pctProm || 0); });
  }
  function resume(sondages) { return parPersonne(sondages.map(function (s) { return Object.assign({}, s, { tous: 'tous' }); }), 'tous')[0] || { n: 0, moyenne: null, pctProm: null, pctDetr: null, nps: null, alertes: 0, prom: 0, pass: 0, detr: 0 }; }

  /* ------------------------------ Section ------------------------------ */
  AMX.section('csi', {
    titre: 'CSI', icone: 'csi', ordre: 47,
    visible: function () { return AMX.perm('voirResultats') || AMX.estAdmin(); },
    monter: function (conteneur, ctx) { return new Csi(conteneur, ctx); }
  });

  function Csi(conteneur, ctx) {
    injecterCss();
    var self = this;
    this.conteneur = conteneur; this.generation = 0; this.detruit = false;
    this.donnees = null; this.erreur = ''; this.enChargement = false;
    this.compagnie = AMX.compagnieChoisie('resultats') || '';
    this.periode = AMX.memo.lire('csi_periode', 'MTD'); if (!PERIODES.some(function (p) { return p[0] === self.periode; })) this.periode = 'MTD';
    this.type = AMX.memo.lire('csi_type', 'ventes'); if (!TYPES.some(function (t) { return t[0] === self.type; })) this.type = 'ventes';
    this.fenetre = parseInt(AMX.memo.lire('csi_fenetre', '90'), 10) || 90;
    this.recherche = '';
    this.construire();
    this.charger(false);
    this.surProfil = function () { if (!self.detruit) { self.compagnie = AMX.compagnieChoisie('resultats') || ''; self.rendre(); } };
    document.addEventListener('amx:compagnie', this.surProfil);
  }
  Csi.prototype.demonter = function () { this.detruit = true; this.generation++; document.removeEventListener('amx:compagnie', this.surProfil); };

  Csi.prototype.construire = function () {
    var self = this;
    this.elEtat = h('p', { text: 'Chargement du CSI…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.elSites = h('span', { style: { display: 'inline-flex', gap: '6px', flexWrap: 'wrap' } });
    this.btnExport = h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.elChoix = h('div.barre-cies');   /* 16 oct. : même rangée de concessions que partout */
    this.elComparaison = h('div.carte');
    this.elScores = h('div.csi-scores');
    this.elKpis = h('div.carte');
    this.elPersonnes = h('div.carte');
    this.elSondages = h('div.carte');
    this.elVide = h('div');
    this.el = h('div.page.etroite.csi-page', [
      h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', ['CSI', h('span.csi-h1-sous', { text: 'Satisfaction client déclarée au constructeur — ventes et service, comparée au composite de la marque' })]), this.elEtat]), h('div.actions', [this.elSites, this.btnRafraichir, this.btnExport])]),
      this.elChoix, this.elVide, this.elComparaison, this.elScores, this.elKpis, this.elPersonnes, this.elSondages
    ]);
    this.conteneur.appendChild(this.el);
  };

  Csi.prototype.charger = function (manuel) {
    var self = this, gen = ++this.generation;
    this.enChargement = true;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    if (!this.donnees) {
      AMX.vider(this.elScores); this.elScores.appendChild(AMX.chargeur('CSI'));
      /* 16 oct. (Google lent) : la dernière copie du navigateur s'affiche tout de suite, le serveur corrige ensuite */
      AMX.cacheLocal.lireGz('csi', 7 * 86400000).then(function (o) { if (self.detruit || gen !== self.generation || self.donnees || !o || !o.donnees || !o.donnees.scores) return; self.donnees = o.donnees; self.copieLe = o.quand; self.erreur = ''; self.rendre(); }).catch(function () {});
    }
    return AMX.get({ csi: 1 }, { copie: 'csi', secours: false }).then(function (d) {
      if (self.detruit || gen !== self.generation) return;
      self.enChargement = false; self.btnRafraichir.classList.remove('occupe');
      if (!d || d.refuse) throw new Error((d && (d.erreur || d.message)) || 'Accès refusé.');
      if (d.ok === false) throw new Error(d.erreur || 'Réponse inattendue du serveur');
      self.donnees = d; self.erreur = ''; self.copieLe = 0;
      self.rendre();
      if (manuel) AMX.toast('CSI mis à jour — ' + self.sondagesVisibles().length + ' sondage' + (self.sondagesVisibles().length > 1 ? 's' : ''), 'ok');
    }, function (e) {
      if (self.detruit || gen !== self.generation) return;
      self.enChargement = false; self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e); self.rendre();
      AMX.toast((self.donnees ? 'CSI : mise à jour impossible (copie du navigateur affichée) — ' : 'Impossible de charger le CSI — ') + self.erreur, 'erreur');
    });
  };

  Csi.prototype.scoresVisibles = function () { var c = this.compagnie; return ((this.donnees || {}).scores || []).filter(function (s) { return !c || s.compagnie === c; }); };
  Csi.prototype.sondagesVisibles = function () { var c = this.compagnie; return ((this.donnees || {}).sondages || []).filter(function (s) { return !c || s.compagnie === c; }); };
  Csi.prototype.compagniesLues = function () { var e = (this.donnees || {}).etats || {}; return Object.keys(e).filter(function (k) { return e[k] && e[k].csiLe; }); };

  Csi.prototype.rendre = function () {
    var self = this;
    AMX.vider(this.elChoix); AMX.vider(this.elVide);
    var d = this.donnees;
    var compte = function (c) {
      var n = ((d && d.sondages) || []).filter(function (s) { return !c || s.compagnie === c; }).length;
      if (n) return n;
      // Pas de sondages détaillés (GM) : le nombre de sondages des scores sur 12 mois
      return ((d && d.scores) || []).filter(function (s) { return (!c || s.compagnie === c) && s.periode === '12M' && (s.type === 'ventes' || s.type === 'service'); }).reduce(function (a, s) { return a + (s.sondages || 0); }, 0);
    };
    AMX.barreConcessions(this.elChoix, { domaine: 'resultats', valeur: this.compagnie, compte: compte, onchange: function (c) { self.compagnie = c; self.rendre(); } });
    if (this.erreur && !d) { this.elEtat.textContent = 'Serveur injoignable.'; this.elVide.appendChild(h('div.vide', [h('div', { html: I.alerte }), h('h3', 'Serveur injoignable'), h('div', { text: this.erreur })])); [this.elComparaison, this.elScores, this.elKpis, this.elPersonnes, this.elSondages].forEach(function (el) { AMX.vider(el); el.classList.add('cache'); }); return; }
    if (!d) return;
    var lues = this.compagniesLues().filter(function (c) { return !self.compagnie || c === self.compagnie; });
    if (!lues.length && !this.sondagesVisibles().length) {
      this.elEtat.textContent = 'Aucune lecture du CSI pour l\'instant' + (this.compagnie ? ' — ' + nomCie(this.compagnie) : '') + '.';
      this.elVide.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Pas encore de données CSI'), h('div', { text: 'Ouvrez le site CSI du constructeur (bouton en haut : BoostCX pour Hyundai, ISC InMoment pour GM), connecté, et cliquez-y le favori « Automax ← Constructeur » — il se trouve dans Inventaire › Neufs › Portail du constructeur. Les scores, le composite de la marque et les sondages arrivent ici en une à trois minutes.' })]));
      [this.elComparaison, this.elScores, this.elKpis, this.elPersonnes, this.elSondages].forEach(function (el) { AMX.vider(el); el.classList.add('cache'); });
      return;
    }
    var etats = d.etats || {};
    var nS = this.sondagesVisibles().length;
    this.elEtat.textContent = (this.copieLe ? 'Copie du ' + AMX.copieTexte(this.copieLe) + (this.erreur ? ' — mise à jour impossible : ' + this.erreur : ' — mise à jour en cours…') + ' · ' : '') + lues.map(function (c) { return nomCie(c) + ' — lu le ' + AMX.fmtDate(etats[c].csiLe, true) + (etats[c].csiPar ? ' par ' + String(etats[c].csiPar).split('@')[0] : ''); }).join(' · ') + (nS ? ' · ' + nS + ' sondages sur 12 mois' : '');
    this.rendreSites();
    [this.elComparaison, this.elScores, this.elKpis, this.elPersonnes, this.elSondages].forEach(function (el) { el.classList.remove('cache'); });
    this.rendreComparaison();
    this.rendreScores();
    this.rendreKpis();
    var sansSondages = !nS;
    this.elPersonnes.classList.toggle('cache', sansSondages); this.elSondages.classList.toggle('cache', sansSondages);
    if (!sansSondages) { this.rendrePersonnes(); this.rendreSondages(); }
  };

  Csi.prototype.scoreDe = function (type, periode) {
    // Une ligne sans score ni sondage est un rapport que le constructeur n'a pas produit (ex. InMoment resté en file) : on la traite comme non lue.
    var liste = this.scoresVisibles().filter(function (s) { return s.type === type && s.periode === periode && !((s.score === null || s.score === undefined) && !s.sondages); });
    if (liste.length <= 1) return liste[0] || null;
    // Plusieurs concessions : on garde la plus récente par concession, puis la moyenne pondérée par le nombre de sondages.
    var tot = 0, poids = 0; liste.forEach(function (s) { if (s.score !== null) { var w = s.sondages || 1; tot += s.score * w; poids += w; } });
    var echelles = {}; liste.forEach(function (s) { echelles[(s.echelle || 'nps')] = true; });
    if (Object.keys(echelles).length > 1) return Object.assign({}, liste[0], { score: null, cibleEcart: null, district: null, zone: null, national: null, sondages: liste.reduce(function (a, s) { return a + (s.sondages || 0); }, 0), rangDistrict: '', rangZone: '', rangNational: '', kpis: [], composites: null, multi: liste.length, mixte: true });
    return Object.assign({}, liste[0], { score: poids ? tot / poids : null, sondages: liste.reduce(function (a, s) { return a + (s.sondages || 0); }, 0), rangDistrict: '', rangZone: '', rangNational: '', multi: liste.length });
  };

  /* Liens vers les sites CSI des concessions visibles (BoostCX, ISC InMoment). */
  Csi.prototype.rendreSites = function () {
    var self = this; AMX.vider(this.elSites);
    var vus = {};
    (this.compagnie ? [this.compagnie] : AMX.codesPour('resultats')).forEach(function (c) {
      var site = SITES_CSI[c]; if (!site || vus[site.url]) return; vus[site.url] = true;
      var a = h('a.btn', { href: site.url, target: '_blank', rel: 'noopener', html: I.externe + '<span>' + site.nom + '</span>', title: 'Ouvre ' + site.nom + ' : cliquez-y le favori « Automax ← Constructeur » (Inventaire › Neufs › Portail du constructeur) pour mettre le CSI à jour.' });
      a.addEventListener('click', function () { AMX.toast('Sur ' + site.nom + ', connecté, cliquez le favori « Automax ← Constructeur », puis revenez ici : Rafraîchir.', 'attention', 8000); });
      self.elSites.appendChild(a);
    });
    if (vus[SITES_CSI.BMW.url] && CODE_SIGNET_FORSTA) {
      var signet = h('a.btn.noprint', { href: CODE_SIGNET_FORSTA, text: 'Automax ← CSI BMW', title: 'Glissez ce bouton dans la barre de favoris de Chrome, puis cliquez-le dans Forsta, sur le rapport « Ventes et service après-vente VoC ».', draggable: 'true' });
      signet.addEventListener('click', function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B pour l\'afficher), puis cliquez-le dans Forsta, sur le rapport « Ventes et service après-vente VoC ».', 'attention', 9000); });
      self.elSites.appendChild(signet);
    }
  };

  /* Comparaison des concessions : score ventes / service vs composite de la marque (ou cible), écart, sondages, recommandation. */
  Csi.prototype.rendreComparaison = function () {
    var self = this, p = this.periode;
    AMX.vider(this.elComparaison);
    var scores = ((this.donnees || {}).scores || []).filter(function (s) { return s.periode === p; });
    var cies = {}; scores.forEach(function (s) { cies[s.compagnie] = true; });
    var liste = Object.keys(cies);
    this.elComparaison.classList.toggle('cache', liste.length < 2 && !!this.compagnie);
    if (liste.length < 2 && this.compagnie) return;
    var ligne = function (c) {
      var v = scores.filter(function (s) { return s.compagnie === c && s.type === 'ventes'; })[0] || null, sv = scores.filter(function (s) { return s.compagnie === c && s.type === 'service'; })[0] || null;
      var e = echelleDe(v || sv), cv = compositeDe(v), cs = compositeDe(sv);
      return { compagnie: c, echelle: e, ventes: v, service: sv, refV: v ? (cv ? cv.score : (v.national !== null && v.national !== undefined ? v.national : null)) : null, refS: sv ? (cs ? cs.score : (sv.national !== null && sv.national !== undefined ? sv.national : null)) : null, nomRefV: cv ? 'composite ' + cv.nom : (v && v.echelle === 'index' ? 'composite' : 'national'), nomRefS: cs ? 'composite ' + cs.nom : (sv && sv.echelle === 'index' ? 'composite' : 'national'), ecartV: v ? v.cibleEcart : null, ecartS: sv ? sv.cibleEcart : null, sondages: ((v && v.sondages) || 0) + ((sv && sv.sondages) || 0), reco: v && v.recommandation !== null && v.recommandation !== undefined ? v.recommandation : (v && v.promoteurs !== null && v.promoteurs !== undefined ? v.promoteurs : null) };
    };
    var lignes = liste.map(ligne).sort(function (a, b) { return ((b.ecartV === null ? -999 : b.ecartV) - (a.ecartV === null ? -999 : a.ecartV)); });
    var cellule = function (score, ref, ecart, nomRef, e) {
      if (score === null || score === undefined) return h('td.num', { text: '—' });
      var cls = ecart === null || ecart === undefined ? '' : (ecart >= 0 ? '.csi-pos' : '.csi-neg');
      return h('td.num', [h('b', { text: nb(score, 1) }), ref !== null && ref !== undefined ? h('div.mini', { text: nomRef + ' ' + nb(ref, 1) }) : null, ecart !== null && ecart !== undefined ? h('div.mini' + cls, { text: signe(ecart) + ' pt' + (Math.abs(ecart) >= 2 ? 's' : '') }) : null]);
    };
    this.elComparaison.appendChild(h('div.carte-entete', [h('h2', ['Comparaison des concessions', h('span.sous', { text: (PERIODES.filter(function (x) { return x[0] === p; })[0] || [])[1].toLowerCase() + ' · chaque concession est mesurée sur l\'échelle de son constructeur (NPS Hyundai, NPS BMW, index GM) : on compare l\'écart au composite de la marque, pas les scores entre eux' })])]));
    this.elComparaison.appendChild(h('div.carte-corps', [h('div.csi-defilant', [h('table.tableau', [
      h('thead', [h('tr', [h('th', 'Concession'), h('th', 'Échelle'), h('th.num', 'Ventes'), h('th.num', 'Service'), h('th.num', 'Sondages'), h('th.num', 'Recommandation')])]),
      h('tbody', lignes.map(function (l) {
        return h('tr', { className: l.compagnie === self.compagnie ? 'csi-actuelle' : '' }, [
          h('td', [h('b', { text: nomCie(l.compagnie) })]),
          h('td', { text: l.echelle.long }),
          cellule(l.ventes ? l.ventes.score : null, l.refV, l.ecartV, l.nomRefV, l.echelle),
          cellule(l.service ? l.service.score : null, l.refS, l.ecartS, l.nomRefS, l.echelle),
          h('td.num', { text: l.sondages ? nb(l.sondages) : '—' }),
          h('td.num', { text: l.reco === null ? '—' : pct(l.reco, 1) + (l.echelle.nom === 'NPS' ? ' de 9-10' : ' recommandent') })
        ]);
      }))
    ])])]));
  };

  Csi.prototype.rendreScores = function () {
    var self = this;
    AMX.vider(this.elScores);
    var seg = h('div.segment', { role: 'group', 'aria-label': 'Période' }, PERIODES.map(function (p) {
      return h('button' + (p[0] === self.periode ? '.actif' : ''), { type: 'button', text: p[1], onclick: function () { if (p[0] === self.periode) return; self.periode = p[0]; AMX.memo.ecrire('csi_periode', p[0]); self.rendreScores(); self.rendreKpis(); } });
    }));
    var premier = this.scoreDe('ventes', this.periode) || this.scoreDe('service', this.periode), eGlobal = echelleDe(premier);
    this.elScores.appendChild(h('div', { style: { gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } }, [h('span.doux.petit', { text: 'Scores ' + (premier && premier.mixte ? 'de plusieurs constructeurs' : eGlobal.long) + ' — ' + (PERIODES.filter(function (p) { return p[0] === self.periode; })[0] || [])[1].toLowerCase() }), seg]));
    var cartes = [['ventes', 'ventes'], ['service', 'service'], ['combine', 'combiné']];
    cartes.forEach(function (c) {
      var s = self.scoreDe(c[0], self.periode), e = echelleDe(s || premier);   /* carte vide : on garde l'échelle de la concession, pas « NPS » par défaut */
      if (!s || s.mixte) { if (c[0] === 'combine' && premier && premier.echelle === 'index') return; self.elScores.appendChild(h('div.csi-score.gris', [h('div.nom', { text: e.nom + ' ' + c[1] }), h('div.val', { text: '—' }), h('div.rangs', { text: s && s.mixte ? 'échelles différentes selon le constructeur : choisissez une concession' : 'pas lu pour cette période' })])); return; }
      var ecart = s.cibleEcart, cls = ecart === null || ecart === undefined ? 'gris' : (ecart >= 0 ? 'vert' : 'rouge');
      var tot = (s.promoteurs || 0) + (s.passifs || 0) + (s.detracteurs || 0);
      var comp = compositeDe(s);
      var colonnes = comp ? [h('span', [h('b', { text: nb(comp.score, 1) }), 'Composite ' + comp.nom]), comp.region ? h('span', [h('b', { text: nb(comp.region.score, 1) }), 'Région']) : null, s.recommandation !== null && s.recommandation !== undefined ? h('span', [h('b', { text: pct(s.recommandation, 1) }), 'Recommandent']) : null] : [h('span', [h('b', { text: nb(s.district, 1) }), 'District']), h('span', [h('b', { text: nb(s.zone, 1) }), 'Zone']), h('span', [h('b', { text: nb(s.national, 1) }), 'National'])];
      self.elScores.appendChild(h('div.csi-score.' + cls, [
        h('div.nom', { text: e.nom + ' ' + c[1] + (s.multi ? ' · ' + s.multi + ' concessions' : '') }),
        h('div.val', [nb(s.score, 1), ecart !== null && ecart !== undefined ? h('small', { text: signe(ecart) + ' pt' + (Math.abs(ecart) >= 2 ? 's' : '') + ' vs ' + e.ref, title: 'Écart par rapport ' + (e.ref === 'cible' ? 'à la cible du constructeur' : 'au composite de la marque (toutes les concessions de la marque dans la région)') }) : null]),
        h('div.comp', colonnes),
        h('div.rangs', { text: [s.rangDistrict ? 'District ' + s.rangDistrict : '', s.rangZone ? 'zone ' + s.rangZone : '', s.rangNational ? 'national ' + s.rangNational : '', s.changement !== null && s.changement !== undefined ? 'variation ' + signe(s.changement) : '', s.sondages !== null && s.sondages !== undefined ? nb(s.sondages) + ' sondage' + (s.sondages > 1 ? 's' : '') : '', s.tauxReponse !== null && s.tauxReponse !== undefined ? 'réponse ' + pct(s.tauxReponse) : '', comp && comp.n ? 'composite sur ' + nb(comp.n) + ' sondages' : '', s.nps !== null && s.nps !== undefined ? 'NPS ' + nb(s.nps, 1) : ''].filter(Boolean).join(' · ') }),
        tot ? h('div.csi-repartition', { title: 'Promoteurs ' + pct(s.promoteurs) + ' · passifs ' + pct(s.passifs) + ' · détracteurs ' + pct(s.detracteurs) }, [h('i.vert', { style: { width: (100 * (s.promoteurs || 0) / tot) + '%' } }), h('i.ambre', { style: { width: (100 * (s.passifs || 0) / tot) + '%' } }), h('i.rouge', { style: { width: (100 * (s.detracteurs || 0) / tot) + '%' } })]) : null
      ]));
    });
  };

  Csi.prototype.rendreKpis = function () {
    var self = this;
    AMX.vider(this.elKpis);
    var cols = [['ventes', 'Questions clés — ventes'], ['service', 'Questions clés — service']].map(function (c) {
      var s = self.scoreDe(c[0], self.periode), kpis = (s && s.kpis) || [], e = echelleDe(s), ref = e.ref === 'cible' ? 'Cible' : 'Composite';
      return h('div', [h('h3', { text: c[1] }), kpis.length ? h('div', kpis.map(function (k) {
        var v = k.valeur, cible = k.cible, sous = v !== null && cible !== null && v < cible, dec = e.ref === 'cible' ? 0 : 1;
        return h('div.csi-kpi', [
          h('div', { text: k.titre + (k.n ? ' · n = ' + k.n : '') }),
          h('div.csi-jauge', [h('i' + (sous ? '.sous' : ''), { style: { width: Math.max(0, Math.min(100, v || 0)) + '%' } }), cible !== null && cible !== undefined ? h('b', { style: { left: Math.max(0, Math.min(100, cible)) + '%' }, title: ref + ' ' + pct(cible, dec) }) : null]),
          h('div.num', [pct(v, 1), h('small', { text: (cible !== null && cible !== undefined ? ref.toLowerCase() + ' ' + pct(cible, dec) : '') + (k.changement !== null && k.changement !== undefined ? ' · ' + signe(k.changement) : '') })])
        ]);
      })) : h('p.doux.petit', 'pas de KPI lu pour cette période')]);
    });
    var eK = echelleDe(this.scoreDe('ventes', this.periode) || this.scoreDe('service', this.periode));
    this.elKpis.appendChild(h('div.carte-entete', [h('h2', ['Questions clés du constructeur', h('span.sous', { text: 'part des clients satisfaits par question, ' + eK.refLong + ' (trait)' + (eK.ref === 'cible' ? ', variation vs période précédente' : '') })])]));
    this.elKpis.appendChild(h('div.carte-corps', [h('div.csi-kpis', cols)]));
  };

  Csi.prototype.sondagesFenetre = function () {
    var depuis = isoJoursAvant(this.fenetre), t = this.type;
    return this.sondagesVisibles().filter(function (s) { return s.type === t && String(s.completeLe || s.dateRdr || '') >= depuis; });
  };

  Csi.prototype.rendrePersonnes = function () {
    var self = this;
    AMX.vider(this.elPersonnes);
    var segType = h('div.segment', { role: 'group', 'aria-label': 'Type de sondage' }, TYPES.map(function (t) { return h('button' + (t[0] === self.type ? '.actif' : ''), { type: 'button', text: t[1], onclick: function () { if (t[0] === self.type) return; self.type = t[0]; AMX.memo.ecrire('csi_type', t[0]); self.rendrePersonnes(); self.rendreSondages(); } }); }));
    var segFen = h('div.segment', { role: 'group', 'aria-label': 'Fenêtre' }, FENETRES.map(function (f) { return h('button' + (f[0] === self.fenetre ? '.actif' : ''), { type: 'button', text: f[1], onclick: function () { if (f[0] === self.fenetre) return; self.fenetre = f[0]; AMX.memo.ecrire('csi_fenetre', String(f[0])); self.rendrePersonnes(); self.rendreSondages(); } }); }));
    var liste = this.sondagesFenetre(), r = resume(liste);
    var service = this.type === 'service';
    this.elPersonnes.appendChild(h('div.carte-entete', [
      h('h2', ['Par ' + (service ? 'aviseur' : 'conseiller'), h('span.sous', { text: liste.length + ' sondage' + (liste.length > 1 ? 's' : '') + ' · note moyenne ' + nb(r.moyenne, 1) + ' / 10 · ' + pct(r.pctProm, 0) + ' de 9-10 · ' + pct(r.pctDetr, 0) + ' de 0-6' + (r.alertes ? ' · ' + r.alertes + ' alerte' + (r.alertes > 1 ? 's' : '') + ' ouverte' + (r.alertes > 1 ? 's' : '') : '') })]),
      h('div.csi-actions', [segType, segFen])
    ]));
    var corps = h('div.carte-corps');
    if (!liste.length) { corps.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucun sondage'), h('div', { text: 'Aucun sondage ' + (service ? 'service' : 'ventes') + ' dans cette fenêtre.' })])); this.elPersonnes.appendChild(corps); return; }
    var table = function (titre, champ) {
      var lignes = parPersonne(liste, champ);
      return h('div', { style: { marginBottom: '14px' } }, [
        h('h3.csi-sous-titre', { text: titre }),
        h('div.csi-defilant', [h('table.tableau', [
          h('thead', [h('tr', [h('th', 'Nom'), h('th.num', 'Sondages'), h('th.num', 'Moyenne / 10'), h('th.num', '9-10'), h('th.num', '7-8'), h('th.num', '0-6'), h('th.num', 'NPS'), h('th.num', 'Alertes')])]),
          h('tbody', lignes.map(function (p) {
            return h('tr', [
              h('td', [h('b', { text: p.nom }), p.commentaires ? h('span.doux.petit', { text: ' · ' + p.commentaires + ' commentaire' + (p.commentaires > 1 ? 's' : '') }) : null]),
              h('td.num', { text: String(p.n) }),
              h('td.num', [h('span.badge.sans-point.' + classeNps(p.moyenne), { text: nb(p.moyenne, 1) })]),
              h('td.num', { text: p.n ? p.prom + ' (' + Math.round(p.pctProm) + ' %)' : '—' }),
              h('td.num', { text: p.n ? String(p.pass) : '—' }),
              h('td.num' + (p.detr ? '.csi-neg' : ''), { text: p.n ? p.detr + ' (' + Math.round(p.pctDetr) + ' %)' : '—' }),
              h('td.num', { text: p.nps === null ? '—' : signe(p.nps, 0) }),
              h('td.num' + (p.alertes ? '.csi-neg' : ''), { text: p.alertes ? String(p.alertes) : '' })
            ]);
          }))
        ])])
      ]);
    };
    corps.appendChild(table(service ? 'Aviseurs service' : 'Conseillers aux ventes', 'conseiller'));
    corps.appendChild(table(service ? 'Techniciens' : 'Directeurs commerciaux (F&I)', service ? 'directeurVentes' : 'directeurFI'));
    if (!service) corps.appendChild(table('Directeurs des ventes', 'directeurVentes'));
    corps.appendChild(h('p.doux.petit', { style: { margin: '4px 0 0' }, text: 'NPS = % de 9-10 moins % de 0-6 (échelle 0-10 du sondage). Le score BoostCX en haut est celui du constructeur ; ici, le détail par personne vient des sondages lus.' }));
    this.elPersonnes.appendChild(corps);
  };

  Csi.prototype.rendreSondages = function () {
    var self = this;
    AMX.vider(this.elSondages);
    var liste = this.sondagesFenetre(), q = this.recherche.trim().toLowerCase();
    var recherche = h('input.saisie', { type: 'search', placeholder: 'Client, conseiller, commentaire, NIV…', value: this.recherche, autocomplete: 'off', style: { height: '30px', width: '240px' }, oninput: AMX.debounce(function (e) { self.recherche = e.target.value; self.rendreSondages(); }, 150) });
    var filtres = liste.filter(function (s) { return !q || propre([s.client, s.conseiller, s.directeurVentes, s.directeurFI, s.commentaire, s.vin, s.modele, s.alerte].join(' ')).toLowerCase().indexOf(q) >= 0; });
    var alertes = filtres.filter(alerteOuverte), avecComm = filtres.filter(function (s) { return commentaireDe(s); });
    this.elSondages.appendChild(h('div.carte-entete', [
      h('h2', ['Sondages', h('span.sous', { text: filtres.length + ' affiché' + (filtres.length > 1 ? 's' : '') + ' · ' + alertes.length + ' alerte' + (alertes.length > 1 ? 's' : '') + ' ouverte' + (alertes.length > 1 ? 's' : '') + ' · ' + avecComm.length + ' avec commentaire' })]),
      h('div.csi-actions', [recherche])
    ]));
    var corps = h('div.carte-corps');
    if (!filtres.length) { corps.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucun sondage'), h('div', 'Rien dans cette fenêtre.')])); this.elSondages.appendChild(corps); return; }
    var service = this.type === 'service';
    var tri = alertes.concat(filtres.filter(function (s) { return !alerteOuverte(s); })).slice(0, 200);
    corps.appendChild(h('div.csi-defilant', [h('table.tableau', [
      h('thead', [h('tr', [h('th', 'Date'), h('th', 'Client'), h('th', 'Véhicule'), h('th', service ? 'Aviseur · technicien' : 'Conseiller · F&I'), h('th.num', 'NPS'), h('th', 'Commentaire'), h('th', 'Alerte')])]),
      h('tbody', tri.map(function (s) {
        return h('tr', [
          h('td.date', { text: s.completeLe ? AMX.fmtDate(s.completeLe) : '—', title: s.dateRdr ? (service ? 'RO du ' : 'Livré le ') + AMX.fmtDate(s.dateRdr) : null }),
          h('td', [h('div', { text: nomCourt(propre(s.client)) || '—' }), s.courriel ? h('div.mini', { text: s.courriel }) : null]),
          h('td', [h('div', { text: [s.annee, s.modele].filter(Boolean).join(' ') || '—' }), s.vin ? h('div.mini.mono', { text: s.vin }) : (s.reference ? h('div.mini', { text: 'RO ' + String(s.reference).replace(/^RO\s*/i, '') + (s.montant ? ' · ' + AMX.fmtArgent(s.montant, 0) : '') }) : null)]),
          h('td', [h('div', { text: nomCourt(propre(s.conseiller)) || '—' }), h('div.mini', { text: nomCourt(propre(service ? s.directeurVentes : s.directeurFI)) })]),
          h('td.num', [h('span.badge.sans-point.nps.' + classeNps(s.nps), { text: s.nps === null || s.nps === undefined ? '—' : String(s.nps) })]),
          h('td', [h('div.csi-commentaire', { text: commentaireDe(s) })]),
          h('td', [alerteOuverte(s) ? h('span.badge.rouge', { text: s.alerte }) : (s.alerte ? h('span.badge.gris', { text: s.alerte }) : '')])
        ]);
      }))
    ])]));
    if (filtres.length > 200) corps.appendChild(h('p.doux.petit', { text: 'Les 200 premiers (alertes d\'abord). Précisez la recherche ou exportez en Excel.' }));
    this.elSondages.appendChild(corps);
  };

  Csi.prototype.exporter = function () {
    var liste = this.sondagesVisibles();
    if (!liste.length && !this.scoresVisibles().length) { AMX.toast('Rien à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var rows = liste.map(function (s) { return { 'Concession': nomCie(s.compagnie), 'Type': s.type === 'service' ? 'Service' : 'Ventes', 'Sondage': s.id, 'Complété le': s.completeLe, 'Client': s.client, 'Courriel': s.courriel, 'NPS': s.nps, 'Conseiller / aviseur': s.conseiller, 'Directeur des ventes / technicien': s.directeurVentes, 'Directeur commercial (F&I)': s.directeurFI, 'NIV': s.vin, 'Modèle': s.modele, 'Année': s.annee, 'Livré / RO le': s.dateRdr, 'RO': s.reference, 'Montant RO': s.montant, 'Alerte': s.alerte, 'Commentaire': commentaireDe(s), 'Invitation le': s.invitationLe }; });
    var scores = this.scoresVisibles().map(function (s) { return { 'Concession': nomCie(s.compagnie), 'Période': s.periode, 'Type': s.type, 'Score': s.score, 'Écart cible': s.cibleEcart, 'District': s.district, 'Zone': s.zone, 'National': s.national, 'Rang district': s.rangDistrict, 'Rang zone': s.rangZone, 'Rang national': s.rangNational, 'Variation': s.changement, 'Sondages': s.sondages, 'Taux de réponse': s.tauxReponse, 'Promoteurs': s.promoteurs, 'Passifs': s.passifs, 'Détracteurs': s.detracteurs, 'Échelle': s.echelle || 'nps', 'NPS (recommandation)': s.nps, 'Recommandent %': s.recommandation, 'Composite marque': (compositeDe(s) || {}).score, 'Composite région': (compositeDe(s) && compositeDe(s).region ? compositeDe(s).region.score : null), 'Lu le': s.luLe }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scores), 'Scores');
    if (rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Sondages');
    XLSX.writeFile(wb, 'csi-' + (this.compagnie || 'groupe').toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export Excel — ' + scores.length + ' scores' + (rows.length ? ', ' + rows.length + ' sondage' + (rows.length > 1 ? 's' : '') : ''), 'ok');
  };
})();
