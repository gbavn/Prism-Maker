/**
 * Fatos do RPG Maker XP que o formato de cena precisa conhecer.
 *
 * Tudo aqui foi verificado contra os arquivos reais do Essentials v21.1 em
 * `Game/essentials-v21.1/Data/`, nao assumido a partir de documentacao.
 */

/** Um tile id 0 significa celula vazia naquela camada. */
export const TILE_EMPTY = 0;

/** Quantas formas cada autotile ocupa na numeracao de tile id. */
export const AUTOTILE_SHAPES = 48;

/** Quantos slots de autotile existem antes do primeiro tile normal. */
export const AUTOTILE_SLOTS = 8;

/** Primeiro tile id que aponta para o bitmap do tileset. */
export const FIRST_REGULAR_TILE = AUTOTILE_SHAPES * AUTOTILE_SLOTS; // 384

/** Colunas do bitmap de um tileset do XP. */
export const TILESET_COLUMNS = 8;

/** Um mapa do XP tem exatamente tres camadas de tiles. */
export const MAP_LAYERS = 3;

export type TileKind = "empty" | "autotile" | "regular";

export function tileKind(tileId: number): TileKind {
  if (tileId === TILE_EMPTY) return "empty";
  return tileId < FIRST_REGULAR_TILE ? "autotile" : "regular";
}

/**
 * Indice do autotile (0..6) para um tile id de autotile.
 *
 * O slot 0 da numeracao (ids 0..47) nao corresponde a nenhum autotile, por
 * isso o desconto de 1. O resultado indexa `RPG::Tileset#autotile_names`.
 * Retorna null para ids que nao sao de autotile.
 */
export function autotileIndex(tileId: number): number | null {
  if (tileKind(tileId) !== "autotile") return null;
  return Math.floor(tileId / AUTOTILE_SHAPES) - 1;
}

/** Forma do autotile (0..47), que decide como as bordas se conectam. */
export function autotileShape(tileId: number): number | null {
  if (tileKind(tileId) !== "autotile") return null;
  return tileId % AUTOTILE_SHAPES;
}

/** Posicao do tile no bitmap do tileset. Null se nao for tile normal. */
export function tileBitmapPosition(
  tileId: number,
): { column: number; row: number } | null {
  if (tileKind(tileId) !== "regular") return null;
  const offset = tileId - FIRST_REGULAR_TILE;
  return {
    column: offset % TILESET_COLUMNS,
    row: Math.floor(offset / TILESET_COLUMNS),
  };
}

/**
 * Bits da tabela `passages` do tileset.
 *
 * Verificado em `Game_Map.rb` do Essentials v21.1, extraido de
 * `Data/Scripts.rxdata`:
 *
 *   - `passable?`   usa `bit = (1 << ((d / 2) - 1)) & 0x0f` e recusa quando
 *                   `passage & bit != 0`, ou quando `passage & 0x0f == 0x0f`
 *   - `bush?`       testa `passage & 0x40 == 0x40`
 *   - `counter?`    testa `passage & 0x80 == 0x80`
 *
 * Nao existe bit de "estrela" aqui. O que decide se um tile e desenhado
 * acima do jogador e a tabela `priorities`, nao esta.
 */
export const PASSAGE = {
  BLOCKED_DOWN: 0x01,
  BLOCKED_LEFT: 0x02,
  BLOCKED_RIGHT: 0x04,
  BLOCKED_UP: 0x08,
  /** Mato alto: o personagem aparece pela metade. */
  BUSH: 0x40,
  /** Balcao: da para interagir por cima do tile. */
  COUNTER: 0x80,
} as const;

/** Mascara das quatro direcoes. */
export const PASSAGE_DIRECTIONS = 0x0f;

/** Direcoes no teclado numerico, como o RPG Maker usa. */
export type Direction = 2 | 4 | 6 | 8;

/** Bit de passagem de uma direcao, na mesma conta que o Essentials faz. */
export function directionBit(direction: Direction): number {
  return (1 << (direction / 2 - 1)) & PASSAGE_DIRECTIONS;
}

/** True quando as quatro direcoes estao bloqueadas. */
export function isImpassable(passage: number): boolean {
  return (passage & PASSAGE_DIRECTIONS) === PASSAGE_DIRECTIONS;
}

/** True quando entrar na celula por essa direcao e bloqueado. */
export function blocksDirection(passage: number, direction: Direction): boolean {
  return (passage & directionBit(direction)) !== 0;
}

export function isBush(passage: number): boolean {
  return (passage & PASSAGE.BUSH) === PASSAGE.BUSH;
}

export function isCounter(passage: number): boolean {
  return (passage & PASSAGE.COUNTER) === PASSAGE.COUNTER;
}

/**
 * Prioridade de desenho do tile, da tabela `priorities`.
 *
 * Zero significa nivel do chao. Acima de zero o tile e desenhado por cima do
 * personagem, o que na pratica marca geometria alta: copa de arvore, telhado,
 * beiral. Em 2.5D isso e um bom palpite inicial de altura.
 */
export function isOverhead(priority: number): boolean {
  return priority > 0;
}

/**
 * Indice de uma celula no `data` de um `Table` do XP.
 *
 * O Table e row-major por camada: x varia primeiro, depois y, depois z.
 */
export function cellIndex(
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
): number {
  return x + y * width + z * width * height;
}
