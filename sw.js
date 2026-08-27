// Enlace Ops — service worker
//
// O QUE MUDOU E POR QUÊ
//
// A versão anterior guardava o index.html no cache e servia dele primeiro
// (cache-first). Funcionava offline, mas tinha um custo caro: depois de subir
// uma versão nova no GitHub, o aparelho continuava abrindo a antiga até
// alguém limpar o cache na mão. Na prática, toda atualização virava uma
// mensagem no grupo pedindo pro pessoal "atualizar a página".
//
// Agora o HTML é network-first: com internet, o app SEMPRE pega a página nova
// do servidor; o cache só entra quando não há rede. Ou seja, subiu no GitHub,
// a próxima abertura já está atualizada — sem ninguém precisar fazer nada.
//
// A constante VERSAO abaixo continua existindo, mas só nomeia o cache. Ela NÃO
// precisa mais ser trocada a cada build pra atualização funcionar. Trocar só
// força a limpeza dos arquivos de apoio (lib/, ícones) — o que faz sentido
// quando você troca uma biblioteca, não a cada ajuste no index.

const VERSAO = 'enlace-2026-08-27';
const CACHE  = 'enlace-cache-' + VERSAO;

// Arquivos de apoio. O index NÃO entra aqui de propósito: ele é buscado da
// rede e guardado a cada visita, pelo fetch lá embaixo.
const ESTATICOS = [
  './manifest.json',
  './lib/supabase.js',
  './lib/jspdf.umd.min.js',
  './icones/icone-192.png',
  './icones/icone-512.png',
  './icones/maskable-192.png',
  './icones/maskable-512.png',
  './icones/favicon.png',
];

self.addEventListener('install', (e)=>{
  e.waitUntil((async ()=>{
    const c = await caches.open(CACHE);
    // allSettled, não addAll: com addAll, UM arquivo faltando (um ícone
    // renomeado, por exemplo) faz a instalação inteira falhar, e aí o app
    // fica sem service worker nenhum — sem offline e sem atualização.
    await Promise.allSettled(
      ESTATICOS.map(u => c.add(new Request(u, {cache:'reload'})))
    );
    // guarda também a página, pra primeira visita já ficar utilizável offline
    try{
      const r = await fetch(new Request('./index.html', {cache:'reload'}));
      if(r && r.ok) await c.put('./index.html', r.clone());
    }catch(err){}
  })());
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async ()=>{
    const chaves = await caches.keys();
    await Promise.all(chaves.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// A página manda esta mensagem quando decide aplicar a versão nova.
// O skipWaiting fica AQUI, e não no install, de propósito: assim quem escolhe
// a hora de trocar é o app — no meio de uma obra sendo preenchida, trocar o
// service worker recarregaria a tela e o técnico perderia o que digitou.
self.addEventListener('message', (e)=>{
  if(e.data === 'atualizar-agora') self.skipWaiting();
});

function ehPagina(req){
  return req.mode === 'navigate'
    || req.destination === 'document'
    || (req.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  if(req.method !== 'GET') return;

  let url;
  try{ url = new URL(req.url); } catch(err){ return; }

  // Supabase, mapas, qualquer coisa de fora: passa direto, sem cache.
  // Guardar resposta de API aqui seria a receita pra mostrar obra que já
  // mudou de status.
  if(url.origin !== self.location.origin) return;

  // ---- a página: rede primeiro, cache só como rede reserva
  if(ehPagina(req)){
    e.respondWith((async ()=>{
      try{
        // cache:'reload' pula o cache HTTP do navegador. Sem isso, o GitHub
        // Pages ainda poderia devolver a versão antiga por conta própria.
        const resp = await fetch(new Request(req.url, {cache:'reload', credentials:'same-origin'}));
        if(resp && resp.ok){
          const c = await caches.open(CACHE);
          c.put('./index.html', resp.clone());
        }
        return resp;
      } catch(err){
        const c = await caches.open(CACHE);
        return (await c.match('./index.html'))
            || (await c.match(req))
            || new Response('Sem conexão e sem cópia guardada.', {status:503, headers:{'Content-Type':'text/plain'}});
      }
    })());
    return;
  }

  // ---- resto do site: responde do cache na hora e busca a versão nova por
  // trás, pra próxima abertura já vir atualizada sem travar esta
  e.respondWith((async ()=>{
    const c = await caches.open(CACHE);
    const guardado = await c.match(req);
    const rede = fetch(req).then(r=>{
      if(r && r.ok && r.type === 'basic') c.put(req, r.clone());
      return r;
    }).catch(()=> null);
    return guardado || (await rede)
        || new Response('', {status:504});
  })());
});
