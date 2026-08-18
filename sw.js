const VERSAO = 'fiberflow-v3';

const ARQUIVOS = [
  './',
  './index.html',
  './manifest.json',
  './lib/supabase.js',
  './lib/jspdf.umd.min.js',
  './icones/icone-192.png',
  './icones/icone-512.png',
  './icones/maskable-192.png',
  './icones/maskable-512.png',
  './icones/favicon.png',
];

self.addEventListener('install', (ev)=>{
  ev.waitUntil(
    caches.open(VERSAO)
      .then(c => c.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev)=>{
  ev.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(k => k !== VERSAO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev)=>{
  const req = ev.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);

  if(url.hostname.includes('supabase.co') ||
     url.hostname.includes('nominatim') ||
     url.hostname.includes('openstreetmap')){
    return;
  }

  if(req.mode === 'navigate'){
    ev.respondWith(
      fetch(req)
        .then(resp => {
          const copia = resp.clone();
          caches.open(VERSAO).then(c => c.put('./index.html', copia));
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  ev.respondWith(
    caches.match(req).then(cacheado=>{
      if(cacheado) return cacheado;
      return fetch(req).then(resp=>{
        if(resp && resp.status === 200 && resp.type === 'basic'){
          const copia = resp.clone();
          caches.open(VERSAO).then(c => c.put(req, copia));
        }
        return resp;
      }).catch(()=> cacheado);
    })
  );
});

self.addEventListener('message', (ev)=>{
  if(ev.data === 'atualizar-agora') self.skipWaiting();
});
