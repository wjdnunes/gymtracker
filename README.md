# GymTracker

**Acompanhamento de treinos, fichas, histórico e recordes pessoais.**

GymTracker é um PWA (Progressive Web App) de treino de força — fichas de
exercícios, execução de treino com timer e detecção automática de
recorde pessoal (PR), histórico de evolução, e um Relatório de Evolução
com modo pessoal e modo profissional (para acompanhamento por personal
trainer).

## Stack

- **Frontend:** HTML + CSS + JavaScript (ES6 modules), sem framework
- **Backend:** [Supabase](https://supabase.com) (Postgres + Auth + Row Level Security)
- **Deploy:** arquivos estáticos, compatível com Netlify/Vercel/qualquer host estático
- **PWA:** manifest + service worker, instalável e parcialmente funcional offline

## Funcionalidades

- Biblioteca de exercícios com busca, filtro e vídeo demonstrativo
- Montagem de fichas de treino, com séries granulares e superset
- Execução de treino com timer de descanso, cálculo de 1RM (fórmula de Epley) e detecção automática de PR
- Histórico completo de sessões
- Relatório de Evolução:
  - **Modo Pessoal** — resumo com Índice de Evolução, volume por grupamento muscular, RPE por exercício, diretrizes automáticas pro próximo ciclo
  - **Modo Profissional** — comparativo planejado × executado, índice de sobrecarga, diagrama corporal com intensidade de volume por músculo, export em PDF
- Diagrama muscular interativo (SVG modular, coloração dinâmica por grupo)

## Rodando localmente

1. Clone o repositório
2. Crie um projeto no [Supabase](https://supabase.com) e rode as migrations em `migrations/` na ordem numérica
3. Copie `js/supabase.config.example.js` para `js/supabase.js` e preencha com a URL e a chave `anon` do seu projeto
4. Sirva os arquivos com qualquer servidor estático (ex: `npx serve .` ou a extensão Live Server do VS Code)
5. Abra `index.html`

Não há passo de build — é HTML/CSS/JS puro, servido como está.

## Contribuindo

Leia o [CONTRIBUTING.md](./CONTRIBUTING.md) antes de abrir um Pull Request — o
projeto segue algumas convenções de código estritas (nomeadas lá) para manter
consistência entre módulos.

## Licença

Este projeto é licenciado sob a **GNU Affero General Public License v3.0**
(AGPL-3.0) — veja [LICENSE](./LICENSE). Em resumo: você pode usar, estudar,
modificar e redistribuir este código livremente, inclusive rodando uma
versão modificada como serviço — mas, se fizer isso, é obrigado a
disponibilizar o código-fonte dessa versão modificada também.
