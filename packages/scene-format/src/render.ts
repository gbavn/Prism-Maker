import { z } from "zod";

/**
 * Como um tile vira geometria.
 *
 * Este e o coracao do contrato: editor e runtime leem exatamente estas
 * variantes e nao podem interpretar nenhuma delas de forma diferente.
 */

export const modelRefSchema = z.object({
  /** Caminho de um .glb, relativo a raiz do projeto Prism. */
  path: z.string().min(1).endsWith(".glb"),
  /** Rotacao em torno do eixo vertical, em graus. */
  rotation: z.number().default(0),
  scale: z.number().positive().default(1),
  /** Deslocamento em unidades de mundo, aplicado depois da escala. */
  offset: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
});

export type ModelRef = z.infer<typeof modelRefSchema>;

/** Plano texturizado no nivel do chao. O caso comum. */
const groundSchema = z.object({
  kind: z.literal("ground"),
});

/** Bloco macico ocupando a celula, com altura em degraus. */
const blockSchema = z.object({
  kind: z.literal("block"),
  height: z.number().positive().default(1),
});

/** Modelo 3D proprio. */
const modelSchema = z.object({
  kind: z.literal("model"),
  model: modelRefSchema,
});

/** Nao desenha nada. Util para tiles que so existem como marcacao. */
const hiddenSchema = z.object({
  kind: z.literal("hidden"),
});

export const tileRenderSchema = z.discriminatedUnion("kind", [
  groundSchema,
  blockSchema,
  modelSchema,
  hiddenSchema,
]);

export type TileRender = z.infer<typeof tileRenderSchema>;

/**
 * Como um evento aparece no mundo.
 *
 * O padrao e billboard, o sprite 2D em pe encarando a camera. Isso reaproveita
 * todos os charsets que o projeto ja tem e evita modelar personagens em 3D.
 */
export const eventRenderSchema = z.enum(["billboard", "model", "hidden"]);

export type EventRender = z.infer<typeof eventRenderSchema>;

export const eventPlacementSchema = z
  .object({
    render: eventRenderSchema.default("billboard"),
    /** Obrigatorio quando render e "model". */
    model: modelRefSchema.optional(),
    /** Degraus somados a altura do terreno sob o evento. */
    elevationOffset: z.number().default(0),
  })
  .refine((v) => v.render !== "model" || v.model !== undefined, {
    message: 'render "model" exige o campo model',
    path: ["model"],
  });

export type EventPlacement = z.infer<typeof eventPlacementSchema>;
