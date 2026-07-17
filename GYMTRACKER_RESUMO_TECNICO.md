# GYMTRACKER — Resumo Técnico
_Atualizado: Sessão atual (Diagrama Muscular Reutilizável)_

> ⚠️ Este arquivo é um resumo rápido. O `PROJECT_MEMORY.md` é a fonte de verdade
> mais completa (schema detalhado, decisões arquiteturais, pendências). Se os
> dois divergirem, confie no `PROJECT_MEMORY.md`.

## Stack
- **Frontend:** HTML + CSS + JS ES6 modules (vanilla, sem framework)
- **Backend:** Supabase (Auth + Postgres + RLS)
- **Deploy:** Netlify (ZIP, arquivos na raiz, sem pasta pai)
- **PWA:** manifest.json + service worker (`sw.js`) — instalável no celular,
  funciona parcialmente offline (cache dos arquivos estáticos; dados do
  Supabase nunca são cacheados)
- **Tipografia:** Inter (corpo) + Barlow Condensed (display/headings) — mantida (RFC-022 pedia fonte única, decisão foi não trocar)
- **Tema:** Dark mode — bg `#121212` (RFC-022, evita preto puro/halação em OLED), acento laranja `#f97316` (mantido), radius `12px`

## Supabase
- **Projeto:** tmrdfhwianhamhdwrrsd
- **Credenciais:** já configuradas em `js/supabase.js`
- **Arquivos SQL aplicados, em ordem:** `GYMTRACKER_SCHEMA.sql` → `MIGRATION_v2.sql` → `MIGRATION_v2b.sql` → `MIGRATION_v3.sql` (Biblioteca) → seeds v1/v2/v3 (300 exercícios) → `MIGRATION_v4.sql` (user_profiles) → `MIGRATION_v5.sql` (is_admin) → `MIGRATION_v6.sql` (medidas) → `MIGRATION_v7.sql` (exercise_relations) → `MIGRATION_v8.sql` (populou exercise_relations com 148 relações reais)

## Tabelas principais
| Tabela | Descrição |
|---|---|
| `exercises` + tabelas satélite | Biblioteca de exercícios (ver PROJECT_MEMORY.md pro detalhe completo) |
| `fichas` / `ficha_exercicios` | Planos de treino do usuário |
| `sessoes` / `series_executadas` | Execução de treino (imutável após finalizar). `sessoes.ficha_id` é nullable — permite **treino livre** (sem ficha). `series_executadas` **não tem coluna `user_id`** — usuário é identificado via `sessao_id → sessoes.user_id` |
| `personal_records` | Cache de PRs por exercício |
| `user_profiles` | Perfil do usuário — nome, peso, altura, objetivo, nível, `is_admin` (estado ATUAL) |
| `medidas` | Histórico de peso ao longo do tempo (uma linha por dia) — série temporal, diferente de `user_profiles.peso_kg` |
| `objetivos` / `niveis_experiencia` | Tabelas de domínio pro perfil (lookup, não texto livre) |
| `exercise_relations` | Variações, substituições e progressões entre exercícios — tabela única com `relation_type`, substituiu `exercise_variations`/`exercise_substitutions` (que nunca foram usadas/populadas) |

### Sistema de admin (`MIGRATION_v5.sql`)
Exercícios oficiais (`criado_por IS NULL`) só podem ser editados por quem tem
`user_profiles.is_admin = true`.

### 1RM e PR automático
Fórmula de Epley (`carga × (1 + reps/30)`), comparação automática com
`personal_records` ao salvar série.

