import {
  autotileIndex,
  autotileShape,
  FIRST_REGULAR_TILE,
  tileKind,
  TILESET_COLUMNS,
} from "@prism/scene-format";

/**
 * De um tile id para o recorte dentro de uma imagem.
 *
 * Confirmado contra os arquivos reais: o tileset "Outside" e 256 por 16064
 * pixels, ou seja 8 colunas de 32 pixels por 502 linhas, dando 4016 tiles
 * normais. Somados aos 384 ids reservados para autotile, dao exatamente as
 * 4400 entradas da tabela `passages` desse tileset.
 */

export const TILE_PIXELS = 32;
export const QUARTER_PIXELS = TILE_PIXELS / 2;

/** O molde de autotile tem 6 colunas e 8 linhas de quartos de 16 pixels. */
export const AUTOTILE_COLUMNS = 6;
export const AUTOTILE_TEMPLATE_WIDTH = AUTOTILE_COLUMNS * QUARTER_PIXELS; // 96
export const AUTOTILE_TEMPLATE_HEIGHT = 8 * QUARTER_PIXELS; // 128

/**
 * Como cada uma das 48 formas de autotile e montada.
 *
 * Copiado de `AUTOTILE_PATTERNS` em TileDrawingHelper, dentro do
 * Scripts.rxdata do Essentials v21.1. Cada forma lista quatro quartos, na
 * ordem noroeste, nordeste, sudoeste, sudeste, numerados de 1 a 48 varrendo o
 * molde da esquerda para a direita e de cima para baixo.
 *
 * Isto nao foi deduzido olhando a imagem. A primeira tentativa foi um chute de
 * que a forma cheia estaria no centro do molde, e o resultado foi agua com
 * risco vermelho no meio do lago. A forma cheia e a 0, que usa os quartos 27,
 * 28, 33 e 34, ou seja o bloco em (32, 64).
 */
export const AUTOTILE_PATTERNS: readonly (readonly [number, number, number, number])[] = [
  [27, 28, 33, 34], [5, 28, 33, 34], [27, 6, 33, 34], [5, 6, 33, 34],
  [27, 28, 33, 12], [5, 28, 33, 12], [27, 6, 33, 12], [5, 6, 33, 12],
  [27, 28, 11, 34], [5, 28, 11, 34], [27, 6, 11, 34], [5, 6, 11, 34],
  [27, 28, 11, 12], [5, 28, 11, 12], [27, 6, 11, 12], [5, 6, 11, 12],
  [25, 26, 31, 32], [25, 6, 31, 32], [25, 26, 31, 12], [25, 6, 31, 12],
  [15, 16, 21, 22], [15, 16, 21, 12], [15, 16, 11, 22], [15, 16, 11, 12],
  [29, 30, 35, 36], [29, 30, 11, 36], [5, 30, 35, 36], [5, 30, 11, 36],
  [39, 40, 45, 46], [5, 40, 45, 46], [39, 6, 45, 46], [5, 6, 45, 46],
  [25, 30, 31, 36], [15, 16, 45, 46], [13, 14, 19, 20], [13, 14, 19, 12],
  [17, 18, 23, 24], [17, 18, 11, 24], [41, 42, 47, 48], [5, 42, 47, 48],
  [37, 38, 43, 44], [37, 6, 43, 44], [13, 18, 19, 24], [13, 14, 43, 44],
  [37, 42, 43, 48], [17, 18, 47, 48], [13, 18, 43, 48], [1, 2, 7, 8],
];

export interface Rect {
  x: number;
  y: number;
}

/** Posicao de um quarto do molde, a partir do numero de 1 a 48. */
export function quarterRect(quarter: number): Rect {
  const index = quarter - 1;
  return {
    x: (index % AUTOTILE_COLUMNS) * QUARTER_PIXELS,
    y: Math.floor(index / AUTOTILE_COLUMNS) * QUARTER_PIXELS,
  };
}

/**
 * Os quatro quartos de uma forma de autotile.
 *
 * A forma ja vem gravada no proprio tile id pelo RPG Maker, entao nao e
 * preciso olhar as celulas vizinhas: basta `tileId % 48`. O Essentials so
 * recalcula vizinhanca em mapa gerado na hora, como masmorra aleatoria.
 */
export function autotileQuarters(shape: number): [Rect, Rect, Rect, Rect] | null {
  const pattern = AUTOTILE_PATTERNS[shape];
  if (pattern === undefined) return null;
  return [
    quarterRect(pattern[0]),
    quarterRect(pattern[1]),
    quarterRect(pattern[2]),
    quarterRect(pattern[3]),
  ];
}

export type TileSource =
  | { kind: "tileset"; x: number; y: number }
  | { kind: "autotile"; autotile: number; shape: number };

export function tileSource(tileId: number): TileSource | null {
  const kind = tileKind(tileId);
  if (kind === "empty") return null;

  if (kind === "autotile") {
    const index = autotileIndex(tileId);
    const shape = autotileShape(tileId);
    if (index === null || shape === null) return null;
    return { kind: "autotile", autotile: index, shape };
  }

  const offset = tileId - FIRST_REGULAR_TILE;
  return {
    kind: "tileset",
    x: (offset % TILESET_COLUMNS) * TILE_PIXELS,
    y: Math.floor(offset / TILESET_COLUMNS) * TILE_PIXELS,
  };
}

/** Chave da imagem de onde o tile sai. */
export function imageKey(source: TileSource): string {
  return source.kind === "tileset" ? "tileset" : `autotile:${source.autotile}`;
}
