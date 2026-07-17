# GymTracker — PROJECT_MEMORY
_Última atualização: Sessão atual (pós logo oficial via Nano Banana)_

---

## Visão geral

GymTracker é uma plataforma profissional de gestão de treinamento de musculação.
Não é um clone do Hevy — usa o Hevy como referência de UX mas tem arquitetura e inteligência próprias.

**URL produção:** https://venerable-conkies-f106a9.netlify.app
**Supabase project:** tmrdfhwianhamhdwrrsd
**Supabase URL:** https://tmrdfhwianhamhdwrrsd.supabase.co
**Chave anon (JWT legacy):** eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtcmRmaHdpYW5oYW1oZHdycnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjAxOTAsImV4cCI6MjA5Nzk5NjE5MH0.3H8xZjWZmrqDMQGG708FFziIzQV1KVVmz3NwJXuWnag

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + CSS + JS ES6 modules (vanilla, sem framework) |
| Backend | Supabase (Auth + Postgres + RLS) |
| Deploy | Netlify (ZIP drag-and-drop, arquivos na raiz, sem pasta pai — exceto `icons/`, que é subpasta normal) |
| PWA | `manifest.json` + service worker (`sw.js`) — instalável no celular, funciona parcialmente offline (cache dos arquivos estáticos; dados do Supabase nunca são cacheados) |
| Tipografia | Inter (corpo) + Barlow Condensed (display/headings) — RFC-022 pedia fonte única, decisão consciente de manter as duas |
| Tema | Dark mode — bg `#121212` (RFC-022, evita preto puro/halação em OLED), acento laranja `#f97316` (mantido), radius `12px` |

> ⚠️ NÃO migrar para React/Vite agora. Decisão documentada e mantida.

---

## Arquitetura de banco (schema atual)

### Domínio: Biblioteca (conhecimento permanente)

```
exercises              ← exercício como entidade de conhecimento
  id, external_id (GT-XXXX), slug, name_pt, name_en
  description, difficulty_id, movement_pattern_id, exercise_type_id
  is_unilateral, is_compound, is_public, status
  biblioteca_tipo (oficial | usuario | academia | compartilhada)
  criado_por (UUID → auth.users)

exercise_muscles       ← músculos por exercício
  exercise_id, muscle_id, role (primary | secondary | stabilizer)

exercise_equipment     ← equipamentos por exercício
  exercise_id, equipment_id, required

exercise_media         ← mídias (vídeos YouTube)
  exercise_id, type, provider (youtube), video_id, language, is_default

exercise_tags          ← tags de busca
  exercise_id, tag_id

exercise_relations     ← variações, substituições e progressões entre exercícios
  exercise_id, related_exercise_id, relation_type
  (tabela única — substituiu exercise_variations/exercise_substitutions,
   que nunca foram usadas/populadas. Implementada mas ATUALMENTE VAZIA —
   precisa ser populada aos poucos pelo admin)

-- Tabelas de domínio --
muscles                (id, name_pt, name_en)
equipment              (id, name, category)
tags                   (id, name)
difficulty              (id, name, level)
movement_patterns       (id, name)
exercise_types          (id, name)
```

### Domínio: Configuração (intenção do treino)

```
fichas                 ← plano de treino do usuário
  id, user_id, nome, descricao, ativo

ficha_exercicios       ← exercício dentro de uma ficha
  id, ficha_id, exercise_id
  ordem, series_padrao, reps_padrao
  carga_sugerida, carga_inicial, carga_atual, carga_maxima
  incremento_kg, descanso_series_seg, descanso_exercicio_seg
  rpe_alvo, notas_especificas
```

### Domínio: Execução (realidade — imutável após finalizar)

