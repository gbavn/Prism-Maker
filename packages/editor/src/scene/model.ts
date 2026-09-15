/**
 * Modelos 3D simples, descritos em caixas.
 *
 * Descricao pura, sem Three: e ela que decide quantas celulas o objeto ocupa,
 * e esse numero precisa bater dos dois lados, no editor e no jogo. Geometria
 * montada direto no renderizador nao daria para testar sem abrir janela.
 *
 * As medidas sao em celulas do mapa. Uma celula do RPG Maker XP tem 32 pixels,
 * e pensar em celula e o que mantem o objeto encaixado na grade.
 *
 * Eixos: x cresce para o leste, y para cima, z para o sul, que e o lado de
 * onde a camera do jogo olha.
 */

export interface Box {
  /** Largura, altura e profundidade, em celulas. */
  size: [number, number, number];
  /** Centro da caixa, em celulas, com a origem no chao do canto noroeste. */
  at: [number, number, number];
  color: number;
}

export interface Model {
  name: string;
  /**
   * Giro do objeto no proprio eixo, em graus.
   *
   * E isto que faz o objeto parecer tridimensional em vez de adesivo. Com o
   * objeto de frente, a camera do mapa so alcanca a face da frente e o topo, e
   * duas faces nao dao volume. Girado, aparece tambem a lateral, e o olho
   * fecha a forma sozinho.
   *
   * Girar o objeto, e nao a camera: a camera e a do mapa, e girar ela faria a
   * projecao do objeto discordar da projecao do chao desenhado pelos tiles.
   * Um caminhao estacionado de lado e natural; um chao de lado, nao.
   */
  yaw: number;
  boxes: Box[];
}

export interface Extent {
  min: [number, number, number];
  max: [number, number, number];
}

/** Os oito cantos de uma caixa, ja girados pelo yaw do modelo. */
export function boxCorners(box: Box, yaw: number, pivot: [number, number]): [number, number, number][] {
  const radians = (yaw * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners: [number, number, number][] = [];

  for (const sx of [-0.5, 0.5]) {
    for (const sy of [-0.5, 0.5]) {
      for (const sz of [-0.5, 0.5]) {
        const x = (box.at[0] ?? 0) + sx * (box.size[0] ?? 0);
        const y = (box.at[1] ?? 0) + sy * (box.size[1] ?? 0);
        const z = (box.at[2] ?? 0) + sz * (box.size[2] ?? 0);

        const dx = x - pivot[0];
        const dz = z - pivot[1];
        corners.push([
          pivot[0] + dx * cos - dz * sin,
          y,
          pivot[1] + dx * sin + dz * cos,
        ]);
      }
    }
  }
  return corners;
}

/** Caixa envolvente do modelo sem giro, usada como pivo do giro. */
export function rawBounds(model: Model): Extent {
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

/** O ponto em volta do qual o modelo gira: o centro da area no chao. */
export function pivot(model: Model): [number, number] {
  const box = rawBounds(model);
  return [
    ((box.min[0] ?? 0) + (box.max[0] ?? 0)) / 2,
    ((box.min[2] ?? 0) + (box.max[2] ?? 0)) / 2,
  ];
}

/** Caixa envolvente depois do giro, que e o que o mapa precisa reservar. */
export function bounds(model: Model): Extent {
  const centre = pivot(model);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const box of model.boxes) {
    for (const corner of boxCorners(box, model.yaw, centre)) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis] ?? Infinity, corner[axis] ?? 0);
        max[axis] = Math.max(max[axis] ?? -Infinity, corner[axis] ?? 0);
      }
    }
  }
  return { min, max };
}

/** Quantas celulas o objeto ocupa no chao, ja contando o giro. */
export function footprint(model: Model): { width: number; depth: number } {
  const box = bounds(model);
  // A folga tira o erro de arredondamento do seno e do cosseno: um objeto de
  // uma celula exata girado em 90 graus daria 1,0000000000000002, e o teto
  // disso reservaria uma celula a mais sem motivo nenhum.
  const cells = (span: number) => Math.max(1, Math.ceil(span - 1e-6));
  return {
    width: cells((box.max[0] ?? 0) - (box.min[0] ?? 0)),
    depth: cells((box.max[2] ?? 0) - (box.min[2] ?? 0)),
  };
}

/**
 * Um food truck.
 *
 * Escolhido por ser o teste que o pessoal do Radiant fez: volume simples,
 * silhueta reconhecivel, e alto o bastante para provar que o objeto tapa o
 * que esta atras dele.
 */
