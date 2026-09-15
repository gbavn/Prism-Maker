import { describe, expect, it } from "vitest";
import {
  autotileFamily,
  autotileTileId,
  brushFootprint,
  fillRect,
  floodFill,
  index,
  NEIGHBOURS_TO_SHAPE,
  paint,
  singleStamp,
  stampAt,
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

describe("carimbo", () => {
  it("um tile só cai centrado na célula, como o lápis", () => {
    const { tiles, changed } = stampAt(empty(), grid, {
      x: 2,
      y: 1,
      layer: 0,
      stamp: singleStamp(400),
    });
    expect(changed).toBe(1);
    expect(tiles[index(grid, 2, 1, 0)]).toBe(400);
  });

  it("um tile só ainda obedece ao pincel", () => {
    const { changed } = stampAt(empty(), grid, {
      x: 2,
      y: 1,
      layer: 0,
      stamp: singleStamp(400),
      size: 3,
    });
    expect(changed).toBe(9);
  });

  it("um bloco cai com o canto na célula clicada", () => {
    const stamp = {
      width: 2,
      height: 2,
      tiles: [400, 401, 408, 409],
    };
    const { tiles, changed } = stampAt(empty(), grid, {
      x: 1,
      y: 1,
      layer: 0,
      stamp,
    });
    expect(changed).toBe(4);
    expect(draw(tiles)).toBe(
      [
        "   0    0    0    0    0",
        "   0  400  401    0    0",
        "   0  408  409    0    0",
        "   0    0    0    0    0",
      ].join("\n"),
    );
  });

  it("o bloco manda no pincel, que só vale para um tile só", () => {
    const stamp = { width: 2, height: 1, tiles: [400, 401] };
    const { changed } = stampAt(empty(), grid, {
      x: 0,
      y: 0,
      layer: 0,
      stamp,
      size: 5,
    });
    expect(changed).toBe(2);
  });
});

describe("retângulo", () => {
  it("preenche entre os dois cantos, em qualquer ordem", () => {
    const one = fillRect(empty(), grid, {
      layer: 0,
      stamp: singleStamp(400),
      from: { x: 1, y: 1 },
      to: { x: 3, y: 2 },
    });
    const other = fillRect(empty(), grid, {
      layer: 0,
      stamp: singleStamp(400),
      from: { x: 3, y: 2 },
      to: { x: 1, y: 1 },
    });
    expect(one.changed).toBe(6);
    expect(draw(one.tiles)).toBe(draw(other.tiles));
  });

  it("repete o bloco em vez de esticar", () => {
    const stamp = { width: 2, height: 1, tiles: [400, 401] };
    const { tiles } = fillRect(empty(), grid, {
      layer: 0,
      stamp,
      from: { x: 0, y: 0 },
      to: { x: 4, y: 0 },
    });
    expect(draw(tiles).split("\n")[0]).toBe(" 400  401  400  401  400");
  });

  it("recorta na borda em vez de estourar", () => {
    const { changed } = fillRect(empty(), grid, {
      layer: 0,
      stamp: singleStamp(400),
      from: { x: 3, y: 2 },
      to: { x: 9, y: 9 },
    });
    expect(changed).toBe(4);
  });
});

describe("balde", () => {
  it("troca a região ligada e para na borda de outro tile", () => {
    const start = empty();
    // Uma parede vertical no meio: o balde à esquerda não passa dela.
    for (let y = 0; y < grid.height; y += 1) start[index(grid, 2, y, 0)] = 400;

    const { tiles, changed } = floodFill(start, grid, {
      x: 0,
      y: 0,
      layer: 0,
      stamp: singleStamp(401),
    });
    expect(changed).toBe(grid.height * 2);
    expect(tiles[index(grid, 3, 0, 0)]).toBe(0);
  });

  it("um lago inteiro conta como uma região só", () => {
    // Duas células de água vizinhas já têm formas diferentes gravadas, e é
    // por isso que a comparação é por família e não por id.
    const start = empty();
    const water = autotileTileId(0);
    const grown = paint(start, grid, { x: 1, y: 1, layer: 0, tileId: water });
    const lake = paint(grown.tiles, grid, {
      x: 2,
      y: 1,
      layer: 0,
      tileId: water,
    });
    expect(lake.tiles[index(grid, 1, 1, 0)]).not.toBe(
      lake.tiles[index(grid, 2, 1, 0)],
    );

    const { changed } = floodFill(lake.tiles, grid, {
      x: 1,
      y: 1,
      layer: 0,
      stamp: singleStamp(400),
    });
    expect(changed).toBe(2);
  });

  it("atravessa um mapa grande sem estourar a pilha", () => {
    const big = { width: 200, height: 200 };
    const tiles = new Uint16Array(big.width * big.height * 3);
    const { changed } = floodFill(tiles, big, {
      x: 0,
      y: 0,
      layer: 0,
      stamp: singleStamp(400),
    });
    expect(changed).toBe(big.width * big.height);
  });

  it("clicar fora do mapa não faz nada", () => {
    const { changed } = floodFill(empty(), grid, {
      x: 99,
      y: 0,
      layer: 0,
      stamp: singleStamp(400),
    });
    expect(changed).toBe(0);
  });
});

describe("área do pincel", () => {
  it("um tile só com pincel 1 cobre a célula clicada", () => {
    expect(brushFootprint(singleStamp(400), 1)).toEqual({
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });
  });

  it("um tile só com pincel maior cobre um quadrado centrado", () => {
    expect(brushFootprint(singleStamp(400), 5)).toEqual({
      left: -2,
      top: -2,
      width: 5,
      height: 5,
    });
  });

  it("um bloco manda no pincel e ancora no canto", () => {
    const stamp = { width: 3, height: 2, tiles: [1, 2, 3, 4, 5, 6] };
    expect(brushFootprint(stamp, 5)).toEqual({
      left: 0,
      top: 0,
      width: 3,
      height: 2,
    });
  });

  it("bate com o que o carimbo escreve de verdade", () => {
    // A área desenhada pelo cursor e a área escrita têm que ser a mesma, ou o
    // cursor mente. Aqui as duas são comparadas contagem por contagem, longe
    // da borda para o recorte do mapa não entrar na conta.
    const wide = { width: 9, height: 9 };
    const tiles = new Uint16Array(wide.width * wide.height * 3);

    for (const size of [1, 3, 5]) {
      const area = brushFootprint(singleStamp(400), size);
      const { changed } = stampAt(tiles, wide, {
        x: 4,
        y: 4,
        layer: 0,
        stamp: singleStamp(400),
        size,
      });
      expect(changed).toBe(area.width * area.height);
    }
  });
});
