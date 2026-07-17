# Contribuindo com o GymTracker

Obrigado por considerar contribuir! Antes de abrir um Pull Request, leia
as regras abaixo — elas existem porque já causaram bugs reais no
passado quando não seguidas.

## Regras de código invioláveis

- **Sempre** importe o cliente Supabase de `js/supabase.js` — nunca use
  `window.supabase` diretamente.
- **Sempre** filtre queries por `user_id` (ou pelo join equivalente,
  quando a tabela não tem essa coluna direto — ex: `series_executadas`
  filtra via join com `sessoes`). Isso já causou vazamento de dado
  entre usuários quando esquecido.
- Use `showToast()` para feedback ao usuário — nunca `alert()`.
- Use `.maybeSingle()` quando o resultado de uma query pode
  legitimamente vir vazio. `.single()` só é seguro logo após um
  `insert()`/`update()`, que sempre retorna exatamente uma linha.
- Nunca edite `series_executadas` depois que uma sessão foi finalizada
  — o histórico de treino é imutável por design.
- Para excluir um registro que pode ter histórico dependente (ex: um
  exercício de uma ficha), prefira soft delete (`ativo: false`) a
  `DELETE` físico — evita violar foreign keys e preserva relatórios
  antigos que dependem desse dado.
- Regras de negócio ficam nos `Service`/`Engine` (`js/*.js`), nunca
  espalhadas dentro do HTML.
- Ao adicionar uma página nova, sempre inclua o botão de voltar
  (`btn-voltar-dash`) e o link correspondente na navbar de
  `dashboard.html`.

## Processo de contribuição

1. Abra uma *issue* descrevendo o que pretende mudar antes de começar
   a codar, especialmente para mudanças maiores — evita retrabalho se
   a abordagem precisar de ajuste.
2. Fork o repositório e crie uma branch a partir de `main`.
3. Siga as regras de código acima.
4. Teste localmente antes de abrir o PR (não há suíte de testes
   automatizada ainda — validação manual é o que temos por enquanto;
   contribuições de testes são muito bem-vindas).
5. Descreva no PR o que mudou e por quê, não só o quê.

## Estrutura do projeto

```
index.html, dashboard.html, fichas.html, treino.html, ...  → páginas
js/                                                          → services/engines (lógica de negócio)
css/global.css                                               → design system
assets/                                                       → SVGs, imagens
migrations/                                                   → histórico de schema SQL, em ordem
```

## Dúvidas

Abra uma *issue* com a tag `question` — não existe pergunta boba.
