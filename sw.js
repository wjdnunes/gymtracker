// ============================================================
// sw.js — Service Worker do GymTracker
// Faz cache dos arquivos estáticos (CSS/JS/ícones) e das telas,
// pra abrir mais rápido e funcionar (parcialmente) sem internet.
//
// IMPORTANTE: nunca intercepta chamadas ao Supabase — só cuida
// de arquivos do próprio site (mesma origem). Dados de treino
// sempre vêm da rede, nunca do cache.
// ============================================================

const CACHE_VERSION = 'gymtracker-v1';

const ARQUIVOS_ESSENCIAIS = [
  '/', '/index.html', '/dashboard.html', '/biblioteca.html',
  '/fichas.html', '/treino.html', '/historico.html',
  '/relatorio.html', '/perfil.html',
  '/css/global.css',
  '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png',
  '/js/supabase.js', '/js/ExerciseService.js', '/js/WorkoutService.js',
  '/js/WorkoutSessionService.js', '/js/ProfileService.js',
  '/js/StatisticsEngine.js', '/js/ReportEngine.js', '/js/engine.js',
  '/js/EvolutionReportService.js', '/js/MuscleDiagramService.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ARQUIVOS_ESSENCIAIS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(nomes =>
      Promise.all(nomes.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Só cuida de requisições GET do próprio site.
  // Chamadas ao Supabase (outra origem) passam direto pela rede.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  const ehArquivoEstatico = /\.(css|js|png|svg|ico|json)$/.test(url.pathname);

  if (ehArquivoEstatico) {
    // Cache-first: estático raramente muda, prioriza velocidade
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          return resp;
        })
      )
    );
  } else {
    // Network-first: telas .html sempre tentam buscar a versão mais
    // nova primeiro; se estiver offline, cai pro que tiver no cache.
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          return resp;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('/dashboard.html')))
    );
  }
});
