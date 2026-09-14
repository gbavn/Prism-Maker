import { describe, expect, it } from "vitest";
import {
  type Elevation,
  decodeElevation,
  elevationLength,
  encodeElevationRunLength,
  flatElevation,
} from "./elevation.js";

describe("elevacao", () => {
  it("decodifica RLE", () => {
    const e: Elevation = { encoding: "rle", data: [[3, 0], [2, 1]] };
    expect(decodeElevation(e)).toEqual([0, 0, 0, 1, 1]);
  });

  it("conta o comprimento sem expandir", () => {
    // Lappet Town tem 32x21 celulas.
    expect(elevationLength(flatElevation(32, 21))).toBe(672);
  });

  it("codifica e decodifica de volta ao original", () => {
    const heights = [0, 0, 1, 1, 1, 0, 2];
    expect(decodeElevation(encodeElevationRunLength(heights))).toEqual(heights);
  });

  it("colapsa um mapa plano em uma unica run", () => {
    const e = encodeElevationRunLength(new Array(672).fill(0));
    expect(e).toEqual({ encoding: "rle", data: [[672, 0]] });
  });

  it("aceita array simples", () => {
    const e: Elevation = { encoding: "flat", data: [0, 1, 2] };
    expect(decodeElevation(e)).toEqual([0, 1, 2]);
    expect(elevationLength(e)).toBe(3);
  });

  it("aceita altura negativa, para buracos e agua", () => {
    expect(decodeElevation(encodeElevationRunLength([-1, -1]))).toEqual([-1, -1]);
  });
});
