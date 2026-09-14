import type { z } from "zod";
import { projectSchema, type Project } from "./project.js";
import { sceneSchema, type Scene } from "./scene.js";
import { migrateDocument, type UnknownDocument } from "./version.js";

export class SceneFormatError extends Error {
  constructor(
    message: string,
    readonly issues: z.ZodIssue[],
  ) {
    super(message);
    this.name = "SceneFormatError";
  }
}

function formatIssues(issues: readonly z.ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("\n");
}

function parseWith<T>(
  schema: { safeParse: (input: unknown) => z.SafeParseReturnType<unknown, T> },
  input: unknown,
  label: string,
): T {
  if (typeof input !== "object" || input === null) {
    throw new SceneFormatError(`${label}: esperava um objeto JSON`, []);
  }

  const migrated = migrateDocument(input as UnknownDocument);
  const result = schema.safeParse(migrated);

  if (!result.success) {
    throw new SceneFormatError(
      `${label} invalido:\n${formatIssues(result.error.issues)}`,
      result.error.issues,
    );
  }
  return result.data;
}

/** Le um MapNNN.scene.json ja migrado e validado. */
export function parseScene(input: unknown): Scene {
  return parseWith(sceneSchema, input, "cena");
}

/** Le um prism.project.json ja migrado e validado. */
export function parseProject(input: unknown): Project {
  return parseWith(projectSchema, input, "projeto");
}

/**
 * Confere a cena contra o mapa real lido do .rxdata.
 *
 * O caso que isso pega e o mais comum na pratica: alguem abre o mapa no RPG
 * Maker, redimensiona ou troca o tileset, e o .scene.json ao lado silenciosamente
 * passa a descrever outro mapa. Melhor falhar alto.
 */
export function validateSceneAgainstMap(
  scene: Scene,
  map: { width: number; height: number; tilesetId: number },
): string[] {
  const problems: string[] = [];

  if (scene.map.width !== map.width || scene.map.height !== map.height) {
    problems.push(
      `a cena descreve um mapa ${scene.map.width}x${scene.map.height}, ` +
        `mas o .rxdata e ${map.width}x${map.height}`,
    );
  }
  if (scene.map.tilesetId !== map.tilesetId) {
    problems.push(
      `a cena usa o tileset ${scene.map.tilesetId}, ` +
        `mas o .rxdata usa o ${map.tilesetId}`,
    );
  }
  return problems;
}
