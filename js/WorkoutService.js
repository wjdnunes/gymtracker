// ============================================================
// WorkoutService.js — Domínio de Fichas e Configuração
// ============================================================
import { supabase } from './supabase.js';

export const WorkoutService = {

  // ── Fichas ──────────────────────────────────────────────
  async listarFichas(userId) {
    const { data, error } = await supabase
      .from('fichas')
      .select('*')
      .eq('user_id', userId)
      .eq('ativo', true)
      .order('criado_em');
    if (error) throw error;
    return data || [];
  },

  async criarFicha(userId, nome, descricao) {
    const { data, error } = await supabase
      .from('fichas')
      .insert({ user_id: userId, nome, descricao })
      .select().single();
    if (error) throw error;
    return data;
  },

  async atualizarFicha(id, payload) {
    const { data, error } = await supabase
      .from('fichas').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async excluirFicha(id) {
    const { error } = await supabase.from('fichas').update({ ativo: false }).eq('id', id);
    if (error) throw error;
  },

  // ── Exercícios da Ficha ─────────────────────────────────
  async listarExercicios(fichaId) {
    const { data, error } = await supabase
      .from('ficha_exercicios')
      .select(`
        *,
        ficha_exercicio_series ( * ),
        exercises (
          id,
          name_pt,
          description,
          exercise_muscles (
            role,
            muscles (name_pt)
          ),
          exercise_media (
            provider,
            video_id,
            is_default
          )
        )
      `)
      .eq('ficha_id', fichaId)
      .eq('ativo', true)
      .order('ordem');
    if (error) throw error;
    // ordena as séries de cada exercício por número, pra vir sempre na ordem certa
    (data || []).forEach(ex => {
      ex.ficha_exercicio_series?.sort((a, b) => a.numero_serie - b.numero_serie);
    });
    return data || [];
  },

  async adicionarExercicio(fichaId, exerciseId, config) {
    const { data, error } = await supabase
      .from('ficha_exercicios')
      .insert({ ficha_id: fichaId, exercise_id: exerciseId, ...config })
      .select().single();
    if (error) throw error;
    return data;
  },

  async atualizarExercicio(id, config) {
    const { data, error } = await supabase
      .from('ficha_exercicios').update(config).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async excluirExercicio(id) {
    // Soft delete — NUNCA apagar de verdade. Um exercício já treinado
    // pelo menos uma vez tem series_executadas apontando pra essa
    // linha (ficha_exercicio_id), e a foreign key corretamente recusa
    // o DELETE físico pra proteger o histórico imutável. Marcar como
    // inativo remove da ficha ativa sem quebrar relatórios antigos
    // (Modo Profissional do Relatório de Evolução, por exemplo, que
    // faz join com essa tabela pra mostrar "Planejado" de sessões
    // passadas).
    const { error } = await supabase
      .from('ficha_exercicios')
      .update({ ativo: false })
      .eq('id', id);
    if (error) throw error;
  },

  // ── Séries granulares (rep range/descanso/técnica por série) ──
  // Substitui todas as séries planejadas desse exercício pelas novas.
  // Passar array vazio remove a configuração avançada (volta a usar
  // series_padrao/reps_padrao simples).
  async salvarSeriesGranulares(fichaExercicioId, series) {
    const { error: delErr } = await supabase
      .from('ficha_exercicio_series')
      .delete()
      .eq('ficha_exercicio_id', fichaExercicioId);
    if (delErr) throw delErr;

    if (!series.length) return [];

    const payload = series.map((s, i) => ({
      ficha_exercicio_id: fichaExercicioId,
      numero_serie: i + 1,
      reps_alvo_min: s.reps_alvo_min || null,
      reps_alvo_max: s.reps_alvo_max || null,
      ate_falha: !!s.ate_falha,
      descanso_seg: s.descanso_seg || null,
      tecnica: s.tecnica || 'nenhuma',
      tecnica_detalhe: s.tecnica_detalhe || null
    }));

    const { data, error } = await supabase
      .from('ficha_exercicio_series')
      .insert(payload)
      .select();
    if (error) throw error;
    return data;
  },

  // ── Superset (bi-set/tri-set/quadri-set) ────────────────
  // Agrupa 2-4 exercícios da ficha pra serem feitos em sequência,
  // sem descanso entre eles.
  async agruparSuperset(fichaExercicioIds) {
    const grupoId = crypto.randomUUID();
    const updates = fichaExercicioIds.map((id, i) =>
      supabase.from('ficha_exercicios')
        .update({ grupo_superset_id: grupoId, ordem_no_grupo: i })
        .eq('id', id)
    );
    const resultados = await Promise.all(updates);
    const erro = resultados.find(r => r.error);
    if (erro) throw erro.error;
    return grupoId;
  },

  async desagruparExercicio(fichaExercicioId) {
    const { error } = await supabase
      .from('ficha_exercicios')
      .update({ grupo_superset_id: null, ordem_no_grupo: 0 })
      .eq('id', fichaExercicioId);
    if (error) throw error;
  }
};