## Arquivos
```
index.html               — Login / cadastro
dashboard.html            — Hub principal (usa StatisticsEngine/WorkoutService,
                            sequência de dias real)
biblioteca.html           — CRUD da Biblioteca, preview de vídeo, admin
                            edita/exclui oficiais, gerencia relações
                            (variação/substituição/progressão) entre exercícios
fichas.html                — CRUD de fichas e exercícios
treino.html                 — Execução do treino (UI pura — lógica no service).
                            Suporta ficha normal E "Treino livre" (sem ficha,
                            adiciona exercícios da Biblioteca durante o treino)
historico.html               — Histórico + gráficos de evolução
relatorio.html                — Relatórios de evolução
perfil.html                    — Editar peso/altura/objetivo/nível +
                                 seção "Evolução de peso" (gráfico + histórico)
diagnostico-videos.html         — Ferramenta admin: acha vídeos com código
                                 inválido no YouTube (checa via oEmbed)

manifest.json              — PWA (nome, ícones, cores)
sw.js                       — Service worker (cache de estáticos, offline)
icons/                       — Ícones do app (192/512/apple-touch/favicons) —
                                PLACEHOLDER "GT" laranja, trocar quando o
                                monograma oficial (RFC-022) for desenhado

css/global.css               — Design system (paleta/radius RFC-022 aplicados)

js/supabase.js                — Cliente Supabase + helpers (showToast,
                                 calcular1RM, verificarPR — maybeSingle)
js/ExerciseService.js          — Domínio da Biblioteca
js/WorkoutService.js            — Domínio de Fichas
js/ProfileService.js             — Domínio de Perfil + Medidas corporais
js/WorkoutSessionService.js       — Domínio de Execução de Treino (mobile e
                                    desktop usam a mesma função registrarSerie()).
                                    iniciarSessaoLivre() pro Treino Livre.
                                    Exercícios do treino livre usam
                                    ficha_exercicio_id = null (não existe
                                    ficha_exercicios pra eles) — nunca passar
                                    um ID sintético/client-side pra uma coluna
                                    UUID do banco (causou bug real — ver abaixo)
js/engine.js                      — ProgressEngine (queries filtram user_id
                                    via join com sessoes, mesmo sem coluna
                                    direta na tabela)
js/StatisticsEngine.js             — StatisticsEngine + sequenciaAtual() (streak)
js/MuscleDiagramService.js          — Diagrama muscular reutilizável: mapeia
                                     muscles.name_pt pro SVG certo, sem
                                     tabela nova no banco (ver PROJECT_MEMORY.md
                                     pro pipeline completo de geração)

assets/exercise-base/
  diagrama-frente.svg / diagrama-costas.svg
                                     — corpo-base + 15 músculos recortáveis
                                     por código. Imagem base em WebP (não
                                     PNG) — ~230KB cada, mesma qualidade
                                     visual (PSNR 47dB)
```

## Responsividade (celular)
Todas as páginas têm regras de media query (`max-width: 768px`): navbar vira
faixa que rola horizontalmente, grids empilham em 1 coluna, padding reduzido.
`treino.html` tem versão mobile própria (fork via JS `isMobile`).

## Regras de código (invioláveis)
- Sempre `import { supabase, showToast } from './js/supabase.js'` — nunca `window.supabase`
- `user_id` em todas as queries onde a tabela tem essa coluna; onde não tem
  (ex: `series_executadas`), filtrar via join com `sessoes`
- `showToast()` — nunca `alert()`
- `maybeSingle()` não `single()` quando o resultado pode ser nulo
- Histórico imutável — nunca editar `series_executadas` após sessão finalizada
- YouTube: armazenar só o `video_id`, nunca a URL completa
- Regras de negócio nos Services/Engines, nunca na interface
- Arquivos no deploy: raiz do ZIP, sem pasta pai (exceto `icons/`, que é uma
  subpasta normal)

## RFC-022 (Branding) — status
| Item | Status |
|---|---|
| Paleta laranja | ✅ Mantida (`#f97316`) — decisão consciente |
| Fundo | ✅ `#121212` (evita preto puro) |
| Radius | ✅ `12px` |
| Tipografia única | ❌ Não aplicado — mantido Inter + Barlow Condensed (decisão consciente) |
| Monograma/logo (i + G + barra) | ✅ Implementado — gerado via Nano Banana (Gemini), G legível + i + barra da anilha fundidos num símbolo só |
| Ícone do app / PWA | ✅ Substituído o placeholder "GT" pelo logo oficial, nos 5 tamanhos (512/192/180/32/16) |
| Splash screen customizada | ✅ Implementada em `dashboard.html` (overlay full-screen com ícone + wordmark + "Train Smarter.", tempo mínimo de 500ms, timeout de segurança de 6s) |

### Como o logo foi feito (pra não repetir o processo do zero)
1. Conceito gerado via prompt de imagem (Nano Banana/Gemini): "G" tipográfico
   bold + "i" + barra de anilha atravessando os dois, fundidos num símbolo só.
2. Depois de 2 tentativas ruins (glow/textura/gamer, e depois um "G" abstrato
   demais desenhado à mão em SVG), a versão aprovada saiu de um prompt bem
   específico proibindo gradiente/glow/textura/3D e pedindo G legível.