export function foodTruck(): Model {
  const body = 0xd94f3d;
  const bodyDark = 0xa8382a;
  const stripe = 0xf4f1e8;
  const cabin = 0xe9e6dd;
  const glass = 0x8fd3f0;
  const glassDark = 0x5fa9cc;
  const tyre = 0x23232a;
  const rim = 0xb9bcc4;
  const awning = 0xf2b632;
  const awningStripe = 0xe8e2d4;
  const counter = 0x8a5a33;
  const counterTop = 0xc99a63;
  const metal = 0x9aa0ab;
  const board = 0x3b3f46;
  const lamp = 0xfff2c4;

  return {
    name: "foodtruck",
    yaw: 24,
    boxes: [
      // Chassi e caixa de carga.
      { size: [2.05, 0.18, 1.5], at: [1.15, 0.28, 1.0], color: bodyDark },
      { size: [2.0, 1.25, 1.55], at: [1.15, 1.0, 1.0], color: body },
      // Faixa clara na lateral, na altura do balcao.
      { size: [2.02, 0.16, 1.57], at: [1.15, 1.32, 1.0], color: stripe },
      // Teto levemente saliente.
      { size: [2.1, 0.08, 1.62], at: [1.15, 1.66, 1.0], color: bodyDark },
      // Caixa de ventilacao no teto.
      { size: [0.5, 0.18, 0.45], at: [0.9, 1.78, 1.0], color: metal },

      // Cabine, capo e para-choque.
      { size: [0.8, 0.95, 1.45], at: [2.5, 0.85, 1.0], color: cabin },
      { size: [0.55, 0.32, 1.4], at: [2.85, 0.5, 1.0], color: cabin },
      { size: [0.16, 0.16, 1.45], at: [3.05, 0.32, 1.0], color: metal },
      // Farois.
      { size: [0.1, 0.12, 0.22], at: [3.08, 0.52, 0.45], color: lamp },
      { size: [0.1, 0.12, 0.22], at: [3.08, 0.52, 1.55], color: lamp },
      // Vidros: para-brisa e janela da porta.
      { size: [0.1, 0.42, 1.2], at: [2.86, 1.05, 1.0], color: glass },
      { size: [0.62, 0.36, 0.08], at: [2.5, 1.05, 1.73], color: glassDark },

      // Janela de atendimento, virada para o sul: balcao, tampo e toldo.
      { size: [1.5, 0.62, 0.1], at: [1.15, 1.12, 1.79], color: board },
      { size: [1.62, 0.12, 0.34], at: [1.15, 0.86, 1.92], color: counter },
      { size: [1.66, 0.06, 0.38], at: [1.15, 0.94, 1.94], color: counterTop },
      { size: [1.85, 0.08, 0.62], at: [1.15, 1.62, 2.02], color: awning },
      { size: [1.85, 0.06, 0.16], at: [1.15, 1.56, 2.28], color: awningStripe },
      { size: [0.07, 0.5, 0.07], at: [0.3, 1.35, 2.28], color: metal },
      { size: [0.07, 0.5, 0.07], at: [2.0, 1.35, 2.28], color: metal },
      // Placa do cardapio, encostada na lateral.
      { size: [0.5, 0.42, 0.06], at: [0.45, 1.05, 1.81], color: board },

      // Rodas, com aro.
      { size: [0.42, 0.42, 0.42], at: [0.55, 0.22, 0.28], color: tyre },
      { size: [0.44, 0.2, 0.2], at: [0.55, 0.22, 0.28], color: rim },
      { size: [0.42, 0.42, 0.42], at: [0.55, 0.22, 1.72], color: tyre },
      { size: [0.44, 0.2, 0.2], at: [0.55, 0.22, 1.72], color: rim },
      { size: [0.42, 0.42, 0.42], at: [2.45, 0.22, 0.28], color: tyre },
      { size: [0.44, 0.2, 0.2], at: [2.45, 0.22, 0.28], color: rim },
      { size: [0.42, 0.42, 0.42], at: [2.45, 0.22, 1.72], color: tyre },
      { size: [0.44, 0.2, 0.2], at: [2.45, 0.22, 1.72], color: rim },
    ],
  };
}

/** Todos os modelos que o editor sabe assar. */
export const MODELS: Record<string, () => Model> = {
  foodtruck: foodTruck,
};
