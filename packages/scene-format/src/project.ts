import { z } from "zod";
import { cameraSchema } from "./camera.js";
import { tileRenderSchema, type TileRender } from "./render.js";
import { autotileIndex, isImpassable, isOverhead, tileKind } from "./rmxp.js";
import { SCENE_FORMAT_VERSION } from "./version.js";

/** Chave de dicionario que guarda um id numerico. */
const numericKey = z.string().regex(/^\d+$/, "a chave precisa ser um id numerico");

/**
 * Regras que geram um mapeamento inicial para um tileset inteiro.
 *
 * Um tileset do Essentials tem milhares de tiles: o "Outside" tem 4400. Mapear
 * cada um a mao nao e viavel e nem necessario, porque o proprio XP ja guarda
 * na tabela `passages` o que e chao e o que e parede. Estas regras traduzem
 * essa informacao e o mapeamento manual fica so para as excecoes.
 */
export const deriveRulesSchema = z.object({
  /** Tile que o jogador atravessa. */
  passable: tileRenderSchema.default({ kind: "ground" }),
  /** Tile bloqueado nas quatro direcoes. */
  impassable: tileRenderSchema.default({ kind: "block", height: 1 }),
  /**
   * Tile com prioridade acima de zero, ou seja, desenhado por cima do
   * personagem no jogo 2D. Copa de arvore, telhado, beiral.
   */
  overhead: tileRenderSchema.default({ kind: "block", height: 2 }),
});

export type DeriveRules = z.infer<typeof deriveRulesSchema>;

export const tilesetMappingSchema = z.object({
  /** Nome do tileset no RPG Maker, so para leitura humana. */
  name: z.string().optional(),
  derive: deriveRulesSchema.default({
    passable: { kind: "ground" },
    impassable: { kind: "block", height: 1 },
    overhead: { kind: "block", height: 2 },
  }),
  /** Por indice de autotile (0 a 6), como em RPG::Tileset#autotile_names. */
  autotiles: z.record(numericKey, tileRenderSchema).default({}),
  /** Por tile id. Tem a ultima palavra. */
  tiles: z.record(numericKey, tileRenderSchema).default({}),
});

export type TilesetMapping = z.infer<typeof tilesetMappingSchema>;

/**
 * Unidades de mundo.
 *
 * Fixar isso em um lugar so e o que impede editor e runtime de divergirem na
 * escala. Um tile de 32 pixels do XP vira `tileSize` unidades; cada degrau de
 * elevacao vale `elevationStep`.
 */
export const unitsSchema = z.object({
  tileSize: z.number().positive().default(1),
  elevationStep: z.number().positive().default(0.5),
});

export type Units = z.infer<typeof unitsSchema>;

export const projectSchema = z.object({
  formatVersion: z.literal(SCENE_FORMAT_VERSION),
  /** Versao do Essentials contra a qual o projeto foi aberto. */
  essentialsVersion: z.string().default("21.1"),
  units: unitsSchema.default({ tileSize: 1, elevationStep: 0.5 }),
  /** Camera usada por mapas que nao trazem a sua. */
  camera: cameraSchema.default({}),
  /** Um mapeamento por tileset, indexado pelo id do tileset no XP. */
  tilesets: z.record(numericKey, tilesetMappingSchema).default({}),
});

export type Project = z.infer<typeof projectSchema>;

/**
 * Decide como um tile vira geometria.
 *
 * A ordem de precedencia e sempre esta, do mais especifico para o mais geral:
 * mapeamento explicito do tile, mapeamento do autotile, regra derivada das
 * tabelas do tileset. Editor e runtime precisam resolver nessa mesma ordem,
 * ou a paridade visual quebra.
 *
 * `passage` vem de `RPG::Tileset#passages[tileId]` e `priority` de
 * `RPG::Tileset#priorities[tileId]`, ambos lidos do .rxdata. Este pacote nao
 * le .rxdata de proposito: quem chama fornece os valores.
 */
export function resolveTileRender(
  mapping: TilesetMapping,
  tileId: number,
  tables: { passage: number; priority: number },
): TileRender | null {
  const kind = tileKind(tileId);
  if (kind === "empty") return null;

  const explicit = mapping.tiles[String(tileId)];
  if (explicit) return explicit;

  if (kind === "autotile") {
    const index = autotileIndex(tileId);
    const byAutotile =
      index === null ? undefined : mapping.autotiles[String(index)];
    if (byAutotile) return byAutotile;
  }

  if (isImpassable(tables.passage)) return mapping.derive.impassable;
  if (isOverhead(tables.priority)) return mapping.derive.overhead;
  return mapping.derive.passable;
}
