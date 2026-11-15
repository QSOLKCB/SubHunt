/* SPDX-License-Identifier: Apache-2.0 */
'use strict';
const CACHE='subhunt-bathtub-v1';
const FILES=['./','./index.html','./style.css','./js/sim.js','./js/render.js','./js/app.js','./assets/icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('subhunt-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  if(!FILES.some(f=>new URL(f,self.registration.scope).href===e.request.url))return;
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request)));
});
