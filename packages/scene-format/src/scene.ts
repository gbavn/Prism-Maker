import { z } from "zod";
import { cameraSchema } from "./camera.js";
import { elevationSchema, elevationLength } from "./elevation.js";
import { eventPlacementSchema, tileRenderSchema } from "./render.js";
import { SCENE_FORMAT_VERSION } from "./version.js";

const numericKey = z.string().regex(/^\d+$/, "a chave precisa ser um id numerico");

/** Chave de celula no formato "x,y". */
const cellKey = z
  .string()
  .regex(/^\d+,\d+$/, 'a chave de celula precisa ter o formato "x,y"');

/** Rampa ligando o nivel da celula ao nivel vizinho. */
export const rampSchema = z.object({
  /** Para onde a rampa sobe. */
  direction: z.enum(["north", "south", "east", "west"]),
  /** Altura do topo, em degraus. */
  to: z.number().int(),
});

export type Ramp = z.infer<typeof rampSchema>;

export const cellOverrideSchema = z.object({
  /** Ignora o mapeamento do tileset so nesta celula. */
  render: tileRenderSchema.optional(),
  ramp: rampSchema.optional(),
  /**
   * "auto" deixa a colisao vir da tabela `passages` do tileset, que e o que
   * mantem o jogo andando igual no Essentials padrao.
   */
  collision: z.enum(["auto", "solid", "open"]).default("auto"),
});

export type CellOverride = z.infer<typeof cellOverrideSchema>;

/**
 * Espelho dos dados que vivem no .rxdata.
 *
 * O .scene.json nunca e a fonte da verdade destes campos. Eles ficam aqui so
 * para detectar que o mapa foi editado por fora, no RPG Maker, e que a cena
 * ficou desatualizada. Ver `validateSceneAgainstMap`.
 */
export const mapReferenceSchema = z.object({
  id: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tilesetId: z.number().int().positive(),
});

export type MapReference = z.infer<typeof mapReferenceSchema>;

export const sceneSchema = z
  .object({
    formatVersion: z.literal(SCENE_FORMAT_VERSION),
    map: mapReferenceSchema,
    elevation: elevationSchema,
    /** Excecoes por celula. Esparso de proposito. */
    cells: z.record(cellKey, cellOverrideSchema).default({}),
    /** Camera deste mapa. Ausente significa usar a do projeto. */
    camera: cameraSchema.optional(),
    /** Por id de evento, como em RPG::Map#events. */
    events: z.record(numericKey, eventPlacementSchema).default({}),
  })
  .superRefine((scene, ctx) => {
    const expected = scene.map.width * scene.map.height;
    const actual = elevationLength(scene.elevation);
    if (actual !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["elevation"],
        message:
          `a elevacao tem ${actual} celulas, mas o mapa e ` +
          `${scene.map.width}x${scene.map.height} (${expected} celulas)`,
      });
    }

    for (const key of Object.keys(scene.cells)) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      if (x >= scene.map.width || y >= scene.map.height) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cells", key],
          message:
            `a celula ${key} esta fora do mapa ` +
            `${scene.map.width}x${scene.map.height}`,
        });
      }
    }
  });

export type Scene = z.infer<typeof sceneSchema>;

/** Monta a chave de celula usada em `cells`. */
export function cellKeyOf(x: number, y: number): string {
  return `${x},${y}`;
}
