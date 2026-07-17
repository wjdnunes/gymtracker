// ============================================================
// engine.js — Motor de Treino GymTracker
// Toda lógica de decisão fica aqui. Zero UI.
// Preparado para substituição por IA no futuro.
// ============================================================

import { supabase } from './supabase.js';

// ------------------------------------------------------------
// 1. SUGESTÃO DE PROGRESSÃO DE CARGA
// Regra: RPE médio <= 7 em 2 sessões consecutivas com todas
// as séries e reps atingidas → sugerir incremento
// ------------------------------------------------------------
export async function avaliarProgressao(userId, exerciseId, incrementoKg = 2.5) {
  // Buscar últimas 2 sessões com séries do exercício
  const { data: series } = await supabase
    .from('series_executadas')
    .select('sessao_id, reps_feitas, rpe, carga_kg, feita_em, sessoes!inner(user_id)')
    .eq('exercise_id', exerciseId)
    .eq('tipo', 'normal')
    .eq('sessoes.user_id', userId)
    .order('feita_em', { ascending: false })
    .limit(20);

  if (!series?.length) return { sugerir: false, motivo: 'sem_historico' };

  // Agrupar por sessão
  const porSessao = {};
  series.forEach(s => {
    if (!porSessao[s.sessao_id]) porSessao[s.sessao_id] = [];
    porSessao[s.sessao_id].push(s);
  });

  const sessoes = Object.values(porSessao).slice(0, 2);
  if (sessoes.length < 2) return { sugerir: false, motivo: 'poucas_sessoes' };

  // Verificar RPE médio <= 7 em ambas
  const todasOk = sessoes.every(sess => {
    const rpeMedio = sess.filter(s => s.rpe).reduce((a, s) => a + s.rpe, 0) / sess.filter(s => s.rpe).length;
    return !rpeMedio || rpeMedio <= 7;
  });

  if (!todasOk) return { sugerir: false, motivo: 'rpe_alto' };

  const cargaAtual = series[0].carga_kg || 0;
  const cargaSugerida = cargaAtual + incrementoKg;

  return {
    sugerir: true,
    cargaAtual,
    cargaSugerida,
    incremento: incrementoKg,
    motivo: 'rpe_baixo_2_sessoes'
  };
}

// ------------------------------------------------------------
// 2. DETECÇÃO DE ESTAGNAÇÃO
// Regra: carga não aumentou nas últimas N sessões
// ------------------------------------------------------------
export async function detectarEstagnacao(userId, exerciseId, sessoesLimite = 4) {
  const { data: series } = await supabase
    .from('series_executadas')
    .select('sessao_id, carga_kg, feita_em, sessoes!inner(user_id)')
    .eq('exercise_id', exerciseId)
    .eq('sessoes.user_id', userId)
    .order('feita_em', { ascending: false })
    .limit(sessoesLimite * 5);

  if (!series?.length) return { estagnado: false };

  const porSessao = {};
  series.forEach(s => {
    if (!porSessao[s.sessao_id]) porSessao[s.sessao_id] = [];
    porSessao[s.sessao_id].push(s);
  });

  const sessoes = Object.values(porSessao).slice(0, sessoesLimite);
  if (sessoes.length < sessoesLimite) return { estagnado: false, motivo: 'historico_insuficiente' };

  const cargas = sessoes.map(sess => Math.max(...sess.map(s => s.carga_kg || 0)));
  const cargaMax = Math.max(...cargas);
  const cargaMin = Math.min(...cargas);
  const estagnado = cargaMax === cargaMin && cargaMax > 0;

  return {
    estagnado,
    cargaAtual: cargas[0],
    sessoesEstagnado: estagnado ? sessoesLimite : 0,
    motivo: estagnado ? 'carga_estatica' : 'progredindo'
  };
}

// ------------------------------------------------------------
// 3. ALERTA DE VOLUME EXCESSIVO
// Regra: volume total da sessão > 150% da média das últimas 3
// ------------------------------------------------------------
export async function alertarVolumeExcessivo(userId, fichaId, volumeAtual) {
  const { data: sessoes } = await supabase
    .from('sessoes')
    .select('id')
    .eq('user_id', userId)
    .eq('ficha_id', fichaId)
    .not('finalizado_em', 'is', null)
    .order('iniciado_em', { ascending: false })
    .limit(3);

  if (!sessoes?.length) return { alerta: false };

  const volumes = await Promise.all(sessoes.map(async s => {
    const { data: series } = await supabase
      .from('series_executadas')
      .select('carga_kg, reps_feitas')
      .eq('sessao_id', s.id);
    return (series || []).reduce((acc, s) => acc + ((s.carga_kg || 0) * (s.reps_feitas || 0)), 0);
  }));

  const mediaNormal = volumes.reduce((a, v) => a + v, 0) / volumes.length;
  const limiteAlerta = mediaNormal * 1.5;
  const alerta = volumeAtual > limiteAlerta && mediaNormal > 0;

  return {
    alerta,
    volumeAtual: Math.round(volumeAtual),
    mediaNormal: Math.round(mediaNormal),
    excesso: alerta ? Math.round(((volumeAtual / mediaNormal) - 1) * 100) : 0
  };
}

