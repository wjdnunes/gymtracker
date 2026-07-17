// ============================================================
// ReportEngine.js — Motor de Relatórios do Treinador
// Consome StatisticsEngine + ProgressEngine (engine.js)
// A interface apenas apresenta — as engines calculam.
// ============================================================
import { supabase } from './supabase.js';
import { StatisticsEngine } from './StatisticsEngine.js';
import {
  avaliarProgressao,
  detectarEstagnacao,
  alertarVolumeExcessivo,
  sugerirDeload,
  calcularProximaCarga
} from './engine.js';

// ── NÍVEL 1: Visão Geral do Aluno ─────────────────────────
// Frequência, volume por grupo, adesão nas últimas 4 semanas
export async function relatorioVisaoGeral(userId) {
  const [resumo, volumeGrupo, sessoes] = await Promise.all([
    StatisticsEngine.resumoGeral(userId),
    StatisticsEngine.volumePorGrupo(userId),
    StatisticsEngine.listarSessoes(userId, 28)
  ]);

  // Frequência por semana (últimas 4)
  const agora = new Date();
  const semanas = [0, 0, 0, 0];
  sessoes.forEach(s => {
    const diff = Math.floor((agora - new Date(s.iniciado_em)) / (7 * 24 * 60 * 60 * 1000));
    if (diff < 4) semanas[diff]++;
  });

  // Média semanal
  const mediaSemanal = semanas.reduce((a, b) => a + b, 0) / 4;

  // Avaliar consistência
  let consistencia = 'baixa';
  if (mediaSemanal >= 4) consistencia = 'excelente';
  else if (mediaSemanal >= 3) consistencia = 'boa';
  else if (mediaSemanal >= 2) consistencia = 'regular';

  // Alertas de volume excessivo por grupo
  const alertasVolume = [];
  for (const grupo of volumeGrupo) {
    if (grupo.volume > 15000) {
      alertasVolume.push({
        grupo: grupo.grupo,
        volume: grupo.volume,
        alerta: 'Volume elevado — considere reduzir séries semanais'
      });
    }
  }

  return {
    resumo,
    volumeGrupo,
    frequenciaSemanas: semanas,
    mediaSemanal: Math.round(mediaSemanal * 10) / 10,
    consistencia,
    alertasVolume,
    totalSessoes4semanas: semanas.reduce((a, b) => a + b, 0)
  };
}

// ── NÍVEL 2: Relatório de Progresso de Carga ──────────────
// Evolução de 1RM, PRs, próxima carga sugerida
export async function relatorioProgresso(userId, exerciseId) {
  const [evolucao, prs, progressao] = await Promise.all([
    StatisticsEngine.evolucaoExercicio(userId, exerciseId),
    StatisticsEngine.listarPRs(userId),
    avaliarProgressao(userId, exerciseId)
  ]);

  // PR por exercise_id — mais confiável que casar por nome de texto
  // livre (a Biblioteca tem duplicatas de nome conhecidas, ver
  // PROJECT_MEMORY.md)
  const prDoExercicio = prs.find(p => p.exercise_id === exerciseId);

  // Buscar últimas séries para calcular próxima carga
  const { data: ultimasSeries } = await supabase
    .from('series_executadas')
    .select('carga_kg, reps_feitas, rpe, feita_em, sessoes!inner(user_id)')
    .eq('exercise_id', exerciseId)
    .eq('sessoes.user_id', userId)
    .order('feita_em', { ascending: false })
    .limit(5);

  const ultimaSerie = ultimasSeries?.[0];
  const proximaCarga = ultimaSerie
    ? calcularProximaCarga(
        ultimaSerie.carga_kg,
        evolucao?.historico?.[0] && 2.5,
        ultimaSerie.rpe
      )
    : null;

  // Tendência: comparar últimas 2 sessões
  let tendencia = 'estavel';
  if (evolucao?.historico?.length >= 2) {
    const ultimas = evolucao.historico.slice(-2);
    if (ultimas[1].carga > ultimas[0].carga) tendencia = 'crescendo';
    else if (ultimas[1].carga < ultimas[0].carga) tendencia = 'caindo';
  }

  return {
    evolucao,
    pr: prDoExercicio,
    progressao,
    proximaCarga,
    tendencia,
    ultimasSeries: ultimasSeries || []
  };
}

