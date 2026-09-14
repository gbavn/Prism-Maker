/**
 * Valores do Ruby, representados sem perda.
 *
 * O leitor devolve estas estruturas e nao strings e objetos JS diretos, porque
 * escrever de volta exige preservar o que o Ruby guardou: bytes originais das
 * strings, ordem das variaveis de instancia, identidade compartilhada entre
 * referencias. A camada tipada em rpg.ts e que traduz isso para algo
 * confortavel de usar.
 */

/** Um simbolo do Ruby, distinto de uma string. */
export class RubySymbol {
  constructor(readonly name: string) {}
  toString(): string {
    return this.name;
  }
}

/**
 * Uma string do Ruby.
 *
 * O Ruby guarda bytes, nao texto. Os nomes de mapa do Essentials vem em UTF-8
 * mesmo sem o marcador de encoding, entao `text` decodifica como UTF-8, mas
 * `bytes` continua disponivel para quem precisa do original.
 */
export class RubyString {
  /**
   * Mutavel de proposito. O Marshal registra a string na tabela de
   * referencias antes de ler as variaveis de instancia, e o marcador de
   * encoding vem justamente como uma delas. Criar uma string nova ao aplicar
   * o encoding quebraria a identidade compartilhada entre referencias.
   */
  encoding: string | null;

  constructor(readonly bytes: Uint8Array, encoding: string | null = null) {
    this.encoding = encoding;
  }

  get text(): string {
    return new TextDecoder("utf-8").decode(this.bytes);
  }

  toString(): string {
    return this.text;
  }
}

/** Um objeto comum do Ruby: nome da classe mais variaveis de instancia. */
export class RubyObject {
  readonly ivars = new Map<string, RubyValue>();
  constructor(readonly className: string) {}

  /** Le uma variavel de instancia pelo nome, com ou sem o arroba. */
  get(name: string): RubyValue | undefined {
    return this.ivars.get(name.startsWith("@") ? name : `@${name}`);
  }
}

/**
 * Um objeto que o Ruby serializa via `_dump` e `_load`, guardado como bytes.
 *
 * O RPG Maker usa isso para Table, Color e Tone. Quando o leitor conhece a
 * classe ele decodifica; quando nao conhece, preserva os bytes para conseguir
 * escrever de volta identico.
 */
export class RubyUserDefined {
  constructor(
    readonly className: string,
    readonly bytes: Uint8Array,
  ) {}
}

/**
 * A Table do RGSS: um array multidimensional de inteiros de 16 bits.
 *
 * E o que guarda a grade de tiles de um mapa e as tabelas de passagem,
 * prioridade e terrain tag de um tileset. O layout foi conferido contra os
 * arquivos reais: cinco inteiros de 32 bits com sinal (numero de dimensoes,
 * x, y, z, total) e depois os valores, sem sinal, com x variando primeiro.
 */
export class Table {
  constructor(
    readonly dimensions: number,
    readonly xSize: number,
    readonly ySize: number,
    readonly zSize: number,
    readonly data: Uint16Array,
  ) {}

  at(x: number, y: number, z = 0): number {
    const index = x + y * this.xSize + z * this.xSize * this.ySize;
    const value = this.data[index];
    if (value === undefined) {
      throw new RangeError(
        `celula (${x}, ${y}, ${z}) fora da Table ` +
          `${this.xSize}x${this.ySize}x${this.zSize}`,
      );
    }
    return value;
  }
}

export class RubyColor {
  constructor(
    readonly red: number,
    readonly green: number,
    readonly blue: number,
    readonly alpha: number,
  ) {}
}

export class RubyTone {
  constructor(
    readonly red: number,
    readonly green: number,
    readonly blue: number,
    readonly gray: number,
  ) {}
}

export type RubyValue =
  | null
  | boolean
  | number
  | bigint
  | RubySymbol
  | RubyString
  | RubyObject
  | RubyUserDefined
  | Table
  | RubyColor
  | RubyTone
  | RubyValue[]
  | Map<RubyValue, RubyValue>;
