import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeElevation } from "./elevation.js";
import { parseProject, parseScene, validateSceneAgainstMap } from "./parse.js";
import { resolveTileRender } from "./project.js";
import { cellIndex } from "./rmxp.js";

/**
 * Os exemplos em examples/ sao parte do contrato, nao enfeite. Se o schema
 * mudar e eles pararem de validar, este teste falha e obriga a atualizar os
 * dois juntos.
 */
function loadExample(name: string): unknown {
  const path = fileURLToPath(new URL(`../../../examples/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("arquivos de exemplo", () => {
  const scene = parseScene(loadExample("Map002.scene.json"));
  const project = parseProject(loadExample("prism.project.json"));

  it("a cena de Lappet Town e valida", () => {
    expect(scene.map).toEqual({ id: 2, width: 32, height: 21, tilesetId: 1 });
  });

  it("bate com o Map002.rxdata real", () => {
    // Valores lidos de Game/essentials-v21.1/Data/Map002.rxdata.
    expect(
      validateSceneAgainstMap(scene, { width: 32, height: 21, tilesetId: 1 }),
    ).toEqual([]);
  });

  it("a elevacao cobre o mapa inteiro", () => {
    const heights = decodeElevation(scene.elevation);
    expect(heights).toHaveLength(32 * 21);
  });

  it("o plato esta onde o exemplo diz", () => {
    const heights = decodeElevation(scene.elevation);
    expect(heights[cellIndex(4, 3, 0, 32, 21)]).toBe(2);
    expect(heights[cellIndex(9, 6, 0, 32, 21)]).toBe(2);
    expect(heights[cellIndex(3, 3, 0, 32, 21)]).toBe(0);
    expect(heights[cellIndex(10, 3, 0, 32, 21)]).toBe(0);
  });

  it("o projeto mapeia os tilesets usados pelos mapas de exemplo", () => {
    expect(Object.keys(project.tilesets)).toContain("1");
    expect(project.tilesets["1"]?.name).toBe("Outside");
  });

  it("o mar de Lappet Town resolve para o modelo de agua", () => {
    // Autotile 0 do tileset "Outside" chama-se "Sea"; tile id 48 e sua
    // primeira forma.
    const outside = project.tilesets["1"]!;
    const render = resolveTileRender(outside, 48, { passage: 0, priority: 0 });
    expect(render).toMatchObject({
      kind: "model",
      model: { path: "water/sea.glb" },
    });
  });
});
