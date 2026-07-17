-- ============================================================
-- GymTracker — Migration v3.0 (RFC-009)
-- Arquitetura Definitiva da Biblioteca de Exercícios
-- Execute no Supabase SQL Editor
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. CRIAR TABELAS AUXILIARES DE DOMÍNIO
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS difficulty (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  level       INT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS movement_patterns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS exercise_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS muscles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_pt     TEXT NOT NULL UNIQUE,
  name_en     TEXT
);

CREATE TABLE IF NOT EXISTS equipment (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  category    TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS contraindications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL UNIQUE
);

-- ------------------------------------------------------------
-- 2. SEEDS / CARGA DE DADOS INICIAIS
-- ------------------------------------------------------------

-- Níveis de Dificuldade
INSERT INTO difficulty (name, level) VALUES
  ('Muito Fácil', 1),
  ('Fácil', 2),
  ('Intermediário', 3),
  ('Avançado', 4),
  ('Elite', 5)
ON CONFLICT (name) DO NOTHING;

-- Padrões de Movimento
INSERT INTO movement_patterns (name) VALUES
  ('Push'),
  ('Pull'),
  ('Squat'),
  ('Hinge'),
  ('Lunge'),
  ('Carry'),
  ('Rotation'),
  ('Core')
ON CONFLICT (name) DO NOTHING;

-- Tipos de Exercício
INSERT INTO exercise_types (name) VALUES
  ('Strength'),
  ('Hypertrophy'),
  ('Cardio'),
  ('Mobility'),
  ('Stretching')
ON CONFLICT (name) DO NOTHING;

-- Músculos Padrão (Português / Inglês)
INSERT INTO muscles (name_pt, name_en) VALUES
  ('Peito', 'Chest'),
  ('Costas', 'Back'),
  ('Ombros', 'Shoulders'),
  ('Bíceps', 'Biceps'),
  ('Tríceps', 'Triceps'),
  ('Antebraço', 'Forearms'),
  ('Core / Abdômen', 'Core / Abs'),
  ('Glúteos', 'Glutes'),
  ('Quadríceps', 'Quadriceps'),
  ('Posterior de Coxa', 'Hamstrings'),
  ('Panturrilha', 'Calves'),
  ('Cardio', 'Cardio'),
  ('Outro', 'Other'),
  ('Trapézio', 'Trapezius'),
  ('Lombar', 'Lower Back'),
  ('Adutores', 'Adductors'),
  ('Abdutores', 'Abductors')
ON CONFLICT (name_pt) DO NOTHING;

-- Equipamentos Padrão
INSERT INTO equipment (name, category) VALUES
  ('Barra', 'Livre'),
  ('Halteres', 'Livre'),
  ('Máquina', 'Máquina'),
  ('Cabo', 'Polia'),
  ('Banco', 'Acessório'),
  ('Peso corporal', 'Calistenia'),
  ('Smith', 'Máquina'),
  ('Kettlebell', 'Livre'),
  ('Elástico', 'Resistência')
ON CONFLICT (name) DO NOTHING;

-- ------------------------------------------------------------
-- 3. ADAPTAR A TABELA exercises PARA A RFC-009
-- ------------------------------------------------------------

-- Criamos novas colunas na tabela exercises de forma segura
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS name_pt TEXT;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS difficulty_id UUID REFERENCES difficulty(id);
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS movement_pattern_id UUID REFERENCES movement_patterns(id);
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS exercise_type_id UUID REFERENCES exercise_types(id);
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_unilateral BOOLEAN DEFAULT FALSE;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_compound BOOLEAN DEFAULT FALSE;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- name_pt preenchido via INSERT direto na criação dos exercícios
-- ALTER TABLE exercises ALTER COLUMN name_pt SET NOT NULL; -- executar após seeds

-- ------------------------------------------------------------
-- 4. CRIAR TABELAS DE ASSOCIAÇÃO
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS exercise_muscles (
  exercise_id   UUID REFERENCES exercises(id) ON DELETE CASCADE,
  muscle_id     UUID REFERENCES muscles(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('primary', 'secondary', 'stabilizer')),
  PRIMARY KEY (exercise_id, muscle_id)
);