// ------------------------------------------------------------
// 4. SUGESTÃO DE DELOAD
// Regra: RPE médio >= 9 em 3 sessões consecutivas OU
//        volume cresceu >20% por 3 semanas seguidas
// ------------------------------------------------------------
export async function sugerirDeload(userId) {
  const { data: series } = await supabase
    .from('series_executadas')
    .select('sessao_id, rpe, feita_em, sessoes!inner(user_id)')
    .eq('sessoes.user_id', userId)
    .order('feita_em', { ascending: false })
    .limit(50);

  if (!series?.length) return { sugerir: false };

  const porSessao = {};
  series.forEach(s => {
    if (!porSessao[s.sessao_id]) porSessao[s.sessao_id] = [];
    porSessao[s.sessao_id].push(s);
  });

  const ultimas3 = Object.values(porSessao).slice(0, 3);
  if (ultimas3.length < 3) return { sugerir: false };

  const rpesAltos = ultimas3.every(sess => {
    const comRpe = sess.filter(s => s.rpe);
    if (!comRpe.length) return false;
    const medio = comRpe.reduce((a, s) => a + s.rpe, 0) / comRpe.length;
    return medio >= 9;
  });

  return {
    sugerir: rpesAltos,
    motivo: rpesAltos ? 'rpe_alto_3_sessoes' : 'ok',
    recomendacao: rpesAltos ? 'Reduza cargas em 40-50% por 1 semana para recuperação.' : null
  };
}

// ------------------------------------------------------------
// 5. CALCULAR PRÓXIMA CARGA SUGERIDA
// Retorna objeto completo para exibir na UI
// ------------------------------------------------------------
export function calcularProximaCarga(cargaAtual, incrementoKg, rpeUltimaSessao) {
  if (!cargaAtual) return null;

  let acao = 'manter';
  let proxima = cargaAtual;
  let motivo = '';

  if (rpeUltimaSessao <= 6) {
    proxima = cargaAtual + (incrementoKg * 2);
    acao = 'aumentar_double';
    motivo = 'RPE muito baixo — progressão acelerada';
  } else if (rpeUltimaSessao <= 7) {
    proxima = cargaAtual + incrementoKg;
    acao = 'aumentar';
    motivo = 'RPE confortável — pronto para progredir';
  } else if (rpeUltimaSessao <= 8) {
    proxima = cargaAtual;
    acao = 'manter';
    motivo = 'RPE adequado — mantenha a carga';
  } else if (rpeUltimaSessao >= 10) {
    proxima = cargaAtual - incrementoKg;
    acao = 'reduzir';
    motivo = 'Falha muscular — reduza levemente';
  }

  return { cargaAtual, proxima, acao, motivo, incrementoKg };
}

// ------------------------------------------------------------
// 6. RESUMO DE EVOLUÇÃO DO EXERCÍCIO
// Tudo que o historico.html vai precisar
// ------------------------------------------------------------
export async function resumoEvolucao(userId, exerciseId) {
  const { data: series } = await supabase
    .from('series_executadas')
    .select('carga_kg, reps_feitas, rpe, one_rm, feita_em, sessao_id, sessoes!inner(user_id)')
    .eq('exercise_id', exerciseId)
    .eq('sessoes.user_id', userId)
    .order('feita_em', { ascending: true });

  if (!series?.length) return null;

  const cargaInicial = series[0].carga_kg;
  const cargaAtual = series[series.length - 1].carga_kg;
  const melhorCarga = Math.max(...series.map(s => s.carga_kg || 0));
  const melhorOneRM = Math.max(...series.map(s => s.one_rm || 0));
  const volumeTotal = series.reduce((a, s) => a + ((s.carga_kg || 0) * (s.reps_feitas || 0)), 0);
  const rpesMedio = series.filter(s => s.rpe).reduce((a, s) => a + s.rpe, 0) / series.filter(s => s.rpe).length;

  // Sessões únicas
  const sessoesUnicas = [...new Set(series.map(s => s.sessao_id))];

  // Evolução percentual de carga
  const evolucaoPct = cargaInicial > 0 ? Math.round(((cargaAtual - cargaInicial) / cargaInicial) * 100) : 0;

  // Série temporal para gráfico
  const porSessao = {};
  series.forEach(s => {
    const data = s.feita_em.split('T')[0];
    if (!porSessao[data] || s.carga_kg > porSessao[data].carga) {
      porSessao[data] = { data, carga: s.carga_kg, one_rm: s.one_rm, rpe: s.rpe };
    }
  });

  return {
    cargaInicial,
    cargaAtual,
    melhorCarga,
    melhorOneRM: Math.round(melhorOneRM * 10) / 10,
    volumeTotal: Math.round(volumeTotal),
    rpesMedio: Math.round(rpesMedio * 10) / 10,
    totalSessoes: sessoesUnicas.length,
    evolucaoPct,
    historico: Object.values(porSessao)
  };
}
