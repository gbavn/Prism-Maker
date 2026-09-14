import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMap, loadTilesets } from "@prism/rxdata-parser";
import { parseProject } from "@prism/scene-format";
import { buildScene } from "./buildScene.js";
import {
  AUTOTILE_PATTERNS,
  autotileQuarters,
  quarterRect,
  tileSource,
} from "./tileAtlas.js";

const dataDir = fileURLToPath(
  new URL("../../../../Game/essentials-v21.1/Data/", import.meta.url),
);

function read(name: string): Uint8Array {
  return new Uint8Array(readFileSync(dataDir + name));
}

const tilesets = loadTilesets(read("Tilesets.rxdata"));
const project = parseProject({ formatVersion: 1 });

function scene(file: string, heights?: number[]) {
  const map = loadMap(read(file));
  return buildScene({
    map,
    tileset: tilesets.get(map.tilesetId)!,
    project,
    ...(heights ? { heights } : {}),
  });
}

describe("construcao da cena a partir de um mapa real", () => {
  const lappet = scene("Map002.rxdata"); // Lappet Town, 32x21

  it("cobre o mapa inteiro", () => {
    expect(lappet.width).toBe(32);
    expect(lappet.height).toBe(21);
  });

  it("emite um quad por tile preenchido, somando as tres camadas", () => {
    // Medido no proprio Map002: 672 na camada 0, 112 na 1 e 13 na 2.
    expect(lappet.quads).toHaveLength(672 + 112 + 13);
  });

  it("mantem a ordem das camadas separada na vertical", () => {
    const stacked = lappet.quads.filter(
      (quad) => quad.cellX === lappet.quads[0]!.cellX && quad.cellY === lappet.quads[0]!.cellY,
    );
    for (let i = 1; i < stacked.length; i += 1) {
      expect(stacked[i]!.y).toBeGreaterThan(stacked[i - 1]!.y);
    }
  });

  it("mira a camera no centro do mapa", () => {
    expect(lappet.center).toEqual({ x: 15.5, z: 10 });
  });

  it("traz os eventos como billboards, com o charset", () => {
    expect(lappet.billboards).toHaveLength(4);
    for (const billboard of lappet.billboards) {
      expect(typeof billboard.characterName).toBe("string");
    }
  });

  it("assenta tudo no nivel zero quando nao ha elevacao", () => {
    expect(lappet.surface.every((top) => top === 0)).toBe(true);
  });
});

describe("elevacao", () => {
  it("levanta as celulas pelo passo do projeto", () => {
    const raised = scene("Map002.rxdata", new Array<number>(32 * 21).fill(2));
    // O passo padrao e 0.5, entao dois degraus levantam uma unidade.
    expect(raised.surface.every((top) => top === 1)).toBe(true);
    expect(raised.quads.every((quad) => quad.y >= 1)).toBe(true);
  });

  it("recusa elevacao do tamanho errado", () => {
    expect(() => scene("Map002.rxdata", new Array<number>(100).fill(0))).toThrow(
      /100 celulas.*32x21/,
    );
  });
});

describe("paredes de degrau", () => {
  it("mapa plano nao produz parede nenhuma", () => {
    expect(scene("Map002.rxdata").skirts).toHaveLength(0);
  });

  it("uma celula levantada ganha parede nos quatro lados", () => {
    const heights = new Array<number>(32 * 21).fill(0);
    heights[5 * 32 + 5] = 2; // celula 5,5

    const raised = scene("Map002.rxdata", heights);
    const around = raised.skirts.filter(
      (skirt) => skirt.cellX === 5 && skirt.cellY === 5,
    );

    expect(around.map((skirt) => skirt.side).sort()).toEqual([
      "east",
      "north",
      "south",
      "west",
    ]);
    // Dois degraus de 0.5 dao uma unidade de altura de parede.
    for (const skirt of around) {
      expect(skirt.top).toBe(1);
      expect(skirt.bottom).toBe(0);
    }
  });

  it("nao levanta parede entre celulas na mesma altura", () => {
    const heights = new Array<number>(32 * 21).fill(0);
    heights[5 * 32 + 5] = 2;
    heights[5 * 32 + 6] = 2; // vizinho a leste, mesma altura

    const raised = scene("Map002.rxdata", heights);
    const between = raised.skirts.filter(
      (skirt) => skirt.cellX === 5 && skirt.cellY === 5 && skirt.side === "east",
    );
    expect(between).toHaveLength(0);
  });

  it("so a celula mais alta ganha a parede do degrau", () => {
    const heights = new Array<number>(32 * 21).fill(0);
    heights[5 * 32 + 5] = 4;
    heights[5 * 32 + 6] = 2;

    const raised = scene("Map002.rxdata", heights);
    const higher = raised.skirts.find(
      (skirt) => skirt.cellX === 5 && skirt.cellY === 5 && skirt.side === "east",
    );
    const lower = raised.skirts.find(
      (skirt) => skirt.cellX === 6 && skirt.cellY === 5 && skirt.side === "west",
    );

    expect(higher).toBeDefined();
    expect(higher!.top).toBe(2);
    expect(higher!.bottom).toBe(1);
    expect(lower).toBeUndefined();
  });

  it("a borda do mapa so ganha parede quando foi levantada", () => {
    const flat = scene("Map002.rxdata");
    expect(flat.skirts.filter((skirt) => skirt.cellX === 0)).toHaveLength(0);

    const heights = new Array<number>(32 * 21).fill(0);
    heights[0] = 1;
    const raised = scene("Map002.rxdata", heights);
    const corner = raised.skirts.filter(
      (skirt) => skirt.cellX === 0 && skirt.cellY === 0,
    );
    expect(corner.length).toBeGreaterThan(0);
  });
});

