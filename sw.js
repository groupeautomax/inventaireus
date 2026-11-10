/* Automax 2.0 — service worker du site (10 nov. 2026).
   Maxime : « comment est-ce qu'on peut le mettre sur Android ? » → le site s'installe comme une application
   (manifest.webmanifest : icône sur l'écran d'accueil, plein écran, raccourci « Scanner un NIV »).

   Ce fichier fait le moins possible, exprès :
   - il ne garde AUCUNE donnée (ni inventaire, ni ventes, ni jeton) : les données restent celles du serveur ;
   - il ne touche qu'à l'ouverture de la page principale (index.html) : le réseau d'abord, toujours ; seulement quand
     il n'y a pas de réseau du tout, il montre hors-ligne.html au lieu de la page d'erreur du navigateur ;
   - tout le reste (scripts ?v=, script.google.com, pont.html, vitrine/, service/, rh/, client/…) passe sans lui.
   Pour le retirer un jour : remplacer ce fichier par un service worker vide qui appelle self.registration.unregister(). */
var VERSION = 'amx-pwa-1';
var HORS_LIGNE = 'hors-ligne.html';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION)
      .then(function (c) { return c.addAll([HORS_LIGNE, 'assets/icones/icone-192.png']); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (noms) { return Promise.all(noms.filter(function (n) { return n.indexOf('amx-pwa-') === 0 && n !== VERSION; }).map(function (n) { return caches.delete(n); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var racine = new URL(self.registration.scope).pathname;          // ex. /inventaireus/
  if (url.pathname !== racine && url.pathname !== racine + 'index.html') return;
  e.respondWith(
    fetch(req).catch(function () {
      return caches.match(HORS_LIGNE).then(function (r) {
        return r || new Response('<meta charset="utf-8"><p style="font-family:sans-serif;padding:24px">Pas de connexion Internet. Réessayez dans un instant.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      });
    })
  );
});
