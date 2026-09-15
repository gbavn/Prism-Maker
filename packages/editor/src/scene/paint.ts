import { AUTOTILE_SHAPES, FIRST_REGULAR_TILE, MAP_LAYERS, tileKind } from "@prism/scene-format";

/**
 * Pintura de tile na grade do mapa.
 *
 * Puro e sem React, pelo mesmo motivo do resto: e a regra que decide o que vai
 * parar dentro do .rxdata, e escrever errado ali estraga o projeto de alguem.
 */

export interface Grid {
  width: number;
  height: number;
}

/**
 * Vizinhanca de uma celula, no formato que o Essentials usa.
 *
 * Um bit por vizinho, no sentido horario a partir do norte. Copiado de
 * `tableNeighbors` em TileDrawingHelper, dentro do Scripts.rxdata.
 */
const NEIGHBOUR_BITS: readonly [number, number, number][] = [
  [0x01, 0, -1],
  [0x02, 1, -1],
  [0x04, 1, 0],
  [0x08, 1, 1],
  [0x10, 0, 1],
  [0x20, -1, 1],
  [0x40, -1, 0],
  [0x80, -1, -1],
];

/**
 * De uma vizinhanca para a forma do autotile.
 *
 * Copiado de `NEIGHBORS_TO_AUTOTILE_INDEX` em TileDrawingHelper. Sao 256
 * entradas, uma por combinacao possivel dos oito vizinhos.
 */
export const NEIGHBOURS_TO_SHAPE: readonly number[] = [
  46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40,
  42, 32, 42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34, 17, 34, 16,
  46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40,
  42, 32, 42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34, 17, 34, 16,
  45, 39, 45, 39, 33, 31, 33, 29, 45, 39, 45, 39, 33, 31, 33, 29,
  37, 27, 37, 27, 23, 15, 23, 13, 37, 27, 37, 27, 22, 11, 22, 9,
  45, 39, 45, 39, 33, 31, 33, 29, 45, 39, 45, 39, 33, 31, 33, 29,
  36, 26, 36, 26, 21, 7, 21, 5, 36, 26, 36, 26, 20, 3, 20, 1,
  46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40,
  42, 32, 42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34, 17, 34, 16,
  46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40,
  42, 32, 42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34, 17, 34, 16,
  45, 38, 45, 38, 33, 30, 33, 28, 45, 38, 45, 38, 33, 30, 33, 28,
  37, 25, 37, 25, 23, 14, 23, 12, 37, 25, 37, 25, 22, 10, 22, 8,
  45, 38, 45, 38, 33, 30, 33, 28, 45, 38, 45, 38, 33, 30, 33, 28,
  36, 24, 36, 24, 21, 6, 21, 4, 36, 24, 36, 24, 20, 2, 20, 0,
];

/** Indice de uma celula na Table do XP: x varia primeiro, depois y, depois z. */
export function index(grid: Grid, x: number, y: number, layer: number): number {
  return x + y * grid.width + layer * grid.width * grid.height;
}

/** A familia de autotile de um tile id, ou null se nao for autotile. */
export function autotileFamily(tileId: number): number | null {
  return tileKind(tileId) === "autotile"
    ? Math.floor(tileId / AUTOTILE_SHAPES)
    : null;
}

/**
 * Recalcula a forma de uma celula de autotile a partir dos vizinhos.
 *
 * A comparacao e por familia de autotile, nao por tile id exato. O Essentials
 * compara o id inteiro porque ali as celulas ja foram gravadas com a forma
 * certa; na hora de pintar, duas celulas do mesmo autotile tem ids diferentes
 * justamente porque tem formas diferentes, e comparar o id inteiro faria cada
 * celula se achar sozinha.
 *
 * Fora do mapa conta como igual, que e o que evita borda desenhada no limite
 * do mapa. E o mesmo que o RPG Maker faz.
 */
function shapeFor(
  tiles: Uint16Array,
  grid: Grid,
  x: number,
  y: number,
  layer: number,
): number | null {
  const family = autotileFamily(tiles[index(grid, x, y, layer)] ?? 0);
  if (family === null) return null;

  let neighbours = 0;
  for (const [bit, dx, dy] of NEIGHBOUR_BITS) {
    const nx = x + dx;
    const ny = y + dy;
    const outside = nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height;
    const value = outside
      ? null
      : autotileFamily(tiles[index(grid, nx, ny, layer)] ?? 0);

    if (outside || value === family) neighbours |= bit;
  }

  return NEIGHBOURS_TO_SHAPE[neighbours] ?? 0;
}

/** Aplica a forma recalculada, se a celula for autotile. */
function refresh(
  tiles: Uint16Array,
  grid: Grid,
  x: number,
  y: number,
  layer: number,
): void {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return;

  const at = index(grid, x, y, layer);
  const current = tiles[at] ?? 0;
  const family = autotileFamily(current);
  if (family === null) return;

  const shape = shapeFor(tiles, grid, x, y, layer);
  if (shape !== null) tiles[at] = family * AUTOTILE_SHAPES + shape;
}

export interface PaintOptions {
  x: number;
  y: number;
  layer: number;
  /** Tile a escrever. Zero apaga a celula naquela camada. */
  tileId: number;
  /** Lado do pincel em celulas. */
  size?: number;
}

export interface PaintResult {
  tiles: Uint16Array;
  changed: number;
}

/**
 * Pinta e devolve uma grade nova.
 *
 * Nao altera a original de proposito: o desfazer guarda as versoes anteriores,
 * e mutar no lugar faria o historico apontar todo para a mesma grade.
 *
 * Depois de escrever, as celulas pintadas e os vizinhos delas tem a forma de
 * autotile recalculada. Sem isso, pintar agua daria um tabuleiro de blocos
 * soltos em vez de um lago com borda.
 */
export function paint(
  tiles: Readonly<Uint16Array>,
  grid: Grid,
  options: PaintOptions,
): PaintResult {
  const expected = grid.width * grid.height * MAP_LAYERS;
  if (tiles.length !== expected) {
    throw new Error(
      `a grade tem ${tiles.length} celulas, mas o mapa e ` +
        `${grid.width}x${grid.height} em ${MAP_LAYERS} camadas`,
    );
  }
  if (options.layer < 0 || options.layer >= MAP_LAYERS) {
    throw new Error(`camada ${options.layer} nao existe`);
  }

  const next = new Uint16Array(tiles);
  const reach = Math.floor(Math.max(1, options.size ?? 1) / 2);
  const touched: [number, number][] = [];
  let changed = 0;

  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const x = options.x + dx;
      const y = options.y + dy;
      if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) continue;

      const at = index(grid, x, y, options.layer);
      if (next[at] !== options.tileId) {
        next[at] = options.tileId;
        changed += 1;
      }
      touched.push([x, y]);
    }
  }

  if (changed === 0) return { tiles: next, changed: 0 };

  // As celulas pintadas e o anel em volta delas: quem estava na borda do lago
  // deixa de estar quando o lago cresce.
  const seen = new Set<number>();
  for (const [x, y] of touched) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const key = (y + dy) * grid.width + (x + dx);
        if (seen.has(key)) continue;
        seen.add(key);
        refresh(next, grid, x + dx, y + dy, options.layer);
      }
    }
  }

  return { tiles: next, changed };
}

/** Tile id que a paleta produz ao escolher um autotile. */
export function autotileTileId(autotile: number): number {
  return (autotile + 1) * AUTOTILE_SHAPES;
}

/** Tile id a partir da posicao no bitmap do tileset. */
export function tilesetTileId(column: number, row: number): number {
  return FIRST_REGULAR_TILE + row * 8 + column;
}