```
sessoes                ← treino executado
  id, user_id, ficha_id (nullable — permite treino livre, sem ficha)
  ficha_nome (snapshot), iniciado_em, finalizado_em, duracao_min

series_executadas      ← cada série registrada (NUNCA editar após sessão finalizada)
  id, sessao_id, ficha_exercicio_id (null se treino livre), exercise_id
  exercicio_nome (snapshot), serie_num, tipo
  carga_kg, reps_feitas, rpe, one_rm (Epley), is_pr
  feita_em
  ⚠️ NÃO tem coluna user_id — usuário é identificado via
     sessao_id → sessoes.user_id (join obrigatório em queries/RLS)
```

### Domínio: Perfil e acompanhamento

```
user_profiles           ← perfil do usuário (estado ATUAL)
  user_id, nome, peso_kg, altura, objetivo_id, nivel_id, is_admin

medidas                 ← histórico de peso ao longo do tempo (série temporal)
  user_id, data, peso_kg
  (uma linha por dia — diferente de user_profiles.peso_kg, que é o valor atual)

objetivos                ← lookup de objetivos (não texto livre)
niveis_experiencia       ← lookup de nível de experiência (não texto livre)
```

### Domínio: Inteligência

```
personal_records       ← cache de PRs por exercício
  user_id, exercise_id, exercicio_nome
  melhor_carga_kg, melhor_reps, melhor_one_rm
  batido_em, serie_id
```

### Sistema de admin (`MIGRATION_v5.sql`)
Exercícios oficiais (`criado_por IS NULL`) só podem ser editados por quem tem
`user_profiles.is_admin = true`.

### 1RM e PR automático
Fórmula de Epley (`carga × (1 + reps/30)`), comparação automática com
`personal_records` ao salvar série.

---

## Arquivos do frontend

```
index.html                — Login / cadastro
dashboard.html             — Hub principal (usa StatisticsEngine/WorkoutService,
                             sequência de dias real via sequenciaAtual())
biblioteca.html             — CRUD da Biblioteca, preview de vídeo, admin
                             edita/exclui oficiais, gerencia relações
                             (variação/substituição/progressão) entre exercícios
fichas.html                  — CRUD de fichas e exercícios
treino.html                   — Execução do treino (UI pura — lógica no service).
                             Suporta ficha normal E "Treino livre" (sem ficha,
                             adiciona exercícios da Biblioteca durante o treino).
                             Versão mobile própria (fork via JS isMobile)
historico.html                 — Histórico + gráficos de evolução
relatorio.html                  — Relatórios de evolução
perfil.html                      — Editar peso/altura/objetivo/nível +
                             seção "Evolução de peso" (gráfico + histórico)
diagnostico-videos.html           — Ferramenta admin: acha vídeos com código
                             inválido no YouTube (checa via oEmbed)

manifest.json               — PWA (nome, ícones, cores)
sw.js                        — Service worker (cache de estáticos, offline)
icons/                        — Ícones do app (192/512/apple-touch/favicons) —
                             logo oficial (ver seção RFC-022)

css/global.css                — Design system completo (paleta/radius RFC-022 aplicados)

js/supabase.js                 — Cliente Supabase + helpers (showToast,
                             calcular1RM, verificarPR — maybeSingle)
js/ExerciseService.js           — Domínio da Biblioteca
js/WorkoutService.js             — Domínio de Fichas
js/ProfileService.js              — Domínio de Perfil + Medidas corporais
js/WorkoutSessionService.js        — Domínio de Execução de Treino (mobile e
                             desktop usam a mesma função registrarSerie()).
                             iniciarSessaoLivre() pro Treino Livre.
                             Exercícios do treino livre usam
                             ficha_exercicio_id = null — nunca passar um ID
                             sintético/client-side pra uma coluna UUID do banco
js/engine.js                       — ProgressEngine (queries filtram user_id
                             via join com sessoes, mesmo sem coluna direta)
js/StatisticsEngine.js              — StatisticsEngine + sequenciaAtual() (streak)
```

> Nota: `SearchEngine.js` (extrair lógica de busca da interface) segue como
> pendência — não foi criado ainda.

---

## Responsividade (celular)

Todas as páginas têm regras de media query (`max-width: 768px`): navbar vira
faixa que rola horizontalmente, grids empilham em 1 coluna, padding reduzido.
`treino.html` tem versão mobile própria (fork via JS `isMobile`).