// ── NÍVEL 3: Relatório de Alertas e Segurança ─────────────
// Estagnação, deload urgente, volume excessivo
export async function relatorioAlertas(userId) {
  const exercicios = await StatisticsEngine.exerciciosTreinados(userId);
  const alertasDeload = await sugerirDeload(userId);

  const alertasEstagnacao = [];
  const alertasProgressao = [];
  const alertasDeloadEx = [];

  // Analisar cada exercício
  for (const { exerciseId, nome } of exercicios) {
    const [estagnacao, progressao] = await Promise.all([
      detectarEstagnacao(userId, exerciseId, 4),
      avaliarProgressao(userId, exerciseId)
    ]);

    if (estagnacao.estagnado) {
      // Buscar carga atual para contexto
      const { data: ultima } = await supabase
        .from('series_executadas')
        .select('carga_kg, rpe, feita_em, sessoes!inner(user_id)')
        .eq('exercise_id', exerciseId)
        .eq('sessoes.user_id', userId)
        .order('feita_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      alertasEstagnacao.push({
        exerciseId,
        exercicio: nome,
        sessoes: estagnacao.sessoesEstagnado,
        carga: estagnacao.cargaAtual,
        ultimaData: ultima?.feita_em,
        recomendacao: 'Considere variar o exercício, mudar faixa de repetições ou aumentar o incremento.'
      });
    }

    if (progressao.sugerir) {
      alertasProgressao.push({
        exerciseId,
        exercicio: nome,
        cargaAtual: progressao.cargaAtual,
        cargaSugerida: progressao.cargaSugerida,
        incremento: progressao.incremento,
        recomendacao: `RPE ≤ 7 em 2 sessões consecutivas. Aumente ${progressao.incremento} kg na próxima ficha.`
      });
    }
  }

  // Deload geral
  if (alertasDeload.sugerir) {
    alertasDeloadEx.push({
      tipo: 'deload_geral',
      urgencia: 'alta',
      recomendacao: alertasDeload.recomendacao || 'Reduza cargas em 40-50% por 1 semana para recuperação.',
      motivo: 'RPE médio ≥ 9 em 3 sessões consecutivas'
    });
  }

  // Score de risco geral (0-10)
  let risco = 0;
  if (alertasDeload.sugerir) risco += 4;
  risco += Math.min(alertasEstagnacao.length * 1.5, 4);
  risco = Math.min(Math.round(risco), 10);

  let nivelRisco = 'baixo';
  if (risco >= 7) nivelRisco = 'alto';
  else if (risco >= 4) nivelRisco = 'moderado';

  return {
    alertasEstagnacao,
    alertasProgressao,
    alertasDeload: alertasDeloadEx,
    risco,
    nivelRisco,
    totalInterventions: alertasEstagnacao.length + alertasDeloadEx.length
  };
}

// ── RELATÓRIO CONSOLIDADO ──────────────────────────────────
export async function relatorioCompleto(userId) {
  const [visaoGeral, alertas, prs, exercicios] = await Promise.all([
    relatorioVisaoGeral(userId),
    relatorioAlertas(userId),
    StatisticsEngine.listarPRs(userId),
    StatisticsEngine.exerciciosTreinados(userId)
  ]);

  return {
    geradoEm: new Date().toISOString(),
    userId,
    visaoGeral,
    alertas,
    prsRecentes: prs.slice(0, 5),
    exerciciosTreinados: exercicios
  };
}
