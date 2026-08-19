/* =====================================================================
   Enlace Ops — service worker
   É o que faz o app ABRIR sem internet. Sem ele, o técnico que fecha a
   aba no meio do mato não consegue reabrir, mesmo com o rascunho salvo.

   Estratégia:
   - app (html, libs, ícones): cache primeiro, rede depois. Abre instantâneo
     e funciona offline.
   - Supabase (API e Storage): SEMPRE rede, nunca cache. Dado de obra não
     pode vir velho, e resposta autenticada em cache é risco de vazamento
     entre usuários no mesmo aparelho.
   ===================================================================== */

const VERSAO = 'enlace-v9';        // troque a cada build enviado ao campo

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

// ---------- instalação: baixa tudo de uma vez ----------
self.addEventListener('install', (ev)=>{
  ev.waitUntil(
    caches.open(VERSAO)
      .then(c => c.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())      // assume o controle sem esperar
  );
});

// ---------- ativação: joga fora versões antigas ----------
self.addEventListener('activate', (ev)=>{
  ev.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(k => k !== VERSAO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ---------- requisições ----------
self.addEventListener('fetch', (ev)=>{
  const req = ev.request;
  if(req.method !== 'GET') return;                 // POST/PUT do envio: passa direto

  const url = new URL(req.url);

  // Supabase e serviços externos: nunca guardar em cache
  if(url.hostname.includes('supabase.co') ||
     url.hostname.includes('nominatim') ||
     url.hostname.includes('openstreetmap')){
    return;                                        // deixa o navegador cuidar
  }

  // navegação (abrir o app): tenta a rede, cai pro cache se estiver offline
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

  // demais arquivos do app: cache primeiro
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

// ---------- o app pede pra atualizar agora ----------
self.addEventListener('message', (ev)=>{
  if(ev.data === 'atualizar-agora') self.skipWaiting();
});