---

## Engines implementados

### engine.js (ProgressEngine)
- `avaliarProgressao()` — sugere aumento de carga (RPE ≤ 7 em 2 sessões)
- `detectarEstagnacao()` — N sessões sem evoluir
- `alertarVolumeExcessivo()` — >150% da média
- `sugerirDeload()` — RPE ≥ 9 em 3 sessões consecutivas
- `calcularProximaCarga()` — baseado no RPE da última sessão
- `resumoEvolucao()` — série temporal de carga por exercício

### StatisticsEngine.js
- `resumoGeral()` — stats do dashboard
- `listarSessoes()` — histórico com volume e PRs
- `evolucaoExercicio()` — série temporal para gráfico
- `listarPRs()` — todos os recordes
- `volumePorGrupo()` — distribuição por músculo
- `alertas()` — estagnação + progressão sugerida
- `sequenciaAtual()` — streak de dias treinados

---

## Biblioteca de exercícios

- **Total:** 300 exercícios oficiais (GT-0001 a GT-0300) + exercícios do usuário
- **Lote 1:** GT-0001 a GT-0100 (Antigravity)
- **Lote 2:** GT-0101 a GT-0200 (Claude — peito, costas, ombros, bíceps, tríceps, pernas, glúteos, core, cardio, antebraço)
- **Lote 3:** GT-0201 a GT-0300 (Claude — kettlebell, elástico, mobilidade, calistenia avançada, powerlifting, reabilitação, iniciantes)
- **Meta:** 300-500 exercícios — 300 atingido; expansão pra 400-500 segue pendente
- **Vídeos:** 305 vídeos do YouTube vinculados via `exercise_media`
- **YouTube:** armazenado apenas o `video_id`, URL montada pela aplicação
- **exercise_relations:** implementada (`MIGRATION_v7.sql`) mas ainda vazia —
  precisa ser populada aos poucos pelo admin

---

## Migrations aplicadas (em ordem)

| Arquivo | O que fez |
|---|---|
| `GYMTRACKER_SCHEMA.sql` | Schema inicial — fichas, sessoes, series_executadas, personal_records |
| `MIGRATION_v2.sql` | Criou tabela `exercises`, migrou dados, adicionou `exercise_id` nas FKs |
| `MIGRATION_v2b.sql` | Adicionou colunas de progressão em `ficha_exercicios` |
| `MIGRATION_v3.sql` | RFC-009 — criou 14 tabelas da Biblioteca (muscles, equipment, exercise_media, etc.) |
| `seeds_v1.sql` | 100 exercícios oficiais lote 1 |
| `seeds_v2_lote2.sql` | +100 exercícios (GT-0101 a GT-0200) |
| `seeds_v3_lote3.sql` | +100 exercícios (GT-0201 a GT-0300) |
| `MIGRATION_v4.sql` | Criou `user_profiles` |
| `MIGRATION_v5.sql` | Adicionou `is_admin` — sistema de admin pra edição de exercícios oficiais |
| `MIGRATION_v6.sql` | Criou `medidas` (histórico de peso) |
| `MIGRATION_v7.sql` | Criou `exercise_relations` (variações/substituições/progressões) |

---

## Regras de código (invioláveis)

- `import { supabase, showToast } from './js/supabase.js'` — nunca `window.supabase`
- `user_id` em todas as queries onde a tabela tem essa coluna; onde não tem
  (ex: `series_executadas`), filtrar via join com `sessoes`
- `showToast()` — nunca `alert()`
- `maybeSingle()` não `single()` quando o resultado pode ser nulo
- Histórico imutável — nunca editar `series_executadas` após sessão finalizada
- YouTube: armazenar só o `video_id`, nunca a URL completa
- Regras de negócio nos Services/Engines, nunca na interface
- `ON CONFLICT DO NOTHING` nos seeds (nunca `DO UPDATE` em tabelas com FK)
- Arquivos no deploy: raiz do ZIP, sem pasta pai (exceto `icons/`, que é uma subpasta normal)

