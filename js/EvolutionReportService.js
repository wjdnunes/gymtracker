// EvolutionReportService.js
// Domínio do Relatório de Evolução (Fase 1)
// Cobre: Resumo Executivo, Frequência e Consistência, Performance por
// Exercício, Recordes do período.
//
// Fases futuras (NÃO implementadas aqui, dependem de decisões de produto
// e/ou schema ainda em aberto):
//   Fase 2 — Volume por grupo muscular (depende de decidir o peso de
//            músculo primário vs secundário no cálculo de volume)
//   Fase 3 — Composição Corporal (depende de estender `medidas` ou criar
//            `avaliacoes_fisicas` com gordura_corporal_pct, massa_magra_kg,
//            cintura_cm, quadril_cm)
//   Fase 4 — Índice de Evolução (IE) (depende das Fases 2 e 3 estarem
//            prontas, pra não gerar uma pontuação enviesada)

import { supabase, showToast } from './supabase.js';

/**
 * Calcula o período anterior de mesma duração, usado para comparações
 * percentuais (ex: "carga aumentou 6,8%").
 */
function calcularPeriodoAnterior(dataInicio, dataFim) {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  const duracaoMs = fim.getTime() - inicio.getTime();

  const fimAnterior = new Date(inicio.getTime() - 1); // 1ms antes do início atual
  const inicioAnterior = new Date(fimAnterior.getTime() - duracaoMs);

  return {
    inicio: inicioAnterior.toISOString(),
    fim: fimAnterior.toISOString(),
  };
}

