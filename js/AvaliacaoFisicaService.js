import { supabase, showToast } from './supabase.js';

/**
 * Service de Avaliação Física — GymTracker
 * Suporta dois métodos de registro:
 *   - dobras_cutaneas: usuário digita as dobras (mm), o service calcula
 *     densidade corporal + % de gordura
 *   - bioimpedancia: usuário digita os valores já prontos do aparelho
 *     (InBody ou similar), sem cálculo adicional necessário
 *
 * Regras de negócio ficam aqui, nunca no HTML.
 */
export const AvaliacaoFisicaService = {

  // ==========================================================
  // CÁLCULO — Dobras Cutâneas
  // ==========================================================
  // Protocolos suportados: 'jp3' (Jackson & Pollock 3 dobras),
  // 'jp7' (Jackson & Pollock 7 dobras), 'faulkner4' (Faulkner 4 dobras).
  // 'guedes' ainda NÃO implementado — existem várias versões publicadas
  // da equação de Guedes (varia por sexo/população); confirmar qual usar
  // antes de habilitar essa opção.
  calcularDobrasCutaneas({ sexo, idade, protocolo, dobras, formula = 'siri' }) {
    if (!sexo || !idade || !protocolo || !dobras) {
      throw new Error('Parâmetros obrigatórios: sexo, idade, protocolo, dobras');
    }

    let somaDobras, densidadeCorporal, percentualGordura;

    if (protocolo === 'jp3') {
      // Homens: peitoral, abdômen, coxa | Mulheres: tríceps, supra-ilíaca, coxa
      const campos = sexo === 'masculino'
        ? ['peitoral', 'abdominal', 'coxa']
        : ['triceps', 'suprailiaca', 'coxa'];
      somaDobras = this._somarDobras(dobras, campos);

      densidadeCorporal = sexo === 'masculino'
        ? 1.10938 - 0.0008267 * somaDobras + 0.0000016 * somaDobras ** 2 - 0.0002574 * idade
        : 1.0994921 - 0.0009929 * somaDobras + 0.0000023 * somaDobras ** 2 - 0.0001392 * idade;

      percentualGordura = this._converterParaPercentualGordura(densidadeCorporal, formula);

    } else if (protocolo === 'jp7') {
      const campos = ['peitoral', 'axilar_media', 'triceps', 'subescapular', 'abdominal', 'suprailiaca', 'coxa'];
      somaDobras = this._somarDobras(dobras, campos);

      densidadeCorporal = sexo === 'masculino'
        ? 1.112 - 0.00043499 * somaDobras + 0.00000055 * somaDobras ** 2 - 0.00028826 * idade
        : 1.097 - 0.00046971 * somaDobras + 0.00000056 * somaDobras ** 2 - 0.00012828 * idade;

      percentualGordura = this._converterParaPercentualGordura(densidadeCorporal, formula);

    } else if (protocolo === 'faulkner4') {
      // Bíceps, tríceps, subescapular, supra-ilíaca — equação direta, sem densidade corporal
      const campos = ['bicipital', 'triceps', 'subescapular', 'suprailiaca'];
      somaDobras = this._somarDobras(dobras, campos);

      percentualGordura = sexo === 'masculino'
        ? somaDobras * 0.153 + 5.783
        : somaDobras * 0.143 + 5.076;
      densidadeCorporal = null; // Faulkner não passa por densidade corporal

    } else if (protocolo === 'guedes') {
      throw new Error(
        'Protocolo Guedes ainda não implementado — confirme qual versão da ' +
        'equação (existem variantes por sexo/população) antes de habilitar.'
      );
    } else {
      throw new Error(`Protocolo desconhecido: ${protocolo}`);
    }

    return {
      somaDobras: Number(somaDobras.toFixed(1)),
      densidadeCorporal: densidadeCorporal ? Number(densidadeCorporal.toFixed(4)) : null,
      percentualGordura: Number(percentualGordura.toFixed(1)),
    };
  },

  _somarDobras(dobras, campos) {
    const faltando = campos.filter(c => dobras[c] == null);
    if (faltando.length) {
      throw new Error(`Faltam dobras obrigatórias para esse protocolo: ${faltando.join(', ')}`);
    }
    return campos.reduce((soma, c) => soma + Number(dobras[c]), 0);
  },

  _converterParaPercentualGordura(densidadeCorporal, formula) {
    if (formula === 'brozek') {
      return (457 / densidadeCorporal) - 414.2;
    }
    return (495 / densidadeCorporal) - 450; // siri (padrão)
  },

  // ==========================================================
  // REGISTRO — grava uma avaliação (dobras OU bioimpedância)
  // ==========================================================
  async registrarAvaliacao(userId, dados) {
    if (!userId) throw new Error('userId obrigatório');
    if (!dados.metodo || !['dobras_cutaneas', 'bioimpedancia'].includes(dados.metodo)) {
      throw new Error('dados.metodo deve ser "dobras_cutaneas" ou "bioimpedancia"');
    }

    const payload = {
      user_id: userId,
      data_avaliacao: dados.dataAvaliacao || new Date().toISOString().slice(0, 10),
      metodo: dados.metodo,
      peso_kg: dados.pesoKg ?? null,
      altura_cm: dados.alturaCm ?? null,
      percentual_gordura: dados.percentualGordura ?? null,
      massa_gorda_kg: dados.massaGordaKg ?? null,
      massa_magra_kg: dados.massaMagraKg ?? null,
      imc: dados.imc ?? null,
      observacoes: dados.observacoes ?? null,
    };

    if (dados.metodo === 'dobras_cutaneas') {
      Object.assign(payload, {
        protocolo_dobras: dados.protocolo ?? null,
        dobras: dados.dobras ?? null,
        formula_conversao: dados.formulaConversao ?? 'siri',
      });
    }

    if (dados.metodo === 'bioimpedancia') {
      Object.assign(payload, {
        agua_corporal_total_l: dados.aguaCorporalTotalL ?? null,
        proteina_kg: dados.proteinaKg ?? null,
        minerais_kg: dados.mineraisKg ?? null,
        massa_muscular_esqueletica_kg: dados.massaMuscularEsqueleticaKg ?? null,
        taxa_metabolica_basal_kcal: dados.taxaMetabolicaBasalKcal ?? null,
        relacao_cintura_quadril: dados.relacaoCinturaQuadril ?? null,
        nivel_gordura_visceral: dados.nivelGorduraVisceral ?? null,
        grau_obesidade_pct: dados.grauObesidadePct ?? null,
        pontuacao_inbody: dados.pontuacaoInbody ?? null,
        peso_ideal_kg: dados.pesoIdealKg ?? null,
        massa_magra_segmentar: dados.massaMagraSegmentar ?? null,
        massa_gordura_segmentar: dados.massaGorduraSegmentar ?? null,
      });
    }

    const { data, error } = await supabase
      .from('avaliacoes_fisicas')
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) {
      showToast('Erro ao salvar avaliação física', 'error');
      throw error;
    }

    showToast('Avaliação registrada com sucesso', 'success');
    return data;
  },

  // ==========================================================
  // CONSULTA
  // ==========================================================
  async listarHistorico(userId, limite = 20) {
    if (!userId) throw new Error('userId obrigatório');
    const { data, error } = await supabase
      .from('avaliacoes_fisicas')
      .select('*')
      .eq('user_id', userId)
      .order('data_avaliacao', { ascending: false })
      .limit(limite);

    if (error) {
      showToast('Erro ao carregar histórico de avaliações', 'error');
      throw error;
    }
    return data;
  },

  async obterUltimaAvaliacao(userId) {
    if (!userId) throw new Error('userId obrigatório');
    const { data, error } = await supabase
      .from('avaliacoes_fisicas')
      .select('*')
      .eq('user_id', userId)
      .order('data_avaliacao', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      showToast('Erro ao carregar última avaliação', 'error');
      throw error;
    }
    return data;
  },

  async excluirAvaliacao(userId, avaliacaoId) {
    if (!userId || !avaliacaoId) throw new Error('userId e avaliacaoId obrigatórios');
    const { error } = await supabase
      .from('avaliacoes_fisicas')
      .delete()
      .eq('id', avaliacaoId)
      .eq('user_id', userId); // reforça isolamento mesmo com RLS

    if (error) {
      showToast('Erro ao excluir avaliação', 'error');
      throw error;
    }
    showToast('Avaliação excluída', 'success');
  },
};
