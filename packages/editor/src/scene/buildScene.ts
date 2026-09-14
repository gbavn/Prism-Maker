import type { RPGMap, RPGTileset } from "@prism/rxdata-parser";
import {
  decodeElevation,
  resolveTileRender,
  type Elevation,
  type Project,
  type TileRender,
  type TilesetMapping,
} from "@prism/scene-format";

/**
 * Traducao de um mapa do RPG Maker para instancias 3D.
 *
 * Esta funcao e deliberadamente pura e sem Babylon: recebe o mapa lido do
 * .rxdata mais o contrato do scene-format, devolve uma lista de caixas e
 * billboards. Assim o coracao do editor tem teste automatizado de verdade,
 * em vez de depender de alguem abrir a janela e olhar.
 *
 * E e tambem o que o runtime em C++ vai precisar reimplementar identico. Ter
 * isso isolado torna a divergencia entre editor e runtime uma coisa que da
 * para comparar, em vez de uma suspeita.
 */

/** Uma caixa no mundo. Posicao e o centro da base, em unidades de mundo. */
export interface SceneBox {
  x: number;
  z: number;
  /** Altura da base, ja multiplicada pelo passo de elevacao. */
  base: number;
  height: number;
  kind: TileRender["kind"];
  /** Cor placeholder, ate existirem modelos de verdade. */
  color: [number, number, number];
}

/** Um evento posicionado no mundo, desenhado como billboard. */
export interface SceneBillboard {
  id: number;
  name: string;
  x: number;
  z: number;
  base: number;
  height: number;
}

export interface BuiltScene {
  width: number;
  height: number;
  boxes: SceneBox[];
  billboards: SceneBillboard[];
  /** Centro do mapa, para a camera mirar. */
  center: { x: number; z: number };
}

/**
 * Cores placeholder por tipo de geometria.
 *
 * O ARCHITECTURE.md e explicito: um cubo colorido aparecendo numa cena
 * navegavel vale mais, no inicio, do que arte perfeita. Estas cores existem
 * para serem substituidas por modelos glTF.
 */
export const PLACEHOLDER_COLORS: Record<TileRender["kind"], [number, number, number]> = {
  ground: [0.44, 0.64, 0.36],
  block: [0.58, 0.55, 0.51],
  model: [0.32, 0.52, 0.76],
  hidden: [0, 0, 0],
};

/**
 * Escolhe o tile que representa a celula.
 *
 * O Essentials varre as camadas de cima para baixo, `[2, 1, 0]`, e para no
 * primeiro tile preenchido. O editor faz igual, senao a celula apareceria com
 * o chao por cima do telhado.
 */
function topmostTile(map: RPGMap, x: number, y: number): number {
  for (const layer of [2, 1, 0]) {
    const tileId = map.data.at(x, y, layer);
    if (tileId !== 0) return tileId;
  }
  return 0;
}

function emptyMapping(): TilesetMapping {
  return {
    derive: {
      passable: { kind: "ground" },
      impassable: { kind: "block", height: 1 },
      overhead: { kind: "block", height: 2 },
    },
    autotiles: {},
    tiles: {},
  };
}

export interface BuildSceneInput {
  map: RPGMap;
  tileset: RPGTileset;
  project: Project;
  /** Elevacao do .scene.json. Ausente significa mapa plano. */
  elevation?: Elevation;
}

export function buildScene(input: BuildSceneInput): BuiltScene {
  const { map, tileset, project } = input;
  const { tileSize, elevationStep } = project.units;
  const mapping = project.tilesets[String(map.tilesetId)] ?? emptyMapping();

  const heights = input.elevation
    ? decodeElevation(input.elevation)
    : new Array<number>(map.width * map.height).fill(0);

  if (heights.length !== map.width * map.height) {
    throw new Error(
      `a elevacao tem ${heights.length} celulas, mas o mapa e ` +
        `${map.width}x${map.height}`,
    );
  }

  const boxes: SceneBox[] = [];
  /** Altura do topo da geometria de cada celula, para assentar os eventos. */
  const surface = new Float64Array(map.width * map.height);

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tileId = topmostTile(map, x, y);
      if (tileId === 0) continue;

      const render = resolveTileRender(mapping, tileId, {
        passage: tileset.passages.data[tileId] ?? 0,
        priority: tileset.priorities.data[tileId] ?? 0,
      });
      if (render === null || render.kind === "hidden") continue;

      const index = y * map.width + x;
      const step = heights[index] ?? 0;
      // Um plano de chao ainda precisa de espessura para aparecer em 3D; meio
      // degrau da relevo visivel sem falsear a altura da celula.
      const height =
        render.kind === "block" ? render.height * elevationStep : elevationStep / 2;

      const base = step * elevationStep;
      surface[index] = base + height;

      boxes.push({
        x: x * tileSize,
        z: y * tileSize,
        base,
        height,
        kind: render.kind,
        color: PLACEHOLDER_COLORS[render.kind],
      });
    }
  }

  const billboards: SceneBillboard[] = [];
  for (const event of map.events.values()) {
    const index = event.y * map.width + event.x;
    // O evento fica em cima da geometria da celula, nao no nivel do terreno.
    // Usar so a elevacao deixaria o personagem afundado dentro do bloco.
    const step = heights[index] ?? 0;
    const top = surface[index] ?? step * elevationStep;

    billboards.push({
      id: event.id,
      name: event.name,
      x: event.x * tileSize,
      z: event.y * tileSize,
      base: top,
      // Altura de um personagem do Essentials: dois tiles de 32 pixels.
      height: tileSize * 1.5,
    });
  }

  return {
    width: map.width,
    height: map.height,
    boxes,
    billboards,
    center: {
      x: ((map.width - 1) * tileSize) / 2,
      z: ((map.height - 1) * tileSize) / 2,
    },
  };
}
