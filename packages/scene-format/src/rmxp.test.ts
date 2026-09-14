import { describe, expect, it } from "vitest";
import {
  autotileIndex,
  autotileShape,
  blocksDirection,
  cellIndex,
  directionBit,
  isBush,
  isCounter,
  isImpassable,
  isOverhead,
  tileBitmapPosition,
  tileKind,
} from "./rmxp.js";

// Os numeros abaixo vieram de Game/essentials-v21.1/Data, nao de documentacao.
describe("classificacao de tile id", () => {
  it("trata 0 como celula vazia", () => {
    expect(tileKind(0)).toBe("empty");
  });

  it("trata a faixa de autotile", () => {
    expect(tileKind(48)).toBe("autotile");
    expect(tileKind(383)).toBe("autotile");
  });

  it("trata 384 em diante como tile normal", () => {
    // 385, 401 e 809 aparecem de fato na camada 0 de Lappet Town.
    expect(tileKind(384)).toBe("regular");
    expect(tileKind(385)).toBe("regular");
    expect(tileKind(809)).toBe("regular");
  });
});

describe("autotiles", () => {
  it("mapeia o slot para o indice de autotile_names", () => {
    // O slot 0 (ids 0..47) nao corresponde a nenhum autotile.
    expect(autotileIndex(48)).toBe(0);
    expect(autotileIndex(95)).toBe(0);
    expect(autotileIndex(96)).toBe(1);
    // O tileset "Outside" tem 7 autotiles, indices 0 a 6.
    expect(autotileIndex(336)).toBe(6);
    expect(autotileIndex(383)).toBe(6);
  });

  it("extrai a forma dentro do autotile", () => {
    expect(autotileShape(48)).toBe(0);
    expect(autotileShape(95)).toBe(47);
  });

  it("devolve null fora da faixa de autotile", () => {
    expect(autotileIndex(0)).toBeNull();
    expect(autotileIndex(384)).toBeNull();
    expect(autotileShape(384)).toBeNull();
  });
});

describe("posicao no bitmap do tileset", () => {
  it("usa 8 colunas", () => {
    expect(tileBitmapPosition(384)).toEqual({ column: 0, row: 0 });
    expect(tileBitmapPosition(385)).toEqual({ column: 1, row: 0 });
    expect(tileBitmapPosition(392)).toEqual({ column: 0, row: 1 });
  });

  it("devolve null para autotile e para celula vazia", () => {
    expect(tileBitmapPosition(0)).toBeNull();
    expect(tileBitmapPosition(100)).toBeNull();
  });
});

describe("tabela de passagem", () => {
  // A semantica abaixo foi conferida em Game_Map.rb do proprio Essentials,
  // extraido de Data/Scripts.rxdata, nao deduzida dos valores.
  it("reconhece bloqueio total", () => {
    // 15 e o valor mais comum no tileset "Poke Center": as quatro direcoes.
    expect(isImpassable(15)).toBe(true);
    expect(isImpassable(7)).toBe(false);
    expect(isImpassable(0)).toBe(false);
  });

  it("calcula o bit de direcao como o Essentials", () => {
    // bit = (1 << ((d / 2) - 1)) & 0x0f, com d no teclado numerico.
    expect(directionBit(2)).toBe(0x01); // baixo
    expect(directionBit(4)).toBe(0x02); // esquerda
    expect(directionBit(6)).toBe(0x04); // direita
    expect(directionBit(8)).toBe(0x08); // cima
  });

  it("bloqueia por direcao", () => {
    // 1 e 2 aparecem no tileset "Outside".
    expect(blocksDirection(1, 2)).toBe(true);
    expect(blocksDirection(1, 8)).toBe(false);
    expect(blocksDirection(2, 4)).toBe(true);
  });

  it("0x40 e mato alto, nao estrela", () => {
    // 64 aparece no tileset "Outside".
    expect(isBush(64)).toBe(true);
    expect(isBush(15)).toBe(false);
    expect(isCounter(64)).toBe(false);
  });

  it("143 e bloqueio total com balcao", () => {
    // 143 = 0x8F aparece no tileset "Poke Center": 0x0f mais 0x80.
    expect(isImpassable(143)).toBe(true);
    expect(isCounter(143)).toBe(true);
    expect(isBush(143)).toBe(false);
  });

  it("prioridade acima de zero e desenho por cima do jogador", () => {
    // O tileset "Outside" usa prioridades de 0 a 5.
    expect(isOverhead(0)).toBe(false);
    expect(isOverhead(1)).toBe(true);
    expect(isOverhead(5)).toBe(true);
  });
});

describe("indice de celula", () => {
  it("varre x primeiro, como o Table do XP", () => {
    // Lappet Town e 32x21.
    expect(cellIndex(0, 0, 0, 32, 21)).toBe(0);
    expect(cellIndex(1, 0, 0, 32, 21)).toBe(1);
    expect(cellIndex(0, 1, 0, 32, 21)).toBe(32);
    expect(cellIndex(0, 0, 1, 32, 21)).toBe(672);
  });
});
