// Service worker : met l'appli en cache (hors connexion) et reçoit les partages Android vers Titi-Sti.
const CACHE = 'titi-sti-v5';
const FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== 'titi-inbox').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Partage reçu (image de carte, fichier, lien, texte) : on le dépose dans une « boîte aux lettres » puis on ouvre l'appli.
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const fd = await e.request.formData();
      const c = await caches.open('titi-inbox');
      const f = fd.getAll('files').find(x => x && typeof x === 'object' && x.size);
      await c.put('inbox-meta', new Response(JSON.stringify({
        title: fd.get('title') || '', text: fd.get('text') || '', url: fd.get('url') || '',
        hasFile: !!f, type: f ? f.type : '', name: f ? f.name : '',
      })));
      if (f) await c.put('inbox-file', new Response(f));
      return Response.redirect(new URL('./?inbox=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Réseau d'abord (mises à jour), cache si hors ligne.
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