describe("recorte do tile na imagem", () => {
  it("usa 8 colunas de 32 pixels para tile normal", () => {
    // Confirmado contra Outside.png, que e 256 por 16064: 8 colunas, 502 linhas.
    expect(tileSource(384)).toEqual({ kind: "tileset", x: 0, y: 0 });
    expect(tileSource(385)).toEqual({ kind: "tileset", x: 32, y: 0 });
    expect(tileSource(392)).toEqual({ kind: "tileset", x: 0, y: 32 });
  });

  it("le a forma do autotile direto do tile id", () => {
    // O RPG Maker grava a forma no id, entao nao e preciso olhar vizinhos.
    expect(tileSource(48)).toEqual({ kind: "autotile", autotile: 0, shape: 0 });
    expect(tileSource(48 + 20)).toEqual({
      kind: "autotile",
      autotile: 0,
      shape: 20,
    });
  });

  it("celula vazia nao tem recorte", () => {
    expect(tileSource(0)).toBeNull();
  });

  it("o ultimo tile de Outside cabe na imagem", () => {
    // 4400 entradas na tabela de passagem, entao o ultimo id valido e 4399.
    const source = tileSource(4399);
    expect(source?.kind).toBe("tileset");
    expect((source as { y: number }).y + 32).toBeLessThanOrEqual(16064);
  });
});

describe("montagem do autotile", () => {
  it("a forma cheia sai do bloco em 32, 64", () => {
    // Quartos 27, 28, 33 e 34 da tabela do Essentials. Meu primeiro chute foi
    // o centro do molde, em 32, 32, e o resultado era agua riscada de vermelho.
    expect(autotileQuarters(0)).toEqual([
      { x: 32, y: 64 },
      { x: 48, y: 64 },
      { x: 32, y: 80 },
      { x: 48, y: 80 },
    ]);
  });

  it("numera os quartos da esquerda para a direita, de cima para baixo", () => {
    expect(quarterRect(1)).toEqual({ x: 0, y: 0 });
    expect(quarterRect(6)).toEqual({ x: 80, y: 0 });
    expect(quarterRect(7)).toEqual({ x: 0, y: 16 });
    expect(quarterRect(48)).toEqual({ x: 80, y: 112 });
  });

  it("cobre as 48 formas, todas dentro do molde", () => {
    expect(AUTOTILE_PATTERNS).toHaveLength(48);
    for (let shape = 0; shape < 48; shape += 1) {
      const quarters = autotileQuarters(shape);
      expect(quarters).not.toBeNull();
      for (const quarter of quarters!) {
        expect(quarter.x + 16).toBeLessThanOrEqual(96);
        expect(quarter.y + 16).toBeLessThanOrEqual(128);
      }
    }
  });

  it("recusa forma fora da faixa", () => {
    expect(autotileQuarters(48)).toBeNull();
    expect(autotileQuarters(-1)).toBeNull();
  });

  it("as formas usadas em Lappet Town sao validas", () => {
    // Medidas no proprio Map002: autotile 4, formas 20, 28, 34, 36, 38 e 40.
    for (const shape of [20, 28, 34, 36, 38, 40]) {
      expect(autotileQuarters(shape)).not.toBeNull();
    }
  });
});

describe("todos os mapas do projeto constroem cena", () => {
  it("nenhum mapa quebra a construcao", () => {
    let built = 0;
    let blank = 0;

    for (let id = 1; id <= 75; id += 1) {
      const file = `Map${String(id).padStart(3, "0")}.rxdata`;
      try {
        read(file);
      } catch {
        continue; // ha buracos na numeracao dos mapas
      }
      const result = scene(file);
      if (result.quads.length === 0) blank += 1;
      built += 1;
    }

    expect(built).toBe(69);
    // Map051 e um mapa em branco no projeto de exemplo do Essentials.
    expect(blank).toBe(1);
  });
});
