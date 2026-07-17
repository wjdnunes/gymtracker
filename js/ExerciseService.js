// ============================================================
// ExerciseService.js — Domínio da Biblioteca de Exercícios
// ============================================================
import { supabase } from './supabase.js';

export const ExerciseService = {

  async listar({ busca = '', grupoId = '', equipamentoId = '', nivel = '', tipo = 'todos' } = {}) {
    // Busca básica trazendo informações sobre o músculo principal para os cards
    let query = supabase
      .from('exercises')
      .select(`
        id,
        name_pt,
        name_en,
        description,
        is_public,
        status,
        criado_por,
        difficulty_id,
        difficulty (name, level),
        exercise_muscles (
          role,
          muscle_id,
          muscles (id, name_pt)
        ),
        exercise_media (
          id,
          provider,
          video_id,
          is_default
        )
      `)
      .order('name_pt');

    if (tipo === 'meus') {
      const user = (await supabase.auth.getUser()).data.user;
      if (user) {
        query = query.eq('criado_por', user.id);
      }
    } else if (tipo === 'oficiais') {
      // Como na RFC o tipo é controlado pelo RLS e status, listamos públicos/oficiais
      query = query.is('criado_por', null);
    }

    if (busca) {
      query = query.ilike('name_pt', `%${busca}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    let result = data || [];

    // Filtrar no lado do cliente para relações N:M se necessário
    if (grupoId) {
      result = result.filter(e => 
        e.exercise_muscles?.some(em => em.muscle_id === grupoId)
      );
    }

    return result;
  },

  async buscarPorId(id) {
    const { data, error } = await supabase
      .from('exercises')
      .select(`
        *,
        difficulty (name, level),
        movement_patterns (name),
        exercise_types (name),
        exercise_muscles (
          role,
          muscle_id,
          muscles (*)
        ),
        exercise_equipment (
          required,
          equipment_id,
          equipment (*)
        ),
        exercise_media (*),
        exercise_tags (
          tags (*)
        )
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async obterMusculos() {
    const { data, error } = await supabase
      .from('muscles')
      .select('*')
      .order('name_pt');
    if (error) throw error;
    return data;
  },

  async obterEquipamentos() {
    const { data, error } = await supabase
      .from('equipment')
      .select('*')
      .order('name');
    if (error) throw error;
    return data;
  },

  async obterDificuldades() {
    const { data, error } = await supabase
      .from('difficulty')
      .select('*')
      .order('level');
    if (error) throw error;
    return data;
  },

  async criar(payload, userId) {
    const { muscles, equipment, media, ...exerciseData } = payload;

    // 1. Criar o exercício principal
    const { data: exercise, error: exError } = await supabase
      .from('exercises')
      .insert({
        ...exerciseData,
        criado_por: userId,
        status: 'active'
      })
      .select()
      .single();

    if (exError) throw exError;

    // 2. Inserir Músculos associados
    if (muscles && muscles.length > 0) {
      const musclesInsert = muscles.map(m => ({
        exercise_id: exercise.id,
        muscle_id: m.muscle_id,
        role: m.role
      }));
      const { error: mError } = await supabase.from('exercise_muscles').insert(musclesInsert);
      if (mError) throw mError;
    }

    // 3. Inserir Equipamentos associados
    if (equipment && equipment.length > 0) {
      const equipInsert = equipment.map(eq => ({
        exercise_id: exercise.id,
        equipment_id: eq.equipment_id,
        required: eq.required ?? true
      }));
      const { error: eqError } = await supabase.from('exercise_equipment').insert(equipInsert);
      if (eqError) throw eqError;
    }

    // 4. Inserir Mídias associadas (ex: YouTube Video ID)
    if (media && media.length > 0) {
      const mediaInsert = media.map(md => ({
        exercise_id: exercise.id,
        type: md.type ?? 'video',
        provider: md.provider ?? 'youtube',
        video_id: md.video_id,
        is_default: md.is_default ?? true
      }));
      const { error: mdError } = await supabase.from('exercise_media').insert(mediaInsert);
      if (mdError) throw mdError;
    }

    return exercise;
  },

  async atualizar(id, payload) {
    const { muscles, equipment, media, ...exerciseData } = payload;

    // 1. Atualizar dados básicos
    const { data: exercise, error: exError } = await supabase
      .from('exercises')
      .update({
        ...exerciseData,
        atualizado_em: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (exError) throw exError;

    // 2. Atualizar Músculos (deletar antigos e inserir novos)
    const { error: delMusclesError } = await supabase.from('exercise_muscles').delete().eq('exercise_id', id);
    if (delMusclesError) throw delMusclesError;

    if (muscles && muscles.length > 0) {
      const musclesInsert = muscles.map(m => ({
        exercise_id: id,
        muscle_id: m.muscle_id,
        role: m.role
      }));
      const { error: mError } = await supabase.from('exercise_muscles').insert(musclesInsert);
      if (mError) throw mError;
    }

    // 3. Atualizar Equipamentos (deletar antigos e inserir novos)
    const { error: delEquipError } = await supabase.from('exercise_equipment').delete().eq('exercise_id', id);
    if (delEquipError) throw delEquipError;

    if (equipment && equipment.length > 0) {
      const equipInsert = equipment.map(eq => ({
        exercise_id: id,
        equipment_id: eq.equipment_id,
        required: eq.required ?? true
      }));
      const { error: eqError } = await supabase.from('exercise_equipment').insert(equipInsert);
      if (eqError) throw eqError;
    }

    // 4. Atualizar Mídias (deletar antigas e inserir novas)
    const { error: delMediaError } = await supabase.from('exercise_media').delete().eq('exercise_id', id);
    if (delMediaError) throw delMediaError;

    if (media && media.length > 0) {
      const mediaInsert = media.map(md => ({
        exercise_id: id,
        type: md.type ?? 'video',
        provider: md.provider ?? 'youtube',
        video_id: md.video_id,
        is_default: md.is_default ?? true
      }));
      const { error: mdError } = await supabase.from('exercise_media').insert(mediaInsert);
      if (mdError) throw mdError;
    }

    return exercise;
  },

  async excluir(id) {
    const { error } = await supabase.from('exercises').delete().eq('id', id);
    if (error) throw error;
  },

  async buscarEquivalentes(exerciseId) {
    const ex = await this.buscarPorId(exerciseId);
    // Encontrar o músculo primário do exercício atual
    const primaryMuscle = ex.exercise_muscles?.find(em => em.role === 'primary');
    if (!primaryMuscle) return [];

    // Buscar outros exercícios que tenham o mesmo músculo primário
    const { data, error } = await supabase
      .from('exercise_muscles')
      .select(`
        role,
        exercises (
          id,
          name_pt,
          exercise_muscles (
            role,
            muscles (name_pt)
          )
        )
      `)
      .eq('muscle_id', primaryMuscle.muscle_id)
      .eq('role', 'primary')
      .neq('exercise_id', exerciseId)
      .limit(5);

    if (error) return [];

    // Mapear resultado formatado
    return data.map(item => ({
      id: item.exercises.id,
      nome: item.exercises.name_pt,
      grupo_muscular: item.exercises.exercise_muscles
        ?.filter(em => em.role === 'primary')
        .map(em => em.muscles?.name_pt)
        .join(', ')
    }));
  },

  // ── exercise_relations (variações, substituições, progressões) ──
  // Relações são direcionais só pra progressão: exercise_id = mais
  // fácil, related_exercise_id = mais difícil. Variação e
  // substituição são simétricas (aparecem nos dois lados).
  async listarRelacoes(exerciseId) {
    const { data, error } = await supabase
      .from('exercise_relations')
      .select(`
        id, relation_type, reason, exercise_id, related_exercise_id,
        exercise:exercise_id ( id, name_pt ),
        related:related_exercise_id ( id, name_pt )
      `)
      .or(`exercise_id.eq.${exerciseId},related_exercise_id.eq.${exerciseId}`);
    if (error) throw error;

    const resultado = { variacoes: [], substituicoes: [], progressoesFaceis: [], progressoesDificeis: [] };

    (data || []).forEach(rel => {
      const souEuExercise = rel.exercise_id === exerciseId;
      const outro = souEuExercise ? rel.related : rel.exercise;
      if (!outro) return;
      const item = { relId: rel.id, id: outro.id, nome: outro.name_pt, reason: rel.reason };

      if (rel.relation_type === 'variacao') resultado.variacoes.push(item);
      else if (rel.relation_type === 'substituicao') resultado.substituicoes.push(item);
      else if (rel.relation_type === 'progressao') {
        // Se eu sou o exercise_id (mais fácil), o outro é mais difícil
        if (souEuExercise) resultado.progressoesDificeis.push(item);
        else resultado.progressoesFaceis.push(item);
      }
    });

    return resultado;
  },

  async adicionarRelacao({ exerciseId, relatedExerciseId, relationType, reason = null }) {
    const { data, error } = await supabase
      .from('exercise_relations')
      .insert({ exercise_id: exerciseId, related_exercise_id: relatedExerciseId, relation_type: relationType, reason })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async removerRelacao(relId) {
    const { error } = await supabase.from('exercise_relations').delete().eq('id', relId);
    if (error) throw error;
  }
};

