// ============================================================
// sw.js — Service Worker do GymTracker
// Faz cache dos arquivos estáticos (CSS/JS/ícones) e das telas,
// pra abrir mais rápido e funcionar (parcialmente) sem internet.
//
// IMPORTANTE: nunca intercepta chamadas ao Supabase — só cuida
// de arquivos do próprio site (mesma origem). Dados de treino
// sempre vêm da rede, nunca do cache.
// ============================================================

// Aumente este número a cada mudança grande: apaga o cache antigo dos usuários.
const CACHE_VERSION = 'gymtracker-v2';

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

  // Código (JS/CSS) e telas (HTML): rede primeiro, cache só se estiver offline.
  // Assim um deploy novo aparece na hora, sem ficar preso numa versão antiga.
  // Imagens, ícones e manifest mudam raramente: cache primeiro, por velocidade.
  const ehCodigo = /\.(css|js)$/.test(url.pathname);
  const ehMidiaEstatica = /\.(png|svg|ico|json)$/.test(url.pathname);

  if (ehMidiaEstatica) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(resp => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return resp;
        })
      )
    );
  } else {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(event.request).then(cached =>
          // Só telas caem na dashboard quando offline; JS/CSS sem cache falham de verdade
          cached || (ehCodigo ? undefined : caches.match('/dashboard.html'))
        ))
    );
  }
});
