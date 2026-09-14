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
   * Variaveis de instancia que vieram junto, na ordem original.
   *
   * Na pratica e o marcador de encoding. Guardar as entradas cruas, em vez de
   * so o encoding interpretado, e o que permite escrever o arquivo de volta
   * identico byte a byte.
   */
  readonly ivars = new Map<string, RubyValue>();

  constructor(readonly bytes: Uint8Array) {}

  /** Encoding declarado, ou null quando a string veio sem marcador. */
  get encoding(): string | null {
    const marker = this.ivars.get("E");
    if (marker === true) return "UTF-8";
    if (marker === false) return "US-ASCII";
    const named = this.ivars.get("encoding");
    return named instanceof RubyString ? named.text : null;
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

/**
 * Um Float do Ruby.
 *
 * Precisa ser um tipo proprio porque o JS nao distingue 98 de 98.0, e o
 * Marshal distingue: o primeiro vira "i", o segundo vira "f". Sem essa
 * separacao, reescrever um arquivo trocaria silenciosamente o tipo.
 */
export class RubyFloat {
  constructor(readonly value: number) {}
  valueOf(): number {
    return this.value;
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
  | RubyFloat
  | RubyObject
  | RubyUserDefined
  | Table
  | RubyColor
  | RubyTone
  | RubyValue[]
  | Map<RubyValue, RubyValue>;

/**
 * Subclasses de Array, Hash e String, e variaveis de instancia soltas.
 *
 * O Marshal tem um tipo proprio para "isto e um Array, mas de uma subclasse"
 * e permite pendurar variaveis de instancia em qualquer objeto. O Essentials
 * usa as duas coisas: `PBAnimations < Array` e `PBAnimation < Array`, no
 * PkmnAnimations.rxdata, guardam id, nome, grafico e posicao ao lado dos
 * elementos.
 *
 * Um Array de JS nao tem onde guardar isso sem virar outro tipo, e trocar o
 * tipo quebraria a identidade que a tabela de referencias do Marshal precisa
 * preservar. Por isso a informacao fica em tabelas laterais, atreladas a
 * identidade do objeto.
 */
const subclassNames = new WeakMap<object, string>();
const looseIvars = new WeakMap<object, Map<string, RubyValue>>();

/** Marca o valor como pertencente a uma subclasse de Array, Hash ou String. */
export function setRubyClass(value: object, className: string): void {
  subclassNames.set(value, className);
}

export function getRubyClass(value: object): string | undefined {
  return subclassNames.get(value);
}

/** Variaveis de instancia penduradas em um Array, Hash ou outro valor. */
export function rubyIvars(value: object): Map<string, RubyValue> {
  let ivars = looseIvars.get(value);
  if (ivars === undefined) {
    ivars = new Map<string, RubyValue>();
    looseIvars.set(value, ivars);
  }
  return ivars;
}

export function peekRubyIvars(
  value: object,
): Map<string, RubyValue> | undefined {
  return looseIvars.get(value);
}