function variacaoPercentual(atual, anterior) {
  if (anterior === null || anterior === undefined || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

/**
 * Busca todas as sessões finalizadas do usuário num período.
 * `sessoes.user_id` existe direto na tabela — sem necessidade de join.
 */
async function buscarSessoesPeriodo(userId, dataInicio, dataFim) {
  const { data, error } = await supabase
    .from('sessoes')
    .select('id, ficha_id, ficha_nome, iniciado_em, finalizado_em, duracao_min')
    .eq('user_id', userId)
    .not('finalizado_em', 'is', null)
    .gte('iniciado_em', dataInicio)
    .lte('iniciado_em', dataFim)
    .order('iniciado_em', { ascending: true });

  if (error) {
    showToast('Erro ao buscar sessões do período', 'error');
    throw error;
  }
  return data || [];
}

/**
 * Busca todas as séries executadas do usuário num período.
 * `series_executadas` NÃO tem user_id — filtra via join com `sessoes`,
 * conforme regra de código documentada no GYMTRACKER_RESUMO_TECNICO.md.
 */
async function buscarSeriesPeriodo(userId, dataInicio, dataFim) {
  const { data, error } = await supabase
    .from('series_executadas')
    .select(`
      id, sessao_id, ficha_exercicio_id, exercicio_nome, exercise_id,
      serie_num, tipo, reps_feitas, carga_kg, one_rm, is_pr, feita_em,
      sessoes!inner ( user_id, iniciado_em )
    `)
    .eq('sessoes.user_id', userId)
    .gte('sessoes.iniciado_em', dataInicio)
    .lte('sessoes.iniciado_em', dataFim);

  if (error) {
    showToast('Erro ao buscar séries do período', 'error');
    throw error;
  }
  return data || [];
}

/**
 * Busca PRs batidos num período (tabela dedicada, mais confiável que
 * filtrar is_pr em series_executadas, já que personal_records guarda o
 * "melhor de todos os tempos", não só do período).
 */
async function buscarRecordesPeriodo(userId, dataInicio, dataFim) {
  const { data, error } = await supabase
    .from('personal_records')
    .select('id, exercicio_nome, exercise_id, melhor_carga_kg, melhor_reps, melhor_one_rm, batido_em')
    .eq('user_id', userId)
    .gte('batido_em', dataInicio)
    .lte('batido_em', dataFim)
    .order('batido_em', { ascending: false });

  if (error) {
    showToast('Erro ao buscar recordes do período', 'error');
    throw error;
  }
  return data || [];
}

// ---------------------------------------------------------------------
// SEÇÃO 1 — RESUMO EXECUTIVO
// ---------------------------------------------------------------------

/**
 * @param {string} userId
 * @param {string} dataInicio - ISO date
 * @param {string} dataFim - ISO date
 * @param {number|null} treinosPlanejadosSemana - opcional. Se não informado,
 *        `treinosPrevistos` e `frequenciaPct` retornam null (não inventamos
 *        uma meta que o usuário não definiu).
 */
export async function obterResumoExecutivo(userId, dataInicio, dataFim, treinosPlanejadosSemana = null) {
  const sessoes = await buscarSessoesPeriodo(userId, dataInicio, dataFim);
  const series = await buscarSeriesPeriodo(userId, dataInicio, dataFim);
  const recordes = await buscarRecordesPeriodo(userId, dataInicio, dataFim);

  const volumeTotal = series.reduce((acc, s) => {
    if (s.carga_kg == null || s.reps_feitas == null) return acc;
    return acc + (s.carga_kg * s.reps_feitas);
  }, 0);

  // Comparação com período anterior (carga média)
  const cargas = series.filter(s => s.carga_kg != null).map(s => s.carga_kg);
  const cargaMediaAtual = cargas.length ? cargas.reduce((a, b) => a + b, 0) / cargas.length : null;

  const periodoAnterior = calcularPeriodoAnterior(dataInicio, dataFim);
  const seriesAnteriores = await buscarSeriesPeriodo(userId, periodoAnterior.inicio, periodoAnterior.fim);
  const cargasAnteriores = seriesAnteriores.filter(s => s.carga_kg != null).map(s => s.carga_kg);
  const cargaMediaAnterior = cargasAnteriores.length
    ? cargasAnteriores.reduce((a, b) => a + b, 0) / cargasAnteriores.length
    : null;

  const cargaMediaVariacaoPct = variacaoPercentual(cargaMediaAtual, cargaMediaAnterior);

  // Volume do período anterior — reaproveita seriesAnteriores já buscado
  // acima (mesma query, evita nova ida ao banco)
  const volumeAnterior = seriesAnteriores.reduce((acc, s) => {
    if (s.carga_kg == null || s.reps_feitas == null) return acc;
    return acc + (s.carga_kg * s.reps_feitas);
  }, 0);
  const volumeVariacaoPct = variacaoPercentual(volumeTotal, volumeAnterior || null);

  let treinosPrevistos = null;
  let frequenciaPct = null;
  if (treinosPlanejadosSemana) {
    const dias = (new Date(dataFim) - new Date(dataInicio)) / (1000 * 60 * 60 * 24);
    const semanas = dias / 7;
    treinosPrevistos = Math.round(treinosPlanejadosSemana * semanas);
    frequenciaPct = treinosPrevistos > 0
      ? Math.round((sessoes.length / treinosPrevistos) * 100)
      : null;
  }

  return {
    periodo: { inicio: dataInicio, fim: dataFim },
    treinosRealizados: sessoes.length,
    treinosPrevistos,       // null se treinosPlanejadosSemana não informado
    frequenciaPct,          // null se treinosPlanejadosSemana não informado
    volumeTotalKg: Math.round(volumeTotal),
    volumeVariacaoPct: volumeVariacaoPct !== null ? Math.round(volumeVariacaoPct * 10) / 10 : null,
    recordesPessoais: recordes.length,
    cargaMediaVariacaoPct: cargaMediaVariacaoPct !== null ? Math.round(cargaMediaVariacaoPct * 10) / 10 : null,
    // "pontuacaoGeral" completo (com Composição Corporal) fica pra Fase 4.
    // O que existe hoje é um Índice de Evolução PARCIAL — ver
    // calcularIndiceEvolucaoParcial() abaixo, chamado pela agregadora.
  };
}

/**
 * Busca as 2 avaliações físicas mais recentes (tabela `avaliacoes_fisicas`,
 * MIGRATION_v10) até a data de fim do relatório, e calcula a variação de
 * % de gordura e massa muscular. Não exige que as duas avaliações caiam
 * dentro do período do relatório — avaliação física é tipicamente
 * mensal, então um período de 7-30 dias raramente teria 2 registros
 * dentro dele. Usa sempre a tendência mais recente disponível.
 */
export async function obterVariacaoComposicaoCorporal(userId, dataFim) {
  // NOTA (MIGRATION_v11): a tabela `avaliacoes_fisicas` não tem uma coluna
  // única `massa_muscular_kg` — tem `massa_magra_kg` (comum aos dois
  // métodos) e `massa_muscular_esqueletica_kg` (só preenchida quando o
  // método é bioimpedância, é uma medida mais específica que massa magra).
  // `massaMuscularProxy()` abaixo usa a esquelética quando disponível
  // (mais precisa) e cai pra massa magra como fallback, pra essa função
  // continuar funcionando independente de qual método o usuário usou.
  const { data, error } = await supabase
    .from('avaliacoes_fisicas')
    .select('data_avaliacao, percentual_gordura, massa_magra_kg, massa_muscular_esqueletica_kg')
    .eq('user_id', userId)
    .lte('data_avaliacao', dataFim.slice(0, 10))
    .order('data_avaliacao', { ascending: false })
    .limit(2);

  if (error) {
    showToast('Erro ao buscar avaliação física', 'error');
    throw error;
  }

  if (!data || data.length < 2) {
    return { disponivel: false };
  }

  function massaMuscularProxy(registro) {
    return registro.massa_muscular_esqueletica_kg ?? registro.massa_magra_kg ?? null;
  }

  const [atual, anterior] = data;
  const massaAtual = massaMuscularProxy(atual);
  const massaAnterior = massaMuscularProxy(anterior);

  const variacaoGordura = (atual.percentual_gordura != null && anterior.percentual_gordura != null)
    ? Math.round((atual.percentual_gordura - anterior.percentual_gordura) * 10) / 10
    : null;
  const variacaoMassaMuscular = (massaAtual != null && massaAnterior != null)
    ? Math.round((massaAtual - massaAnterior) * 10) / 10
    : null;

  if (variacaoGordura === null && variacaoMassaMuscular === null) {
    return { disponivel: false };
  }

  return {
    disponivel: true,
    dataAtual: atual.data_avaliacao,
    dataAnterior: anterior.data_avaliacao,
    variacaoGordura,
    variacaoMassaMuscular,
  };
}

/**
 * Índice de Evolução — agora com os 6 componentes originais do documento
 * de produto (Equilíbrio Muscular conectado via `obterEquilibrioMuscular`,
 * que combina pares antagonistas de volume + simetria física
 * esquerdo/direito). Pesos originais, renormalizados pra somar 100%
 * entre os componentes disponíveis:
 *
 *   Frequência ......... peso original 20
 *   Progressão de carga . peso original 25
 *   Volume .............. peso original 15
 *   PRs ................. peso original 10
 *   Composição corporal . peso original 15 (só se houver 2+ avaliações físicas)
 *   Equilíbrio muscular . peso original 10 (só se houver pares antagonistas
 *                          treinados no período e/ou avaliação física
 *                          segmentar)
 *   Regularidade ........ peso original  5
 *
 * Cada score 0-100 usa uma transformação heurística simples — os limiares
 * (ex: "+25% de carga = nota 100") são um ponto de partida arbitrário,
 * ajustável depois de validar com uso real ou opinião de um personal.
 * Componentes indisponíveis (sem meta de frequência, sem avaliação
 * física registrada, sem par antagonista treinado no período) têm o
 * peso redistribuído entre os disponíveis.
 */
export function calcularIndiceEvolucaoParcial(
  resumo,
  frequencia,
  composicaoCorporal = { disponivel: false },
  equilibrioMuscular = { disponivel: false }
) {
  const PESOS_ORIGINAIS = {
    frequencia: 20,
    progressaoCarga: 25,
    volume: 15,
    prs: 10,
    composicaoCorporal: 15,
    equilibrioMuscular: 10,
    regularidade: 5,
  };

  function clamp(v) { return Math.max(0, Math.min(100, v)); }

  // Composição corporal: % gordura descendo é bom, massa muscular
  // subindo é bom. Se só uma das duas métricas estiver disponível na
  // avaliação, usa só ela; se as duas, faz a média.
  let scoreComposicao = null;
  if (composicaoCorporal.disponivel) {
    const parciais = [];
    if (composicaoCorporal.variacaoGordura !== null) {
      parciais.push(clamp(50 - composicaoCorporal.variacaoGordura * 10));
    }
    if (composicaoCorporal.variacaoMassaMuscular !== null) {
      parciais.push(clamp(50 + composicaoCorporal.variacaoMassaMuscular * 10));
    }
    if (parciais.length) {
      scoreComposicao = parciais.reduce((a, b) => a + b, 0) / parciais.length;
    }
  }

  const scores = {
    frequencia: resumo.frequenciaPct !== null ? clamp(resumo.frequenciaPct) : null,
    progressaoCarga: resumo.cargaMediaVariacaoPct !== null ? clamp(50 + resumo.cargaMediaVariacaoPct * 2) : null,
    volume: resumo.volumeVariacaoPct !== null ? clamp(50 + resumo.volumeVariacaoPct * 1.5) : null,
    prs: clamp(resumo.recordesPessoais * 20), // 5+ PRs no período = nota máxima
    composicaoCorporal: scoreComposicao,
    equilibrioMuscular: equilibrioMuscular.disponivel ? equilibrioMuscular.score : null,
    regularidade: clamp((frequencia.maiorSequenciaDias * 100) / 14), // 14 dias seguidos = nota máxima
  };

  const componentesDisponiveis = Object.keys(scores).filter(k => scores[k] !== null);
  if (!componentesDisponiveis.length) {
    return { disponivel: false };
  }

  const pesoTotalDisponivel = componentesDisponiveis.reduce((acc, k) => acc + PESOS_ORIGINAIS[k], 0);
  const indiceRaw = componentesDisponiveis.reduce((acc, k) => {
    const pesoNormalizado = PESOS_ORIGINAIS[k] / pesoTotalDisponivel;
    return acc + scores[k] * pesoNormalizado;
  }, 0);

  const indice = Math.round(indiceRaw);
  const label = indice >= 85 ? 'Excelente evolução'
    : indice >= 70 ? 'Boa evolução'
    : indice >= 50 ? 'Evolução moderada'
    : 'Atenção necessária';

  // "completo" agora exige os dois componentes que dependem de dado extra
  // do usuário (composição corporal E equilíbrio muscular), não só o
  // primeiro — assim o rótulo reflete de verdade quando falta alguma coisa.
  const completo = componentesDisponiveis.includes('composicaoCorporal')
    && componentesDisponiveis.includes('equilibrioMuscular');

  return {
    disponivel: true,
    indice,
    label,
    parcial: !completo,
    componentesUsados: componentesDisponiveis,
  };
}

// ---------------------------------------------------------------------
// SEÇÃO 2 — FREQUÊNCIA E CONSISTÊNCIA
// ---------------------------------------------------------------------

export async function obterFrequenciaConsistencia(userId, dataInicio, dataFim) {
  const sessoes = await buscarSessoesPeriodo(userId, dataInicio, dataFim);

  // Mapa de dias com treino, para montar o calendário estilo GitHub no front
  const diasComTreino = new Set(
    sessoes.map(s => s.iniciado_em.slice(0, 10)) // YYYY-MM-DD
  );

  // Maior sequência de dias consecutivos com treino
  const diasOrdenados = [...diasComTreino].sort();
  let maiorSequencia = 0;
  let sequenciaAtual = 0;
  let diaAnterior = null;

  for (const dia of diasOrdenados) {
    if (diaAnterior) {
      const diffDias = (new Date(dia) - new Date(diaAnterior)) / (1000 * 60 * 60 * 24);
      sequenciaAtual = diffDias === 1 ? sequenciaAtual + 1 : 1;
    } else {
      sequenciaAtual = 1;
    }
    maiorSequencia = Math.max(maiorSequencia, sequenciaAtual);
    diaAnterior = dia;
  }

  return {
    treinosRealizados: sessoes.length,
    diasComTreino: [...diasComTreino], // array de 'YYYY-MM-DD', pro front desenhar o calendário
    maiorSequenciaDias: maiorSequencia,
    // "diasPerdidos" e "frequenciaPct" exigem uma meta definida pelo usuário
    // (ver treinosPlanejadosSemana em obterResumoExecutivo) — não calculado
    // aqui para não duplicar/divergir da mesma lógica.
  };
}

// ---------------------------------------------------------------------
// SEÇÃO 3 — PERFORMANCE POR EXERCÍCIO
// ---------------------------------------------------------------------

/**
 * Agrupa séries por exercise_id (fallback: exercicio_nome, para séries
 * antigas de treino livre que possam não ter exercise_id preenchido).
 * Retorna, por exercício: carga máxima, volume total, 1RM estimado
 * (melhor one_rm já calculado pelo app), e se bateu PR no período —
 * cada um comparado com o período anterior de mesma duração.
 */
export async function obterPerformancePorExercicio(userId, dataInicio, dataFim) {
  const seriesAtuais = await buscarSeriesPeriodo(userId, dataInicio, dataFim);

  const periodoAnterior = calcularPeriodoAnterior(dataInicio, dataFim);
  const seriesAnteriores = await buscarSeriesPeriodo(userId, periodoAnterior.inicio, periodoAnterior.fim);

  function agrupar(series) {
    const grupos = new Map();
    for (const s of series) {
      const chave = s.exercise_id || `nome:${s.exercicio_nome}`;
      if (!grupos.has(chave)) {
        grupos.set(chave, {
          exerciseId: s.exercise_id,
          nome: s.exercicio_nome,
          series: [],
        });
      }
      grupos.get(chave).series.push(s);
    }
    return grupos;
  }

  const gruposAtuais = agrupar(seriesAtuais);
  const gruposAnteriores = agrupar(seriesAnteriores);

  const resultado = [];

  for (const [chave, grupo] of gruposAtuais) {
    const cargas = grupo.series.filter(s => s.carga_kg != null).map(s => s.carga_kg);
    const oneRms = grupo.series.filter(s => s.one_rm != null).map(s => s.one_rm);
    const rpes = grupo.series.filter(s => s.rpe != null).map(s => s.rpe);
    const volume = grupo.series.reduce((acc, s) => {
      if (s.carga_kg == null || s.reps_feitas == null) return acc;
      return acc + (s.carga_kg * s.reps_feitas);
    }, 0);
    const bateuPr = grupo.series.some(s => s.is_pr === true);

    const cargaMaxima = cargas.length ? Math.max(...cargas) : null;
    const oneRmEstimado = oneRms.length ? Math.max(...oneRms) : null;
    const rpeMedio = rpes.length ? arred(rpes.reduce((a, b) => a + b, 0) / rpes.length) : null;

    // comparação com período anterior
    const grupoAnterior = gruposAnteriores.get(chave);
    let cargaMaximaAnterior = null;
    let volumeAnterior = null;
    let oneRmAnterior = null;

    if (grupoAnterior) {
      const cargasAnt = grupoAnterior.series.filter(s => s.carga_kg != null).map(s => s.carga_kg);
      const oneRmsAnt = grupoAnterior.series.filter(s => s.one_rm != null).map(s => s.one_rm);
      cargaMaximaAnterior = cargasAnt.length ? Math.max(...cargasAnt) : null;
      oneRmAnterior = oneRmsAnt.length ? Math.max(...oneRmsAnt) : null;
      volumeAnterior = grupoAnterior.series.reduce((acc, s) => {
        if (s.carga_kg == null || s.reps_feitas == null) return acc;
        return acc + (s.carga_kg * s.reps_feitas);
      }, 0);
    }

    resultado.push({
      exerciseId: grupo.exerciseId,
      nome: grupo.nome,
      cargaMaximaKg: cargaMaxima,
      cargaMaximaVariacaoPct: arred(variacaoPercentual(cargaMaxima, cargaMaximaAnterior)),
      volumeKg: Math.round(volume),
      volumeVariacaoPct: arred(variacaoPercentual(volume, volumeAnterior)),
      oneRmEstimadoKg: oneRmEstimado,
      oneRmVariacaoPct: arred(variacaoPercentual(oneRmEstimado, oneRmAnterior)),
      rpeMedio,
      bateuRecordeNoPeriodo: bateuPr,
      totalSeries: grupo.series.length,
    });
  }

  // ordena pelos exercícios com mais séries primeiro (proxy de relevância)
  resultado.sort((a, b) => b.totalSeries - a.totalSeries);

  return resultado;
}

function arred(valor) {
  return valor !== null && valor !== undefined ? Math.round(valor * 10) / 10 : null;
}

// ---------------------------------------------------------------------
// SEÇÃO 4 — RECORDES DO PERÍODO
// ---------------------------------------------------------------------

export async function obterRecordesDoPeriodo(userId, dataInicio, dataFim) {
  const recordes = await buscarRecordesPeriodo(userId, dataInicio, dataFim);

  return recordes.map(r => ({
    exerciseId: r.exercise_id,
    nome: r.exercicio_nome,
    melhorCargaKg: r.melhor_carga_kg,
    melhorReps: r.melhor_reps,
    melhorOneRm: r.melhor_one_rm,
    batidoEm: r.batido_em,
  }));
}

/**
 * Volume por grupamento muscular resumido em 5 baldes grandes (Peito,
 * Costas, Pernas, Ombros, Braços) — pensado pra um gráfico simples de
 * "desequilíbrio muscular" no relatório, não a granularidade completa
 * de 17 músculos que o Modo Profissional usa no resumo corporal.
 *
 * Mapeamento dos 17 `muscles.name_pt` reais nos 5 baldes:
 *   Peito   -> Peito
 *   Costas  -> Costas, Trapézio, Lombar
 *   Pernas  -> Quadríceps, Posterior de Coxa, Panturrilha, Glúteos, Adutores, Abdutores
 *   Ombros  -> Ombros
 *   Braços  -> Bíceps, Tríceps, Antebraço
 * Fora dos 5 baldes (Core/Abdômen, Cardio, Outro) não entram no
 * gráfico — o pedido original foi especificamente esses 5 grupos.
 */
export async function obterVolumePorGrupoResumido(userId, dataInicio, dataFim) {
  const BALDES = {
    'Peito': 'Peito',
    'Costas': 'Costas', 'Trapézio': 'Costas', 'Lombar': 'Costas',
    'Quadríceps': 'Pernas', 'Posterior de Coxa': 'Pernas', 'Panturrilha': 'Pernas',
    'Glúteos': 'Pernas', 'Adutores': 'Pernas', 'Abdutores': 'Pernas',
    'Ombros': 'Ombros',
    'Bíceps': 'Braços', 'Tríceps': 'Braços', 'Antebraço': 'Braços',
  };

  const { data, error } = await supabase
    .from('series_executadas')
    .select(`
      carga_kg, reps_feitas,
      sessoes!inner ( user_id, iniciado_em ),
      exercises ( exercise_muscles ( role, muscles ( name_pt ) ) )
    `)
    .eq('sessoes.user_id', userId)
    .gte('sessoes.iniciado_em', dataInicio)
    .lte('sessoes.iniciado_em', dataFim);

  if (error) {
    showToast('Erro ao buscar volume por grupamento', 'error');
    throw error;
  }

  const volumePorBalde = { Peito: 0, Costas: 0, Pernas: 0, Ombros: 0, Braços: 0 };

  (data || []).forEach(s => {
    const primario = s.exercises?.exercise_muscles?.find(em => em.role === 'primary');
    const nomeMuscle = primario?.muscles?.name_pt;
    const balde = BALDES[nomeMuscle];
    if (!balde) return; // Core/Abdômen, Cardio, Outro, ou sem exercise_muscles: fora do gráfico
    if (s.carga_kg == null || s.reps_feitas == null) return;
    volumePorBalde[balde] += s.carga_kg * s.reps_feitas;
  });

  const max = Math.max(...Object.values(volumePorBalde), 1);

  return Object.entries(volumePorBalde).map(([grupo, volume]) => ({
    grupo,
    volumeKg: Math.round(volume),
    proporcao: volume / max, // 0-1, pra desenhar a barra proporcional ao maior grupo
  }));
}

// ---------------------------------------------------------------------
// SEÇÃO 6 — EQUILÍBRIO MUSCULAR (componente que faltava no Índice de
// Evolução, peso original 10%)
// ---------------------------------------------------------------------

/**
 * Pares antagonistas reais, usando os 17 `muscles.name_pt` individuais
 * (não os "5 baldes" de obterVolumePorGrupoResumido — aqueles juntam
 * Bíceps+Tríceps+Antebraço no mesmo balde "Braços", o que esconderia
 * justamente o desequilíbrio entre antagonistas que queremos medir aqui).
 */
const PARES_ANTAGONISTAS = [
  { nome: 'Peito x Costas', a: 'Peito', b: 'Costas' },
  { nome: 'Bíceps x Tríceps', a: 'Bíceps', b: 'Tríceps' },
  { nome: 'Quadríceps x Posterior de Coxa', a: 'Quadríceps', b: 'Posterior de Coxa' },
];

/**
 * Volume de treino (kg) por músculo PRIMÁRIO individual, num período —
 * granularidade fina (17 músculos), diferente do resumo de 5 baldes.
 */
async function obterVolumePorMusculoIndividual(userId, dataInicio, dataFim) {
  const { data, error } = await supabase
    .from('series_executadas')
    .select(`
      carga_kg, reps_feitas,
      sessoes!inner ( user_id, iniciado_em ),
      exercises ( exercise_muscles ( role, muscles ( name_pt ) ) )
    `)
    .eq('sessoes.user_id', userId)
    .gte('sessoes.iniciado_em', dataInicio)
    .lte('sessoes.iniciado_em', dataFim);

  if (error) {
    showToast('Erro ao buscar volume por músculo', 'error');
    throw error;
  }

  const volumePorMusculo = {};
  (data || []).forEach(s => {
    const primario = s.exercises?.exercise_muscles?.find(em => em.role === 'primary');
    const nomeMuscle = primario?.muscles?.name_pt;
    if (!nomeMuscle) return;
    if (s.carga_kg == null || s.reps_feitas == null) return;
    volumePorMusculo[nomeMuscle] = (volumePorMusculo[nomeMuscle] || 0) + s.carga_kg * s.reps_feitas;
  });

  return volumePorMusculo;
}

/**
 * Score 0-100 de um par antagonista: 100 = perfeitamente equilibrado
 * (razão 1:1), caindo conforme um lado domina o outro. Usa a razão do
 * menor sobre o maior (sempre 0-1) transformada em score.
 */
function scoreRazaoAntagonista(volumeA, volumeB) {
  if (!volumeA && !volumeB) return null; // nenhum dos dois treinado no período
  if (!volumeA || !volumeB) return 0; // só um lado treinado = desequilíbrio máximo
  const razao = Math.min(volumeA, volumeB) / Math.max(volumeA, volumeB);
  return Math.round(razao * 100);
}

/**
 * Score 0-100 de simetria física esquerdo/direito, a partir de
 * `massa_magra_segmentar` da avaliação física mais recente que tiver
 * esse campo preenchido (normalmente só bioimpedância/InBody — dobras
 * cutâneas não mede por segmento). Mesma lógica de razão do componente
 * de treino: 100 = simetria perfeita.
 */
async function obterSimetriaFisica(userId, dataFim) {
  const { data, error } = await supabase
    .from('avaliacoes_fisicas')
    .select('data_avaliacao, massa_magra_segmentar')
    .eq('user_id', userId)
    .not('massa_magra_segmentar', 'is', null)
    .lte('data_avaliacao', dataFim.slice(0, 10))
    .order('data_avaliacao', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    showToast('Erro ao buscar simetria física', 'error');
    throw error;
  }

  if (!data?.massa_magra_segmentar) {
    return { disponivel: false };
  }

  const seg = data.massa_magra_segmentar;
  const pares = [
    { nome: 'Braços', a: seg.braco_direito, b: seg.braco_esquerdo },
    { nome: 'Pernas', a: seg.perna_direita, b: seg.perna_esquerda },
  ].filter(p => p.a != null && p.b != null);

  if (!pares.length) return { disponivel: false };

  const detalhes = pares.map(p => ({
    parte: p.nome,
    direito: p.a,
    esquerdo: p.b,
    diferencaPct: Math.round((Math.abs(p.a - p.b) / Math.max(p.a, p.b)) * 1000) / 10,
    score: scoreRazaoAntagonista(p.a, p.b),
  }));

  const scoreMedio = Math.round(detalhes.reduce((acc, d) => acc + d.score, 0) / detalhes.length);

  return {
    disponivel: true,
    dataAvaliacao: data.data_avaliacao,
    score: scoreMedio,
    detalhes,
  };
}

/**
 * Componente combinado de Equilíbrio Muscular: junta o equilíbrio de
 * ESTÍMULO DE TREINO (pares antagonistas, período do relatório) com a
 * SIMETRIA FÍSICA real (esquerdo/direito, da avaliação física mais
 * recente com dado segmentar). Quando só um dos dois está disponível,
 * usa só esse — nunca inventa a metade que falta.
 */
export async function obterEquilibrioMuscular(userId, dataInicio, dataFim) {
  const volumePorMusculo = await obterVolumePorMusculoIndividual(userId, dataInicio, dataFim);

  const paresAvaliados = PARES_ANTAGONISTAS
    .map(par => ({
      nome: par.nome,
      volumeA: Math.round(volumePorMusculo[par.a] || 0),
      volumeB: Math.round(volumePorMusculo[par.b] || 0),
      score: scoreRazaoAntagonista(volumePorMusculo[par.a], volumePorMusculo[par.b]),
    }))
    .filter(p => p.score !== null);

  const scoreVolumeAntagonista = paresAvaliados.length
    ? Math.round(paresAvaliados.reduce((acc, p) => acc + p.score, 0) / paresAvaliados.length)
    : null;

  const simetriaFisica = await obterSimetriaFisica(userId, dataFim);

  const scoresParaCombinar = [];
  if (scoreVolumeAntagonista !== null) scoresParaCombinar.push(scoreVolumeAntagonista);
  if (simetriaFisica.disponivel) scoresParaCombinar.push(simetriaFisica.score);

  if (!scoresParaCombinar.length) {
    return { disponivel: false };
  }

  const scoreCombinado = Math.round(
    scoresParaCombinar.reduce((a, b) => a + b, 0) / scoresParaCombinar.length
  );

  return {
    disponivel: true,
    score: scoreCombinado,
    estimuloTreino: paresAvaliados.length
      ? { score: scoreVolumeAntagonista, pares: paresAvaliados }
      : { score: null, pares: [] },
    simetriaFisica,
  };
}

// =======================================================================
// MODO PROFISSIONAL — carregado à parte (sob demanda), não faz parte do
// relatório pessoal padrão. Pensado pra revisão de um personal trainer.
// =======================================================================

/**
 * Mapa muscles.name_pt -> id do path no SVG do diagrama muscular
 * (m-peito, m-ombros etc.) + qual arquivo (frente/costas) o músculo
 * aparece. Nomes confirmados via `SELECT id, name_pt FROM muscles`
 * (17 registros reais). 'Cardio' e 'Outro' não têm correspondência
 * visual no diagrama — ficam de fora do resumo corporal por design,
 * não por engano.
 */
const MAPA_GRUPO_MUSCULAR_SVG = {
  'Peito':               { svg: 'frente', id: 'm-peito' },
  'Ombros':              { svg: 'frente', id: 'm-ombros' },
  'Bíceps':              { svg: 'frente', id: 'm-biceps' },
  'Antebraço':           { svg: 'frente', id: 'm-antebraco' },
  'Quadríceps':          { svg: 'frente', id: 'm-quadriceps' },
  'Adutores':            { svg: 'frente', id: 'm-adutores' },
  'Core / Abdômen':      { svg: 'frente', id: 'm-core' },
  'Costas':              { svg: 'costas', id: 'm-costas' },
  'Trapézio':            { svg: 'costas', id: 'm-trapezio' },
  'Tríceps':             { svg: 'costas', id: 'm-triceps' },
  'Posterior de Coxa':   { svg: 'costas', id: 'm-posterior_coxa' },
  'Lombar':              { svg: 'costas', id: 'm-lombar' },
  'Panturrilha':         { svg: 'costas', id: 'm-panturrilha' },
  'Glúteos':             { svg: 'costas', id: 'm-gluteos' },
  'Abdutores':           { svg: 'costas', id: 'm-abdutores' },
  'Cardio':              null,
  'Outro':               null,
};

/**
 * Agrupa por músculo PRIMÁRIO do exercício (via exercise_muscles,
 * role='primary'), não mais por `ficha_exercicios.grupo_muscular` —
 * esse campo está vazio em 70 de 71 fichas reais testadas, então não é
 * uma fonte confiável. A relação estrutural exercise_id -> exercise_muscles
 * -> muscles já existe pra todo exercício da Biblioteca e não depende de
 * preenchimento manual por ficha.
 *
 * Exercícios de treino livre (sem ficha_exercicio_id) NÃO ficam mais
 * isolados num grupo "Treino Livre" à parte — aparecem dentro do grupo
 * muscular real do exercício, só sem o bloco "Planejado" (porque não
 * existe planejamento pra eles). Só cai em "Sem grupo definido" quando
 * o exercício não tem exercise_id, ou não tem relação em exercise_muscles,
 * ou tem relação mas nenhuma com role='primary'.
 *
 * Inclui histórico das últimas 5 cargas por exercício (mini-gráfico de
 * tendência) e o sinal 'progrediu' / 'fadiga' / 'estavel'.
 */
export async function obterComparativoPlanejadoExecutado(userId, dataInicio, dataFim) {
  const { data, error } = await supabase
    .from('series_executadas')
    .select(`
      id, ficha_exercicio_id, exercicio_nome, exercise_id,
      reps_feitas, carga_kg, rpe, is_pr, feita_em,
      sessoes!inner ( user_id, iniciado_em ),
      ficha_exercicios ( nome, carga_padrao, series_padrao, reps_padrao, rpe_alvo ),
      exercises ( id, exercise_muscles ( role, muscles ( name_pt ) ) )
    `)
    .eq('sessoes.user_id', userId)
    .gte('sessoes.iniciado_em', dataInicio)
    .lte('sessoes.iniciado_em', dataFim)
    .order('feita_em', { ascending: true });

  if (error) {
    showToast('Erro ao buscar comparativo planejado x executado', 'error');
    throw error;
  }

  function grupoMuscularPrimario(s) {
    const relacoes = s.exercises?.exercise_muscles;
    if (!relacoes || !relacoes.length) return 'Sem grupo definido';
    const primario = relacoes.find(r => r.role === 'primary');
    return primario?.muscles?.name_pt || 'Sem grupo definido';
  }

  const grupos = new Map();

  for (const s of (data || [])) {
    const fe = s.ficha_exercicios;
    const temFicha = !!fe;
    const grupoNome = grupoMuscularPrimario(s);
    // chave por exercício dentro do grupo: usa ficha_exercicio_id quando
    // existe (mais preciso), senão exercise_id/nome (treino livre)
    const chaveExercicio = s.ficha_exercicio_id || `livre:${s.exercise_id || s.exercicio_nome}`;

    if (!grupos.has(grupoNome)) grupos.set(grupoNome, new Map());
    const exerciciosDoGrupo = grupos.get(grupoNome);

    if (!exerciciosDoGrupo.has(chaveExercicio)) {
      exerciciosDoGrupo.set(chaveExercicio, {
        nome: fe?.nome || s.exercicio_nome,
        temPlanejado: temFicha,
        planejado: fe ? {
          cargaKg: fe.carga_padrao,
          series: fe.series_padrao,
          reps: fe.reps_padrao,
          rpeAlvo: fe.rpe_alvo,
        } : null,
        series: [],
      });
    }
    exerciciosDoGrupo.get(chaveExercicio).series.push(s);
  }

  const resultado = [];

  for (const [grupoNome, exercicios] of grupos) {
    const listaExercicios = [];

    for (const [, ex] of exercicios) {
      const cargas = ex.series.filter(s => s.carga_kg != null).map(s => s.carga_kg);
      const rpes = ex.series.filter(s => s.rpe != null).map(s => s.rpe);
      const cargaMediaExecutada = cargas.length ? cargas.reduce((a, b) => a + b, 0) / cargas.length : null;
      const cargaMaximaExecutada = cargas.length ? Math.max(...cargas) : null;
      const rpeMedioExecutado = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
      const bateuPr = ex.series.some(s => s.is_pr === true);

      let sinal = null;
      if (ex.temPlanejado) {
        const rpeAlvo = ex.planejado.rpeAlvo;
        if (rpeMedioExecutado != null && rpeAlvo != null && (rpeMedioExecutado - rpeAlvo) >= 2) {
          sinal = 'fadiga';
        } else if (cargaMediaExecutada != null && ex.planejado.cargaKg != null && cargaMediaExecutada > ex.planejado.cargaKg) {
          sinal = 'progrediu';
        } else {
          sinal = 'estavel';
        }
      }

      const historicoCargas = cargas.slice(-5);

      listaExercicios.push({
        nome: ex.nome,
        temPlanejado: ex.temPlanejado,
        planejado: ex.planejado,
        executado: {
          cargaMediaKg: cargaMediaExecutada !== null ? arred(cargaMediaExecutada) : null,
          cargaMaximaKg: cargaMaximaExecutada,
          totalSeries: ex.series.length,
          rpeMedio: rpeMedioExecutado !== null ? arred(rpeMedioExecutado) : null,
        },
        historicoCargas,
        sinal,
        bateuRecordeNoPeriodo: bateuPr,
      });
    }

    resultado.push({ grupoMuscular: grupoNome, exercicios: listaExercicios });
  }

  // 'Sem grupo definido' sempre por último; grupos musculares reais em
  // ordem alfabética antes dele
  resultado.sort((a, b) => {
    if (a.grupoMuscular === 'Sem grupo definido') return 1;
    if (b.grupoMuscular === 'Sem grupo definido') return -1;
    return a.grupoMuscular.localeCompare(b.grupoMuscular, 'pt-BR');
  });

  return resultado;
}

/**
 * Índice de Sobrecarga: volume dos últimos 7 dias vs. média semanal das
 * 4 semanas anteriores a essa. Inspirado no conceito Fitness/Fatigue/Form
 * do TrainingPeaks, adaptado pra volume (kg) em vez de Training Stress
 * Score (que exige potência/FC que não temos).
 *
 * LIMIAR: >130% = 'alto' (atenção), 110-130% = 'elevado', senão 'normal'.
 * Isso é uma escolha inicial arbitrária — ajustar depois de validar com
 * um personal de verdade. Requer pelo menos 4 semanas de histórico pra
 * fazer sentido; com menos que isso, retorna `suficiente: false`.
 */
export async function obterIndiceSobrecarga(userId, dataReferencia = new Date().toISOString()) {
  const fimJanela = new Date(dataReferencia);
  const inicioUltimos7 = new Date(fimJanela.getTime() - 7 * 24 * 60 * 60 * 1000);
  const inicioHistorico = new Date(fimJanela.getTime() - 35 * 24 * 60 * 60 * 1000); // 7 + 28 dias

  const series = await buscarSeriesPeriodo(userId, inicioHistorico.toISOString(), fimJanela.toISOString());

  if (!series.length) {
    return { suficiente: false, motivo: 'sem_dados' };
  }

  const primeiraData = new Date(Math.min(...series.map(s => new Date(s.sessoes.iniciado_em).getTime())));
  const diasDeHistorico = (fimJanela.getTime() - primeiraData.getTime()) / (1000 * 60 * 60 * 24);
  if (diasDeHistorico < 28) {
    return { suficiente: false, motivo: 'historico_insuficiente', diasDeHistorico: Math.round(diasDeHistorico) };
  }

  function volumeNoPeriodo(inicio, fim) {
    return series
      .filter(s => {
        const d = new Date(s.sessoes.iniciado_em);
        return d >= inicio && d < fim;
      })
      .reduce((acc, s) => {
        if (s.carga_kg == null || s.reps_feitas == null) return acc;
        return acc + (s.carga_kg * s.reps_feitas);
      }, 0);
  }

  const volumeUltimos7 = volumeNoPeriodo(inicioUltimos7, fimJanela);

  const semanasAnteriores = [];
  for (let i = 1; i <= 4; i++) {
    const fimSemana = new Date(inicioUltimos7.getTime() - (i - 1) * 7 * 24 * 60 * 60 * 1000);
    const inicioSemana = new Date(fimSemana.getTime() - 7 * 24 * 60 * 60 * 1000);
    semanasAnteriores.push(volumeNoPeriodo(inicioSemana, fimSemana));
  }
  const mediaAnteriores = semanasAnteriores.reduce((a, b) => a + b, 0) / semanasAnteriores.length;

  if (mediaAnteriores === 0) {
    return { suficiente: false, motivo: 'sem_volume_base' };
  }

  const indicePercentual = Math.round((volumeUltimos7 / mediaAnteriores) * 100);
  const status = indicePercentual > 130 ? 'alto' : indicePercentual > 110 ? 'elevado' : 'normal';

  return { suficiente: true, indicePercentual, status, volumeUltimos7: Math.round(volumeUltimos7), mediaAnteriores: Math.round(mediaAnteriores) };
}

/**
 * Volume por grupo muscular nos últimos 7 dias, já mapeado pro id de
 * path do SVG (ver MAPA_GRUPO_MUSCULAR_SVG acima) e classificado em
 * 3 níveis de intensidade pra pintar o diagrama: 'alto' (top 33% dos
 * grupos treinados), 'medio' (33-66%), 'baixo' (resto), 'nenhum' (não
 * treinado no período).
 */
export async function obterResumoCorporal(userId, dataReferencia = new Date().toISOString()) {
  const fim = new Date(dataReferencia);
  const inicio = new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000);

  const comparativo = await obterComparativoPlanejadoExecutado(userId, inicio.toISOString(), fim.toISOString());

  // 'Sem grupo definido' (sem exercise_muscles mapeado) e 'Cardio'/'Outro'
  // (sem correspondência visual no diagrama) ficam fora do boneco.
  // `gruposSemMapeamento` deixa isso visível pra quem chama, em vez de
  // sumir silenciosamente.
  const gruposSemMapeamento = comparativo
    .filter(g => g.grupoMuscular === 'Sem grupo definido')
    .reduce((acc, g) => acc + g.exercicios.length, 0);

  const volumePorGrupo = comparativo
    .filter(g => g.grupoMuscular !== 'Sem grupo definido' && MAPA_GRUPO_MUSCULAR_SVG[g.grupoMuscular])
    .map(g => {
      const volume = g.exercicios.reduce((acc, ex) => {
        const carga = ex.executado.cargaMediaKg || 0;
        const reps = ex.executado.totalSeries || 0; // aproximação: não temos reps agregados aqui
        return acc + carga * reps;
      }, 0);
      return { grupoMuscular: g.grupoMuscular, volume };
    })
    .filter(g => g.volume > 0)
    .sort((a, b) => b.volume - a.volume);

  if (!volumePorGrupo.length) {
    return { grupos: [], gruposSemMapeamento };
  }

  const max = volumePorGrupo[0].volume;

  return {
    grupos: volumePorGrupo.map(g => {
      const svgInfo = MAPA_GRUPO_MUSCULAR_SVG[g.grupoMuscular] || null;
      const proporcao = g.volume / max;
      const intensidade = proporcao >= 0.66 ? 'alto' : proporcao >= 0.33 ? 'medio' : 'baixo';
      return {
        grupoMuscular: g.grupoMuscular,
        volume: Math.round(g.volume),
        intensidade,
        svg: svgInfo?.svg || null,
        svgId: svgInfo?.id || null,
      };
    }),
    gruposSemMapeamento,
  };
}

// ---------------------------------------------------------------------
// FUNÇÃO AGREGADORA — monta o relatório completo da Fase 1 (Modo Pessoal)
// ---------------------------------------------------------------------

export async function gerarRelatorioEvolucao(userId, dataInicio, dataFim, treinosPlanejadosSemana = null) {
  const [resumo, frequencia, performance, recordes, volumePorGrupo, composicaoCorporal, equilibrioMuscular] = await Promise.all([
    obterResumoExecutivo(userId, dataInicio, dataFim, treinosPlanejadosSemana),
    obterFrequenciaConsistencia(userId, dataInicio, dataFim),
    obterPerformancePorExercicio(userId, dataInicio, dataFim),
    obterRecordesDoPeriodo(userId, dataInicio, dataFim),
    obterVolumePorGrupoResumido(userId, dataInicio, dataFim),
    obterVariacaoComposicaoCorporal(userId, dataFim),
    obterEquilibrioMuscular(userId, dataInicio, dataFim),
  ]);

  const indiceEvolucao = calcularIndiceEvolucaoParcial(resumo, frequencia, composicaoCorporal, equilibrioMuscular);
  const diretrizes = calcularDiretrizes(resumo, performance, volumePorGrupo, frequencia);

  return {
    resumoExecutivo: resumo,
    frequenciaConsistencia: frequencia,
    performancePorExercicio: performance,
    recordesDoPeriodo: recordes,
    volumePorGrupo,
    composicaoCorporal,
    equilibrioMuscular,
    indiceEvolucao,
    diretrizes,
    geradoEm: new Date().toISOString(),
  };
}

/**
 * Diretrizes automáticas pro próximo ciclo — regras simples sobre dado
 * que já temos, não é IA generativa. Cada regra é auditável e
 * previsível: mesmo dado sempre gera a mesma diretriz.
 */
function calcularDiretrizes(resumo, performance, volumePorGrupo, frequencia) {
  const diretrizes = [];

  // 1. Foco de volume — grupo com menor proporção relativa dentre os 5
  // (só sugere se houve QUALQUER treino no período, senão não há base)
  const gruposComVolume = volumePorGrupo.filter(g => g.volumeKg > 0);
  if (gruposComVolume.length >= 2) {
    const menorGrupo = [...gruposComVolume].sort((a, b) => a.proporcao - b.proporcao)[0];
    if (menorGrupo.proporcao < 0.5) {
      diretrizes.push({
        tipo: 'volume',
        texto: `Aumentar volume de ${menorGrupo.grupo} — está bem abaixo dos demais grupos no período.`,
      });
    }
  }

  // 2. Meta de carga — exercício com mais séries no período (proxy de
  // "exercício principal") que ainda não teve queda de carga
  const candidatos = performance.filter(p => p.cargaMaximaKg != null && (p.cargaMaximaVariacaoPct ?? 0) >= 0);
  if (candidatos.length) {
    const principal = candidatos[0]; // já vem ordenado por totalSeries desc
    diretrizes.push({
      tipo: 'carga',
      texto: `Progredir a carga em ${principal.nome} — meta sugerida de +5% sobre os ${principal.cargaMaximaKg}kg atuais.`,
    });
  }

  // 3. Consistência — usa frequenciaPct quando disponível, senão a
  // sequência mais longa como proxy
  if (resumo.frequenciaPct !== null) {
    diretrizes.push(resumo.frequenciaPct >= 85
      ? { tipo: 'consistencia', texto: `Manter a consistência atual — ${resumo.frequenciaPct}% de frequência é um ótimo ritmo.` }
      : { tipo: 'consistencia', texto: `Melhorar consistência de frequência — hoje em ${resumo.frequenciaPct}%, abaixo do ideal.` }
    );
  } else if (frequencia.maiorSequenciaDias > 0) {
    diretrizes.push({
      tipo: 'consistencia',
      texto: `Manter o ritmo — maior sequência do período foi de ${frequencia.maiorSequenciaDias} dias seguidos.`,
    });
  }

  return diretrizes;
}

// ---------------------------------------------------------------------
// FUNÇÃO AGREGADORA — Modo Profissional (carregada sob demanda, só
// quando o personal ativa o toggle no relatorio.html)
// ---------------------------------------------------------------------

export async function gerarRelatorioProfissional(userId, dataInicio, dataFim) {
  const [comparativo, sobrecarga, resumoCorporal, recordes] = await Promise.all([
    obterComparativoPlanejadoExecutado(userId, dataInicio, dataFim),
    obterIndiceSobrecarga(userId, dataFim),
    obterResumoCorporal(userId, dataFim),
    obterRecordesDoPeriodo(userId, dataInicio, dataFim),
  ]);

  return {
    comparativoPlanejadoExecutado: comparativo,
    indiceSobrecarga: sobrecarga,
    resumoCorporal,
    recordesDoPeriodo: recordes,
    geradoEm: new Date().toISOString(),
  };
}
