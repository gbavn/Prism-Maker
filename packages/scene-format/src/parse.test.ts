import { describe, expect, it } from "vitest";
import { flatElevation } from "./elevation.js";
import {
  parseProject,
  parseScene,
  SceneFormatError,
  validateSceneAgainstMap,
} from "./parse.js";
import { resolveTileRender } from "./project.js";
import { UnsupportedFormatVersionError } from "./version.js";

// Lappet Town, o mapa 2 do Essentials v21.1: 32x21, tileset 1 ("Outside").
function lappetTown(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: 1,
    map: { id: 2, width: 32, height: 21, tilesetId: 1 },
    elevation: flatElevation(32, 21),
    ...overrides,
  };
}

describe("parseScene", () => {
  it("aceita uma cena minima e aplica os defaults", () => {
    const scene = parseScene(lappetTown());
    expect(scene.map.width).toBe(32);
    expect(scene.cells).toEqual({});
    expect(scene.events).toEqual({});
    expect(scene.camera).toBeUndefined();
  });

  it("recusa elevacao com tamanho errado", () => {
    const bad = lappetTown({ elevation: flatElevation(32, 20) });
    expect(() => parseScene(bad)).toThrow(SceneFormatError);
    expect(() => parseScene(bad)).toThrow(/640 celulas.*32x21/s);
  });

  it("recusa celula fora do mapa", () => {
    const bad = lappetTown({ cells: { "32,0": { collision: "solid" } } });
    expect(() => parseScene(bad)).toThrow(/fora do mapa/);
  });

  it("recusa chave de celula malformada", () => {
    expect(() => parseScene(lappetTown({ cells: { "x,y": {} } }))).toThrow(
      /formato "x,y"/,
    );
  });

  it("recusa evento com render model e sem modelo", () => {
    const bad = lappetTown({ events: { "1": { render: "model" } } });
    expect(() => parseScene(bad)).toThrow(/exige o campo model/);
  });

  it("aceita evento com modelo", () => {
    const scene = parseScene(
      lappetTown({
        events: { "1": { render: "model", model: { path: "npc/oak.glb" } } },
      }),
    );
    expect(scene.events["1"]?.model?.scale).toBe(1);
  });

  it("recusa modelo que nao e .glb", () => {
    const bad = lappetTown({
      events: { "1": { render: "model", model: { path: "npc/oak.obj" } } },
    });
    expect(() => parseScene(bad)).toThrow(SceneFormatError);
  });

  it("recusa formatVersion desconhecido", () => {
    expect(() => parseScene(lappetTown({ formatVersion: 99 }))).toThrow(
      UnsupportedFormatVersionError,
    );
    expect(() => parseScene(lappetTown({ formatVersion: undefined }))).toThrow(
      UnsupportedFormatVersionError,
    );
  });

  it("recusa entrada que nao e objeto", () => {
    expect(() => parseScene("cena")).toThrow(SceneFormatError);
    expect(() => parseScene(null)).toThrow(SceneFormatError);
  });
});

describe("validateSceneAgainstMap", () => {
  const scene = parseScene(lappetTown());

  it("nao reclama quando bate", () => {
    expect(
      validateSceneAgainstMap(scene, { width: 32, height: 21, tilesetId: 1 }),
    ).toEqual([]);
  });

  it("pega mapa redimensionado no RPG Maker", () => {
    const problems = validateSceneAgainstMap(scene, {
      width: 40,
      height: 21,
      tilesetId: 1,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/32x21.*40x21/);
  });

  it("pega troca de tileset", () => {
    const problems = validateSceneAgainstMap(scene, {
      width: 32,
      height: 21,
      tilesetId: 4,
    });
    expect(problems[0]).toMatch(/tileset 1.*usa o 4/);
  });
});

describe("parseProject e resolucao de tile", () => {
  const project = parseProject({
    formatVersion: 1,
    tilesets: {
      "1": {
        name: "Outside",
        autotiles: { "0": { kind: "model", model: { path: "water/sea.glb" } } },
        tiles: { "401": { kind: "hidden" } },
      },
    },
  });
  const outside = project.tilesets["1"]!;

  it("aplica os defaults do projeto", () => {
    expect(project.units.elevationStep).toBe(0.5);
    expect(project.camera.pitch).toBe(55);
    expect(outside.derive.impassable).toEqual({ kind: "block", height: 1 });
    expect(outside.derive.overhead).toEqual({ kind: "block", height: 2 });
  });

  it("celula vazia nao vira geometria", () => {
    expect(resolveTileRender(outside, 0, { passage: 0, priority: 0 })).toBeNull();
  });

  it("mapeamento por tile id tem a ultima palavra", () => {
    // 401 e o tile mais usado na camada 0 de Lappet Town, com passage 0.
    expect(resolveTileRender(outside, 401, { passage: 0, priority: 0 })).toEqual({ kind: "hidden" });
  });

  it("cai no mapeamento do autotile", () => {
    // 48 e a primeira forma do autotile 0, que no "Outside" e "Sea".
    expect(resolveTileRender(outside, 48, { passage: 0, priority: 0 })).toEqual({
      kind: "model",
      model: { path: "water/sea.glb", rotation: 0, scale: 1, offset: [0, 0, 0] },
    });
  });

  it("deriva chao e parede da tabela de passagem", () => {
    expect(resolveTileRender(outside, 809, { passage: 0, priority: 0 })).toEqual({ kind: "ground" });
    expect(resolveTileRender(outside, 809, { passage: 15, priority: 0 })).toEqual({
      kind: "block",
      height: 1,
    });
  });

  it("bloqueio vence prioridade", () => {
    // Um tronco de arvore e as duas coisas ao mesmo tempo.
    expect(
      resolveTileRender(outside, 809, { passage: 15, priority: 3 }),
    ).toEqual({ kind: "block", height: 1 });
  });

  it("prioridade sozinha vira geometria alta", () => {
    expect(
      resolveTileRender(outside, 809, { passage: 0, priority: 3 }),
    ).toEqual({ kind: "block", height: 2 });
  });
});
