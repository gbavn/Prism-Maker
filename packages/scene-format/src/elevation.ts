import { z } from "zod";

/**
 * Elevacao por celula.
 *
 * Mapas reais do Essentials sao quase todos planos: em Lappet Town, 672 de
 * 672 celulas estao no mesmo nivel. Guardar 672 numeros iguais em JSON e
 * desperdicio e deixa o arquivo impossivel de revisar no diff. Por isso o
 * formato aceita duas codificacoes e o resto do codigo so lida com o
 * resultado decodificado.
 *
 * A altura e medida em degraus inteiros, nao em unidades de mundo. Quanto
 * vale um degrau e decidido uma vez no manifesto do projeto, o que mantem
 * editor e runtime falando a mesma lingua.
 */

export const elevationFlatSchema = z.object({
  encoding: z.literal("flat"),
  /** Uma altura por celula, na mesma ordem do Table do XP: x varia primeiro. */
  data: z.array(z.number().int()),
});

export const elevationRunLengthSchema = z.object({
  encoding: z.literal("rle"),
  /** Pares [quantidade, altura], na mesma ordem de varredura. */
  data: z.array(z.tuple([z.number().int().positive(), z.number().int()])),
});

export const elevationSchema = z.discriminatedUnion("encoding", [
  elevationFlatSchema,
  elevationRunLengthSchema,
]);

export type Elevation = z.infer<typeof elevationSchema>;

/** Expande qualquer codificacao para um array simples de alturas. */
export function decodeElevation(elevation: Elevation): number[] {
  if (elevation.encoding === "flat") return [...elevation.data];

  const out: number[] = [];
  for (const [count, height] of elevation.data) {
    for (let i = 0; i < count; i += 1) out.push(height);
  }
  return out;
}

/** Comprimento decodificado, sem materializar o array. */
export function elevationLength(elevation: Elevation): number {
  if (elevation.encoding === "flat") return elevation.data.length;
  return elevation.data.reduce((total, [count]) => total + count, 0);
}

/** Compacta um array de alturas em RLE. */
export function encodeElevationRunLength(heights: readonly number[]): Elevation {
  const runs: [number, number][] = [];
  for (const height of heights) {
    const last = runs.at(-1);
    if (last && last[1] === height) last[0] += 1;
    else runs.push([1, height]);
  }
  return { encoding: "rle", data: runs };
}

/** Elevacao plana de um mapa inteiro, em uma unica run. */
export function flatElevation(
  width: number,
  height: number,
  level = 0,
): Elevation {
  return { encoding: "rle", data: [[width * height, level]] };
}
