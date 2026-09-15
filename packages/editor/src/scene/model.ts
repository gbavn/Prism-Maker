import { TILE_PIXELS } from "./tileAtlas.js";

/**
 * Modelos 3D simples, descritos em caixas.
 *
 * Descricao pura, sem Three: e ela que decide o tamanho do objeto em celulas,
 * e esse numero precisa bater dos dois lados, no editor e no jogo. Geometria
 * montada direto no renderizador nao daria para testar sem abrir janela.
 *
 * As medidas sao em celulas do mapa, nao em pixels. Uma celula do RPG Maker XP
 * tem 32 pixels, e pensar em celula e o que mantem o objeto encaixado na grade.
 */

export interface Box {
  /** Largura, altura e profundidade, em celulas. */
  size: [number, number, number];
  /** Centro da caixa, em celulas, com a origem no chao do canto sudoeste. */
  at: [number, number, number];
  color: number;
}

export interface Model {
  name: string;
  /** Area que o objeto ocupa no chao, em celulas. */
  footprint: { width: number; depth: number };
  boxes: Box[];
}

/**
 * Um food truck.
 *
 * Escolhido por ser o teste que o pessoal do Radiant fez: volume simples,
 * silhueta reconhecivel, e alto o bastante para provar que o objeto tapa o
 * que esta atras dele.
 */
export function foodTruck(): Model {
  const body = 0xe8543f;
  const cabin = 0xf2f2f2;
  const glass = 0x6ec6e8;
  const tyre = 0x2a2a2f;
  const awning = 0xf6c445;
  const counter = 0x8b5a2b;

  return {
    name: "foodtruck",
    footprint: { width: 3, depth: 2 },
    boxes: [
      // Caixa de carga, o volume principal.
      { size: [2, 1.5, 1.6], at: [1.1, 0.85, 1], color: body },
      // Cabine, mais baixa e a frente.
      { size: [0.85, 1.05, 1.5], at: [2.5, 0.6, 1], color: cabin },
      { size: [0.1, 0.5, 1.2], at: [2.9, 0.85, 1], color: glass },
      // Balcao de atendimento e o toldo por cima, virados para o sul, que e o
      // lado de onde a camera do jogo olha. Ambos
      // cabem dentro da area no chao: o que passasse dela cobriria celula que
      // o jogo considera livre.
      { size: [1.6, 0.12, 0.35], at: [1.1, 1.0, 1.75], color: counter },
      { size: [1.9, 0.1, 0.8], at: [1.1, 1.5, 1.55], color: awning },
      // Rodas.
      { size: [0.35, 0.35, 0.35], at: [0.55, 0.18, 0.3], color: tyre },
      { size: [0.35, 0.35, 0.35], at: [0.55, 0.18, 1.7], color: tyre },
      { size: [0.35, 0.35, 0.35], at: [2.5, 0.18, 0.3], color: tyre },
      { size: [0.35, 0.35, 0.35], at: [2.5, 0.18, 1.7], color: tyre },
    ],
  };
}

/** Todos os modelos que o editor sabe assar. */
export const MODELS: Record<string, () => Model> = {
  foodtruck: foodTruck,
};

/**
 * Caixa que envolve o modelo inteiro, em celulas.
 *
 * O render precisa dela para enquadrar sem cortar, e a altura e o que diz
 * quanto o objeto passa por cima da propria area no chao.
 */
export function bounds(model: Model): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const box of model.boxes) {
    for (let axis = 0; axis < 3; axis += 1) {
      const centre = box.at[axis] ?? 0;
      const half = (box.size[axis] ?? 0) / 2;
      min[axis] = Math.min(min[axis] ?? Infinity, centre - half);
      max[axis] = Math.max(max[axis] ?? -Infinity, centre + half);
    }
  }
  return { min, max };
}

/** Tamanho da imagem assada, em pixels, para o modelo caber inteiro. */
export function bakeSize(model: Model): { width: number; height: number } {
  const box = bounds(model);
  // Largura pela area no chao, altura pela soma da altura com a profundidade:
  // a camera olha inclinada, entao o fundo do objeto sobe na imagem.
  const width = Math.ceil(box.max[0] - box.min[0]) * TILE_PIXELS;
  const height =
    Math.ceil(box.max[1] - box.min[1] + (box.max[2] - box.min[2])) * TILE_PIXELS;
  return { width, height };
}
