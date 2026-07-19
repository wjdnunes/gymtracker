// ============================================================
// AvaliacaoFisicaService.js — Domínio de Avaliação Física
// (composição corporal: bioimpedância, dobras cutâneas, medidas)
// ============================================================
// Separado de ProfileService.js (que cuida de `medidas`, a série
// diária de peso) porque avaliação física é outro domínio: menos
// frequente, mais campos, tipicamente registrada por um personal.

import { supabase, showToast } from './supabase.js';

export const AvaliacaoFisicaService = {

  async listar(userId) {
    const { data, error } = await supabase
      .from('avaliacoes_fisicas')
      .select('*')
      .eq('user_id', userId)
      .order('data_avaliacao', { ascending: false });
    if (error) {
      showToast('Erro ao buscar avaliações físicas', 'erro');
      throw error;
    }
    return data || [];
  },

  async obterUltima(userId) {
    const { data, error } = await supabase
      .from('avaliacoes_fisicas')
      .select('*')
      .eq('user_id', userId)
      .order('data_avaliacao', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async criar(userId, payload) {
    const { data, error } = await supabase
      .from('avaliacoes_fisicas')
      .insert({ user_id: userId, criado_por: userId, ...payload })
      .select()
      .single();
    if (error) {
      showToast('Erro ao salvar avaliação: ' + error.message, 'erro');
      throw error;
    }
    return data;
  },

  async atualizar(id, payload) {
    const { data, error } = await supabase
      .from('avaliacoes_fisicas')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      showToast('Erro ao atualizar avaliação: ' + error.message, 'erro');
      throw error;
    }
    return data;
  },

  async excluir(id) {
    const { error } = await supabase
      .from('avaliacoes_fisicas')
      .delete()
      .eq('id', id);
    if (error) {
      showToast('Erro ao excluir avaliação: ' + error.message, 'erro');
      throw error;
    }
  },

  /**
   * Compara a avaliação mais recente com a anterior, retornando a
   * variação de cada métrica. Usado pra mostrar setas de tendência
   * (↑/↓) na tela, e no futuro pode alimentar o componente de
   * Composição Corporal do Índice de Evolução completo.
   */
  async compararUltimasDuas(userId) {
    const { data, error } = await supabase
      .from('avaliacoes_fisicas')
      .select('*')
      .eq('user_id', userId)
      .order('data_avaliacao', { ascending: false })
      .limit(2);
    if (error) throw error;
    if (!data || data.length < 2) return null;

    const [atual, anterior] = data;
    function variacao(campo) {
      if (atual[campo] == null || anterior[campo] == null) return null;
      return Math.round((atual[campo] - anterior[campo]) * 10) / 10;
    }

    return {
      atual,
      anterior,
      variacao: {
        peso_kg: variacao('peso_kg'),
        percentual_gordura: variacao('percentual_gordura'),
        massa_muscular_kg: variacao('massa_muscular_kg'),
        cintura_cm: variacao('cintura_cm'),
        quadril_cm: variacao('quadril_cm'),
        braco_direito_cm: variacao('braco_direito_cm'),
        braco_esquerdo_cm: variacao('braco_esquerdo_cm'),
        coxa_direita_cm: variacao('coxa_direita_cm'),
        coxa_esquerda_cm: variacao('coxa_esquerda_cm'),
      }
    };
  }
};
