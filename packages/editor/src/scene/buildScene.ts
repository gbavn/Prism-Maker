import type { RPGMap, RPGTileset } from "@prism/rxdata-parser";
import { MAP_LAYERS, tileKind, type Project } from "@prism/scene-format";

/**
 * Traducao de um mapa do RPG Maker para o que a viewport desenha.
 *
 * A abordagem mudou depois de ver um editor de referencia em uso: em vez de
 * derivar geometria a partir da tabela de passagem, a viewport desenha os
 * proprios tiles do tileset em perspectiva, e o relevo vem da elevacao por
 * celula. O resultado parece um mapa de Pokemon em vez de uma visualizacao de
 * depuracao, e usa menos regra inventada.
 *
 * A funcao segue pura e sem motor 3D, pelo mesmo motivo de antes: e o que o
 * runtime em C++ vai precisar reimplementar identico, e o que permite testar
 * sem abrir janela.
 */

/** Um tile desenhado no mundo, ja com a altura resolvida. */
export interface TileQuad {
  cellX: number;
  cellY: number;
  /** Camada do RPG Maker, de 0 a 2. */
  layer: number;
  tileId: number;
  /** Altura do quad em unidades de mundo. */
  y: number;
}

/**
 * Um objeto 3D colocado no mapa, ja assado em imagem pelo editor.
 *
 * Mora dentro do .rxdata, numa ivar propria. A area no chao esta em celulas;
 * a imagem pode ser mais alta que isso, e a parte que sobra fica por cima das
 * celulas ao norte, como acontece com qualquer construcao alta num mapa.
 */
export interface PlacedObject {
  /** Arquivo em Graphics/Objects, sem extensao. */
  name: string;
  /** Celula do canto noroeste da area no chao. */
  x: number;
  y: number;
  width: number;
  depth: number;
}

/** Um objeto ja posicionado no mundo, pronto para desenhar. */
export interface SceneObject extends PlacedObject {
  /** Centro da area no chao, em unidades de mundo. */
  centreX: number;
  /** Borda sul da area no chao, onde a imagem se apoia. */
  footZ: number;
  base: number;
}

/**
 * Um evento posicionado no mundo.
 *
 * O tamanho do sprite nao vem daqui: o frame de um charset e a imagem dividida
 * por quatro em cada eixo, e so quem ja carregou a imagem sabe o tamanho dela.
 * Aqui fica o que o .rxdata diz, e a viewport calcula o resto.
 */
export interface SceneBillboard {
  id: number;
  name: string;
  /** Celula do evento, que e por onde a selecao o encontra. */
  cellX: number;
  cellY: number;
  x: number;
  z: number;
  base: number;
  /** Nome do charset, vazio quando o evento nao tem grafico de personagem. */
  characterName: string;
  /** Direcao da pagina: 2 baixo, 4 esquerda, 6 direita, 8 cima. */
  direction: number;
  /** Coluna do frame dentro do charset. */
  pattern: number;
  /** Tile do tileset usado como grafico, ou zero quando e charset. */
  tileId: number;
  /** Opacidade da pagina, de 0 a 255. */
  opacity: number;
}

/**
 * Parede lateral de um degrau.
 *
 * Um tile e um plano sem espessura. Quando uma celula sobe, o plano sobe junto
 * e deixa o lugar dele vazio, o que aparece como um buraco preto no mapa. A
 * saia fecha esse vao entre a celula e o vizinho mais baixo.
 *
 * A textura e a do proprio tile da celula, esticada na vertical. Nao e o que
 * um penhasco de verdade deveria mostrar, mas le como parede e nao inventa
 * arte que nao existe. Tile de penhasco proprio vem junto com o mapeamento
 * para modelos.
 */
export interface SkirtQuad {
  cellX: number;
  cellY: number;
  side: "north" | "south" | "east" | "west";
  tileId: number;
  /** Alturas em unidades de mundo, com top sempre acima de bottom. */
  top: number;
  bottom: number;
}

export interface BuiltScene {
  width: number;
  height: number;
  tileSize: number;
  elevationStep: number;
  quads: TileQuad[];
  skirts: SkirtQuad[];
  billboards: SceneBillboard[];
  objects: SceneObject[];
  /** Altura do topo de cada celula, para o destaque e para assentar eventos. */
  surface: number[];
  center: { x: number; z: number };
}

