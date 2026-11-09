// ============================================================
// StatisticsEngine.js — Motor de Estatísticas GymTracker
// Toda agregação e análise fica aqui. Zero UI.
// ============================================================
import { supabase } from './supabase.js';

// ── Datas no fuso local (o toISOString() usa UTC e empurra treinos
// da noite para o dia seguinte) ────────────────────────────
export function chaveDiaLocal(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// Semana começa na segunda-feira
export function inicioDaSemana(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export function addDias(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export const StatisticsEngine = {

  // ── Resumo geral do usuário ────────────────────────────
  async resumoGeral(userId) {
    const [
      { count: totalSessoes },
      { count: totalPRs },
      { data: series }
    ] = await Promise.all([
      supabase.from('sessoes').select('*', { count: 'exact', head: true }).eq('user_id', userId).not('finalizado_em', 'is', null),
      supabase.from('personal_records').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('series_executadas').select('carga_kg, reps_feitas, feita_em, sessoes!inner(user_id)').eq('sessoes.user_id', userId).order('feita_em', { ascending: false }).limit(500)
    ]);

    const volumeTotal = (series || []).reduce((a, s) => a + ((s.carga_kg || 0) * (s.reps_feitas || 0)), 0);

    // Semana atual
    const semanaInicio = new Date();
    semanaInicio.setDate(semanaInicio.getDate() - semanaInicio.getDay());
    semanaInicio.setHours(0,0,0,0);
    const { count: semanal } = await supabase
      .from('sessoes').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).not('finalizado_em', 'is', null)
      .gte('iniciado_em', semanaInicio.toISOString());

    return { totalSessoes: totalSessoes || 0, totalPRs: totalPRs || 0, volumeTotal: Math.round(volumeTotal), semanal: semanal || 0 };
  },

  // ── Histórico de sessões ───────────────────────────────
  async listarSessoes(userId, limite = 20) {
    const { data, error } = await supabase
      .from('sessoes')
      .select('*')
      .eq('user_id', userId)
      .not('finalizado_em', 'is', null)
      .order('iniciado_em', { ascending: false })
      .limit(limite);
    if (error) throw error;

    // Para cada sessão buscar volume e séries
    const sessoes = await Promise.all((data || []).map(async s => {
      const { data: series } = await supabase
        .from('series_executadas')
        .select('carga_kg, reps_feitas, exercicio_nome, is_pr')
        .eq('sessao_id', s.id);

      const volume = (series || []).reduce((a, se) => a + ((se.carga_kg || 0) * (se.reps_feitas || 0)), 0);
      const prs = (series || []).filter(se => se.is_pr).length;
      const exercicios = [...new Set((series || []).map(se => se.exercicio_nome).filter(Boolean))];

      return { ...s, volume: Math.round(volume), total_series: series?.length || 0, prs, exercicios };
    }));

    return sessoes;
  },

  // ── Evolução de carga por exercício ───────────────────
  async evolucaoExercicio(userId, exerciseId) {
    const { data, error } = await supabase
      .from('series_executadas')
      .select('carga_kg, reps_feitas, rpe, one_rm, feita_em, tipo, exercicio_nome, sessoes!inner(user_id)')
      .eq('exercise_id', exerciseId)
      .eq('sessoes.user_id', userId)
      .order('feita_em', { ascending: true });
    if (error) throw error;

    // Agrupar por data — pegar melhor carga do dia
    const porData = {};
    (data || []).forEach(s => {
      const data = s.feita_em.split('T')[0];
      if (!porData[data] || (s.carga_kg || 0) > (porData[data].carga || 0)) {
        porData[data] = { data, carga: s.carga_kg, reps: s.reps_feitas, rpe: s.rpe, one_rm: s.one_rm };
      }
    });

    const historico = Object.values(porData);
    if (!historico.length) return null;

    const cargas = historico.map(h => h.carga || 0).filter(Boolean);
    return {
      exerciseId,
      nome: data[0]?.exercicio_nome || '', // pega o nome do próprio resultado, não mais do parâmetro
      historico,
      cargaInicial: cargas[0],
      cargaAtual: cargas[cargas.length - 1],
      melhorCarga: Math.max(...cargas),
      melhorOneRM: Math.max(...historico.map(h => h.one_rm || 0)),
      totalSessoes: historico.length,
      evolucaoPct: cargas[0] > 0 ? Math.round(((cargas[cargas.length-1] - cargas[0]) / cargas[0]) * 100) : 0
    };
  },

  // ── PRs do usuário ─────────────────────────────────────
  async listarPRs(userId) {
    const { data, error } = await supabase
      .from('personal_records')
      .select('*')
      .eq('user_id', userId)
      .order('batido_em', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // ── Exercícios únicos treinados ────────────────────────
  // Retorna {exerciseId, nome} em vez de só nome — exercicio_nome é
  // texto livre e a Biblioteca já tem duplicatas conhecidas
  // (ver PROJECT_MEMORY.md), então agrupar por exercise_id é mais
  // confiável. Séries sem exercise_id (dado legado) ficam de fora
  // dessa lista — não têm como ser rastreadas com segurança por ID.
  async exerciciosTreinados(userId) {
    const { data } = await supabase
      .from('series_executadas')
      .select('exercise_id, exercicio_nome, sessoes!inner(user_id)')
      .eq('sessoes.user_id', userId)
      .not('exercise_id', 'is', null)
      .order('exercicio_nome');

    const vistos = new Map();
    (data || []).forEach(s => {
      if (!vistos.has(s.exercise_id)) vistos.set(s.exercise_id, s.exercicio_nome);
    });
    return [...vistos.entries()].map(([exerciseId, nome]) => ({ exerciseId, nome }));
  },

  // ── Volume por grupo muscular ──────────────────────────
  // Join direto exercise_id → exercises → exercise_muscles → muscles,
  // sem casar por nome. Séries sem exercise_id (dado legado) caem em
  // 'Outro' — mesma lógica de fallback usada no Modo Profissional do
  // Relatório de Evolução.
  async volumePorGrupo(userId) {
    const { data: series } = await supabase
      .from('series_executadas')
      .select(`
        carga_kg, reps_feitas, sessoes!inner(user_id),
        exercises ( exercise_muscles ( role, muscles ( name_pt ) ) )
      `)
      .eq('sessoes.user_id', userId);

    const volumePorGrupo = {};
    (series || []).forEach(s => {
      const primario = s.exercises?.exercise_muscles?.find(em => em.role === 'primary');
      const grupo = primario?.muscles?.name_pt || 'Outro';
      volumePorGrupo[grupo] = (volumePorGrupo[grupo] || 0) + ((s.carga_kg || 0) * (s.reps_feitas || 0));
    });

    return Object.entries(volumePorGrupo)
      .map(([grupo, volume]) => ({ grupo, volume: Math.round(volume) }))
      .sort((a, b) => b.volume - a.volume);
  },

  // ── Sequência de dias consecutivos com treino ──────────
  async sequenciaAtual(userId) {
    const { data, error } = await supabase
      .from('sessoes')
      .select('iniciado_em')
      .eq('user_id', userId)
      .not('finalizado_em', 'is', null)
      .order('iniciado_em', { ascending: false })
      .limit(200);
    if (error) throw error;

    const dias = new Set((data || []).map(s => s.iniciado_em.split('T')[0]));

    const hoje = new Date();
    const chave = d => d.toISOString().split('T')[0];

    // Se ainda não treinou hoje, isso não quebra a sequência —
    // só começa a contar a partir de ontem.
    let cursor = new Date(hoje);
    if (!dias.has(chave(cursor))) cursor.setDate(cursor.getDate() - 1);

    let streak = 0;
    while (dias.has(chave(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  },

  // ── Contagens leves para o Início (sem baixar séries) ──
  async contagens(userId) {
    const [{ count: totalSessoes }, { count: totalPRs }] = await Promise.all([
      supabase.from('sessoes').select('*', { count: 'exact', head: true }).eq('user_id', userId).not('finalizado_em', 'is', null),
      supabase.from('personal_records').select('*', { count: 'exact', head: true }).eq('user_id', userId)
    ]);
    return { totalSessoes: totalSessoes || 0, totalPRs: totalPRs || 0 };
  },

  // ── Sessões concluídas desde uma data (1 consulta só) ──
  // Mais recente primeiro. Serve à faixa da semana e à sequência.
  async sessoesDesde(userId, desdeISO, limite = 1000) {
    const { data, error } = await supabase
      .from('sessoes')
      .select('*')
      .eq('user_id', userId)
      .not('finalizado_em', 'is', null)
      .gte('iniciado_em', desdeISO)
      .order('iniciado_em', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data || [];
  },

  // ── Sequência em semanas seguidas que bateram a meta ───
  // Semana atual ainda em andamento não quebra a sequência: se a meta
  // dela ainda não foi batida, a contagem parte da semana passada.
  sequenciaSemanas(sessoes, metaSemanal, hoje = new Date()) {
    const meta = Math.max(1, metaSemanal || 1);
    const porSemana = new Map();
    (sessoes || []).forEach(s => {
      const k = chaveDiaLocal(inicioDaSemana(new Date(s.iniciado_em)));
      porSemana.set(k, (porSemana.get(k) || 0) + 1);
    });
    let cursor = inicioDaSemana(hoje);
    if ((porSemana.get(chaveDiaLocal(cursor)) || 0) < meta) cursor = addDias(cursor, -7);
    let n = 0;
    while ((porSemana.get(chaveDiaLocal(cursor)) || 0) >= meta) {
      n++;
      cursor = addDias(cursor, -7);
    }
    return n;
  },

  // ── Alertas do ProgressEngine ──────────────────────────
  async alertas(userId) {
    const alertas = [];

    // Buscar exercícios com histórico
    const exercicios = await this.exerciciosTreinados(userId);

    for (const { exerciseId, nome } of exercicios.slice(0, 10)) {
      const ev = await this.evolucaoExercicio(userId, exerciseId);
      if (!ev || ev.totalSessoes < 2) continue;

      // Estagnação: mesma carga nas últimas 3 sessões
      const ultimas = ev.historico.slice(-3);
      if (ultimas.length === 3) {
        const cargas = ultimas.map(h => h.carga);
        if (cargas.every(c => c === cargas[0]) && cargas[0] > 0) {
          alertas.push({ tipo: 'estagnacao', exerciseId, exercicio: nome, mensagem: `Sem evolução de carga nas últimas ${ultimas.length} sessões`, carga: cargas[0] });
        }
      }

      // Progressão sugerida: RPE médio <= 7 nas últimas 2 sessões
      const ultimas2 = ev.historico.slice(-2);
      if (ultimas2.length === 2) {
        const rpeMedio = ultimas2.filter(h => h.rpe).reduce((a, h) => a + h.rpe, 0) / ultimas2.filter(h => h.rpe).length;
        if (rpeMedio && rpeMedio <= 7) {
          alertas.push({ tipo: 'progressao', exerciseId, exercicio: nome, mensagem: `RPE médio ${rpeMedio.toFixed(1)} — pronto para aumentar a carga`, cargaAtual: ev.cargaAtual });
        }
      }
    }

    return alertas;
  }
};
