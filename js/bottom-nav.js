// ============================================================
// bottom-nav.js — navegação inferior do GymTracker (só celular)
//
// Como usar: em cada página que tem a barra de navegação do topo,
// adicione ANTES de </body>:
//     <script src="/js/bottom-nav.js" defer></script>
//
// - Só aparece em telas até 768px. No computador nada muda.
// - Esconde a faixa de links do topo no celular (a marca e o
//   botão Sair continuam lá).
// - Atalho de "Treinar" no botão redondo central.
// - "Mais" abre uma folha com: Histórico, Biblioteca, Avaliação
//   física, Perfil e Sair.
// - Usa as variáveis de cor do css/global.css (--orange, --bg-2…),
//   com valores padrão caso alguma falte.
// - Para desligar numa página: <html data-no-bottom-nav>
// ============================================================
(function () {
  'use strict';

  if (window.__gtBottomNav) return;
  window.__gtBottomNav = true;

  var raiz = document.documentElement;
  if (raiz.hasAttribute('data-no-bottom-nav')) return;

  // "/dashboard.html" -> "dashboard"
  var atual = location.pathname.replace(/\/+$/, '').replace(/^\//, '').replace(/\.html$/, '');
  if (!atual || atual === 'index' || atual === 'treino') return; // login e tela de treino têm layout próprio

  // ── Ícones (SVG próprios, traço fino) ─────────────────────
  function svg(inner, extra) {
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' + (extra || '') + '>' + inner + '</svg>';
  }
  var ICON = {
    home:  svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/>'),
    list:  svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h4"/>'),
    play:  '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
    chart: svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
    more:  '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>'
  };

  var MAIS = [
    { id: 'historico',        href: '/historico.html',        label: 'Histórico' },
    { id: 'biblioteca',       href: '/biblioteca.html',       label: 'Biblioteca de exercícios' },
    { id: 'avaliacao-fisica', href: '/avaliacao-fisica.html', label: 'Avaliação física' },
    { id: 'perfil',           href: '/perfil.html',           label: 'Perfil' }
  ];
  var idsMais = MAIS.map(function (m) { return m.id; }).concat(['diagnostico-videos']);
  var maisAtivo = idsMais.indexOf(atual) !== -1;

  // ── Estilos (injetados, só valem até 768px) ───────────────
  var css = [
    '.gt-bn, .gt-bn-overlay, .gt-bn-sheet { display: none; }',
    '@media (max-width: 768px) {',
    '  body.has-bottom-nav { padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px)); }',
    '  body.has-bottom-nav .navbar-nav { display: none; }',
    '  body.has-bottom-nav #gt-toast { bottom: calc(92px + env(safe-area-inset-bottom, 0px)) !important; right: 16px !important; }',

    '  .gt-bn { display: flex; align-items: stretch; position: fixed; left: 0; right: 0; bottom: 0; z-index: 150;',
    '    height: calc(64px + env(safe-area-inset-bottom, 0px)); padding-bottom: env(safe-area-inset-bottom, 0px);',
    '    background: var(--bg-2, #1c1c1c); border-top: 1px solid var(--border, #323232); }',
    '  .gt-bn-item { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;',
    '    background: none; border: 0; padding: 0; margin: 0; cursor: pointer; text-decoration: none;',
    '    color: var(--text-2, #a0a0a0); font: 600 10.5px/1 "Inter", system-ui, sans-serif; letter-spacing: .02em;',
    '    -webkit-tap-highlight-color: transparent; }',
    '  .gt-bn-item:active { opacity: .7; }',
    '  .gt-bn-item.is-active { color: var(--orange, #f97316); }',

    '  .gt-bn-fab { width: 56px; height: 56px; border-radius: 50%; margin-top: -34px;',
    '    display: flex; align-items: center; justify-content: center; color: #fff;',
    '    background: var(--orange, #f97316);',
    '    box-shadow: 0 6px 20px rgba(249,115,22,.45), 0 0 0 5px var(--bg-2, #1c1c1c); }',
    '  .gt-bn-fab svg { margin-left: 2px; }',
    '  .gt-bn-center { color: var(--text-2, #a0a0a0); }',
    '  .gt-bn-center.is-active { color: var(--orange, #f97316); }',

    '  .gt-bn-overlay { position: fixed; inset: 0; z-index: 160; background: rgba(0,0,0,.6); }',
    '  .gt-bn-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 170;',
    '    background: var(--bg-2, #1c1c1c); border-top: 1px solid var(--border, #323232); border-radius: 20px 20px 0 0;',
    '    padding: 10px 16px calc(18px + env(safe-area-inset-bottom, 0px)); }',
    '  body.gt-bn-open .gt-bn-overlay, body.gt-bn-open .gt-bn-sheet { display: block; }',
    '  body.gt-bn-open { overflow: hidden; }',
    '  .gt-bn-grab { width: 40px; height: 4px; border-radius: 2px; background: var(--border-2, #424242); margin: 0 auto 10px; }',
    '  .gt-bn-row { display: flex; align-items: center; justify-content: space-between; width: 100%; box-sizing: border-box;',
    '    padding: 15px 8px; background: none; border: 0; border-bottom: 1px solid var(--border, #323232);',
    '    color: var(--text, #f0f0f0); font: 500 15px/1.2 "Inter", system-ui, sans-serif; text-align: left; text-decoration: none; cursor: pointer; }',
    '  .gt-bn-row::after { content: "›"; color: var(--text-3, #606060); font-size: 20px; }',
    '  .gt-bn-row.is-active { color: var(--orange, #f97316); }',
    '  .gt-bn-row.gt-bn-out { color: var(--red, #ef4444); border-bottom: 0; }',
    '  .gt-bn-row.gt-bn-out::after { content: ""; }',
    '}'
  ].join('\n');

  var estilo = document.createElement('style');
  estilo.id = 'gt-bottom-nav-css';
  estilo.textContent = css;
  document.head.appendChild(estilo);

  // ── Montagem ──────────────────────────────────────────────
  function aba(id, href, label, icone, ehAtiva) {
    return '<a class="gt-bn-item' + (ehAtiva ? ' is-active' : '') + '" href="' + href + '"' +
      (ehAtiva ? ' aria-current="page"' : '') + '>' + icone + '<span>' + label + '</span></a>';
  }

  var html = '';
  html += aba('dashboard', '/dashboard.html', 'Início', ICON.home, atual === 'dashboard');
  html += aba('fichas', '/fichas.html', 'Fichas', ICON.list, atual === 'fichas');
  html += '<a class="gt-bn-item gt-bn-center" href="/treino.html" aria-label="Iniciar treino">' +
    '<span class="gt-bn-fab">' + ICON.play + '</span><span>Treinar</span></a>';
  html += aba('relatorio', '/relatorio.html', 'Evolução', ICON.chart, atual === 'relatorio');
  html += '<button type="button" class="gt-bn-item' + (maisAtivo ? ' is-active' : '') + '" id="gt-bn-mais" ' +
    'aria-haspopup="dialog" aria-expanded="false">' + ICON.more + '<span>Mais</span></button>';

  var barra = document.createElement('nav');
  barra.className = 'gt-bn';
  barra.setAttribute('aria-label', 'Navegação principal');
  barra.innerHTML = html;

  var overlay = document.createElement('div');
  overlay.className = 'gt-bn-overlay';

  var folha = document.createElement('div');
  folha.className = 'gt-bn-sheet';
  folha.setAttribute('role', 'dialog');
  folha.setAttribute('aria-label', 'Mais opções');
  var htmlFolha = '<div class="gt-bn-grab"></div>';
  MAIS.forEach(function (m) {
    htmlFolha += '<a class="gt-bn-row' + (atual === m.id ? ' is-active' : '') + '" href="' + m.href + '">' + m.label + '</a>';
  });
  htmlFolha += '<button type="button" class="gt-bn-row gt-bn-out" id="gt-bn-sair">Sair</button>';
  folha.innerHTML = htmlFolha;

  function montar() {
    document.body.classList.add('has-bottom-nav');
    document.body.appendChild(barra);
    document.body.appendChild(overlay);
    document.body.appendChild(folha);

    var botaoMais = document.getElementById('gt-bn-mais');

    function abrir() {
      document.body.classList.add('gt-bn-open');
      botaoMais.setAttribute('aria-expanded', 'true');
    }
    function fechar() {
      document.body.classList.remove('gt-bn-open');
      botaoMais.setAttribute('aria-expanded', 'false');
    }

    botaoMais.addEventListener('click', function () {
      if (document.body.classList.contains('gt-bn-open')) fechar(); else abrir();
    });
    overlay.addEventListener('click', fechar);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });
    window.addEventListener('pageshow', fechar); // voltar pelo histórico do navegador

    // Sair: não depende de função da página — fala direto com o Supabase
    document.getElementById('gt-bn-sair').addEventListener('click', async function () {
      try {
        var mod = await import('/js/supabase.js');
        await mod.supabase.auth.signOut();
      } catch (err) {
        console.warn('Falha ao sair:', err);
      }
      location.href = '/index.html';
    });
  }

  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
