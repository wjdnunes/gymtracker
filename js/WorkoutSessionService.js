// ============================================================
// WorkoutSessionService.js — Domínio de Execução de Treino
//
// Extraído do treino.html (RFC — reduzir lógica de negócio
// misturada com UI). Antes, mobile e desktop tinham cada um
// sua própria cópia quase idêntica dessas funções
// (confirmarSerie / confirmarSerieD) — agora é uma só.
//
// O treino.html continua responsável só por: renderizar HTML,
// cronômetro/timer visual, drawer, som do timer.
// ============================================================
import { supabase, calcular1RM, verificarPR } from './supabase.js';

export const WorkoutSessionService = {

  // ── Seleção de ficha ────────────────────────────────────
  async listarFichasComContagem(userId) {
    const { data: fichasData, error } = await supabase
      .from('fichas')
      .select('id,nome,descricao')
      .eq('user_id', userId)
      .eq('ativo', true)
      .order('criado_em');
    if (error) throw error;

    const fichas = fichasData || [];
    return Promise.all(fichas.map(async f => {
      const { count } = await supabase
        .from('ficha_exercicios')
        .select('*', { count: 'exact', head: true })
        .eq('ficha_id', f.id);
      return { ...f, total_ex: count || 0 };
    }));
  },

  // ── Iniciar sessão de treino ────────────────────────────
  // Busca os exercícios da ficha (com músculo/vídeo já resolvidos)
  // e abre uma linha em `sessoes`. Retorna tudo pronto pra UI montar
  // o cache de séries.
  async iniciarSessao(userId, fichaId, fichaNome) {
    const { data: exs, error: exErr } = await supabase
      .from('ficha_exercicios')
      .select(`
        *,
        ficha_exercicio_series ( * ),
        exercises (
          id, name_pt,
          exercise_muscles ( role, muscles ( name_pt ) ),
          exercise_media ( type, provider, video_id, is_default )
        )
      `)
      .eq('ficha_id', fichaId)
      .order('ordem');
    if (exErr) throw exErr;

    if (!exs?.length) return { exercicios: [], sessaoId: null };

    const exercicios = exs.map(e => {
      const primaryMuscle = e.exercises?.exercise_muscles?.find(em => em.role === 'primary');
      const midias = e.exercises?.exercise_media || [];
      // Quatro combinações possíveis de mídia:
      // - vídeo externo (provider youtube/vimeo) — link, abre em nova aba
      // - vídeo hospedado no Storage (provider storage/local, arquivo .mp4)
      //   — embutido inline como <video>
      // - gif hospedado no Storage — embutido inline como <img>
      // `is_default` só desempata quando há mais de uma do MESMO tipo.
      const videosExternos = midias.filter(m => m.type === 'video' && (m.provider === 'youtube' || m.provider === 'vimeo'));
      const videosInline = midias.filter(m => m.type === 'video' && (m.provider === 'storage' || m.provider === 'local'));
      const gifsDisponiveis = midias.filter(m => m.type === 'gif');
      const videoExterno = videosExternos.find(m => m.is_default) || videosExternos[0];
      const videoInline = videosInline.find(m => m.is_default) || videosInline[0];
      const gifMedia = gifsDisponiveis.find(m => m.is_default) || gifsDisponiveis[0];
      const seriesGranulares = (e.ficha_exercicio_series || []).slice().sort((a,b) => a.numero_serie - b.numero_serie);

      // `video_id` guarda coisas diferentes conforme o provider: ID do
      // vídeo no YouTube/Vimeo, ou o caminho do arquivo dentro do bucket
      // do Supabase Storage (nunca a URL completa) — a URL pública final
      // é sempre montada aqui.
      function urlDoStorage(media) {
        if (!media?.video_id) return null;
        if (media.provider === 'storage') {
          const { data } = supabase.storage.from('exercicios-midia').getPublicUrl(media.video_id);
          return data?.publicUrl || null;
        }
        if (media.provider === 'local') {
          return media.video_id; // caminho já relativo ao próprio deploy
        }
        return null;
      }

      return {
        ...e,
        nome: e.exercises?.name_pt || e.nome || 'Exercício',
        grupo_muscular: primaryMuscle?.muscles?.name_pt || '',
        video_url: videoExterno?.video_id ? `https://www.youtube.com/watch?v=${videoExterno.video_id}` : null,
        media_video_url: urlDoStorage(videoInline),
        media_gif_url: urlDoStorage(gifMedia),
        descanso_series_seg: e.descanso_series_seg || 90,
        series_granulares: seriesGranulares
      };
    });

    const { data: sessao, error: sessErr } = await supabase
      .from('sessoes')
      .insert({
        user_id: userId, ficha_id: fichaId, ficha_nome: fichaNome,
        iniciado_em: new Date().toISOString()
      })
      .select()
      .single();
    if (sessErr) throw sessErr;

    return { exercicios, sessaoId: sessao.id };
  },

  // ── Iniciar sessão livre (sem ficha) ────────────────────
  async iniciarSessaoLivre(userId) {
    const { data: sessao, error } = await supabase
      .from('sessoes')
      .insert({
        user_id: userId, ficha_id: null, ficha_nome: 'Treino livre',
        iniciado_em: new Date().toISOString()
      })
      .select()
      .single();
    if (error) throw error;
    return sessao.id;
  },

  // ── Histórico e recorde de um exercício (drawer / painel) ──
  async obterHistoricoExercicio(fichaExercicioId, sessaoIdAtual, limit = 9) {
    // IDs sintéticos (treino livre, ex: "livre-...") não existem no banco —
    // não tem histórico de ficha pra buscar, retorna vazio sem consultar.
    const pareceUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fichaExercicioId);
    if (!pareceUUID) return [];

    const { data, error } = await supabase
      .from('series_executadas')
      .select('serie_num,carga_kg,reps_feitas,rpe,tipo,is_pr')
      .eq('ficha_exercicio_id', fichaExercicioId)
      .neq('sessao_id', sessaoIdAtual)
      .order('feita_em', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async obterPR(userId, exercicioNome) {
    const { data, error } = await supabase
      .from('personal_records')
      .select('melhor_carga_kg,melhor_reps,melhor_one_rm')
      .eq('user_id', userId)
      .eq('exercicio_nome', exercicioNome)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // ── Registrar uma série ─────────────────────────────────
  // Uma única função pra mobile e desktop (antes eram duas
  // cópias quase iguais). Faz: salvar a série, checar/gravar PR,
  // e atualizar carga_atual/carga_maxima da ficha_exercicio.
  // Retorna a série pronta pra UI só exibir.
  async registrarSerie({ userId, sessaoId, fichaExercicioId, exerciseId, exercicioNome, serieNum, tipo, carga, reps, rpe }) {
    if (!reps) throw new Error('Informe as repetições');

    const one_rm = calcular1RM(carga, reps);

    const { data: serieDB, error: insErr } = await supabase
      .from('series_executadas')
      .insert({
        sessao_id: sessaoId,
        ficha_exercicio_id: fichaExercicioId,
        exercise_id: exerciseId || null,
        exercicio_nome: exercicioNome,
        serie_num: serieNum,
        tipo: tipo || 'normal',
        reps_feitas: reps,
        carga_kg: carga,
        one_rm, rpe,
        feita_em: new Date().toISOString()
      })
      .select()
      .single();
    if (insErr) throw insErr;

    const is_pr = await verificarPR(userId, exercicioNome, carga, reps, one_rm, serieDB.id);

    if (is_pr) {
      await supabase.from('series_executadas').update({ is_pr: true }).eq('id', serieDB.id);
    }

    // Atualiza carga_atual sempre; carga_maxima só quando bate recorde
    // (só existe ficha_exercicio de verdade quando NÃO é treino livre)
    if (carga && fichaExercicioId) {
      const payload = { carga_atual: carga, carga_updated_at: new Date().toISOString() };
      await supabase.from('ficha_exercicios').update(payload).eq('id', fichaExercicioId);
    }

    return { db_id: serieDB.id, is_pr, one_rm };
  },

  // Atualiza carga_maxima da ficha_exercicio (chamado pela UI só
  // quando quem chamou já sabe, pelo carga_atual em memória, que
  // é um novo máximo — evita ida ao banco redundante).
  async atualizarCargaMaxima(fichaExercicioId, novaCarga) {
    await supabase
      .from('ficha_exercicios')
      .update({ carga_maxima: novaCarga, carga_updated_at: new Date().toISOString() })
      .eq('id', fichaExercicioId);
  },

  // ── Finalizar sessão ────────────────────────────────────
  async finalizarSessao(sessaoId, duracaoMin) {
    const { error } = await supabase
      .from('sessoes')
      .update({ finalizado_em: new Date().toISOString(), duracao_min: duracaoMin })
      .eq('id', sessaoId);
    if (error) throw error;
  }
};
