/* =====================================================================================================
   employes.js — Outils › Ressources humaines › Dossiers des employés (7 nov. 2026)

   Maxime : « on fait seulement dossier employé et santé sécurité, et oublie pas, ça va être pour toutes les concessions » ;
   ScanAutomax remplace HR4. Accès : la RH (droit « Ressources humaines ») et les propriétaires voient tout le groupe ;
   un DG (administrateur de concession) voit les employés de SA concession. Personne d'autre.
   - Données : GET ?employes=1, ?employe=E-1001 (Employes.gs) ; POST employeEnregistrer, employeDepart, employesImporter.
   - Le NAS, la date de naissance, le sexe et l'état civil vivent dans un fichier Drive privé (Loi 25), jamais dans une
     feuille ; seuls la RH et les propriétaires les voient. Un DG voit seulement « au dossier : oui / non ».
   - Aucune copie dans le navigateur (ni localStorage, ni copie compressée) : renseignements personnels.
   - Import : favori « Automax ← HR4 (employés) » (VW Brossard, BMW Sherbrooke) et fichier CSV / Excel (Desjardins —
     Employeur D — pour les autres). Une valeur vide n'efface rien ; rien n'est jamais retiré par un import.
   - Règle v138 : filtres → « Chiffres et liste » → chiffres de la liste filtrée → liste.
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez la version qui contient Employes.gs.';
  var HR4 = 'https://automax.hr4.ca/employees';
  /* Généré par python3 mock/signet-hr4-build.py — ne pas modifier à la main. */
  var CODE_SIGNET_HR4 = "javascript:(function () { var SITE = " + JSON.stringify(AMX.SITE) + "; var ORIGINE_SITE = SITE.replace(/^(https?:\\/\\/[^\\/]+).*$/, '$1'); if (!/hr4\\.ca$/.test(location.hostname)) { alert('Cliquez ce favori dans HR4 (automax.hr4.ca), \u00e0 la page Dossier des employ\u00e9s.'); return; } if (window.__amxHr4) { alert('Une lecture est d\u00e9j\u00e0 en cours dans cette page.'); return; } window.__amxHr4 = true; var bande = document.createElement('div'); bande.setAttribute('style', 'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;background:#0F7B4F;color:#fff;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;padding:12px 16px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;'); var etiquette = document.createElement('div'); etiquette.style.flex = '1'; var fermer = document.createElement('button'); fermer.textContent = 'Fermer'; fermer.setAttribute('style', 'background:rgba(255,255,255,.18);border:0;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit;'); bande.appendChild(etiquette); bande.appendChild(fermer); document.body.appendChild(bande); var pont = null, arret = false; fermer.onclick = function () { arret = true; bande.remove(); window.__amxHr4 = false; try { if (pont && !pont.closed) pont.close(); } catch (e) {} }; function dire(t) { etiquette.textContent = 'HR4 \u2192 ScanAutomax \u2014 ' + t; } function erreur(t) { bande.style.background = '#B42318'; dire(t); window.__amxHr4 = false; try { if (pont && !pont.closed) pont.close(); } catch (e) {} } if (typeof window.hr4 === 'undefined' || !window.hr4.post) { erreur('ouvrez la page Dossier des employ\u00e9s de HR4 (Application \u203a Dossier des Employ\u00e9s), puis recliquez le favori.'); return; } pont = window.open(SITE + 'pont.html?v=' + Date.now(), 'amxPont', 'width=460,height=240,menubar=no,toolbar=no,location=no,status=no'); if (!pont) { erreur('Chrome a bloqu\u00e9 la petite fen\u00eatre du site : autorisez les fen\u00eatres pop-up pour automax.hr4.ca, puis recliquez le favori.'); return; } var attentes = {}, compteur = 0, pret = null; window.addEventListener('message', function (ev) { if (ev.source !== pont) return; var m = ev.data || {}; if (m.type === 'amx:pret' && pret) { pret(m); pret = null; } if (m.type === 'amx:resultat' && attentes[m.id]) { attentes[m.id](m.resultat); delete attentes[m.id]; } }); function attendrePont() { return new Promise(function (res, rej) { var fini = false, essais = 0; pret = function (m) { fini = true; res(m); }; (function ping() { if (fini) return; essais++; try { pont.postMessage({ type: 'amx:ping' }, ORIGINE_SITE); } catch (e) {} if (pont.closed) { rej(new Error('La petite fen\u00eatre du site a \u00e9t\u00e9 ferm\u00e9e : recliquez le favori et laissez-la ouverte.')); return; } if (essais > 60) { rej(new Error('Le site d\\'inventaire ne r\u00e9pond pas.')); return; } setTimeout(ping, 500); })(); }); } function envoyer(corps) { return new Promise(function (res) { var id = 'lot' + (++compteur); attentes[id] = res; pont.postMessage({ type: 'amx:lot', id: id, corps: corps }, ORIGINE_SITE); setTimeout(function () { if (attentes[id]) { delete attentes[id]; res({ ok: false, erreur: 'Pas de r\u00e9ponse du site (d\u00e9lai).' }); } }, 280000); }); } function verifier(rep, quoi) { if (rep && rep.refuse && !rep.erreur) throw new Error('Votre session du site d\\'inventaire a expir\u00e9 : reconnectez-vous, puis recliquez le favori.'); if (!rep || rep.ok === false || rep.refuse) throw new Error('Le site a refus\u00e9 ' + quoi + ' : ' + ((rep && rep.erreur) || 'erreur inconnue')); if (rep.vehicules) throw new Error('Le script du site n\\'est pas \u00e0 jour (Employes.gs, Sst.gs) : il faut le d\u00e9ployer.'); return rep; } function txt(s) { return String(s || '').replace(/\\s+/g, ' ').trim(); } function attendre(ms) { return new Promise(function (r) { setTimeout(r, ms); }); } function liste() { return new Promise(function (res, rej) { var fini = false; window.hr4.post('/employees/default/getUsersJSON', {}, { success: function (d) { fini = true; try { d = typeof d === 'string' ? JSON.parse(d) : d; res((d && d.users) || []); } catch (e) { rej(e); } }, error: function () { fini = true; rej(new Error('HR4 n\\'a pas donn\u00e9 la liste des employ\u00e9s.')); } }); setTimeout(function () { if (!fini) rej(new Error('HR4 ne r\u00e9pond pas (liste des employ\u00e9s).')); }, 30000); }); } function onglet(id, tab) { var url = '/employees/default/getTabData/id/' + id + '/tab/' + tab + '/candidate_posting_id//encoded_post/%5B%5D/highlight/0'; return fetch(url, { credentials: 'include' }).then(function (r) { return r.text(); }).then(function (t) { var html = ''; try { html = JSON.parse(t).html || ''; } catch (e) {} return new DOMParser().parseFromString(html, 'text/html'); }); } function libelleDe(e, d) { if (e.id) { var l = d.querySelector('label[for=\"' + e.id + '\"]'); if (l) return txt(l.textContent); } var p = e.parentElement; for (var i = 0; i < 5 && p; i++, p = p.parentElement) { var l2 = p.querySelector('label'); if (l2 && !l2.contains(e)) return txt(l2.textContent); } return ''; } function valeur(e) { if (e.type === 'checkbox') return e.checked || e.hasAttribute('checked') ? 'oui' : 'non'; if (e.tagName === 'SELECT') { var o = e.querySelector('option[selected]') || e.options[e.selectedIndex]; return txt(o ? o.textContent : ''); } return txt(e.getAttribute('value') || e.value || ''); } var PAR_ID = { employee_number: 'numero', email: 'courrielTravail', personal_email: 'courrielPerso', firstname: 'prenom', middlename: 'deuxiemeNom', lastname: 'nom', prefname: 'nomPrefere', address_1: 'adresse1', address_2: 'adresse2', city: 'ville', postal_code: 'codePostal', home_phone: 'telDomicile', cell_phone: 'telCell', work_phone: 'telTravail', work_phone_extension: 'posteTel', assurance_collective: 'assuranceCollective', syndicat: 'syndicat' }; var SENS_ID = { date_of_birth: 'naissance', sin_number: 'nas', sin_expiry_date: 'nasExpire', sin_expiry_reason: 'nasRaison' }; var PAR_LIBELLE = [[/^statut/i, 'statut'], [/^province/i, 'province'], [/^sexe/i, 's:sexe'], [/^[\u00e9e]tat civil/i, 's:etatCivil']]; function personnel(d, e) { e.sensible = e.sensible || {}; Array.prototype.forEach.call(d.querySelectorAll('input, select, textarea'), function (el) { if (/file|range|hidden|radio/.test(el.type || '')) return; var v = valeur(el); if (el.id === 'deactivate_account') { if (v === 'oui') e.statut = 'inactif'; return; } if (PAR_ID[el.id]) { if (v) e[PAR_ID[el.id]] = v; return; } if (SENS_ID[el.id]) { if (v) e.sensible[SENS_ID[el.id]] = v; return; } var lib = libelleDe(el, d); PAR_LIBELLE.forEach(function (x) { if (!x[0].test(lib) || !v) return; if (x[1] === 'statut') { if (!e.statut) e.statut = /inactif|d[\u00e9e]sactiv/i.test(v) ? 'inactif' : 'actif'; } else if (x[1].indexOf('s:') === 0) e.sensible[x[1].slice(2)] = v; else e[x[1]] = v; }); }); } function contacts(d) { var champ = function (racine) { return Array.prototype.map.call(d.querySelectorAll('[id^=\"' + racine + '\"]'), valeur); }; var p = champ('contacts-firstname'), n = champ('contacts-lastname'), r = champ('contacts-relationshi'), h = champ('contacts-homePhone'), c = champ('contacts-cellPhone'), w = champ('contacts-workPhone'), o = champ('contacts-otherPhone'), m = champ('contacts-email'), out = []; for (var i = 0; i < p.length; i++) { var nom = txt((p[i] || '') + ' ' + (n[i] || '')); var tel = c[i] || h[i] || w[i] || ''; if (nom || tel) out.push({ nom: nom, relation: r[i] || '', telephone: tel, autreTel: o[i] || (c[i] && h[i] ? h[i] : ''), courriel: m[i] || '' }); } return out; } function versDataUrl(blob) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(new Error('Lecture du document impossible.')); }; r.readAsDataURL(blob); }); } var THEMES = ['sst', 'ergonomie', 'technicien', 'premiers', 'accident', 'formulaires']; function themeDe(libelle, rang) { var s = txt(libelle).toLowerCase(); if (/ergonom/.test(s)) return 'ergonomie'; if (/technicien|outil/.test(s)) return 'technicien'; if (/premier/.test(s)) return 'premiers'; if (/accident/.test(s)) return 'accident'; if (/formulaire/.test(s)) return 'formulaires'; if (/sant/.test(s)) return 'sst'; return THEMES[rang] || 'sst'; } (async function () { try { dire('ouverture du pont vers le site\u2026'); var p = await attendrePont(); if (!p.connecte) { erreur('Vous n\\'\u00eates pas connect\u00e9 au site d\\'inventaire dans ce navigateur : ouvrez ' + SITE + ' dans un onglet, connectez-vous, puis recliquez le favori.'); return; } dire('lecture de la liste des employ\u00e9s\u2026'); var gens = await liste(); if (!gens.length) throw new Error('HR4 n\\'a renvoy\u00e9 aucun employ\u00e9.'); var passage = new Date().toISOString(), lot = [], faits = 0, total = { ajoutes: 0, modifies: 0, inchanges: 0, horsPortee: 0 }; var vider = async function (dernier) { if (!lot.length && !dernier) return; var rep = verifier(await envoyer({ action: 'employesImporter', source: 'hr4', passage: passage, dernier: !!dernier, employes: lot }), 'les employ\u00e9s'); ['ajoutes', 'modifies', 'inchanges', 'horsPortee'].forEach(function (k) { total[k] += Number(rep[k]) || 0; }); lot = []; }; for (var i = 0; i < gens.length; i++) { if (arret) return; var u = gens[i], ed = u.ed || {}; dire('employ\u00e9 ' + (i + 1) + ' / ' + gens.length + '\u2026'); var e = { sourceId: String(u.i), poste: txt(ed['i-1'] || u.p || ''), marque: txt(ed['i-2'] || ''), emplacement: txt(ed['i-3'] || ''), courrielTravail: txt(u.e || ed['i-4'] || ''), dateEmbauche: u.st || '', datePoste: u.pst || '', sensible: {} }; if (u.dd || u.date_deactivated) e.statut = 'inactif'; try { var dp = await onglet(u.i, 'personal'); personnel(dp, e); var dc = await onglet(u.i, 'contacts'); var ur = contacts(dc); if (ur.length) e.urgence = ur; var dpay = await onglet(u.i, 'payroll'); var hd = dpay.querySelector('#hire_date'); if (hd && valeur(hd)) e.dateEmbauche = valeur(hd); } catch (eF) {} if (!e.prenom && !e.nom) { var parts = txt(u.f).split(' '); e.prenom = parts.shift() || ''; e.nom = parts.join(' '); } lot.push(e); faits++; if (lot.length >= 20) await vider(false); await attendre(120); } await vider(true); var resumeEmp = faits + ' employ\u00e9s lus \u2014 ' + total.ajoutes + ' ajout\u00e9s, ' + total.modifies + ' mis \u00e0 jour, ' + total.inchanges + ' inchang\u00e9s' + (total.horsPortee ? ', ' + total.horsPortee + ' hors de votre acc\u00e8s' : ''); dire(resumeEmp + ' \u2014 documents de sant\u00e9 et s\u00e9curit\u00e9\u2026'); var t = await (await fetch('/healthSafety', { credentials: 'include' })).text(); var d = new DOMParser().parseFromString(t, 'text/html'); var panes = Array.prototype.slice.call(d.querySelectorAll('[id^=\"hs-category-\"]')); var docs = []; panes.forEach(function (pane, rang) { var lien = d.querySelector('[href=\"#' + pane.id + '\"], [data-target=\"#' + pane.id + '\"]'); var theme = themeDe(lien ? lien.textContent : '', rang); Array.prototype.forEach.call(pane.querySelectorAll('a[href^=\"/download/\"]'), function (a, k) { docs.push({ theme: theme, titre: txt(a.textContent) || txt(a.getAttribute('data-original-title')) || 'Document', href: a.getAttribute('href'), ordre: k + 1 }); }); }); var ajoutes = 0, deja = 0, erreurs = 0; for (var j = 0; j < docs.length; j++) { if (arret) return; dire(resumeEmp + ' \u2014 document ' + (j + 1) + ' / ' + docs.length + ' : ' + docs[j].titre); try { var b = await (await fetch(docs[j].href, { credentials: 'include' })).blob(); if (b.size > 10 * 1024 * 1024) { erreurs++; continue; } var rep = verifier(await envoyer({ action: 'sstImporter', source: 'hr4', documents: [{ theme: docs[j].theme, titre: docs[j].titre, ordre: docs[j].ordre, base64: await versDataUrl(b), sourceRef: 'hr4:' + docs[j].href.split('/').pop() }] }), 'les documents'); ajoutes += Number(rep.ajoutes) || 0; deja += Number(rep.deja) || 0; erreurs += (rep.erreurs || []).length; } catch (eD) { if (/session|pas \u00e0 jour/.test(String(eD.message))) throw eD; erreurs++; } } dire('termin\u00e9 : ' + resumeEmp + ' \u00b7 sant\u00e9 et s\u00e9curit\u00e9 : ' + ajoutes + ' document(s) ajout\u00e9(s), ' + deja + ' d\u00e9j\u00e0 l\u00e0' + (erreurs ? ', ' + erreurs + ' illisible(s)' : '') + '.'); window.__amxHr4 = false; setTimeout(function () { try { if (!pont.closed) pont.close(); } catch (e) {} }, 1500); } catch (e) { erreur('Arr\u00eat : ' + (e && e.message || e)); } })(); })();";
  (AMX.signets = AMX.signets || {}).hr4 = { nom: 'Automax ← HR4 (employés)', code: CODE_SIGNET_HR4 };   /* registre des favoris (Outils › Imports) */

  var CSS = [
    '.emp-vues { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }',
    '.emp-vues button { border: 1px solid var(--ligne); background: var(--carte); border-radius: 999px; padding: 6px 13px; font-size: 13px; font-weight: 600; color: var(--encre-2); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }',
    '.emp-vues button.actif { background: var(--vert-fonce); border-color: var(--vert-fonce); color: #fff; }',
    '.emp-vues button .n { font-weight: 700; opacity: .8; font-variant-numeric: tabular-nums; }',
    '.emp-filtres { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 8px; }',
    '.emp-filtres .saisie.recherche { flex: 1 1 280px; max-width: 520px; }',
    '.emp-filtres select { max-width: 240px; }',
    '.emp-cadre { overflow-x: auto; }',
    '.emp-table tbody tr { cursor: pointer; } .emp-table tbody tr:hover { background: var(--carte-2); }',
    '.emp-table td { vertical-align: top; } .emp-table td .s { display: block; color: var(--encre-3); font-size: 12px; }',
    '.emp-puce { display: inline-block; border-radius: 999px; padding: 2px 9px; font-size: 12px; font-weight: 700; white-space: nowrap; margin: 0 4px 2px 0; }',
    '.emp-puce.actif { background: var(--vert-clair); color: var(--vert-fonce); } .emp-puce.inactif { background: var(--ambre-bg); color: var(--ambre); }',
    '.emp-puce.parti { background: var(--gris-bg); color: var(--encre-3); } .emp-puce.manque { background: var(--rouge-bg); color: var(--rouge); }',
    '.emp-puce.source { background: var(--bleu-bg); color: var(--bleu); font-weight: 600; }',
    '.emp-vide { padding: 28px; text-align: center; color: var(--encre-3); }',
    '.emp-avis { border-left: 4px solid var(--ambre); background: var(--ambre-bg); padding: 10px 12px; border-radius: 8px; margin: 0 0 10px; font-size: 13px; }',
    '.emp-ok { border-left: 4px solid var(--vert); background: var(--vert-clair); padding: 10px 12px; border-radius: 8px; margin: 0 0 10px; font-size: 13px; }',
    '.emp-erreur { border-left: 4px solid var(--rouge); background: var(--rouge-bg); padding: 10px 12px; border-radius: 8px; margin: 0 0 10px; font-size: 13px; }',
    '.emp-h { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--encre-2); margin: 16px 0 6px; }',
    '.emp-detail { display: grid; grid-template-columns: minmax(150px, 32%) 1fr; margin: 0 0 8px; }',
    '.emp-detail dt, .emp-detail dd { padding: 6px 8px; border-bottom: 1px solid var(--ligne); margin: 0; font-size: 13px; }',
    '.emp-detail dt { color: var(--encre-3); font-weight: 600; } .emp-detail dd { word-break: break-word; }',
    '.emp-sensible { border: 1px dashed var(--ambre); border-radius: 10px; padding: 8px 10px; background: #FFFBF2; }',
    '.emp-sensible .q { font-size: 12px; color: var(--encre-3); margin: 0 0 6px; }',
    '.emp-liste { list-style: none; margin: 0; padding: 0; } .emp-liste li { padding: 7px 0; border-bottom: 1px dashed var(--ligne); font-size: 13px; }',
    '.emp-liste li .q { display: block; color: var(--encre-3); font-size: 12px; }',
    '.emp-journal { font-size: 12px; color: var(--encre-3); list-style: none; margin: 0; padding: 0; } .emp-journal li { padding: 2px 0; }',
    '.emp-form .grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }',
    '.emp-urg { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr 1.3fr; gap: 6px; margin: 0 0 6px; }',
    '@media (max-width: 760px) { .emp-urg { grid-template-columns: 1fr 1fr; } }',
    '@media (max-width: 640px) { .emp-detail { grid-template-columns: 1fr; } .emp-detail dt { border-bottom: none; padding-bottom: 0; } }',
    '.emp-import { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 12px; }',
    '.emp-import .bloc { border: 1px solid var(--ligne); border-radius: 12px; padding: 12px 14px; }',
    '.emp-import .bloc h3 { margin: 0 0 6px; font-size: 15px; } .emp-import .bloc p { font-size: 13px; color: var(--encre-2); margin: 0 0 8px; line-height: 1.45; }',
    '.emp-import ol { font-size: 13px; color: var(--encre-2); padding-left: 18px; margin: 0 0 8px; } .emp-import ol li { margin: 0 0 3px; }',
    '.emp-signet { display: inline-flex; gap: 6px; align-items: center; background: var(--vert-fonce); color: #fff !important; border-radius: 8px; padding: 7px 12px; font-weight: 700; text-decoration: none; cursor: grab; font-size: 13px; }',
    '.emp-map { width: 100%; border-collapse: collapse; font-size: 12.5px; } .emp-map td { padding: 4px 6px; border-bottom: 1px solid var(--ligne); } .emp-map select { width: 100%; font-size: 12.5px; }',
    '.emp-map td.ex { color: var(--encre-3); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.emp-prog { font-size: 12.5px; color: var(--encre-3); margin: 6px 0 0; }'
  ].join('\n');
  function css() { if (!document.getElementById('css-employes')) { var s = document.createElement('style'); s.id = 'css-employes'; s.textContent = CSS; document.head.appendChild(s); } }

  /* ------------------------------------------------------------------------------- accès */
  function perms() { return (AMX.session && AMX.session.perms) || {}; }
  function role() { var p = perms(); return p.role || (AMX.session && AMX.session.role) || ''; }
  function voitTout() { return perms().rh === true || role() === 'proprietaire'; }
  function peutVoir() { return voitTout() || role() === 'admin'; }

  /* ------------------------------------------------------------------------------- données (mémoire seulement) */
  var cache = { rep: null, le: 0, enCours: null };
  function charger(force) {
    if (cache.enCours && !force) return cache.enCours;
    if (!force && cache.rep && Date.now() - cache.le < AMX.dureeCopie(60000)) return Promise.resolve(cache.rep);
    cache.enCours = AMX.get({ employes: '1' }, { delai: 60000, secours: false }).then(function (d) {
      cache.enCours = null;
      if (d && d.refuse) throw new Error(d.erreur || 'Réservé aux ressources humaines, aux propriétaires et aux DG.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!Array.isArray(d.employes)) throw new Error(SCRIPT_PAS_A_JOUR);
      cache.rep = d; cache.le = Date.now();
      try { document.dispatchEvent(new CustomEvent('amx:employes')); } catch (e) {}
      return d;
    }, function (e) { cache.enCours = null; throw e; });
    return cache.enCours;
  }
  function poser(e) {
    if (!cache.rep || !e) return;
    var i = cache.rep.employes.findIndex(function (x) { return x.id === e.id; });
    var court = Object.assign({}, e); delete court.journal; delete court.documentsRh; delete court.evenementsSst;
    if (court.sensible) court.sensible = { nasAuDossier: !!court.sensible.nasAuDossier, naissanceAuDossier: !!court.sensible.naissanceAuDossier, nasMasque: court.sensible.nasMasque || '', naissance: court.sensible.naissance || '' };
    if (i >= 0) cache.rep.employes[i] = court; else cache.rep.employes.push(court);
    try { document.dispatchEvent(new CustomEvent('amx:employes')); } catch (er) {}
  }
  function ecrire(corps, opts) {
    return AMX.post(corps, Object.assign({ delai: 120000, secours: false }, opts || {})).then(function (d) {
      if (d && d.vehicules && !d.employe && d.ajoutes === undefined) throw new Error(SCRIPT_PAS_A_JOUR);
      return AMX.verifier(d);
    });
  }
  function fiche(id) {
    return AMX.get({ employe: id }, { delai: 60000, secours: false }).then(function (d) {
      if (d && d.refuse) throw new Error(d.erreur || 'Accès refusé.');
      if (!d || d.ok === false || !d.employe) throw new Error((d && d.erreur) || (d && d.vehicules ? SCRIPT_PAS_A_JOUR : 'Fiche introuvable.'));
      return d;
    });
  }
  function compteur() { return ''; }

  AMX.section('employes', {
    titre: 'Dossiers des employés', icone: 'admin', ordre: 57,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new VueEmployes(conteneur, ctx); }
  });
  AMX.employes = {
    charger: charger, enCache: function () { return cache.rep; }, peutVoir: peutVoir, voitTout: voitTout, compteur: compteur,
    vider: function () { cache = { rep: null, le: 0, enCours: null }; },
    /* Pour le registre SST : choisir l'employé (actifs de la concession). */
    liste: function (cie) { return ((cache.rep && cache.rep.employes) || []).filter(function (e) { return e.statut !== 'parti' && (!cie || e.compagnie === cie); }); },
    ouvrir: function (id) { AMX.aller('employes', '', { id: id }); }
  };

  /* ------------------------------------------------------------------------------- outils */
  var STATUTS = { actif: 'Actif', inactif: 'Inactif', parti: 'Parti' };
  var VUES = [['actif', 'Actifs'], ['inactif', 'Inactifs'], ['parti', 'Partis'], ['tous', 'Tous']];
  var MANQUES = [['', 'Dossier : tous'], ['urgence', 'Sans contact d\'urgence'], ['embauche', 'Sans date d\'embauche'], ['coord', 'Sans courriel ni cellulaire'], ['nas', 'NAS pas au dossier']];
  var SOURCES = { hr4: 'HR4', desjardins: 'Desjardins', fichier: 'Fichier', manuel: 'Saisie' };
  function nomCie(c) { return c ? ((AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c) : 'Siège social / groupe'; }
  /* Toujours avec l'année : une date de naissance ou d'embauche sans année ne veut rien dire. */
  function dateCourte(iso) { if (!iso) return ''; var d = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? String(iso) : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function dateHeure(iso) { return iso ? AMX.fmtDate(iso, true) : ''; }
  function tel(t) { t = String(t || '').replace(/\D/g, ''); return t.length === 10 ? t.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2-$3') : t; }
  function anciennete(iso, ajd) {
    if (!iso) return '';
    var a = new Date(iso + 'T12:00:00'), b = new Date((ajd || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
    var mois = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0);
    if (mois < 0) return 'à venir';
    if (mois < 1) return 'moins d\'un mois';
    if (mois < 12) return mois + ' mois';
    var ans = Math.floor(mois / 12), r = mois % 12;
    return ans + ' an' + (ans > 1 ? 's' : '') + (r ? ' ' + r + ' mois' : '');
  }
  function moisDepuis(iso, ajd) {
    if (!iso) return null;
    var a = new Date(iso + 'T12:00:00'), b = new Date((ajd || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
    return (b - a) / (30.44 * 864e5);
  }
  function champsRecherche(e) {
    return [e.id, e.numero, e.prenom, e.nom, e.nomPrefere, e.nomComplet, e.courrielTravail, e.courrielPerso, e.telCell, e.telDomicile, e.poste, e.departement,
      e.marque, e.emplacement, e.superieur, e.ville, nomCie(e.compagnie), STATUTS[e.statut], SOURCES[e.source]];
  }
  function manque(e, quoi) {
    if (quoi === 'urgence') return !(e.urgence || []).length;
    if (quoi === 'embauche') return !e.dateEmbauche;
    if (quoi === 'coord') return !e.courrielTravail && !e.courrielPerso && !e.telCell;
    if (quoi === 'nas') return !(e.sensible && e.sensible.nasAuDossier);
    return false;
  }
  function puceStatut(s) { return h('span.emp-puce.' + (s || 'actif'), { text: STATUTS[s] || s || 'Actif' }); }
  function champ(libelle, el, aide) { return h('div.champ', [h('label', { text: libelle }), el, aide ? h('span.aide', { text: aide }) : null]); }
  function saisie(valeur, attrs) { return h('input.saisie', Object.assign({ type: 'text', value: valeur || '', autocomplete: 'off' }, attrs || {})); }
  function choix(valeur, options) {
    var s = h('select.saisie');
    options.forEach(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (o[0] === (valeur || '')) op.selected = true; s.appendChild(op); });
    return s;
  }

  /* ------------------------------------------------------------------------------- page */
  function VueEmployes(conteneur, ctx) {
    css();
    var self = this, p = (ctx && ctx.params) || {};
    this.conteneur = conteneur; this.detruit = false;
    this.compagnie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
    this.vue = p.voir || 'actif'; this.q = p.q || ''; this.manque = ''; this.poste = '';
    this.ouvrirId = p.id || '';
    AMX.vider(conteneur);
    this.btnNouvel = h('button.btn.primaire', { type: 'button', text: 'Nouvel employé', onclick: function () { self.modifier(null); } });
    this.btnImport = h('button.btn', { type: 'button', text: 'Importer', onclick: function () { self.importer(); } });
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', text: 'Exporter (Excel)', onclick: function () { self.exporter(); } });
    this.btnSst = h('button.btn', { type: 'button', text: 'Santé et sécurité', onclick: function () { AMX.aller('sst', '', {}); } });
    this.btnImport.hidden = !voitTout();
    this.elSous = h('p', { text: 'Le dossier de chaque employé, par concession. Le NAS et la date de naissance restent dans un fichier privé : la RH et les propriétaires seulement.' });
    conteneur.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Dossiers des employés'), this.elSous]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnExport, this.btnSst, this.btnImport, this.btnNouvel], [this.btnImport, this.btnNouvel]))
    ]));
    this.elCies = h('div.barre-cies'); conteneur.appendChild(this.elCies);
    this.elVues = h('div.emp-vues'); conteneur.appendChild(this.elVues);
    this.inRecherche = h('input.saisie.recherche', { type: 'search', value: this.q, placeholder: 'Chercher : nom, poste, courriel, cellulaire, no d\'employé…', autocomplete: 'off', 'aria-label': 'Chercher un employé' });
    this.selManque = choix('', MANQUES);
    this.selPoste = h('select.saisie', { 'aria-label': 'Poste' });
    conteneur.appendChild(h('div.emp-filtres', [this.inRecherche, this.selPoste, this.selManque]));
    this.elPortee = h('div'); conteneur.appendChild(this.elPortee);
    this.elKpis = h('div.kpis'); conteneur.appendChild(this.elKpis);
    this.elCorps = h('div'); conteneur.appendChild(this.elCorps);
    var relancer = AMX.debounce(function () { self.q = self.inRecherche.value; self.rafraichir(); }, 160);
    this.inRecherche.addEventListener('input', relancer);
    this.inRecherche.addEventListener('keydown', function (e) { if (e.key === 'Escape') { self.inRecherche.value = ''; self.q = ''; self.rafraichir(); } });
    this.selManque.addEventListener('change', function () { self.manque = self.selManque.value; self.rendre(); });
    this.selPoste.addEventListener('change', function () { self.poste = self.selPoste.value; self.rendre(); });
    this.surCie = function (e) { self.compagnie = (e.detail && e.detail.compagnie) || ''; self.rendre(); };
    this.surDonnees = function () { if (cache.rep && !self.detruit) { self.rep = cache.rep; self.rendre(); } };
    document.addEventListener('amx:compagnie', this.surCie);
    document.addEventListener('amx:employes', this.surDonnees);
    if (cache.rep) { this.rep = cache.rep; this.rendre(); } else this.elCorps.appendChild(AMX.chargeur('Dossiers des employés'));
    this.charger(false);
  }
  VueEmployes.prototype.demonter = function () { this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); document.removeEventListener('amx:employes', this.surDonnees); };
  VueEmployes.prototype.naviguer = function (ctx) {
    var p = (ctx && ctx.params) || {};
    if (p.voir && p.voir !== this.vue) { this.vue = p.voir; this.rendre(); }
    if (p.id && this.rep) this.ouvrirFiche(p.id);
  };
  VueEmployes.prototype.charger = function (force) {
    var self = this;
    charger(force).then(function (d) {
      if (self.detruit) return;
      self.rep = d; self.rendre();
      self.btnImport.hidden = !d.peutImporter;
      if (self.ouvrirId) { var id = self.ouvrirId; self.ouvrirId = ''; self.ouvrirFiche(id); }
      if (force) AMX.toast('Dossiers des employés à jour', 'ok');
    }, function (e) {
      if (self.detruit) return;
      AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.carte', [h('div.emp-vide', { text: AMX.erreurTexte(e) })]));
    });
  };
  VueEmployes.prototype.base = function () { var cie = this.compagnie; return (this.rep ? this.rep.employes : []).filter(function (e) { return !cie || e.compagnie === cie; }); };
  VueEmployes.prototype.filtrer = function (sauf) {
    var self = this;
    return this.base().filter(function (e) {
      if (sauf !== 'vue' && self.vue !== 'tous' && (e.statut || 'actif') !== self.vue) return false;
      if (sauf !== 'poste' && self.poste && (e.poste || '') !== self.poste) return false;
      if (sauf !== 'manque' && self.manque && !manque(e, self.manque)) return false;
      if (self.q && !AMX.correspond(champsRecherche(e), self.q)) return false;
      return true;
    });
  };
  VueEmployes.prototype.rendre = function () {
    if (!this.rep || this.detruit) return;
    var self = this, tous = this.rep.employes;
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.compagnie,
      compte: function (c) { return tous.filter(function (e) { return (!c || e.compagnie === c) && (e.statut || 'actif') === 'actif'; }).length; },
      onchange: function (c) { self.compagnie = c; self.rendre(); } });
    var pourVue = this.filtrer('vue');
    AMX.vider(this.elVues);
    VUES.forEach(function (v) {
      var n = v[0] === 'tous' ? pourVue.length : pourVue.filter(function (e) { return (e.statut || 'actif') === v[0]; }).length;
      self.elVues.appendChild(h('button' + (self.vue === v[0] ? '.actif' : ''), { type: 'button', onclick: function () { self.vue = v[0]; self.rendre(); } }, [v[1], h('span.n', { text: String(n) })]));
    });
    /* Postes : ceux de la liste sans ce filtre, du plus fréquent au moins fréquent. */
    var parPoste = {};
    this.filtrer('poste').forEach(function (e) { if (e.poste) parPoste[e.poste] = (parPoste[e.poste] || 0) + 1; });
    var postes = Object.keys(parPoste).sort(function (a, b) { return parPoste[b] - parPoste[a] || a.localeCompare(b, 'fr'); });
    if (this.poste && !parPoste[this.poste]) postes.unshift(this.poste);
    AMX.vider(this.selPoste);
    this.selPoste.appendChild(h('option', { value: '', text: 'Tous les postes' }));
    postes.forEach(function (p) { var o = h('option', { value: p, text: p + (parPoste[p] ? ' (' + parPoste[p] + ')' : '') }); if (p === self.poste) o.selected = true; self.selPoste.appendChild(o); });
    Array.prototype.forEach.call(this.selManque.options, function (o) { if (o.value === 'nas') o.hidden = !self.rep.peutSensible; });
    this.rafraichir();
  };
  VueEmployes.prototype.rafraichir = function () {
    if (!this.rep) return;
    var self = this, liste = this.filtrer();
    var filtres = [];
    if (this.q) filtres.push('« ' + this.q + ' »');
    if (this.poste) filtres.push(this.poste);
    if (this.manque) filtres.push((MANQUES.filter(function (m) { return m[0] === self.manque; })[0] || [])[1]);
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['employé', 'employés'], contexte: [this.compagnie ? nomCie(this.compagnie) : 'tout le groupe', ({ actif: 'actifs', inactif: 'inactifs', parti: 'partis', tous: 'tous' })[this.vue]],
      filtres: filtres, effacer: function () { self.q = ''; self.inRecherche.value = ''; self.poste = ''; self.manque = ''; self.selManque.value = ''; self.rendre(); } });
    this.rendreKpis(liste);
    this.rendreListe(liste);
  };
  VueEmployes.prototype.rendreKpis = function (liste) {
    var self = this, ajd = this.rep.aujourdhui;
    AMX.vider(this.elKpis);
    var tuile = function (valeur, libelle, sous, cls, clic) {
      var el = h(clic ? 'button.kpi' : 'div.kpi', clic ? { type: 'button', onclick: clic } : {}, [h('div.valeur', { text: String(valeur) }), h('div.libelle', { text: libelle }), sous ? h('div.sous', { text: sous }) : null]);
      if (cls) el.classList.add(cls); return el;
    };
    var recents = liste.filter(function (e) { var m = moisDepuis(e.dateEmbauche, ajd); return m !== null && m >= 0 && m < 3; }).length;
    var anc = liste.map(function (e) { return moisDepuis(e.dateEmbauche, ajd); }).filter(function (m) { return m !== null && m >= 0; });
    var moy = anc.length ? anc.reduce(function (a, b) { return a + b; }, 0) / anc.length : null;
    var sansUrg = liste.filter(function (e) { return manque(e, 'urgence'); }).length;
    this.elKpis.appendChild(tuile(liste.length, 'Employés', liste.filter(function (e) { return (e.statut || 'actif') === 'actif'; }).length + ' actifs dans cette liste', 'neutre'));
    this.elKpis.appendChild(tuile(recents, 'Embauchés depuis 3 mois', 'd\'après la date d\'embauche', 'neutre'));
    this.elKpis.appendChild(tuile(moy === null ? '—' : (moy < 12 ? Math.round(moy) + ' mois' : (moy / 12).toFixed(1).replace('.', ',') + ' ans'), 'Ancienneté moyenne', anc.length + ' avec une date d\'embauche', 'neutre'));
    this.elKpis.appendChild(tuile(sansUrg, 'Sans contact d\'urgence', sansUrg ? 'cliquez pour les voir' : 'tous ont un contact', sansUrg ? 'attention' : 'neutre', sansUrg ? function () { self.manque = 'urgence'; self.selManque.value = 'urgence'; self.rendre(); } : null));
    if (this.rep.peutSensible) {
      var nas = liste.filter(function (e) { return e.sensible && e.sensible.nasAuDossier; }).length;
      this.elKpis.appendChild(tuile(nas + ' / ' + liste.length, 'NAS au dossier', 'gardé dans le fichier privé', nas < liste.length ? 'attention' : 'neutre', nas < liste.length ? function () { self.manque = 'nas'; self.selManque.value = 'nas'; self.rendre(); } : null));
    }
  };
  VueEmployes.prototype.rendreListe = function (liste) {
    var self = this, ajd = this.rep.aujourdhui;
    AMX.vider(this.elCorps);
    if (!liste.length) {
      var aucun = !this.rep.employes.length;
      this.elCorps.appendChild(h('div.carte', [h('div.emp-vide', [
        h('p', { text: aucun ? 'Aucun employé encore. Importez les dossiers de HR4 (VW, BMW) et de Desjardins, ou ajoutez-en un.' : 'Aucun employé avec ces filtres.' }),
        aucun && this.rep.peutImporter ? h('button.btn.primaire', { type: 'button', text: 'Importer les employés', onclick: function () { self.importer(); } }) : null
      ])]));
      return;
    }
    var corps = h('tbody');
    liste.slice(0, 600).forEach(function (e) {
      var manques = [];
      if (manque(e, 'urgence')) manques.push('contact d\'urgence');
      if (manque(e, 'embauche')) manques.push('date d\'embauche');
      corps.appendChild(h('tr', { onclick: function () { self.ouvrirFiche(e.id); } }, [
        h('td', [h('b', { text: [e.prenom, e.nom].filter(Boolean).join(' ') || e.nomComplet }), h('span.s', { text: [e.nomPrefere ? '« ' + e.nomPrefere + ' »' : '', e.numero ? 'no ' + e.numero : '', e.id].filter(Boolean).join(' · ') })]),
        h('td', [h('span', { text: e.poste || '—' }), h('span.s', { text: [e.departement, e.superieur ? 'sup. ' + e.superieur : ''].filter(Boolean).join(' · ') })]),
        h('td', [h('span', { text: nomCie(e.compagnie) }), h('span.s', { text: e.emplacement && e.emplacement !== nomCie(e.compagnie) ? e.emplacement : '' })]),
        h('td', [h('span', { text: tel(e.telCell) || tel(e.telTravail) || '—' }), h('span.s', { text: e.courrielTravail || e.courrielPerso || '' })]),
        h('td', [h('span', { text: e.dateEmbauche ? dateCourte(e.dateEmbauche) : '—' }), h('span.s', { text: e.statut === 'parti' ? (e.dateDepart ? 'parti le ' + dateCourte(e.dateDepart) : 'parti') : anciennete(e.dateEmbauche, ajd) })]),
        h('td', [puceStatut(e.statut), e.source ? h('span.emp-puce.source', { text: SOURCES[e.source] || e.source }) : null,
          manques.length ? h('span.s', { style: { color: 'var(--rouge)' }, text: 'Manque : ' + manques.join(', ') }) : null])
      ]));
    });
    this.elCorps.appendChild(h('div.carte', [h('div.emp-cadre', [h('table.tableau.emp-table', [
      h('thead', [h('tr', [h('th', 'Employé'), h('th', 'Poste'), h('th', 'Concession'), h('th', 'Joindre'), h('th', 'Embauche'), h('th', 'État')])]), corps
    ])])]));
    if (liste.length > 600) this.elCorps.appendChild(h('p.emp-prog', { text: '600 premiers sur ' + liste.length + ' : précisez la recherche.' }));
  };

  /* ------------------------------------------------------------------------------- fiche */
  VueEmployes.prototype.ouvrirFiche = function (id) {
    var self = this, corps = h('div', [AMX.chargeur('Dossier ' + id, { compact: true })]), m, e = null, peutSens = false;
    var dl = function (paires) {
      var out = h('dl.emp-detail');
      paires.forEach(function (p) { if (p[1] === null || p[1] === undefined || p[1] === '') return; out.appendChild(h('dt', { text: p[0] })); out.appendChild(h('dd', typeof p[1] === 'string' ? { text: p[1] } : [p[1]])); });
      return out;
    };
    var dessiner = function () {
      AMX.vider(corps);
      if (e.statut === 'parti') corps.appendChild(h('div.emp-avis', { text: 'Parti' + (e.dateDepart ? ' le ' + dateCourte(e.dateDepart) : '') + (e.raisonDepart ? ' : ' + e.raisonDepart : '') + '. Le dossier est gardé.' }));
      corps.appendChild(h('div.emp-h', { text: 'Identité' }));
      corps.appendChild(dl([
        ['Nom', [e.prenom, e.deuxiemeNom, e.nom].filter(Boolean).join(' ')], ['Nom préféré', e.nomPrefere], ['No d\'employé', e.numero], ['Statut', puceStatut(e.statut)],
        ['Langue', e.langue === 'en' ? 'Anglais' : e.langue === 'fr' ? 'Français' : '']
      ]));
      if (peutSens) {
        var s = e.sensible || {}, nasEl = h('span', { text: s.nasMasque || 'pas au dossier' });
        var voir = s.nas ? h('button.btn.petit', { type: 'button', text: 'Afficher', style: { marginLeft: '8px' }, onclick: function () { nasEl.textContent = String(s.nas).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3'); voir.remove(); } }) : null;
        corps.appendChild(h('div.emp-h', { text: 'Renseignements confidentiels' }));
        corps.appendChild(h('div.emp-sensible', [
          h('p.q', { text: 'Fichier privé (Loi 25) : visible seulement par la RH et les propriétaires ; jamais dans une feuille.' }),
          dl([['NAS', h('span', [nasEl, voir])], ['NAS : expiration', s.nasExpire ? dateCourte(s.nasExpire) + (s.nasRaison ? ' (' + s.nasRaison + ')' : '') : ''], ['Date de naissance', s.naissance ? dateCourte(s.naissance) : 'pas au dossier'],
            ['Sexe à la naissance', s.sexe], ['État civil', s.etatCivil]])
        ]));
      } else if (e.sensible) {
        corps.appendChild(dl([['Renseignements confidentiels', 'NAS ' + (e.sensible.nasAuDossier ? 'au dossier' : 'pas au dossier') + ' · date de naissance ' + (e.sensible.naissanceAuDossier ? 'au dossier' : 'pas au dossier') + ' (la RH les voit)']]));
      }
      corps.appendChild(h('div.emp-h', { text: 'Emploi' }));
      corps.appendChild(dl([
        ['Concession', nomCie(e.compagnie)], ['Emplacement', e.emplacement], ['Marque', e.marque], ['Poste', e.poste], ['Département', e.departement], ['Supérieur', e.superieur], ['Horaire', e.horaire],
        ['Embauche', e.dateEmbauche ? dateCourte(e.dateEmbauche) + ' · ' + anciennete(e.dateEmbauche, self.rep && self.rep.aujourdhui) : ''], ['Ancienneté depuis', e.dateAnciennete ? dateCourte(e.dateAnciennete) : ''],
        ['Dans ce poste depuis', e.datePoste ? dateCourte(e.datePoste) : ''], ['Syndicat', e.syndicat], ['Assurance collective', e.assuranceCollective]
      ]));
      corps.appendChild(h('div.emp-h', { text: 'Coordonnées' }));
      corps.appendChild(dl([
        ['Courriel (travail)', e.courrielTravail], ['Courriel personnel', e.courrielPerso], ['Cellulaire', tel(e.telCell)], ['Domicile', tel(e.telDomicile)], ['Travail', tel(e.telTravail) + (e.posteTel ? ' poste ' + e.posteTel : '')],
        ['Adresse', [e.adresse1, e.adresse2, [e.ville, e.province, e.codePostal].filter(Boolean).join(' ')].filter(Boolean).join(', ')]
      ]));
      corps.appendChild(h('div.emp-h', { text: 'Contacts d\'urgence (' + (e.urgence || []).length + ')' }));
      if (!(e.urgence || []).length) corps.appendChild(h('div.emp-avis', { text: 'Aucun contact d\'urgence au dossier.' }));
      else corps.appendChild(h('ul.emp-liste', e.urgence.map(function (u) { return h('li', [h('b', { text: u.nom || '—' }), h('span.q', { text: [u.relation, tel(u.telephone), tel(u.autreTel), u.courriel].filter(Boolean).join(' · ') })]); })));
      corps.appendChild(h('div.emp-h', { text: 'Documents RH signés' }));
      if (!(e.documentsRh || []).length) corps.appendChild(h('p.emp-prog', { text: 'Aucun envoi du portail RH à ses courriels.' }));
      else corps.appendChild(h('ul.emp-liste', e.documentsRh.map(function (d) {
        return h('li', [h('b', { text: d.id + ' — ' + (d.docs || []).join(', ') }), h('span.q', { text: 'Envoyé le ' + dateCourte(d.creeLe) + (d.signeLe ? ' · signé le ' + dateCourte(d.signeLe) : ' · ' + (d.etat || '')) }),
          AMX.rh && AMX.rh.peutVoir() ? h('button.btn.petit', { type: 'button', text: 'Ouvrir', onclick: function () { m.fermer(); AMX.aller('rh', '', { id: d.id }); } }) : null]);
      })));
      corps.appendChild(h('div.emp-h', { text: 'Santé et sécurité' }));
      if (!(e.evenementsSst || []).length) corps.appendChild(h('p.emp-prog', { text: 'Aucun événement au registre.' }));
      else corps.appendChild(h('ul.emp-liste', e.evenementsSst.map(function (x) {
        return h('li', [h('b', { text: x.id + ' — ' + dateCourte(x.date) }), h('span.q', { text: x.resume }), h('button.btn.petit', { type: 'button', text: 'Ouvrir', onclick: function () { m.fermer(); AMX.aller('sst', '', { voir: 'registre', id: x.id }); } })]);
      })));
      if (AMX.sst && AMX.sst.declarer) corps.appendChild(h('button.btn.petit', { type: 'button', text: 'Déclarer un accident ou des premiers soins', onclick: function () { m.fermer(); AMX.sst.declarer({ employeId: e.id, employeNom: [e.prenom, e.nom].filter(Boolean).join(' '), poste: e.poste, compagnie: e.compagnie }); } }));
      corps.appendChild(h('div.emp-h', { text: 'Journal' }));
      corps.appendChild(h('ul.emp-journal', (e.journal || []).slice(0, 15).map(function (j) { return h('li', { text: dateHeure(j.le) + ' — ' + (j.qui ? j.qui + ' : ' : '') + j.quoi }); })));
      corps.appendChild(h('p.emp-prog', { text: 'Source : ' + (SOURCES[e.source] || 'saisie') + (e.majLe ? ' · mis à jour le ' + dateHeure(e.majLe) + (e.majPar ? ' par ' + e.majPar : '') : '') }));
      m.boutons([
        { texte: 'Fermer' },
        e.statut === 'parti' ? { texte: 'Rétablir', action: function () { return self.depart(e, true).then(function (x) { if (x) { e = x; dessiner(); } return false; }); } }
          : { texte: 'Départ…', action: function () { self.depart(e, false).then(function (x) { if (x) { e = x; dessiner(); } }); return false; } },
        { texte: 'Modifier', classe: 'primaire', action: function (fermer) { fermer(); self.modifier(e); return false; } }
      ]);
    };
    m = AMX.modale({ titre: 'Dossier ' + id, corps: corps, large: true, proteger: false, boutons: [{ texte: 'Fermer' }] });
    fiche(id).then(function (d) {
      e = d.employe; peutSens = !!d.peutSensible;
      try { m.el.querySelector('[id^="modale-titre-"]').textContent = [e.prenom, e.nom].filter(Boolean).join(' ') + ' — ' + e.id; } catch (er) {}
      dessiner();
    }, function (er) { AMX.vider(corps); corps.appendChild(h('div.emp-erreur', { text: AMX.erreurTexte(er) })); });
  };

  /* ------------------------------------------------------------------------------- modifier / nouvel employé */
  VueEmployes.prototype.modifier = function (e) {
    var self = this, rep = this.rep || {}, peutSens = !!rep.peutSensible, nouveau = !e;
    e = e || { statut: 'actif', compagnie: this.compagnie, urgence: [] };
    var champs = {};
    var t = function (cle, libelle, attrs) { champs[cle] = saisie(e[cle], attrs); return champ(libelle, champs[cle]); };
    var d = function (cle, libelle) { champs[cle] = saisie(e[cle], { type: 'date' }); return champ(libelle, champs[cle]); };
    var codes = rep.concessions === '*' || !Array.isArray(rep.concessions) ? Object.keys(AMX.COMPAGNIES_TOUTES || {}) : rep.concessions;
    var optsCie = codes.map(function (c) { return [c, nomCie(c)]; });
    if (rep.voitTout) optsCie.push(['', 'Siège social / groupe']);
    champs.compagnie = choix(e.compagnie || (optsCie[0] || [''])[0], optsCie);
    champs.statut = choix(e.statut || 'actif', [['actif', 'Actif'], ['inactif', 'Inactif'], ['parti', 'Parti']]);
    champs.langue = choix(e.langue || '', [['', '—'], ['fr', 'Français'], ['en', 'Anglais']]);
    var s = e.sensible || {}, sens = {};
    var urg = (e.urgence || []).slice(0, 4); while (urg.length < 2) urg.push({});
    var lignesUrg = urg.map(function (u) {
      var r = { nom: saisie(u.nom, { placeholder: 'Nom' }), relation: saisie(u.relation, { placeholder: 'Lien (conjoint, parent…)' }), telephone: saisie(u.telephone, { placeholder: 'Téléphone', inputmode: 'tel' }),
        autreTel: saisie(u.autreTel, { placeholder: 'Autre téléphone', inputmode: 'tel' }), courriel: saisie(u.courriel, { placeholder: 'Courriel', type: 'email' }) };
      r.el = h('div.emp-urg', [r.nom, r.relation, r.telephone, r.autreTel, r.courriel]);
      return r;
    });
    var corps = h('div.emp-form', [
      h('div.emp-h', { text: 'Identité' }),
      h('div.grille', [t('prenom', 'Prénom'), t('deuxiemeNom', 'Deuxième prénom'), t('nom', 'Nom de famille'), t('nomPrefere', 'Nom préféré'), t('numero', 'No d\'employé'), champ('Statut', champs.statut), champ('Langue', champs.langue)]),
      peutSens ? h('div.emp-h', { text: 'Renseignements confidentiels (fichier privé)' }) : null,
      peutSens ? h('div.grille.emp-sensible', [
        champ('NAS', sens.nas = saisie(s.nas, { inputmode: 'numeric', placeholder: s.nasMasque || '9 chiffres' }), 'Jamais dans une feuille.'),
        champ('Date de naissance', sens.naissance = saisie(s.naissance, { type: 'date' })),
        champ('NAS : date d\'expiration', sens.nasExpire = saisie(s.nasExpire, { type: 'date' }), 'NAS temporaire (débute par 9) seulement.'),
        champ('Sexe à la naissance', sens.sexe = saisie(s.sexe)), champ('État civil', sens.etatCivil = saisie(s.etatCivil))
      ]) : null,
      h('div.emp-h', { text: 'Emploi' }),
      h('div.grille', [champ('Concession', champs.compagnie), t('emplacement', 'Emplacement'), t('marque', 'Marque'), t('poste', 'Poste'), t('departement', 'Département'), t('superieur', 'Supérieur'), t('horaire', 'Horaire'),
        d('dateEmbauche', 'Date d\'embauche'), d('dateAnciennete', 'Ancienneté depuis'), d('datePoste', 'Dans ce poste depuis'), t('syndicat', 'Syndicat'), t('assuranceCollective', 'Assurance collective')]),
      h('div.emp-h', { text: 'Coordonnées' }),
      h('div.grille', [t('courrielTravail', 'Courriel (travail)', { type: 'email' }), t('courrielPerso', 'Courriel personnel', { type: 'email' }), t('telCell', 'Cellulaire', { inputmode: 'tel' }), t('telDomicile', 'Domicile', { inputmode: 'tel' }),
        t('telTravail', 'Téléphone au travail', { inputmode: 'tel' }), t('posteTel', 'Poste téléphonique'), t('adresse1', 'Adresse'), t('adresse2', 'Adresse (suite)'), t('ville', 'Ville'), t('province', 'Province'), t('codePostal', 'Code postal')]),
      h('div.emp-h', { text: 'Contacts d\'urgence' }),
      h('div', lignesUrg.map(function (r) { return r.el; })),
      h('div.emp-h', { text: 'Notes (RH)' }),
      champs.notes = h('textarea.saisie', { rows: 3, text: e.notes || '' })
    ]);
    AMX.modale({ titre: nouveau ? 'Nouvel employé' : 'Modifier — ' + [e.prenom, e.nom].filter(Boolean).join(' '), corps: corps, large: true, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      var x = { id: e.id || '' };
      Object.keys(champs).forEach(function (k) { x[k] = champs[k].value; });
      x.urgence = lignesUrg.map(function (r) { return { nom: r.nom.value, relation: r.relation.value, telephone: r.telephone.value, autreTel: r.autreTel.value, courriel: r.courriel.value }; })
        .filter(function (u) { return u.nom || u.telephone; });
      var corpsPost = { action: 'employeEnregistrer', employe: x };
      if (peutSens) {
        var sv = {}, change = false;
        Object.keys(sens).forEach(function (k) { var v = sens[k].value.trim(); if (v !== (s[k] || '')) { sv[k] = v; change = true; } });
        if (change) corpsPost.sensible = sv;
      }
      return ecrire(corpsPost).then(function (r) {
        poser(r.employe);
        AMX.toast(nouveau ? 'Employé ajouté' : 'Dossier enregistré', 'ok');
        if (nouveau) setTimeout(function () { self.ouvrirFiche(r.employe.id); }, 50);
      }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); throw er; });
    } }] });
  };

  /* ------------------------------------------------------------------------------- départ */
  VueEmployes.prototype.depart = function (e, retablir) {
    if (retablir) return ecrire({ action: 'employeDepart', id: e.id, retablir: true }).then(function (r) { poser(r.employe); AMX.toast('De nouveau actif', 'ok'); return r.employe; }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); return null; });
    return new Promise(function (res) {
      var inDate = saisie(new Date().toISOString().slice(0, 10), { type: 'date' }), inRaison = saisie('', { placeholder: 'Démission, fin d\'emploi, retraite…' });
      AMX.modale({ titre: 'Départ — ' + [e.prenom, e.nom].filter(Boolean).join(' '), corps: h('div.emp-form', [
        h('p', { text: 'Le dossier est gardé (rien n\'est effacé) ; l\'employé passe dans « Partis ».' }),
        h('div.grille', [champ('Date du départ', inDate), champ('Raison (facultatif)', inRaison)])
      ]), boutons: [{ texte: 'Annuler', action: function (f) { res(null); f(); return false; } }, { texte: 'Enregistrer le départ', classe: 'danger', action: function () {
        return ecrire({ action: 'employeDepart', id: e.id, date: inDate.value, raison: inRaison.value }).then(function (r) { poser(r.employe); AMX.toast('Départ enregistré', 'ok'); res(r.employe); })
          .catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); throw er; });
      } }], onFermer: function () { res(null); } });
    });
  };

  /* ------------------------------------------------------------------------------- export */
  VueEmployes.prototype.exporter = function () {
    var liste = this.filtrer(), ajd = this.rep.aujourdhui;
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var lignes = liste.map(function (e) {
      return { 'No': e.numero, 'Prénom': e.prenom, 'Nom': e.nom, 'Nom préféré': e.nomPrefere, 'Concession': nomCie(e.compagnie), 'Emplacement': e.emplacement, 'Poste': e.poste, 'Département': e.departement,
        'Supérieur': e.superieur, 'Embauche': e.dateEmbauche, 'Ancienneté': anciennete(e.dateEmbauche, ajd), 'Statut': STATUTS[e.statut] || e.statut, 'Départ': e.dateDepart, 'Courriel (travail)': e.courrielTravail,
        'Cellulaire': tel(e.telCell), 'Contact d\'urgence': (e.urgence || []).map(function (u) { return [u.nom, u.relation, tel(u.telephone)].filter(Boolean).join(' '); }).join(' ; '), 'Source': SOURCES[e.source] || e.source };
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Employés');
    XLSX.writeFile(wb, 'employes-' + (this.compagnie || 'groupe') + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  };

  /* ------------------------------------------------------------------------------- import : HR4 (favori) et fichier (Desjardins) */
  /* Colonnes reconnues dans un fichier (en-têtes normalisés : minuscules, sans accents ni ponctuation). */
  var COLONNES = [
    ['numero', ['matricule', 'no employe', 'numero employe', 'numero d employe', 'no d employe', 'employee number', 'employee id', 'id employe', 'code employe', 'numero']],
    ['prenom', ['prenom', 'first name', 'firstname', 'given name']],
    ['nom', ['nom de famille', 'nom', 'last name', 'lastname', 'surname', 'family name']],
    ['nomComplet', ['nom complet', 'employe', 'nom de l employe', 'full name', 'name', 'nom prenom', 'nom et prenom']],
    ['courrielTravail', ['courriel travail', 'courriel professionnel', 'work email', 'courriel', 'email', 'adresse courriel', 'courriel electronique']],
    ['courrielPerso', ['courriel personnel', 'personal email', 'courriel perso']],
    ['telCell', ['cellulaire', 'cell', 'mobile', 'telephone cellulaire', 'cell phone', 'mobile phone']],
    ['telDomicile', ['telephone', 'telephone domicile', 'domicile', 'home phone', 'tel', 'phone']],
    ['adresse1', ['adresse', 'address', 'adresse 1', 'rue', 'adresse civique']],
    ['ville', ['ville', 'city', 'municipalite']],
    ['province', ['province', 'prov', 'state']],
    ['codePostal', ['code postal', 'postal code', 'cp', 'zip']],
    ['poste', ['poste', 'titre du poste', 'titre', 'fonction', 'emploi', 'job title', 'position', 'occupation']],
    ['departement', ['departement', 'service', 'department', 'division']],
    ['compagnie', ['concession', 'emplacement', 'etablissement', 'location', 'succursale', 'compagnie', 'employeur', 'entreprise', 'company']],
    ['superieur', ['superieur', 'gestionnaire', 'manager', 'supervisor']],
    ['dateEmbauche', ['date d embauche', 'date embauche', 'embauche', 'hire date', 'date d entree', 'date entree', 'date de debut', 'start date']],
    ['dateDepart', ['date de depart', 'date depart', 'termination date', 'date de fin d emploi', 'fin d emploi', 'date de cessation']],
    ['statut', ['statut', 'status', 'etat', 'statut d emploi']],
    ['s:nas', ['nas', 'numero d assurance sociale', 'no assurance sociale', 'assurance sociale', 'sin', 'social insurance number']],
    ['s:naissance', ['date de naissance', 'naissance', 'date naissance', 'birth date', 'date of birth', 'dob']],
    ['s:sexe', ['sexe', 'genre', 'gender', 'sex']],
    ['s:etatCivil', ['etat civil', 'marital status']]
  ];
  var LIBELLES = { numero: 'No d\'employé', prenom: 'Prénom', nom: 'Nom de famille', nomComplet: 'Nom complet', courrielTravail: 'Courriel (travail)', courrielPerso: 'Courriel personnel', telCell: 'Cellulaire',
    telDomicile: 'Téléphone', adresse1: 'Adresse', ville: 'Ville', province: 'Province', codePostal: 'Code postal', poste: 'Poste', departement: 'Département', compagnie: 'Concession / emplacement',
    superieur: 'Supérieur', dateEmbauche: 'Date d\'embauche', dateDepart: 'Date de départ', statut: 'Statut', 's:nas': 'NAS (fichier privé)', 's:naissance': 'Date de naissance (fichier privé)',
    's:sexe': 'Sexe (fichier privé)', 's:etatCivil': 'État civil (fichier privé)' };
  function norm(s) { s = String(s || '').toLowerCase(); if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); return s.replace(/[^a-z0-9]+/g, ' ').trim(); }
  function deviner(entetes) {
    var pris = {}, out = entetes.map(function () { return ''; });
    COLONNES.forEach(function (c) {
      if (pris[c[0]]) return;
      for (var a = 0; a < c[1].length; a++) {
        for (var i = 0; i < entetes.length; i++) {
          if (out[i]) continue;
          if (norm(entetes[i]) === c[1][a]) { out[i] = c[0]; pris[c[0]] = 1; return; }
        }
      }
    });
    /* Deuxième passage : l'en-tête commence par l'alias (« Courriel du travail »). */
    COLONNES.forEach(function (c) {
      if (pris[c[0]]) return;
      for (var i = 0; i < entetes.length; i++) {
        if (out[i]) continue;
        var n = norm(entetes[i]);
        if (c[1].some(function (a) { return a.length >= 4 && n.indexOf(a) === 0; })) { out[i] = c[0]; pris[c[0]] = 1; return; }
      }
    });
    return out;
  }
  function lireCsv(texte) {
    texte = String(texte || '').replace(/^﻿/, '');
    var premiere = texte.split(/\r?\n/)[0] || '', sep = ',';
    var m = /^sep=(.)/i.exec(premiere); if (m) { sep = m[1]; texte = texte.slice(premiere.length).replace(/^\r?\n/, ''); }
    else { var cand = [';', '\t', '|', ','], best = 0; cand.forEach(function (c) { var n = premiere.split(c).length; if (n > best) { best = n; sep = c; } }); }
    var lignes = [], ligne = [], cell = '', q = false;
    for (var i = 0; i < texte.length; i++) {
      var ch = texte[i];
      if (q) { if (ch === '"') { if (texte[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if (ch === '"') { q = true; continue; }
      if (ch === sep) { ligne.push(cell); cell = ''; continue; }
      if (ch === '\n' || ch === '\r') { if (ch === '\r' && texte[i + 1] === '\n') i++; ligne.push(cell); lignes.push(ligne); ligne = []; cell = ''; continue; }
      cell += ch;
    }
    if (cell || ligne.length) { ligne.push(cell); lignes.push(ligne); }
    return lignes.filter(function (l) { return l.some(function (c) { return String(c).trim(); }); });
  }
  function lireTableau(f) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onerror = function () { rej(new Error('Lecture du fichier impossible.')); };
      if (/\.(csv|txt|tsv)$/i.test(f.name) || typeof XLSX === 'undefined') {
        r.onload = function () { var t = String(r.result || ''); if (t.indexOf('�') >= 0) { var r2 = new FileReader(); r2.onload = function () { res(lireCsv(r2.result)); }; r2.readAsText(f, 'ISO-8859-1'); } else res(lireCsv(t)); };
        r.readAsText(f, 'UTF-8');
      } else {
        r.onload = function () {
          try {
            var wb = XLSX.read(r.result, { type: 'array' }), meilleur = null;
            wb.SheetNames.forEach(function (n) { var rangs = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }); if (!meilleur || rangs.length > meilleur.length) meilleur = rangs; });
            res((meilleur || []).filter(function (l) { return l.some(function (c) { return String(c).trim(); }); }));
          } catch (e) { rej(new Error('Fichier Excel illisible.')); }
        };
        r.readAsArrayBuffer(f);
      }
    });
  }
  /* La ligne d'en-tête : la première des 15 premières qui reconnaît le plus de colonnes. */
  function trouverEntete(rangs) {
    var best = 0, n = -1;
    for (var i = 0; i < Math.min(15, rangs.length); i++) { var k = deviner(rangs[i].map(String)).filter(Boolean).length; if (k > n) { n = k; best = i; } }
    return best;
  }
  function statutDe(v) {
    var s = norm(v);
    if (!s) return '';
    if (/^(actif|active|en poste|employe|a l emploi)/.test(s)) return 'actif';
    if (/(termin|depart|parti|demission|cess|fin d emploi|quit)/.test(s)) return 'parti';
    if (/(inactif|inactive|conge|suspend|leave)/.test(s)) return 'inactif';
    return '';
  }
  function versEmploye(rang, carte) {
    var e = { sensible: {} };
    carte.forEach(function (cle, i) {
      if (!cle) return;
      var v = String(rang[i] === undefined ? '' : rang[i]).trim();
      if (!v) return;
      if (cle.indexOf('s:') === 0) { e.sensible[cle.slice(2)] = v; return; }
      if (cle === 'nomComplet') {
        if (v.indexOf(',') > 0) { var p = v.split(','); e.nom = e.nom || p[0].trim(); e.prenom = e.prenom || p.slice(1).join(' ').trim(); }
        else { var m = v.split(/\s+/); e.prenom = e.prenom || m.shift(); e.nom = e.nom || m.join(' '); }
        return;
      }
      if (cle === 'statut') { var st = statutDe(v); if (st) e.statut = st; return; }
      e[cle] = v;
    });
    if (!Object.keys(e.sensible).length) delete e.sensible;
    return e;
  }

  VueEmployes.prototype.importer = function () {
    var self = this, rep = this.rep || {}, imports = rep.imports || {};
    var etatSource = function (src) { var x = imports[src]; return x ? 'Dernier import : ' + dateHeure(x.le) + (x.par ? ' par ' + x.par : '') + ' — ' + (x.ajoutes || 0) + ' ajouté(s), ' + (x.modifies || 0) + ' mis à jour.' : 'Jamais importé.'; };
    var code = CODE_SIGNET_HR4 || '';
    var signet = h('a.emp-signet', { href: code || '#', text: '★ Automax ← HR4 (employés)', title: 'Glissez ce bouton dans la barre des favoris de Chrome', onclick: function (ev) { ev.preventDefault(); AMX.toast('Glissez ce bouton dans la barre des favoris, puis cliquez-le dans HR4.', 'info'); } });
    /* Fichier (Desjardins / autre) */
    var selSource = choix('desjardins', [['desjardins', 'Desjardins (Employeur D)'], ['fichier', 'Autre fichier (CSV / Excel)']]);
    var codes = rep.concessions === '*' || !Array.isArray(rep.concessions) ? Object.keys(AMX.COMPAGNIES_TOUTES || {}) : rep.concessions;
    var selCie = choix(this.compagnie || '', [['', 'D\'après la colonne « Concession » du fichier']].concat(codes.map(function (c) { return [c, nomCie(c)]; })));
    var inFichier = h('input', { type: 'file', accept: '.csv,.txt,.tsv,.xlsx,.xls' });
    var elCarte = h('div'), elProg = h('p.emp-prog'), donnees = null, carte = null, debut = 0;
    var dessinerCarte = function () {
      AMX.vider(elCarte);
      if (!donnees) return;
      var ent = donnees[debut].map(String), ex = donnees[debut + 1] || [];
      var options = [['', '— ignorer —']].concat(COLONNES.map(function (c) { return [c[0], LIBELLES[c[0]] || c[0]]; }));
      var tb = h('tbody');
      ent.forEach(function (n, i) {
        var s = choix(carte[i], options);
        s.addEventListener('change', function () { carte[i] = s.value; resume(); });
        var exemple = /nas|assurance sociale|sin\b|naissance|birth/i.test(n) ? '•••' : String(ex[i] === undefined ? '' : ex[i]).slice(0, 40);
        tb.appendChild(h('tr', [h('td', [h('b', { text: n || '(sans titre)' })]), h('td.ex', { text: exemple }), h('td', [s])]));
      });
      elCarte.appendChild(h('table.emp-map', [h('thead', [h('tr', [h('th', 'Colonne du fichier'), h('th', 'Exemple'), h('th', 'Va dans')])]), tb]));
      resume();
    };
    var resume = function () {
      if (!donnees) { elProg.textContent = ''; return; }
      var n = donnees.length - debut - 1, ok = carte.indexOf('nom') >= 0 || carte.indexOf('nomComplet') >= 0;
      var sens = carte.filter(function (c) { return c.indexOf('s:') === 0; }).length;
      elProg.textContent = n + ' ligne(s) à envoyer.' + (ok ? '' : ' Choisissez au moins la colonne du nom.') + (sens ? ' Les renseignements confidentiels (' + sens + ' colonne(s)) iront dans le fichier privé.' : '') +
        (!selCie.value && carte.indexOf('compagnie') < 0 ? ' Sans concession choisie ni colonne « Concession », les employés iront au siège social.' : '');
    };
    inFichier.addEventListener('change', function () {
      var f = inFichier.files && inFichier.files[0]; if (!f) return;
      elProg.textContent = 'Lecture de ' + f.name + '…';
      lireTableau(f).then(function (rangs) {
        if (rangs.length < 2) throw new Error('Le fichier n\'a pas de lignes.');
        donnees = rangs; debut = trouverEntete(rangs); carte = deviner(rangs[debut].map(String));
        if (/desjardins|employeur/i.test(f.name)) selSource.value = 'desjardins';
        dessinerCarte();
      }).catch(function (er) { donnees = null; AMX.vider(elCarte); elProg.textContent = AMX.erreurTexte(er); });
    });
    selCie.addEventListener('change', resume);
    var envoyer = function () {
      if (!donnees) { AMX.toast('Choisissez d\'abord un fichier.', 'attention'); return Promise.reject(new Error('fichier')); }
      if (carte.indexOf('nom') < 0 && carte.indexOf('nomComplet') < 0) { AMX.toast('Choisissez la colonne du nom.', 'attention'); return Promise.reject(new Error('nom')); }
      var employes = donnees.slice(debut + 1).map(function (r) { return versEmploye(r, carte); }).filter(function (e) { return e.nom || e.prenom; });
      var lots = [], total = { ajoutes: 0, modifies: 0, inchanges: 0, horsPortee: 0, sansNom: 0 }, passage = new Date().toISOString();
      for (var i = 0; i < employes.length; i += 150) lots.push(employes.slice(i, i + 150));
      var suite = Promise.resolve();
      lots.forEach(function (lot, k) {
        suite = suite.then(function () {
          elProg.textContent = 'Envoi ' + (k + 1) + ' / ' + lots.length + '…';
          return ecrire({ action: 'employesImporter', source: selSource.value, compagnie: selCie.value, passage: passage, dernier: k === lots.length - 1, employes: lot }, { delai: 180000 }).then(function (r) {
            Object.keys(total).forEach(function (c) { total[c] += Number(r[c]) || 0; });
          });
        });
      });
      return suite.then(function () {
        AMX.toast(employes.length + ' lus — ' + total.ajoutes + ' ajouté(s), ' + total.modifies + ' mis à jour, ' + total.inchanges + ' inchangé(s)' + (total.horsPortee ? ', ' + total.horsPortee + ' hors de votre accès' : ''), 'ok', 9000);
        self.charger(true);
      }).catch(function (er) { elProg.textContent = AMX.erreurTexte(er); AMX.toast(AMX.erreurTexte(er), 'erreur'); throw er; });
    };
    var corps = h('div.emp-import', [
      h('div.bloc', [
        h('h3', { text: 'HR4 (Volkswagen Brossard, BMW Sherbrooke)' }),
        h('p', { text: 'Le favori lit, dans votre session HR4, la fiche de chaque employé (identité, emploi, coordonnées, contacts d\'urgence, NAS et date de naissance) et les documents du Tableau de santé et sécurité, puis les envoie ici. Rien n\'est écrit dans HR4.' }),
        h('ol', [
          h('li', { text: 'Glissez le bouton vert dans la barre des favoris de Chrome (une seule fois).' }),
          h('li', [document.createTextNode('Ouvrez HR4 › Dossier des employés ('), h('a', { href: HR4, target: '_blank', rel: 'noopener', text: 'automax.hr4.ca' }), document.createTextNode(') et connectez-vous.')]),
          h('li', { text: 'Cliquez le favori : une bande verte suit la lecture ; gardez l\'onglet ouvert (≈ 1 min pour 100 employés).' })
        ]),
        code ? signet : h('div.emp-avis', { text: 'Le favori n\'est pas encore construit dans cette version du site.' }),
        h('p.emp-prog', { text: etatSource('hr4') })
      ]),
      h('div.bloc', [
        h('h3', { text: 'Desjardins — Employeur D (Ste-Marie, Hawkesbury, Hyundai Longueuil)' }),
        h('p', { text: 'Dans Employeur D (Desjardins), exportez la liste des employés en Excel ou en CSV, puis déposez-la ici. Les colonnes sont reconnues d\'elles-mêmes ; corrigez au besoin avant d\'importer.' }),
        h('div.grille', { style: { display: 'grid', gap: '8px' } }, [champ('Source', selSource), champ('Concession', selCie), champ('Fichier', inFichier)]),
        elCarte, elProg,
        h('p.emp-prog', { text: etatSource('desjardins') })
      ])
    ]);
    AMX.modale({ titre: 'Importer les employés', corps: corps, large: true, proteger: false, boutons: [{ texte: 'Fermer' }, { texte: 'Importer le fichier', classe: 'primaire', action: function () { return envoyer().then(function () { return true; }); } }] });
  };
})();
