import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMap, loadTilesets } from "@prism/rxdata-parser";
import { parseProject } from "@prism/scene-format";
import { buildScene, PLACEHOLDER_COLORS } from "./buildScene.js";

const dataDir = fileURLToPath(
  new URL("../../../../Game/essentials-v21.1/Data/", import.meta.url),
);

function read(name: string): Uint8Array {
  return new Uint8Array(readFileSync(dataDir + name));
}

const tilesets = loadTilesets(read("Tilesets.rxdata"));
const project = parseProject({ formatVersion: 1 });

function scene(file: string) {
  const map = loadMap(read(file));
  return buildScene({ map, tileset: tilesets.get(map.tilesetId)!, project });
}

describe("construcao da cena a partir de um mapa real", () => {
  const lappet = scene("Map002.rxdata"); // Lappet Town, 32x21

  it("cobre o mapa inteiro", () => {
    expect(lappet.width).toBe(32);
    expect(lappet.height).toBe(21);
    // A camada 0 de Lappet Town esta 672 de 672 preenchida, entao toda celula
    // produz geometria.
    expect(lappet.boxes).toHaveLength(32 * 21);
  });

  it("mira a camera no centro do mapa", () => {
    expect(lappet.center).toEqual({ x: 15.5, z: 10 });
  });

  it("traz os eventos como billboards", () => {
    // Map002.rxdata tem 4 eventos.
    expect(lappet.billboards).toHaveLength(4);
    for (const billboard of lappet.billboards) {
      expect(billboard.x).toBeGreaterThanOrEqual(0);
      expect(billboard.z).toBeGreaterThanOrEqual(0);
    }
  });

  it("assenta o evento em cima da geometria, nao dentro dela", () => {
    // Com elevacao zero, o topo de um chao fica em metade do passo e o de um
    // bloco em um passo inteiro. Em nenhum caso o evento pode ficar em zero,
    // que e onde a base do bloco esta.
    for (const billboard of lappet.billboards) {
      expect(billboard.base).toBeGreaterThan(0);
    }

    const boxAt = (x: number, z: number) =>
      lappet.boxes.find((box) => box.x === x && box.z === z);

    for (const billboard of lappet.billboards) {
      const box = boxAt(billboard.x, billboard.z);
      if (box) expect(billboard.base).toBe(box.base + box.height);
    }
  });

  it("separa chao de geometria bloqueada", () => {
    const kinds = new Set(lappet.boxes.map((box) => box.kind));
    expect(kinds.has("ground")).toBe(true);
    expect(kinds.has("block")).toBe(true);
  });

  it("usa a cor placeholder do tipo", () => {
    const ground = lappet.boxes.find((box) => box.kind === "ground");
    expect(ground?.color).toEqual(PLACEHOLDER_COLORS.ground);
  });

  it("assenta tudo no nivel zero quando nao ha elevacao", () => {
    expect(lappet.boxes.every((box) => box.base === 0)).toBe(true);
  });
});

describe("elevacao", () => {
  it("levanta as celulas pelo passo do projeto", () => {
    const map = loadMap(read("Map002.rxdata"));
    const raised = buildScene({
      map,
      tileset: tilesets.get(map.tilesetId)!,
      project,
      heights: new Array<number>(32 * 21).fill(2),
    });
    // O passo padrao e 0.5, entao dois degraus levantam uma unidade.
    expect(raised.boxes.every((box) => box.base === 1)).toBe(true);
  });

  it("recusa elevacao do tamanho errado", () => {
    const map = loadMap(read("Map002.rxdata"));
    expect(() =>
      buildScene({
        map,
        tileset: tilesets.get(map.tilesetId)!,
        project,
        heights: new Array<number>(100).fill(0),
      }),
    ).toThrow(/100 celulas.*32x21/);
  });
});

describe("todos os mapas do projeto constroem cena", () => {
  it("nenhum mapa quebra a construcao", () => {
    let built = 0;
    let blank = 0;

    for (let id = 1; id <= 75; id += 1) {
      const file = `Map${String(id).padStart(3, "0")}.rxdata`;
      let bytes: Uint8Array;
      try {
        bytes = read(file);
      } catch {
        continue; // ha buracos na numeracao dos mapas
      }
      const map = loadMap(bytes);
      const tileset = tilesets.get(map.tilesetId);
      expect(tileset).toBeDefined();

      const result = buildScene({ map, tileset: tileset!, project });
      if (result.boxes.length === 0) blank += 1;
      built += 1;
    }

    expect(built).toBe(69);
    // Map051 e um mapa em branco no projeto de exemplo do Essentials: a grade
    // inteira e zero e so existe um evento. Nao produzir geometria ali esta
    // certo, e o editor precisa aguentar abrir sem quebrar.
    expect(blank).toBe(1);
  });

  it("um mapa em branco produz cena vazia, nao erro", () => {
    const map = loadMap(read("Map051.rxdata"));
    const result = buildScene({
      map,
      tileset: tilesets.get(map.tilesetId)!,
      project,
    });
    expect(result.boxes).toHaveLength(0);
    expect(result.billboards).toHaveLength(1);
  });
});
