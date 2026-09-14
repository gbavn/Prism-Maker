import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dump } from "./dump.js";
import { load } from "./load.js";
import { RubyFloat, RubyString } from "./values.js";

const dataDir = fileURLToPath(
  new URL("../../../../Game/essentials-v21.1/Data/", import.meta.url),
);

function read(name: string): Uint8Array {
  return new Uint8Array(readFileSync(dataDir + name));
}

/**
 * O teste que importa de verdade.
 *
 * Ler e escrever de volta tem que dar exatamente os mesmos bytes. Isso pega
 * em um golpe so a ordem da tabela de referencias, a escolha de
 * representacao do inteiro compacto, a ordem das variaveis de instancia e a
 * reconstrucao das Tables. E e o que garante que salvar um mapa pelo editor
 * nao produza um diff gigante em um projeto que a pessoa continua abrindo no
 * RPG Maker.
 */
describe("ida e volta nos arquivos reais do Essentials", () => {
  const files = readdirSync(dataDir)
    .filter((name) => name.endsWith(".rxdata"))
    .sort();

  it("encontra os arquivos de dados", () => {
    expect(files.length).toBeGreaterThan(80);
  });

  for (const name of files) {
    it(`reescreve ${name} identico`, () => {
      const original = read(name);
      const rewritten = dump(load(original));
      expect(rewritten.length).toBe(original.length);
      // Comparar posicao a posicao daria uma mensagem de erro gigante; o
      // indice do primeiro byte diferente e muito mais util para depurar.
      let firstDifference = -1;
      for (let i = 0; i < original.length; i += 1) {
        if (original[i] !== rewritten[i]) {
          firstDifference = i;
          break;
        }
      }
      expect(firstDifference).toBe(-1);
    });
  }
});

describe("escrita de valores isolados", () => {
  function roundTrip(bytes: number[]): number[] {
    return [...dump(load(new Uint8Array([4, 8, ...bytes])))].slice(2);
  }

  it("reproduz a borda do inteiro compacto", () => {
    for (const bytes of [
      [105, 0],
      [105, 127],
      [105, 1, 123],
      [105, 128],
      [105, 255, 132],
      [105, 2, 44, 1],
      [105, 254, 212, 254],
      [105, 4, 255, 255, 255, 63],
      [105, 252, 0, 0, 0, 192],
    ]) {
      expect(roundTrip(bytes)).toEqual(bytes);
    }
  });

  it("reproduz string com marcador de encoding", () => {
    const bytes = [73, 34, 8, 97, 98, 99, 6, 58, 6, 69, 84];
    expect(roundTrip(bytes)).toEqual(bytes);
  });

  it("reproduz string sem marcador", () => {
    const bytes = [34, 8, 97, 98, 99];
    const value = load(new Uint8Array([4, 8, ...bytes]));
    expect((value as RubyString).encoding).toBeNull();
    expect(roundTrip(bytes)).toEqual(bytes);
  });

  it("reproduz referencia compartilhada", () => {
    const bytes = [
      91, 7, 73, 34, 18, 99, 111, 109, 112, 97, 114, 116, 105, 108, 104, 97,
      100, 97, 6, 58, 6, 69, 84, 64, 6,
    ];
    expect(roundTrip(bytes)).toEqual(bytes);
  });

  it("reproduz symlink", () => {
    const bytes = [91, 9, 58, 6, 97, 58, 6, 98, 59, 0, 59, 6];
    expect(roundTrip(bytes)).toEqual(bytes);
  });

  it("reproduz float", () => {
    expect(roundTrip([102, 8, 49, 46, 53])).toEqual([102, 8, 49, 46, 53]);
  });

  /**
   * O texto de um Float nao e obvio: o Ruby escolhe entre forma decimal e
   * exponencial pela posicao do ponto, nao pela magnitude. Os pares abaixo
   * saem de Marshal.dump do Ruby 3.3.
   */
  it("escreve Float no mesmo texto que o Ruby", () => {
    const cases: [number, string][] = [
      [0, "0"],
      [-0, "-0"],
      [1.5, "1.5"],
      [-2.75, "-2.75"],
      [98, "98"],
      [300.8, "300.8"],
      [1000, "1e3"],
      [123456789, "123456789"],
      [0.001, "0.001"],
      [0.0001, "0.0001"],
      [0.00001, "1e-5"],
      [1e15, "1e15"],
      [1e20, "1e20"],
      [1 / 3, "0.3333333333333333"],
      [5e-324, "5e-324"],
      [1.7976931348623157e308, "1.7976931348623157e308"],
      [Number.POSITIVE_INFINITY, "inf"],
      [Number.NEGATIVE_INFINITY, "-inf"],
      [Number.NaN, "nan"],
    ];

    for (const [value, want] of cases) {
      const written = dump(new RubyFloat(value));
      const text = new TextDecoder().decode(written.slice(4));
      expect(`${value}: ${text}`).toBe(`${value}: ${want}`);
    }
  });

  it("recusa escrever um number nao inteiro sem RubyFloat", () => {
    // Sem isso, 98.0 viraria o inteiro 98 silenciosamente ao salvar.
    expect(() => dump(1.5)).toThrow(/RubyFloat/);
  });
});
