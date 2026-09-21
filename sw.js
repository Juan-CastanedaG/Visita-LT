/* Service worker — cachea la app para uso offline (cache-first con fallback a red).
   Sube el número de versión cada vez que publiques una versión nueva del index.html
   para forzar la actualización en los teléfonos. */
const CACHE='informe-lt-v21';
const ASSETS=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./map.js','./infolt.js','./vendor/leaflet.js','./vendor/leaflet.css','./vendor/jszip.min.js','./vendor/shp.min.js','./vendor/pdf.min.js','./vendor/pdf.worker.min.js','./vendor/images/marker-icon.png','./vendor/images/marker-icon-2x.png','./vendor/images/marker-shadow.png','./vendor/images/layers.png','./vendor/images/layers-2x.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp)).catch(()=>{});return r;}).catch(()=>caches.match('./index.html'))));});
self.addEventListener('message',e=>{if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting();});
