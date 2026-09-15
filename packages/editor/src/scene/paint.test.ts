import { describe, expect, it } from "vitest";
import {
  autotileFamily,
  autotileTileId,
  index,
  NEIGHBOURS_TO_SHAPE,
  paint,
  tilesetTileId,
} from "./paint.js";

const grid = { width: 5, height: 4 };
const CELLS = grid.width * grid.height * 3;

function empty(): Uint16Array {
  return new Uint16Array(CELLS);
}

/** Desenha uma camada como texto, que torna a falha legível de imediato. */
function draw(tiles: Uint16Array, layer = 0): string {
  const rows: string[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    const row: string[] = [];
    for (let x = 0; x < grid.width; x += 1) {
      row.push(String(tiles[index(grid, x, y, layer)]).padStart(4));
    }
    rows.push(row.join(" "));
  }
  return rows.join("\n");
}

describe("identificação de tile", () => {
  it("monta o id de um tile do tileset", () => {
    // 8 colunas por linha, começando em 384.
    expect(tilesetTileId(0, 0)).toBe(384);
    expect(tilesetTileId(1, 0)).toBe(385);
    expect(tilesetTileId(0, 1)).toBe(392);
  });

  it("monta o id de um autotile na forma cheia", () => {
    expect(autotileTileId(0)).toBe(48);
    expect(autotileTileId(6)).toBe(336);
  });

  it("reconhece a família de autotile", () => {
    expect(autotileFamily(48)).toBe(1);
    expect(autotileFamily(95)).toBe(1);
    expect(autotileFamily(96)).toBe(2);
    expect(autotileFamily(384)).toBeNull();
    expect(autotileFamily(0)).toBeNull();
  });
});

describe("pincel", () => {
  it("escreve uma célula", () => {
    const { tiles, changed } = paint(empty(), grid, {
      x: 2,
      y: 1,
      layer: 0,
      tileId: 400,
    });
    expect(changed).toBe(1);
    expect(tiles[index(grid, 2, 1, 0)]).toBe(400);
  });

  it("escreve um quadrado com pincel maior", () => {
    const { changed } = paint(empty(), grid, {
      x: 2,
      y: 1,
      layer: 0,
      tileId: 400,
      size: 3,
    });
    expect(changed).toBe(9);
  });

  it("recorta o pincel na borda em vez de estourar", () => {
    const { changed, tiles } = paint(empty(), grid, {
      x: 0,
      y: 0,
      layer: 0,
      tileId: 400,
      size: 3,
    });
    expect(changed).toBe(4);
    expect(tiles.length).toBe(CELLS);
  });

  it("não altera a grade original", () => {
    const before = empty();
    paint(before, grid, { x: 1, y: 1, layer: 0, tileId: 400 });
    expect(before.every((value) => value === 0)).toBe(true);
  });

  it("escreve só na camada pedida", () => {
    const { tiles } = paint(empty(), grid, { x: 1, y: 1, layer: 2, tileId: 400 });
    expect(tiles[index(grid, 1, 1, 0)]).toBe(0);
    expect(tiles[index(grid, 1, 1, 2)]).toBe(400);
  });

  it("apaga escrevendo zero", () => {
    const painted = paint(empty(), grid, { x: 1, y: 1, layer: 0, tileId: 400 }).tiles;
    const { tiles, changed } = paint(painted, grid, {
      x: 1,
      y: 1,
      layer: 0,
      tileId: 0,
    });
    expect(changed).toBe(1);
    expect(tiles[index(grid, 1, 1, 0)]).toBe(0);
  });

  it("recusa camada inexistente", () => {
    expect(() => paint(empty(), grid, { x: 0, y: 0, layer: 3, tileId: 1 })).toThrow(
      /camada 3/,
    );
  });

  it("recusa grade com tamanho errado", () => {
    expect(() =>
      paint(new Uint16Array(10), grid, { x: 0, y: 0, layer: 0, tileId: 1 }),
    ).toThrow(/10 celulas/);
  });
});

describe("forma de autotile", () => {
  it("a tabela tem uma entrada por combinação de vizinhos", () => {
    expect(NEIGHBOURS_TO_SHAPE).toHaveLength(256);
    for (const shape of NEIGHBOURS_TO_SHAPE) {
      expect(shape).toBeGreaterThanOrEqual(0);
      expect(shape).toBeLessThan(48);
    }
  });

  it("célula cercada por iguais vira a forma cheia", () => {
    // Pinta 3 por 3 e olha o miolo: todos os oito vizinhos são do mesmo
    // autotile, então a forma é a 0.
    const { tiles } = paint(empty(), grid, {
      x: 2,
      y: 1,
      layer: 0,
      tileId: autotileTileId(0),
      size: 3,
    });
    expect(tiles[index(grid, 2, 1, 0)]).toBe(autotileTileId(0));
  });

  it("célula sozinha no meio do mapa recebe forma de ilha", () => {
    const { tiles } = paint(empty(), grid, {
      x: 2,
      y: 1,
      layer: 0,
      tileId: autotileTileId(0),
    });
    // Vizinhos todos diferentes, ou seja entrada 0 da tabela, que é a forma
    // 46. Eu tinha chutado 47, que é o bloco do canto superior esquerdo do
    // molde; a ilha de verdade é montada com os quatro cantos externos.
    expect(NEIGHBOURS_TO_SHAPE[0]).toBe(46);
    expect(tiles[index(grid, 2, 1, 0)]).toBe(autotileTileId(0) + 46);
  });

  it("crescer o autotile refaz a borda do vizinho", () => {
    const first = paint(empty(), grid, {
      x: 1,
      y: 1,
      layer: 0,
      tileId: autotileTileId(0),
    }).tiles;
    const isolated = first[index(grid, 1, 1, 0)];

    const second = paint(first, grid, {
      x: 2,
      y: 1,
      layer: 0,
      tileId: autotileTileId(0),
    }).tiles;

    // A célula antiga deixou de ser ilha quando ganhou vizinho.
    expect(second[index(grid, 1, 1, 0)]).not.toBe(isolated);
    expect(autotileFamily(second[index(grid, 1, 1, 0)]!)).toBe(1);
  });

  it("fora do mapa conta como igual, então a borda não desenha contorno", () => {
    // Preenche a camada inteira com o autotile: nenhuma célula deve ficar com
    // forma de borda, porque fora do mapa conta como mais do mesmo.
    let tiles = empty();
    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        tiles = paint(tiles, grid, {
          x,
          y,
          layer: 0,
          tileId: autotileTileId(0),
        }).tiles;
      }
    }
    expect(draw(tiles)).toBe(
      ["  48   48   48   48   48", "  48   48   48   48   48",
       "  48   48   48   48   48", "  48   48   48   48   48"].join("\n"),
    );
  });

  it("tile normal não sofre recálculo", () => {
    const { tiles } = paint(empty(), grid, {
      x: 2,
      y: 1,
      layer: 0,
      tileId: 800,
      size: 3,
    });
    expect(tiles[index(grid, 2, 1, 0)]).toBe(800);
    expect(tiles[index(grid, 1, 1, 0)]).toBe(800);
  });
});
