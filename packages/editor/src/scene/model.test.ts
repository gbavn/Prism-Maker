import { describe, expect, it } from "vitest";
import { bakeSize, bounds, foodTruck, MODELS } from "./model.js";

describe("modelo do food truck", () => {
  it("ocupa a área no chão que diz ocupar", () => {
    const model = foodTruck();
    const box = bounds(model);
    // O objeto não pode transbordar a área que o jogo vai reservar para ele,
    // senão a imagem cobre célula que o plugin acha que está livre.
    expect(box.min[0]).toBeGreaterThanOrEqual(0);
    expect(box.min[2]).toBeGreaterThanOrEqual(0);
    expect(box.max[0]).toBeLessThanOrEqual(model.footprint.width);
    expect(box.max[2]).toBeLessThanOrEqual(model.footprint.depth);
  });

  it("fica apoiado no chão", () => {
    expect(bounds(foodTruck()).min[1]).toBeCloseTo(0, 1);
  });

  it("a imagem assada sai em múltiplo de 32", () => {
    const size = bakeSize(foodTruck());
    expect(size.width % 32).toBe(0);
    expect(size.height % 32).toBe(0);
    expect(size.width).toBeGreaterThanOrEqual(96);
  });

  it("está no catálogo pelo próprio nome", () => {
    expect(MODELS[foodTruck().name]).toBeDefined();
  });
});