CREATE TABLE IF NOT EXISTS exercise_equipment (
  exercise_id   UUID REFERENCES exercises(id) ON DELETE CASCADE,
  equipment_id  UUID REFERENCES equipment(id) ON DELETE CASCADE,
  required      BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (exercise_id, equipment_id)
);

CREATE TABLE IF NOT EXISTS exercise_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id   UUID REFERENCES exercises(id) ON DELETE CASCADE NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('video', 'gif', 'image', 'animation')),
  provider      TEXT NOT NULL CHECK (provider IN ('youtube', 'vimeo', 'storage', 'local')),
  video_id      TEXT NOT NULL,
  thumbnail     TEXT,
  language      TEXT DEFAULT 'pt-BR',
  is_default    BOOLEAN DEFAULT TRUE,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exercise_tags (
  exercise_id   UUID REFERENCES exercises(id) ON DELETE CASCADE,
  tag_id        UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (exercise_id, tag_id)
);

CREATE TABLE IF NOT EXISTS exercise_contraindications (
  exercise_id         UUID REFERENCES exercises(id) ON DELETE CASCADE,
  contraindication_id UUID REFERENCES contraindications(id) ON DELETE CASCADE,
  PRIMARY KEY (exercise_id, contraindication_id)
);

CREATE TABLE IF NOT EXISTS exercise_variations (
  exercise_id           UUID REFERENCES exercises(id) ON DELETE CASCADE,
  variation_exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE,
  PRIMARY KEY (exercise_id, variation_exercise_id)
);

CREATE TABLE IF NOT EXISTS exercise_substitutions (
  exercise_id             UUID REFERENCES exercises(id) ON DELETE CASCADE,
  substitute_exercise_id   UUID REFERENCES exercises(id) ON DELETE CASCADE,
  reason                  TEXT NOT NULL CHECK (reason IN ('equipment', 'injury', 'beginner', 'advanced')),
  PRIMARY KEY (exercise_id, substitute_exercise_id)
);

-- ------------------------------------------------------------
-- 5. MIGRAÇÃO DE DADOS EXISTENTES
-- Colunas legadas já removidas em migrations anteriores.
-- Dados serão populados via seeds_v1.sql
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 6. COLUNAS LEGADAS
-- Já removidas em migrations anteriores — nada a fazer.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 7. ATIVAR RLS (Row Level Security) NAS NOVAS TABELAS
-- ------------------------------------------------------------

ALTER TABLE difficulty ENABLE ROW LEVEL SECURITY;
ALTER TABLE movement_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE muscles ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contraindications ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_muscles ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_contraindications ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_substitutions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbls TEXT[] := ARRAY[
    'difficulty','movement_patterns','exercise_types','muscles',
    'equipment','tags','contraindications',
    'exercise_muscles','exercise_equipment','exercise_media',
    'exercise_tags','exercise_contraindications',
    'exercise_variations','exercise_substitutions'
  ];
  tbl TEXT;
BEGIN
  -- Policies de leitura para tabelas de domínio
  FOREACH tbl IN ARRAY tbls LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = tbl AND policyname = 'Leitura livre para autenticados'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Leitura livre para autenticados" ON %I FOR SELECT TO authenticated USING (true)',
        tbl
      );
    END IF;
  END LOOP;

  -- Policies de escrita para tabelas associativas
  FOREACH tbl IN ARRAY ARRAY[
    'exercise_muscles','exercise_equipment','exercise_media',
    'exercise_tags','exercise_contraindications',
    'exercise_variations','exercise_substitutions'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = tbl AND policyname = 'Escrita livre para criador'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Escrita livre para criador" ON %I FOR ALL TO authenticated USING (exercise_id IN (SELECT id FROM exercises WHERE criado_por = auth.uid()))',
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- Habilitar privilégios
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

COMMIT;
