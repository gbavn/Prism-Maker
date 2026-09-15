import { describe, expect, it } from "vitest";
import {
  bounds,
  boxCorners,
  footprint,
  foodTruck,
  MODELS,
  pivot,
  rawBounds,
} from "./model.js";

describe("modelo do food truck", () => {
  it("fica apoiado no chão", () => {
    expect(rawBounds(foodTruck()).min[1]).toBeCloseTo(0, 1);
  });

  it("é mais comprido que alto, como um caminhão", () => {
    const box = rawBounds(foodTruck());
    const length = (box.max[0] ?? 0) - (box.min[0] ?? 0);
    const height = (box.max[1] ?? 0) - (box.min[1] ?? 0);
    expect(length).toBeGreaterThan(height);
  });

  it("tem detalhe suficiente para não ler como um bloco", () => {
    expect(foodTruck().boxes.length).toBeGreaterThan(20);
  });

  it("está no catálogo pelo próprio nome", () => {
    expect(MODELS[foodTruck().name]).toBeDefined();
  });
});

describe("giro do modelo", () => {
  it("sem giro, os cantos ficam onde a caixa está", () => {
    const box = { size: [2, 1, 2] as [number, number, number], at: [1, 0.5, 1] as [number, number, number], color: 0 };
    const corners = boxCorners(box, 0, [1, 1]);
    expect(corners.some(([x, , z]) => x === 0 && z === 0)).toBe(true);
    expect(corners.some(([x, , z]) => x === 2 && z === 2)).toBe(true);
  });

  it("girar 90 graus troca largura e profundidade", () => {
    const model = { name: "t", yaw: 90, boxes: [
      { size: [4, 1, 1] as [number, number, number], at: [2, 0.5, 0.5] as [number, number, number], color: 0 },
    ] };
    const area = footprint(model);
    expect(area.width).toBe(1);
    expect(area.depth).toBe(4);
  });

  it("gira em volta do centro da área no chão", () => {
    const model = foodTruck();
    const centre = pivot(model);
    const raw = rawBounds(model);
    expect(centre[0]).toBeCloseTo(((raw.min[0] ?? 0) + (raw.max[0] ?? 0)) / 2, 5);
    expect(centre[1]).toBeCloseTo(((raw.min[2] ?? 0) + (raw.max[2] ?? 0)) / 2, 5);
  });

  it("o caminhão girado ocupa mais chão que o parado", () => {
    // É o preço de mostrar a lateral: a área reservada cresce, e o jogo
    // precisa saber disso para a profundidade continuar certa. A comparação é
    // na medida contínua, não em células: o arredondamento para célula pode
    // esconder um crescimento pequeno.
    const span = (model: Parameters<typeof bounds>[0]) => {
      const box = bounds(model);
      return [(box.max[0] ?? 0) - (box.min[0] ?? 0), (box.max[2] ?? 0) - (box.min[2] ?? 0)];
    };

    const turned = span(foodTruck());
    const straight = span({ ...foodTruck(), yaw: 0 });
    expect(turned[0] ?? 0).toBeGreaterThan(straight[0] ?? 0);
    expect(turned[1] ?? 0).toBeGreaterThan(straight[1] ?? 0);
  });

  it("a área girada contém o modelo inteiro", () => {
    const model = foodTruck();
    const box = bounds(model);
    const area = footprint(model);
    expect((box.max[0] ?? 0) - (box.min[0] ?? 0)).toBeLessThanOrEqual(area.width);
    expect((box.max[2] ?? 0) - (box.min[2] ?? 0)).toBeLessThanOrEqual(area.depth);
  });
});
