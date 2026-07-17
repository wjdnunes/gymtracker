-- ============================================================
-- GymTracker — Schema v1.0
-- Execute no Supabase SQL Editor (projeto novo)
-- ============================================================

-- ------------------------------------------------------------
-- 1. FICHAS (planos de treino)
-- ------------------------------------------------------------
CREATE TABLE fichas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL,
  nome          TEXT NOT NULL,
  descricao     TEXT,
  ativo         BOOLEAN DEFAULT true,
  criado_em     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE fichas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuario ve suas fichas" ON fichas
  FOR ALL USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 2. EXERCICIOS dentro de uma ficha
-- ------------------------------------------------------------
CREATE TABLE ficha_exercicios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id        UUID REFERENCES fichas ON DELETE CASCADE NOT NULL,
  nome            TEXT NOT NULL,
  grupo_muscular  TEXT,
  ordem           INT DEFAULT 0,
  series_padrao   INT DEFAULT 3,
  reps_padrao     TEXT DEFAULT '10-12',
  carga_padrao    NUMERIC,
  notas           TEXT
);

ALTER TABLE ficha_exercicios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuario ve seus exercicios" ON ficha_exercicios
  FOR ALL USING (
    ficha_id IN (SELECT id FROM fichas WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 3. SESSOES (execuções de treino)
-- ------------------------------------------------------------
CREATE TABLE sessoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL,
  ficha_id        UUID REFERENCES fichas,
  ficha_nome      TEXT,           -- snapshot do nome no momento da sessão
  iniciado_em     TIMESTAMPTZ DEFAULT now(),
  finalizado_em   TIMESTAMPTZ,
  duracao_min     INT,            -- calculado ao finalizar
  notas           TEXT
);

ALTER TABLE sessoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuario ve suas sessoes" ON sessoes
  FOR ALL USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 4. SERIES EXECUTADAS
-- ------------------------------------------------------------
CREATE TABLE series_executadas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id             UUID REFERENCES sessoes ON DELETE CASCADE NOT NULL,
  ficha_exercicio_id    UUID REFERENCES ficha_exercicios,
  exercicio_nome        TEXT NOT NULL,   -- snapshot do nome
  serie_num             INT NOT NULL,
  tipo                  TEXT DEFAULT 'normal' CHECK (tipo IN ('normal','warmup','dropset','falha')),
  reps_feitas           INT,
  carga_kg              NUMERIC,
  one_rm                NUMERIC,         -- calculado: carga * (1 + reps/30)
  is_pr                 BOOLEAN DEFAULT false,
  notas                 TEXT,
  feita_em              TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE series_executadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuario ve suas series" ON series_executadas
  FOR ALL USING (
    sessao_id IN (SELECT id FROM sessoes WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 5. PERSONAL RECORDS (cache de PRs por exercício)
-- ------------------------------------------------------------
CREATE TABLE personal_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users NOT NULL,
  exercicio_nome        TEXT NOT NULL,
  melhor_carga_kg       NUMERIC,
  melhor_reps           INT,
  melhor_one_rm         NUMERIC,
  serie_id              UUID REFERENCES series_executadas,
  batido_em             TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, exercicio_nome)
);

ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuario ve seus prs" ON personal_records
  FOR ALL USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- FIM — todas as tabelas criadas com RLS ativo
-- ============================================================
