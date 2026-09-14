import { MARSHAL_MAJOR, MARSHAL_MINOR, MarshalError } from "./load.js";
import {
  getRubyClass,
  peekRubyIvars,
  RubyColor,
  RubyFloat,
  RubyObject,
  RubyString,
  RubySymbol,
  RubyTone,
  RubyUserDefined,
  Table,
  type RubyValue,
} from "./values.js";

/**
 * Escritor do formato Marshal 4.8.
 *
 * O objetivo e mais estrito que "gerar algo que o Ruby leia": ler um .rxdata
 * e escrever de volta tem que produzir os mesmos bytes. O teste de ida e
 * volta cobre os 110 arquivos de Data do Essentials. Isso importa porque o
 * editor vai reescrever mapas dentro de um projeto que a pessoa continua
 * abrindo no RPG Maker, e um diff gigante a cada salvamento seria inaceitavel.
 */

class Writer {
  private readonly chunks: number[] = [];
  private readonly symbols = new Map<string, number>();
  private readonly objects = new Map<object, number>();

  byte(value: number): void {
    this.chunks.push(value & 0xff);
  }

  bytes(values: Uint8Array): void {
    for (const value of values) this.chunks.push(value);
  }

  /**
   * Inteiro compacto, seguindo `w_long` do marshal.c passo a passo.
   *
   * A troca de representacao acontece em 122 para 123 e em -123 para -124, e
   * errar essa borda gera arquivos que o Ruby le com valores diferentes.
   */
  fixnum(value: number): void {
    if (!Number.isInteger(value)) {
      throw new MarshalError(`${value} nao e inteiro`, this.chunks.length);
    }
    if (value === 0) return this.byte(0);
    if (value > 0 && value < 123) return this.byte(value + 5);
    if (value < 0 && value > -124) return this.byte(value - 5);

    const out: number[] = [];
    let rest = value;
    for (let i = 1; i < 5; i += 1) {
      out.push(rest & 0xff);
      rest >>= 8;
      if (rest === 0) {
        this.byte(i);
        break;
      }
      if (rest === -1) {
        this.byte(-i);
        break;
      }
      if (i === 4) {
        throw new MarshalError(
          `${value} nao cabe em um Fixnum`,
          this.chunks.length,
        );
      }
    }
    for (const b of out) this.byte(b);
  }

  symbol(name: string): void {
    const known = this.symbols.get(name);
    if (known !== undefined) {
      this.byte(0x3b); // ";"
      this.fixnum(known);
      return;
    }
    this.symbols.set(name, this.symbols.size);
    this.byte(0x3a); // ":"
    const encoded = new TextEncoder().encode(name);
    this.fixnum(encoded.length);
    this.bytes(encoded);
  }

  /**
   * Emite uma referencia se o objeto ja foi escrito.
   *
   * A tabela e alimentada na mesma ordem em que o leitor a alimenta, o que
   * faz os indices baterem com os do arquivo original.
   */
  linkOrRegister(value: object): boolean {
    const known = this.objects.get(value);
    if (known !== undefined) {
      this.byte(0x40); // "@"
      this.fixnum(known);
      return true;
    }
    this.objects.set(value, this.objects.size);
    return false;
  }

  finish(): Uint8Array {
    return new Uint8Array(this.chunks);
  }
}

function tableBytes(table: Table): Uint8Array {
  const out = new Uint8Array(20 + table.data.length * 2);
  const view = new DataView(out.buffer);
  view.setInt32(0, table.dimensions, true);
  view.setInt32(4, table.xSize, true);
  view.setInt32(8, table.ySize, true);
  view.setInt32(12, table.zSize, true);
  view.setInt32(16, table.data.length, true);
  for (let i = 0; i < table.data.length; i += 1) {
    view.setUint16(20 + i * 2, table.data[i] as number, true);
  }
  return out;
}

function colorLikeBytes(values: [number, number, number, number]): Uint8Array {
  const out = new Uint8Array(32);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  return out;
}

/**
 * Texto de um Float como o Ruby escreve.
 *
 * O Ruby usa os digitos mais curtos que voltam ao mesmo valor e decide entre
 * forma decimal e exponencial por duas condicoes: a posicao do ponto antes do
 * primeiro digito significativo (`decpt`) menor que -3, ou maior que a
 * quantidade de digitos. Por isso 1000.0 sai como "1e3" e nao como "1000",
 * enquanto 123456789.0 sai inteiro.
 *
 * Conferido contra Marshal.dump do Ruby 3.3 em 238 valores, entre casos de
 * borda e sorteados.
 */
function floatText(value: number): string {
  if (Number.isNaN(value)) return "nan";
  if (value === Number.POSITIVE_INFINITY) return "inf";
  if (value === Number.NEGATIVE_INFINITY) return "-inf";
  if (value === 0) return Object.is(value, -0) ? "-0" : "0";

  const exponential = Math.abs(value).toExponential();
  const [mantissa = "", exponentText = "0"] = exponential.split("e");
  const digits = mantissa.replace(".", "");
  const decpt = Number(exponentText) + 1;
  const sign = value < 0 ? "-" : "";

  if (decpt < -3 || decpt > digits.length) {
    const head = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    return `${sign}${head}e${decpt - 1}`;
  }
  if (decpt > 0) {
    return decpt < digits.length
      ? `${sign}${digits.slice(0, decpt)}.${digits.slice(decpt)}`
      : `${sign}${digits}`;
  }
  return `${sign}0.${"0".repeat(-decpt)}${digits}`;
}

