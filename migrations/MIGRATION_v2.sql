-- ============================================================
-- GymTracker — Migration v2.0
-- ADR-001: Separação Biblioteca / Configuração / Histórico
-- Execute no Supabase SQL Editor
-- ============================================================

-- ── ETAPA 1: Criar tabela exercises (Biblioteca) ──────────

CREATE TABLE exercises (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                  TEXT NOT NULL,
  slug                  TEXT,                          -- futuro: busca por URL
  grupo_muscular        TEXT,                          -- principal
  grupos_secundarios    TEXT[],
  grupos_estabilizadores TEXT[],
  equipamentos          TEXT[],
  instrucoes_execucao   TEXT,
  erros_comuns          TEXT,
  dicas                 TEXT,
  respiracao            TEXT,
  contraindicacoes      TEXT,
  video_url             TEXT,
  imagem_url            TEXT,
  objetivo              TEXT,
  nivel                 TEXT,
  dificuldade           INT CHECK (dificuldade BETWEEN 1 AND 5),
  biblioteca_tipo       TEXT DEFAULT 'usuario'
                        CHECK (biblioteca_tipo IN ('oficial','usuario','academia','compartilhada')),
  is_publico            BOOLEAN DEFAULT false,
  criado_por            UUID REFERENCES auth.users,
  versao                INT DEFAULT 1,
  criado_em             TIMESTAMPTZ DEFAULT now(),
  atualizado_em         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver exercises" ON exercises
  FOR SELECT TO authenticated
  USING (
    is_publico = true
    OR biblioteca_tipo = 'oficial'
    OR criado_por = auth.uid()
  );

CREATE POLICY "criar exercises" ON exercises
  FOR INSERT TO authenticated
  WITH CHECK (criado_por = auth.uid());

CREATE POLICY "editar exercises" ON exercises
  FOR UPDATE TO authenticated
  USING (criado_por = auth.uid());

CREATE POLICY "excluir exercises" ON exercises
  FOR DELETE TO authenticated
  USING (criado_por = auth.uid());

GRANT ALL ON exercises TO authenticated;

-- ── ETAPA 2: Migrar dados técnicos de ficha_exercicios ───
-- Criar um exercise para cada ficha_exercicio existente

INSERT INTO exercises (
  nome, grupo_muscular, grupos_secundarios, equipamentos,
  instrucoes_execucao, erros_comuns, dicas, respiracao,
  video_url, objetivo, nivel, biblioteca_tipo, is_publico,
  criado_por
)
SELECT DISTINCT ON (fe.nome, fe.ficha_id)
  fe.nome,
  fe.grupo_muscular,
  fe.grupos_secundarios,
  fe.equipamentos,
  fe.instrucoes_execucao,
  fe.erros_comuns,
  fe.dicas,
  fe.respiracao,
  fe.video_url,
  fe.objetivo,
  fe.nivel,
  'usuario',
  false,
  f.user_id
FROM ficha_exercicios fe
JOIN fichas f ON fe.ficha_id = f.id
WHERE fe.nome IS NOT NULL;

-- ── ETAPA 3: Adicionar exercise_id em ficha_exercicios ───

ALTER TABLE ficha_exercicios
  ADD COLUMN exercise_id UUID REFERENCES exercises(id);

-- Vincular cada ficha_exercicio ao exercise criado
UPDATE ficha_exercicios fe
SET exercise_id = e.id
FROM exercises e
WHERE e.nome = fe.nome
  AND e.criado_por = (SELECT user_id FROM fichas WHERE id = fe.ficha_id);

-- Remover colunas técnicas de ficha_exercicios (agora vivem em exercises)
-- ATENÇÃO: só executar depois de confirmar que os dados foram migrados
ALTER TABLE ficha_exercicios
  DROP COLUMN IF EXISTS instrucoes_execucao,
  DROP COLUMN IF EXISTS erros_comuns,
  DROP COLUMN IF EXISTS dicas,
  DROP COLUMN IF EXISTS respiracao,
  DROP COLUMN IF EXISTS video_url,
  DROP COLUMN IF EXISTS objetivo,
  DROP COLUMN IF EXISTS nivel,
  DROP COLUMN IF EXISTS equipamentos,
  DROP COLUMN IF EXISTS grupos_secundarios;

-- ── ETAPA 4: Adicionar exercise_id em series_executadas ──

ALTER TABLE series_executadas
  ADD COLUMN exercise_id UUID REFERENCES exercises(id);

-- Vincular séries existentes via nome do exercício
UPDATE series_executadas se
SET exercise_id = e.id
FROM exercises e
WHERE e.nome = se.exercicio_nome;

-- ── ETAPA 5: Atualizar personal_records ──────────────────

ALTER TABLE personal_records
  ADD COLUMN exercise_id UUID REFERENCES exercises(id);

UPDATE personal_records pr
SET exercise_id = e.id
FROM exercises e
WHERE e.nome = pr.exercicio_nome;

-- ── FIM ──────────────────────────────────────────────────
-- Verificar resultado:
SELECT 'exercises' as tabela, count(*) FROM exercises
UNION ALL
SELECT 'ficha_exercicios', count(*) FROM ficha_exercicios
UNION ALL
SELECT 'series_executadas', count(*) FROM series_executadas
UNION ALL
SELECT 'personal_records', count(*) FROM personal_records;