---

## Fluxo de trabalho

```
Claude (arquiteto) → define spec e revisa
Antigravity (implementador) → implementa
Claude → revisa o ZIP do Antigravity antes do deploy
```

**Ao iniciar nova sessão com Antigravity:** passar este arquivo + ZIP atual.
**Ao iniciar nova sessão com Claude:** passar este arquivo.

---

## Decisões arquiteturais tomadas

| Decisão | Motivo |
|---|---|
| Vanilla JS em vez de React | MVP estável, sem necessidade de reescrita agora |
| `exercise_media` em vez de `video_url` na tabela | Permite múltiplos vídeos, provedores futuros |
| `external_id` em `exercises` | Prepara importação de bases externas (Wger, ExerciseDB) |
| `exercise_relations` unificada | Tabela única (com `relation_type`) em vez de 3 tabelas separadas para variações/progressões/substituições — implementada na Sessão 7 |
| Histórico imutável | Toda análise futura (incluindo IA) depende de dados confiáveis |
| IA como camada auxiliar | Engines calculam, IA interpreta |
| `biblioteca_tipo` em `exercises` | Permite biblioteca oficial + usuário + academia + compartilhada |
| Manter Inter + Barlow Condensed (RFC-022) | RFC pedia fonte única; decisão consciente de não trocar |
| Manter paleta laranja `#f97316` (RFC-022) | Decisão consciente de manter identidade já estabelecida |
| bg `#121212` em vez de preto puro (RFC-022) | Evita halação em telas OLED |

---

## RFC-022 (Branding) — status

| Item | Status |
|---|---|
| Paleta laranja | ✅ Mantida (`#f97316`) — decisão consciente |
| Fundo | ✅ `#121212` (evita preto puro) |
| Radius | ✅ `12px` |
| Tipografia única | ❌ Não aplicado — mantido Inter + Barlow Condensed (decisão consciente) |
| Monograma/logo (i + G + barra) | ✅ Implementado — gerado via Nano Banana (Gemini), G legível + i + barra da anilha fundidos num símbolo só |
| Ícone do app / PWA | ✅ Substituído o placeholder "GT" pelo logo oficial, nos 5 tamanhos (512/192/180/32/16) |
| Splash screen customizada | ⏳ Referência visual já gerada (ícone + "GYMTRACKER" + "Train Smarter."), mas não implementada no `sw.js`/manifest ainda |

**Status geral: RFC-022 concluída em ~90%.**

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
5. **Limitação conhecida:** o `icon-512.png` foi ampliado de uma imagem-fonte
   de ~220px (não gerado nativamente em alta resolução) — pode parecer
   levemente suave/borrado em telas grandes. Se algum dia quiser corrigir,
   pedir ao Nano Banana só o 512px sozinho, em alta resolução, usando a
   imagem aprovada como referência.

---

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

---

## Pendente / Próximos passos

- [ ] Splash screen customizada — referência visual já aprovada, falta implementar no `sw.js`/manifest
- [ ] Popular `exercise_relations` (curar variações/substituições/progressões dos 300 exercícios oficiais, aos poucos, pelo admin)
- [ ] Rodar `diagnostico-videos.html` periodicamente pra achar vídeos quebrados
- [ ] Regenerar `icon-512.png` em alta resolução (upscaled de fonte pequena atualmente)
- [ ] Documentação GOA.md (arquitetura formal)
- [ ] Documentação GOL.md (biblioteca formal)
- [ ] CLAUDE.md (guia de trabalho)
- [ ] `SearchEngine.js` — extrair lógica de busca da interface
- [ ] Expandir biblioteca para 400-500 exercícios
- [ ] Substituir vídeos com IDs inválidos do YouTube

---

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
- **Sessão atual ✅** — Logo oficial (RFC-022 concluída em ~90%): gerado via
  Nano Banana, extraído em 5 tamanhos, substituiu o placeholder "GT" em `icons/`
