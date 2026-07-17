// ============================================================
// MuscleDiagramService.js — Diagrama muscular reutilizável
//
// Não precisa de tabela nova no banco: o mapeamento abaixo liga
// o nome real de `muscles.name_pt` (como já existe no banco) à
// região correspondente no SVG (frente ou costas). Cardio e
// Outro não têm diagrama (não são músculos visualizáveis).
// ============================================================

const MAPA_MUSCULOS = {
  'Peito':               { slug: 'peito',          vista: 'frente' },
  'Bíceps':              { slug: 'biceps',          vista: 'frente' },
  'Ombros':              { slug: 'ombros',          vista: 'frente' },
  'Quadríceps':          { slug: 'quadriceps',      vista: 'frente' },
  'Core / Abdômen':      { slug: 'core',            vista: 'frente' },
  'Adutores':            { slug: 'adutores',        vista: 'frente' },
  'Antebraço':           { slug: 'antebraco',       vista: 'frente' },
  'Costas':              { slug: 'costas',          vista: 'costas' },
  'Trapézio':            { slug: 'trapezio',        vista: 'costas' },
  'Tríceps':             { slug: 'triceps',         vista: 'costas' },
  'Posterior de Coxa':   { slug: 'posterior_coxa',  vista: 'costas' },
  'Lombar':              { slug: 'lombar',          vista: 'costas' },
  'Panturrilha':         { slug: 'panturrilha',     vista: 'costas' },
  'Glúteos':             { slug: 'gluteos',         vista: 'costas' },
  'Abdutores':           { slug: 'abdutores',       vista: 'costas' },
  // 'Cardio' e 'Outro' ficam de fora de propósito — não são músculos
};

const CORES = {
  primary: '#f97316',
  secondary: '#eab308',
  stabilizer: '#eab308'
};

let cacheSvg = { frente: null, costas: null };

async function carregarSvg(vista) {
  if (cacheSvg[vista]) return cacheSvg[vista];
  const resp = await fetch(`/assets/exercise-base/diagrama-${vista}.svg`);
  const texto = await resp.text();
  cacheSvg[vista] = texto;
  return texto;
}

export const MuscleDiagramService = {
  /**
   * Renderiza o diagrama muscular certo (frente ou costas) dentro do
   * elemento indicado, colorindo os músculos de acordo com os dados
   * reais de exercise_muscles do exercício.
   *
   * @param {HTMLElement} container - onde o SVG vai ser inserido
   * @param {Array} exerciseMuscles - array vindo de exercise_muscles,
   *   cada item com { role, muscles: { name_pt } }
   */
  async renderizar(container, exerciseMuscles) {
    if (!exerciseMuscles?.length) {
      container.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:24px">Nenhum músculo cadastrado.</p>';
      return;
    }

    // Descobre a vista pelo músculo PRIMÁRIO (é o que mais importa mostrar)
    const primario = exerciseMuscles.find(em => em.role === 'primary');
    const nomePrimario = primario?.muscles?.name_pt;
    const infoVista = MAPA_MUSCULOS[nomePrimario];
    const vista = infoVista?.vista || 'frente';

    const svgTexto = await carregarSvg(vista);
    container.innerHTML = svgTexto;
    const svgEl = container.querySelector('svg');
    if (svgEl) {
      svgEl.style.width = '100%';
      svgEl.style.height = 'auto';
      svgEl.style.display = 'block';
    }

    // Pinta cada músculo do exercício que existir nessa vista.
    // Músculos secundários que só existem na OUTRA vista (ex: exercício
    // de peito com tríceps secundário) não aparecem — limitação aceita
    // por ora, dá pra evoluir pra "duas vistas lado a lado" depois.
    exerciseMuscles.forEach(em => {
      const nome = em.muscles?.name_pt;
      const info = MAPA_MUSCULOS[nome];
      if (!info || info.vista !== vista) return;

      const path = container.querySelector(`#m-${info.slug}`);
      if (!path) return;
      const cor = CORES[em.role] || CORES.secondary;
      path.setAttribute('fill', cor);
      path.setAttribute('fill-opacity', '0.85');
    });
  }
};
