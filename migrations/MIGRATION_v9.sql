-- ============================================================
-- MIGRATION_v9.sql — Soft delete em ficha_exercicios
-- ============================================================
-- Motivo: excluir um exercício da ficha que já foi treinado pelo
-- menos uma vez violava a foreign key
-- series_executadas_ficha_exercicio_id_fkey (histórico aponta pra
-- ficha_exercicios). Isso é o banco corretamente protegendo a regra
-- "histórico imutável" — a solução não é forçar o delete (via CASCADE
-- ou SET NULL, que apagaria/desconectaria histórico real), é nunca
-- apagar de verdade, só marcar como inativo. Mesmo padrão que
-- `fichas.ativo` já usa.

ALTER TABLE ficha_exercicios
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

-- Índice parcial: acelera a query mais comum (listar exercícios
-- ativos de uma ficha), que agora sempre filtra por ativo = true
CREATE INDEX IF NOT EXISTS idx_ficha_exercicios_ficha_ativo
  ON ficha_exercicios (ficha_id)
  WHERE ativo = true;

-- Nenhum dado existente precisa de backfill — o DEFAULT true já
-- cobre todas as linhas atuais como "ativas", que é o estado
-- correto (nada foi excluído até agora, porque o delete estava
-- falhando silenciosamente antes desse fix).
