// ============================================================
// ProfileService.js — Domínio de Perfil do Usuário
// ============================================================
import { supabase } from './supabase.js';

export const ProfileService = {

  // ── Perfil ──────────────────────────────────────────────
  // maybeSingle() de propósito: usuários criados antes da
  // migration v4 podem ainda não ter profile até o backfill
  // rodar (ver nota no fim de MIGRATION_v4.sql).
  async obterPerfil(userId) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select(`
        *,
        objetivos (id, name),
        niveis_experiencia (id, name, level)
      `)
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async atualizarPerfil(userId, payload) {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ ...payload, atualizado_em: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Cobre o caso raro de um usuário sem profile (pré-migration
  // e ainda sem backfill) tentar salvar antes de existir a linha.
  async garantirPerfil(userId) {
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ── Medidas corporais (histórico de peso) ───────────────
  // Diferente de obterPerfil/atualizarPerfil (que guardam só o
  // peso ATUAL), isto é uma série temporal — uma linha por dia.
  async listarMedidas(userId, limite = 90) {
    const { data, error } = await supabase
      .from('medidas')
      .select('*')
      .eq('user_id', userId)
      .order('data_medicao', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data || [];
  },

  // upsert: registrar de novo no mesmo dia atualiza em vez de duplicar
  async registrarMedida(userId, { data_medicao, peso_kg, observacoes }) {
    const dataFinal = data_medicao || new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('medidas')
      .upsert(
        { user_id: userId, data_medicao: dataFinal, peso_kg, observacoes: observacoes || null },
        { onConflict: 'user_id,data_medicao' }
      )
      .select()
      .single();
    if (error) throw error;

    // Se for a medição de hoje, mantém o peso "atual" do perfil em sincronia
    const hoje = new Date().toISOString().split('T')[0];
    if (dataFinal === hoje) {
      await this.atualizarPerfil(userId, { peso_kg });
    }

    return data;
  },

  async excluirMedida(id) {
    const { error } = await supabase.from('medidas').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Tabelas de domínio ──────────────────────────────────
  async listarObjetivos() {
    const { data, error } = await supabase
      .from('objetivos')
      .select('*')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async listarNiveis() {
    const { data, error } = await supabase
      .from('niveis_experiencia')
      .select('*')
      .order('level');
    if (error) throw error;
    return data || [];
  }
};