/**
 * Escreve um Array, Hash ou String considerando subclasse e variaveis de
 * instancia soltas.
 *
 * A ordem dos prefixos segue o Marshal: "I" por fora, "C" por dentro, e o
 * corpo por ultimo.
 */
function writeWrapped(
  writer: Writer,
  value: object,
  writeBody: () => void,
): void {
  const ivars = peekRubyIvars(value);
  const className = getRubyClass(value);
  const hasIvars = ivars !== undefined && ivars.size > 0;

  if (hasIvars) writer.byte(0x49); // "I"
  if (className !== undefined) {
    writer.byte(0x43); // "C"
    writer.symbol(className);
  }
  writeBody();

  if (hasIvars) {
    writer.fixnum(ivars.size);
    for (const [name, ivar] of ivars) {
      writer.symbol(name);
      writeValue(writer, ivar);
    }
  }
}

function writeValue(writer: Writer, value: RubyValue): void {
  if (value === null) return writer.byte(0x30); // "0"
  if (value === true) return writer.byte(0x54); // "T"
  if (value === false) return writer.byte(0x46); // "F"

  if (typeof value === "number" && Number.isInteger(value)) {
    writer.byte(0x69); // "i"
    return writer.fixnum(value);
  }

  if (value instanceof RubySymbol) {
    return writer.symbol(value.name);
  }

  if (value instanceof RubyFloat) {
    if (writer.linkOrRegister(value)) return;
    writer.byte(0x66); // "f"
    const encoded = new TextEncoder().encode(floatText(value.value));
    writer.fixnum(encoded.length);
    return writer.bytes(encoded);
  }

  if (typeof value === "number") {
    throw new MarshalError(
      `${value} nao e inteiro; envolva em RubyFloat para escrever como Float`,
      0,
    );
  }

  if (typeof value === "bigint") {
    writer.byte(0x6c); // "l"
    writer.byte(value < 0n ? 0x2d : 0x2b);
    let rest = value < 0n ? -value : value;
    const words: number[] = [];
    while (rest > 0n) {
      words.push(Number(rest & 0xffffn));
      rest >>= 16n;
    }
    writer.fixnum(words.length);
    for (const word of words) {
      writer.byte(word & 0xff);
      writer.byte((word >> 8) & 0xff);
    }
    return;
  }

  if (value instanceof RubyString) {
    if (writer.linkOrRegister(value)) return;
    const className = getRubyClass(value);
    const hasIvars = value.ivars.size > 0;

    if (hasIvars) writer.byte(0x49); // "I"
    if (className !== undefined) {
      writer.byte(0x43); // "C"
      writer.symbol(className);
    }
    writer.byte(0x22); // '"'
    writer.fixnum(value.bytes.length);
    writer.bytes(value.bytes);

    if (hasIvars) {
      writer.fixnum(value.ivars.size);
      for (const [name, ivar] of value.ivars) {
        writer.symbol(name);
        writeValue(writer, ivar);
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    if (writer.linkOrRegister(value)) return;
    return writeWrapped(writer, value, () => {
      writer.byte(0x5b); // "["
      writer.fixnum(value.length);
      for (const item of value) writeValue(writer, item);
    });
  }

  if (value instanceof Map) {
    if (writer.linkOrRegister(value)) return;
    return writeWrapped(writer, value, () => {
      writer.byte(0x7b); // "{"
      writer.fixnum(value.size);
      for (const [key, item] of value) {
        writeValue(writer, key);
        writeValue(writer, item);
      }
    });
  }

  if (value instanceof RubyObject) {
    if (writer.linkOrRegister(value)) return;
    writer.byte(0x6f); // "o"
    writer.symbol(value.className);
    writer.fixnum(value.ivars.size);
    for (const [name, ivar] of value.ivars) {
      writer.symbol(name);
      writeValue(writer, ivar);
    }
    return;
  }

  if (
    value instanceof Table ||
    value instanceof RubyColor ||
    value instanceof RubyTone ||
    value instanceof RubyUserDefined
  ) {
    if (writer.linkOrRegister(value)) return;
    const [className, payload] =
      value instanceof Table
        ? (["Table", tableBytes(value)] as const)
        : value instanceof RubyColor
          ? ([
              "Color",
              colorLikeBytes([value.red, value.green, value.blue, value.alpha]),
            ] as const)
          : value instanceof RubyTone
            ? ([
                "Tone",
                colorLikeBytes([value.red, value.green, value.blue, value.gray]),
              ] as const)
            : ([value.className, value.bytes] as const);

    writer.byte(0x75); // "u"
    writer.symbol(className);
    writer.fixnum(payload.length);
    return writer.bytes(payload);
  }

  throw new MarshalError(
    `valor nao suportado na escrita: ${Object.prototype.toString.call(value)}`,
    0,
  );
}

/** Escreve um documento Marshal 4.8 inteiro. */
export function dump(value: RubyValue): Uint8Array {
  const writer = new Writer();
  writer.byte(MARSHAL_MAJOR);
  writer.byte(MARSHAL_MINOR);
  writeValue(writer, value);
  return writer.finish();
}