3. O Nano Banana gerou os tamanhos numa **folha de referência única** (não
   arquivos separados como pedido) — os 5 arquivos finais (`icon-512.png`,
   `icon-192.png`, `apple-touch-icon.png`, `favicon-32.png`, `favicon-16.png`)
   foram extraídos programaticamente dessa folha (recorte quadrado + cantos
   arredondados + resize), não vieram prontos do gerador de imagem.
4. Os 5 arquivos substituíram o placeholder "GT" em `icons/` — nenhum `.html`,
   `manifest.json` ou `sw.js` precisou mudar, já que os nomes de arquivo
   bateram com o que já estava configurado.
5. **Limitação conhecida (RESOLVIDA):** o `icon-512.png` da v1 tinha sido
   ampliado de uma imagem-fonte de ~220px. Depois, o Nano Banana gerou uma
   segunda versão do mesmo ícone **nativa em 1024x1024** — os 5 arquivos
   foram regenerados a partir dela (com uma marca d'água ✦ no canto removida
   programaticamente, preenchendo com a cor de fundo antes do recorte). Hoje
   nenhum tamanho está upscaled.

## Bugs corrigidos (histórico)
- `ExerciseService.atualizar()` salvava em `updated_at` (não existe) → `atualizado_em`
- Extração de ID do YouTube não cortava em `?` → links com `?si=` do
  compartilhamento mobile geravam ID corrompido
- `engine.js`: 4 funções não filtravam por usuário explicitamente (RLS já
  protegia, mas era inconsistente) → corrigido via join com `sessoes`
- `dashboard.html`: busca de fichas sem filtro de `user_id` (RLS protegia,
  mas incorreto) → corrigido usando `WorkoutService.listarFichas()`
- `dashboard.html`: "Sequência atual" nunca foi implementada (`TODO` no
  código, sempre mostrava "—") → implementada em `StatisticsEngine.sequenciaAtual()`
- Treino livre: exercícios adicionados usam um ID temporário gerado no
  navegador (não existe no banco). Passar esse ID pra uma busca de histórico
  (`obterHistoricoExercicio`) causava erro "invalid input syntax for type
  uuid", que travava a função no meio (nav atualizava, painel principal não)
  → corrigido pulando a busca de histórico quando o exercício é do treino
  livre, e blindando o serviço pra nunca aceitar um ID que não seja UUID

## Pendências conhecidas
- Diagrama muscular não mostra secundários que ficam na vista oposta à do
  primário (ex: peito+tríceps — tríceps não aparece, já que só existe na
  vista de costas)
- Rodar `diagnostico-videos.html` periodicamente pra achar vídeos quebrados
- `exercise_relations` tem 148 relações reais (101 variações, 28
  substituições, 19 progressões) cobrindo os grupos principais — mas ainda
  faltam grupos inteiros sem nenhuma relação (abdômen, cardio, mobilidade,
  antebraço, etc.). Dá pra ir expandindo aos poucos.
- Duas duplicatas de nome encontradas na Biblioteca (mesmo exercício, nomes
  quase idênticos, UUIDs diferentes): "Desenvolvimento com halteres/Halteres"
  e "Elevação Pélvica com Barra" (aparece 2x) — vale limpar/mesclar algum dia

## Plano de Sessões (histórico)
- **Sessão 1 ✅** — Schema SQL + supabase.js + index.html + dashboard.html + fichas.html
- **Sessão 2 ✅** — treino.html (execução, timer, PR)
- **Sessão 3 ✅** — historico.html + Biblioteca de Exercícios (RFC-009)
- **Sessão 4 ✅** — user_profiles + admin + WorkoutSessionService.js +
  correção de bugs + responsividade + RFC-022 (paleta/radius)
- **Sessão 5 ✅** — PWA (manifest + ícones + service worker) + Dashboard
  corrigido (StatisticsEngine/WorkoutService, streak real) + engine.js
  (filtro user_id via join) + medidas corporais (histórico de peso + gráfico)
- **Sessão 6 ✅** — Treino livre (treinar sem ficha, adicionar exercício
  durante o treino) + correção de bug de ID sintético no histórico
- **Sessão 7 ✅** — exercise_relations (variações/substituições/
  progressões, tabela única com relation_type) + UI de gerenciamento na Biblioteca
- **Sessão atual ✅** — Logo oficial (RFC-022 concluída 100%): segunda versão
  do ícone em alta resolução nativa (1024x1024, sem marca d'água), splash
  screen implementada de verdade no `dashboard.html`, `exercise_relations`
  populada com 148 relações reais (`MIGRATION_v8.sql`, gerada a partir de
  export CSV dos 308 exercícios do banco)
