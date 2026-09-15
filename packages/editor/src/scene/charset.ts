import { TILE_PIXELS, tileSource } from "./tileAtlas.js";
import { LAYER_GAP } from "./buildScene.js";
import type { SceneBillboard } from "./buildScene.js";

/**
 * Recorte e colocacao do sprite de um evento.
 *
 * Tudo verificado no `Sprite_Character` do Essentials, dentro do
 * `Scripts.rxdata`, e nao deduzido: o charset e a imagem dividida em quatro
 * por quatro, a coluna vem do `pattern`, a linha vem de `(direction - 2) / 2`,
 * e o sprite fica com os pes no rodape da celula, centrado na horizontal.
 *
 * Puro e sem Three, pelo mesmo motivo do resto da pasta: da para testar o
 * recorte sem abrir janela nenhuma.
 */

/** Um charset tem quatro colunas de quadro e quatro linhas de direcao. */
export const CHARSET_COLUMNS = 4;
export const CHARSET_ROWS = 4;

export interface ImageSize {
  width: number;
  height: number;
}

/** Retangulo dentro da imagem, em pixels. */
export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A linha do charset para uma direcao do XP.
 *
 * As direcoes validas sao 2, 4, 6 e 8. Qualquer outra coisa cai na primeira
 * linha, que e o personagem de frente: um evento com direcao estranha some do
 * mapa se a conta estourar, e sumir e pior que aparecer virado errado.
 */
export function directionRow(direction: number): number {
  const row = Math.floor((direction - 2) / 2);
  if (!Number.isFinite(row) || row < 0 || row >= CHARSET_ROWS) return 0;
  return row;
}

/** O recorte de um frame dentro do charset. */
export function charsetFrame(
  image: ImageSize,
  direction: number,
  pattern: number,
): Frame {
  const width = image.width / CHARSET_COLUMNS;
  const height = image.height / CHARSET_ROWS;
  const column =
    Number.isFinite(pattern) && pattern >= 0 && pattern < CHARSET_COLUMNS
      ? Math.floor(pattern)
      : 0;

  return {
    x: column * width,
    y: directionRow(direction) * height,
    width,
    height,
  };
}

/** Chave da imagem de um charset, no mesmo formato das outras imagens. */
export function characterKey(name: string): string {
  return `character:${name}`;
}

export type ViewMode = "2d" | "3d";

/** Onde o quad do sprite fica no mundo, ja no tamanho certo. */
export interface SpritePlacement {
  width: number;
  height: number;
  /** Centro do quad. */
  x: number;
  y: number;
  z: number;
}

/**
 * Coloca o sprite no mundo.
 *
 * Os pes ficam no rodape da celula, que e onde o Essentials os poe: o
 * `screen_y` do personagem e o topo da celula mais um tile, e a ancora do
 * sprite e a base dele.
 *
 * Em 2D o quad fica deitado no chao, olhando para cima, e cresce para o norte
 * a partir dos pes. Em 3D fica em pe, com os pes no chao. E o mesmo sprite,
 * desenhado do jeito que faz sentido em cada vista.
 */
export function placeSprite(
  billboard: { x: number; z: number; base: number },
  frame: Frame,
  tileSize: number,
  mode: ViewMode,
): SpritePlacement {
  const scale = tileSize / TILE_PIXELS;
  const width = frame.width * scale;
  const height = frame.height * scale;
  const feet = billboard.z + tileSize / 2;

  if (mode === "2d") {
    return {
      width,
      height,
      x: billboard.x,
      // Acima das tres camadas de tile, senao o sprite briga pelo mesmo plano
      // com o chao e o resultado cintila conforme a camera anda.
      y: billboard.base + LAYER_GAP * 4,
      z: feet - height / 2,
    };
  }

  return {
    width,
    height,
    x: billboard.x,
    y: billboard.base + height / 2,
    z: feet,
  };
}

/**
 * De onde sai o desenho de um evento.
 *
 * Tres casos, na ordem que o Essentials usa: charset, tile do tileset como
 * grafico, e nada. O terceiro nao e erro, e comum: porta, gatilho de aviso e
 * transferencia de mapa sao eventos sem grafico. Eles precisam aparecer de
 * alguma forma, senao ficam invisiveis para quem edita e ninguem consegue
 * clicar neles.
 */
export type SpriteSource =
  | { kind: "character"; key: string; frame: Frame }
  | { kind: "tile"; key: "tileset"; frame: Frame }
  | { kind: "marker" };

export function spriteSource(
  billboard: SceneBillboard,
  sizes: ReadonlyMap<string, ImageSize>,
): SpriteSource {
  if (billboard.characterName !== "") {
    const key = characterKey(billboard.characterName);
    const size = sizes.get(key);
    if (size !== undefined) {
      return {
        kind: "character",
        key,
        frame: charsetFrame(size, billboard.direction, billboard.pattern),
      };
    }
  }

  const tile = tileSource(billboard.tileId);
  if (tile !== null && tile.kind === "tileset") {
    return {
      kind: "tile",
      key: "tileset",
      frame: { x: tile.x, y: tile.y, width: TILE_PIXELS, height: TILE_PIXELS },
    };
  }

  return { kind: "marker" };
}

/** Chave da imagem de um objeto assado. */
export function objectKey(name: string): string {
  return `object:${name}`;
}
