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

/**
 * Recalcula a forma das celulas tocadas e do anel em volta delas.
 *
 * O anel importa: quem estava na borda do lago deixa de estar quando o lago
 * cresce, e quem estava no meio vira borda quando o lago encolhe.
 */
function refreshAround(
  tiles: Uint16Array,
  grid: Grid,
  layer: number,
  touched: Iterable<readonly [number, number]>,
): void {
  const seen = new Set<number>();
  for (const [x, y] of touched) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const key = (y + dy) * grid.width + (x + dx);
        if (seen.has(key)) continue;
        seen.add(key);
        refresh(tiles, grid, x + dx, y + dy, layer);
      }
    }
  }
}

/** Recusa grade e camada que nao batem com o mapa, antes de escrever nada. */
function assertGrid(tiles: Readonly<Uint16Array>, grid: Grid, layer: number): void {
  const expected = grid.width * grid.height * MAP_LAYERS;
  if (tiles.length !== expected) {
    throw new Error(
      `a grade tem ${tiles.length} celulas, mas o mapa e ` +
        `${grid.width}x${grid.height} em ${MAP_LAYERS} camadas`,
    );
  }
  if (layer < 0 || layer >= MAP_LAYERS) {
    throw new Error(`camada ${layer} nao existe`);
  }
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
  assertGrid(tiles, grid, options.layer);

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

  refreshAround(next, grid, options.layer, touched);
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

/**
 * Um bloco de tiles escolhido na paleta.
 *
 * Um tile so e um carimbo 1x1. Escolher um bloco na paleta guarda a forma
 * inteira, para que pintar repita o bloco em vez de repetir o canto dele.
 */
export interface Stamp {
  width: number;
  height: number;
  /** Ids linha a linha, comecando pelo canto superior esquerdo. */
  tiles: readonly number[];
}

/** O carimbo de um tile so. */
export function singleStamp(tileId: number): Stamp {
  return { width: 1, height: 1, tiles: [tileId] };
}

/** O id que o carimbo produz na celula (x, y), ancorado em (originX, originY). */
function stampTile(
  stamp: Stamp,
  originX: number,
  originY: number,
  x: number,
  y: number,
): number {
  const column = ((x - originX) % stamp.width + stamp.width) % stamp.width;
  const row = ((y - originY) % stamp.height + stamp.height) % stamp.height;
  return stamp.tiles[row * stamp.width + column] ?? 0;
}

export interface StampOptions {
  x: number;
  y: number;
  layer: number;
  stamp: Stamp;
  /** Lado do pincel, so usado quando o carimbo e 1x1. */
  size?: number;
}

/**
 * Carimba na grade e devolve uma grade nova.
 *
 * Com carimbo de um tile so, o pincel vale e a celula clicada fica no centro,
 * que e o que a mao espera de um lapis. Com um bloco, o bloco manda: ele cai
 * com o canto superior esquerdo na celula clicada, como no RPG Maker.
 */
export function stampAt(
  tiles: Readonly<Uint16Array>,
  grid: Grid,
  options: StampOptions,
): PaintResult {
  assertGrid(tiles, grid, options.layer);

  const { stamp } = options;
  const single = stamp.width === 1 && stamp.height === 1;
  const reach = single ? Math.floor(Math.max(1, options.size ?? 1) / 2) : 0;

  const left = options.x - reach;
  const top = options.y - reach;
  const right = single ? options.x + reach : options.x + stamp.width - 1;
  const bottom = single ? options.y + reach : options.y + stamp.height - 1;

  return write(tiles, grid, options.layer, left, top, right, bottom, (x, y) =>
    stampTile(stamp, left, top, x, y),
  );
}

export interface RectOptions {
  layer: number;
  stamp: Stamp;
  /** Um canto do retangulo. */
  from: { x: number; y: number };
  /** O canto oposto. Qualquer ordem serve. */
  to: { x: number; y: number };
}

/**
 * Preenche um retangulo repetindo o carimbo.
 *
 * Repetir, e nao esticar: esticar um bloco de grama em cima de um terreno
 * grande daria faixas do mesmo pixel, enquanto repetir devolve o padrao que a
 * pessoa escolheu na paleta.
 */
export function fillRect(
  tiles: Readonly<Uint16Array>,
  grid: Grid,
  options: RectOptions,
): PaintResult {
  assertGrid(tiles, grid, options.layer);

  const left = Math.min(options.from.x, options.to.x);
  const right = Math.max(options.from.x, options.to.x);
  const top = Math.min(options.from.y, options.to.y);
  const bottom = Math.max(options.from.y, options.to.y);

  return write(tiles, grid, options.layer, left, top, right, bottom, (x, y) =>
    stampTile(options.stamp, left, top, x, y),
  );
}

export interface FillOptions {
  x: number;
  y: number;
  layer: number;
  stamp: Stamp;
}

/**
 * Balde: troca a regiao ligada que tem o mesmo tile da celula clicada.
 *
 * A comparacao e por familia de autotile, entao um lago inteiro conta como
 * uma regiao so, mesmo com cada celula guardando uma forma diferente.
 *
 * A varredura e iterativa. Recursao aqui estouraria a pilha num mapa grande,
 * e mapa grande e justamente onde o balde e usado.
 */
export function floodFill(
  tiles: Readonly<Uint16Array>,
  grid: Grid,
  options: FillOptions,
): PaintResult {
  assertGrid(tiles, grid, options.layer);
  if (
    options.x < 0 ||
    options.y < 0 ||
    options.x >= grid.width ||
    options.y >= grid.height
  ) {
    return { tiles: new Uint16Array(tiles), changed: 0 };
  }

  const at = (x: number, y: number) => tiles[index(grid, x, y, options.layer)] ?? 0;

  const origin = at(options.x, options.y);
  const originFamily = autotileFamily(origin);
  const matches = (x: number, y: number): boolean => {
    const value = at(x, y);
    return originFamily === null
      ? value === origin
      : autotileFamily(value) === originFamily;
  };

  const region = new Set<number>();
  const stack: [number, number][] = [[options.x, options.y]];
  while (stack.length > 0) {
    const [x, y] = stack.pop() as [number, number];
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) continue;

    const key = y * grid.width + x;
    if (region.has(key) || !matches(x, y)) continue;
    region.add(key);

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  // O carimbo se ancora na origem do mapa, nao na celula clicada: assim o
  // padrao fica continuo mesmo que a pessoa clique em outro ponto da regiao.
  const next = new Uint16Array(tiles);
  const touched: [number, number][] = [];
  let changed = 0;

  for (const key of region) {
    const x = key % grid.width;
    const y = Math.floor(key / grid.width);
    const cell = index(grid, x, y, options.layer);
    const tileId = stampTile(options.stamp, 0, 0, x, y);
    if (next[cell] !== tileId) {
      next[cell] = tileId;
      changed += 1;
    }
    touched.push([x, y]);
  }

  if (changed === 0) return { tiles: next, changed: 0 };

  refreshAround(next, grid, options.layer, touched);
  return { tiles: next, changed };
}

/** Escreve um retangulo de celulas e recalcula os autotiles em volta. */
function write(
  tiles: Readonly<Uint16Array>,
  grid: Grid,
  layer: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  tileOf: (x: number, y: number) => number,
): PaintResult {
  const next = new Uint16Array(tiles);
  const touched: [number, number][] = [];
  let changed = 0;

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) continue;

      const cell = index(grid, x, y, layer);
      const tileId = tileOf(x, y);
      if (next[cell] !== tileId) {
        next[cell] = tileId;
        changed += 1;
      }
      touched.push([x, y]);
    }
  }

  if (changed === 0) return { tiles: next, changed: 0 };

  refreshAround(next, grid, layer, touched);
  return { tiles: next, changed };
}