/**
 * Separacao vertical entre camadas.
 *
 * As tres camadas do XP ocupam a mesma celula. Sem um deslocamento minimo elas
 * disputam o mesmo plano e o resultado cintila conforme a camera se move. O
 * valor e pequeno o bastante para nao ler como degrau.
 */
export const LAYER_GAP = 0.004;

export interface BuildSceneInput {
  map: RPGMap;
  tileset: RPGTileset;
  project: Project;
  /** Objetos colocados pelo editor. Ausente significa mapa sem nenhum. */
  objects?: readonly PlacedObject[];
  /** Altura de cada celula em degraus. Ausente significa mapa plano. */
  heights?: readonly number[];
}

export function buildScene(input: BuildSceneInput): BuiltScene {
  const { map, project } = input;
  const { tileSize, elevationStep } = project.units;

  const heights =
    input.heights ?? new Array<number>(map.width * map.height).fill(0);

  if (heights.length !== map.width * map.height) {
    throw new Error(
      `a elevacao tem ${heights.length} celulas, mas o mapa e ` +
        `${map.width}x${map.height}`,
    );
  }

  const quads: TileQuad[] = [];
  const surface = new Array<number>(map.width * map.height).fill(0);

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      const base = (heights[index] ?? 0) * elevationStep;
      surface[index] = base;

      for (let layer = 0; layer < MAP_LAYERS; layer += 1) {
        const tileId = map.data.at(x, y, layer);
        if (tileKind(tileId) === "empty") continue;

        quads.push({
          cellX: x,
          cellY: y,
          layer,
          tileId,
          y: base + layer * LAYER_GAP,
        });
      }
    }
  }

  // Saias: comparadas com os quatro vizinhos, so onde esta celula e mais alta.
  const skirts: SkirtQuad[] = [];
  const neighbours: [SkirtQuad["side"], number, number][] = [
    ["north", 0, -1],
    ["south", 0, 1],
    ["west", -1, 0],
    ["east", 1, 0],
  ];

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      const top = surface[index] ?? 0;
      const tileId = map.data.at(x, y, 0);
      if (tileKind(tileId) === "empty") continue;

      for (const [side, dx, dy] of neighbours) {
        const nx = x + dx;
        const ny = y + dy;
        // Fora do mapa conta como altura zero, entao a borda so ganha parede
        // quando o mapa foi de fato levantado ali.
        const bottom =
          nx < 0 || ny < 0 || nx >= map.width || ny >= map.height
            ? 0
            : (surface[ny * map.width + nx] ?? 0);

        if (top > bottom) {
          skirts.push({ cellX: x, cellY: y, side, tileId, top, bottom });
        }
      }
    }
  }

  const billboards: SceneBillboard[] = [];
  for (const event of map.events.values()) {
    const index = event.y * map.width + event.x;
    const page = event.pages[0];

    billboards.push({
      id: event.id,
      name: event.name,
      cellX: event.x,
      cellY: event.y,
      x: event.x * tileSize,
      z: event.y * tileSize,
      base: surface[index] ?? 0,
      characterName: page?.graphic.characterName ?? "",
      // Sem pagina, o evento nao desenha nada, mas continua existindo e
      // precisa aparecer para quem edita. A viewport marca esse caso.
      direction: page?.graphic.direction ?? 2,
      pattern: page?.graphic.pattern ?? 0,
      tileId: page?.graphic.tileId ?? 0,
      opacity: page?.graphic.opacity ?? 255,
    });
  }

  const objects: SceneObject[] = (input.objects ?? []).map((object) => {
    // Apoiado no ponto mais alto da propria area: um objeto meio em cima de um
    // degrau precisa subir junto, senao ele afunda na quina.
    let base = 0;
    for (let dy = 0; dy < object.depth; dy += 1) {
      for (let dx = 0; dx < object.width; dx += 1) {
        const x = object.x + dx;
        const y = object.y + dy;
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        base = Math.max(base, surface[y * map.width + x] ?? 0);
      }
    }

    return {
      ...object,
      centreX: (object.x + (object.width - 1) / 2) * tileSize,
      footZ: (object.y + object.depth - 1) * tileSize + tileSize / 2,
      base,
    };
  });

  return {
    width: map.width,
    height: map.height,
    tileSize,
    elevationStep,
    quads,
    skirts,
    billboards,
    objects,
    surface,
    center: {
      x: ((map.width - 1) * tileSize) / 2,
      z: ((map.height - 1) * tileSize) / 2,
    },
  };
}
