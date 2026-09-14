import { z } from "zod";

/**
 * Camera do mapa.
 *
 * Os angulos seguem a convencao de orbita: yaw gira em torno do eixo
 * vertical, pitch inclina para baixo. Pitch 0 olha na horizontal, pitch 90
 * olha de cima direto para baixo. Os jogos de DS ficam por volta de 55.
 */
export const cameraSchema = z.object({
  yaw: z.number().default(0),
  pitch: z.number().min(0).max(90).default(55),
  /** Distancia do alvo, em unidades de mundo. */
  distance: z.number().positive().default(12),
  projection: z.enum(["perspective", "orthographic"]).default("perspective"),
  /** Campo de visao em graus. Ignorado em projecao ortografica. */
  fov: z.number().positive().max(179).default(45),
  zoom: z
    .object({
      min: z.number().positive().default(6),
      max: z.number().positive().default(24),
    })
    .default({ min: 6, max: 24 })
    .refine((z_) => z_.min <= z_.max, {
      message: "zoom.min nao pode ser maior que zoom.max",
    }),
  /**
   * "free" deixa orbitar livremente, "locked" trava o yaw no valor acima,
   * "steps" permite apenas multiplos de 90 graus, como nos jogos de DS.
   */
  rotation: z.enum(["free", "locked", "steps"]).default("free"),
});

export type Camera = z.infer<typeof cameraSchema>;
