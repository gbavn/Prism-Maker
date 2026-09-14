import { describe, expect, it } from "vitest";
import { load, MarshalError } from "./load.js";
import { RubyString, RubySymbol } from "./values.js";

/**
 * Os bytes de cada caso saem de `Marshal.dump` do Ruby 3.3, nao de leitura
 * manual da especificacao. O caso mais escorregadio e o inteiro compacto, que
 * muda de representacao em 122, 123, -123 e -124.
 */
function bytes(...values: number[]): Uint8Array {
  return new Uint8Array([4, 8, ...values]);
}

describe("valores simples", () => {
  it("nil, true e false", () => {
    expect(load(bytes(0x30))).toBeNull();
    expect(load(bytes(0x54))).toBe(true);
    expect(load(bytes(0x46))).toBe(false);
  });
});

describe("inteiro compacto", () => {
  const cases: [string, Uint8Array, number][] = [
    ["zero", bytes(105, 0), 0],
    ["um", bytes(105, 6), 1],
    ["menos um", bytes(105, 250), -1],
    ["122, ainda em um byte", bytes(105, 127), 122],
    ["123, ja com contagem", bytes(105, 1, 123), 123],
    ["menos 123, ainda em um byte", bytes(105, 128), -123],
    ["menos 124, ja com contagem", bytes(105, 255, 132), -124],
    ["300, dois bytes", bytes(105, 2, 44, 1), 300],
    ["menos 300, dois bytes", bytes(105, 254, 212, 254), -300],
    ["70000, tres bytes", bytes(105, 3, 112, 17, 1), 70000],
    ["16777216, quatro bytes", bytes(105, 4, 0, 0, 0, 1), 16777216],
    ["maior fixnum", bytes(105, 4, 255, 255, 255, 63), 1073741823],
    ["menor fixnum", bytes(105, 252, 0, 0, 0, 192), -1073741824],
  ];

  for (const [name, input, want] of cases) {
    it(name, () => {
      expect(load(input)).toBe(want);
    });
  }
});

describe("strings e simbolos", () => {
  it("le uma string com marcador de encoding", () => {
    const value = load(bytes(73, 34, 8, 97, 98, 99, 6, 58, 6, 69, 84));
    expect(value).toBeInstanceOf(RubyString);
    expect((value as RubyString).text).toBe("abc");
    expect((value as RubyString).encoding).toBe("UTF-8");
  });

  it("decodifica acento", () => {
    const value = load(
      bytes(73, 34, 13, 80, 111, 107, 195, 169, 109, 111, 110, 6, 58, 6, 69, 84),
    );
    expect((value as RubyString).text).toBe("Pokémon");
  });

  it("resolve referencia de simbolo", () => {
    // [:a, :b, :a, :b] com os dois ultimos como symlink.
    const value = load(bytes(91, 9, 58, 6, 97, 58, 6, 98, 59, 0, 59, 6));
    const symbols = value as RubySymbol[];
    expect(symbols.map((s) => s.name)).toEqual(["a", "b", "a", "b"]);
    expect(symbols[0]).toBe(symbols[2]);
  });
});

describe("referencia de objeto", () => {
  it("preserva identidade compartilhada", () => {
    // [s, s] com a mesma string nas duas posicoes.
    const value = load(
      bytes(
        91, 7, 73, 34, 18, 99, 111, 109, 112, 97, 114, 116, 105, 108, 104, 97,
        100, 97, 6, 58, 6, 69, 84, 64, 6,
      ),
    );
    const list = value as RubyString[];
    expect(list).toHaveLength(2);
    expect(list[0]).toBe(list[1]);
    expect(list[0]?.text).toBe("compartilhada");
  });
});

describe("colecoes", () => {
  it("le um Hash", () => {
    const value = load(
      bytes(
        123, 7, 105, 6, 73, 34, 7, 117, 109, 6, 58, 6, 69, 84, 105, 7, 73, 34,
        9, 100, 111, 105, 115, 6, 59, 0, 84,
      ),
    );
    const map = value as Map<number, RubyString>;
    expect(map.size).toBe(2);
    expect(map.get(1)?.text).toBe("um");
    expect(map.get(2)?.text).toBe("dois");
  });

  it("le arrays aninhados", () => {
    const value = load(
      bytes(
        123, 6, 73, 34, 10, 108, 105, 115, 116, 97, 6, 58, 6, 69, 84, 91, 7,
        105, 6, 91, 7, 105, 7, 91, 6, 105, 8,
      ),
    );
    const map = value as Map<RubyString, unknown>;
    const [entry] = [...map.entries()];
    expect(entry?.[0]).toBeInstanceOf(RubyString);
    expect(entry?.[1]).toEqual([1, [2, [3]]]);
  });

  it("le float", () => {
    expect(load(bytes(102, 8, 49, 46, 53))).toBe(1.5);
  });
});

describe("erros", () => {
  it("recusa versao diferente", () => {
    expect(() => load(new Uint8Array([5, 0, 0x30]))).toThrow(MarshalError);
  });

  it("recusa tipo desconhecido", () => {
    expect(() => load(bytes(0x5a))).toThrow(/tipo Marshal nao suportado/);
  });

  it("recusa dados truncados", () => {
    expect(() => load(bytes(34, 20, 97))).toThrow(/esperava/);
  });
});
