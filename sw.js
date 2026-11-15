/* SPDX-License-Identifier: Apache-2.0 */
'use strict';
const PREFIX = 'subhunt:' + self.registration.scope + ':';
const CACHE = PREFIX + 'v4';
const FILES = ['./','./index.html','./style.css','./js/sim.js','./js/controller.js','./js/render.js','./js/app.js','./js/music.js','./vendor/vanillajs/audio2d.js','./assets/icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const key of await caches.keys()) {
    if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    if (key === 'subhunt-bathtub-v1') {
      const entries = await (await caches.open(key)).keys();
      if (entries.length && entries.every(r => r.url.startsWith(self.registration.scope))) await caches.delete(key);
    }
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  if (!FILES.some(f => new URL(f, self.registration.scope).href === e.request.url)) return;
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request)).then(cached => cached || fetch(e.request)));
});
