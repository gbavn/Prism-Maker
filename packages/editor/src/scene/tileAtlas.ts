import {
  autotileIndex,
  FIRST_REGULAR_TILE,
  tileKind,
  TILESET_COLUMNS,
} from "@prism/scene-format";

/**
 * De um tile id para um retangulo dentro de uma imagem.
 *
 * Confirmado contra os arquivos reais: o tileset "Outside" e 256 por 16064
 * pixels, ou seja 8 colunas de 32 pixels por 502 linhas, dando 4016 tiles
 * normais. Somados aos 384 ids reservados para autotile, dao exatamente as
 * 4400 entradas da tabela `passages` desse tileset.
 */

export const TILE_PIXELS = 32;

/** Uma fonte de imagem e o recorte dentro dela. */
export interface TileSource {
  /** "tileset" usa o png do tileset; "autotile" usa o png do autotile. */
  kind: "tileset" | "autotile";
  /** Indice em autotile_names quando kind e "autotile". */
  autotile: number;
  /** Recorte em pixels, com origem no canto superior esquerdo. */
  x: number;
  y: number;
}

/**
 * Recorte do autotile usado como aproximacao.
 *
 * Um autotile do XP e um molde de 96 por 128 pixels de onde as 48 formas sao
 * montadas em quartos de 16 pixels, conforme as celulas vizinhas. Isso e
 * trabalhoso e o proprio ARCHITECTURE.md manda adiar. Ate la, usamos o bloco
 * central do molde, que e a forma cheia: agua no meio do lago e caminho no
 * meio do caminho ficam certos, so as bordas ficam sem recorte.
 */
export const AUTOTILE_FALLBACK = { x: TILE_PIXELS, y: TILE_PIXELS };

export function tileSource(tileId: number): TileSource | null {
  const kind = tileKind(tileId);
  if (kind === "empty") return null;

  if (kind === "autotile") {
    const index = autotileIndex(tileId);
    if (index === null) return null;
    return {
      kind: "autotile",
      autotile: index,
      x: AUTOTILE_FALLBACK.x,
      y: AUTOTILE_FALLBACK.y,
    };
  }

  const offset = tileId - FIRST_REGULAR_TILE;
  return {
    kind: "tileset",
    autotile: -1,
    x: (offset % TILESET_COLUMNS) * TILE_PIXELS,
    y: Math.floor(offset / TILESET_COLUMNS) * TILE_PIXELS,
  };
}
