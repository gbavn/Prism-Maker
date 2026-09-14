import {
  RubyColor,
  RubyObject,
  RubyString,
  RubySymbol,
  RubyTone,
  RubyUserDefined,
  Table,
  type RubyValue,
} from "./values.js";

/**
 * Leitor do formato Marshal 4.8 do Ruby.
 *
 * Cobre o subconjunto que o RPG Maker XP realmente usa. Cada tipo aqui foi
 * exercitado contra os .rxdata reais do Essentials v21.1; nada foi incluido
 * "por via das duvidas" sem aparecer nos arquivos.
 */

export const MARSHAL_MAJOR = 4;
export const MARSHAL_MINOR = 8;

export class MarshalError extends Error {
  constructor(message: string, readonly offset: number) {
    super(`${message} (byte ${offset})`);
    this.name = "MarshalError";
  }
}

class Reader {
  offset = 0;
  /**
   * Tabela de objetos. O Marshal referencia objetos ja lidos por indice, o
   * que preserva identidade compartilhada e permite ciclos. Fixnum, simbolo,
   * nil, true e false nao entram aqui.
   */
  private readonly objects: RubyValue[] = [];
  /** Tabela de simbolos, separada da de objetos. */
  private readonly symbols: RubySymbol[] = [];

  constructor(private readonly bytes: Uint8Array) {}

  private fail(message: string): never {
    throw new MarshalError(message, this.offset);
  }

  byte(): number {
    const value = this.bytes[this.offset];
    if (value === undefined) this.fail("fim inesperado dos dados");
    this.offset += 1;
    return value;
  }

  signedByte(): number {
    const value = this.byte();
    return value >= 0x80 ? value - 0x100 : value;
  }

  slice(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) {
      this.fail(`esperava ${length} bytes`);
    }
    const out = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }

  /**
   * Inteiro no formato compacto do Marshal.
   *
   * O primeiro byte, com sinal, decide tudo: 0 e zero; acima de 4 e o proprio
   * valor menos 5; abaixo de -4 e o valor mais 5; qualquer outro e a
   * quantidade de bytes que seguem, em little endian.
   */
  fixnum(): number {
    const first = this.signedByte();
    if (first === 0) return 0;
    if (first > 4) return first - 5;
    if (first < -4) return first + 5;

    const count = Math.abs(first);
    let value = first > 0 ? 0 : -1;
    for (let i = 0; i < count; i += 1) {
      const mask = 0xff << (8 * i);
      value = (value & ~mask) | (this.byte() << (8 * i));
    }
    // Volta para inteiro com sinal de 32 bits sem depender de operadores que
    // saturam, e depois normaliza para Number.
    return first > 0 ? value >>> 0 : value | 0;
  }

  /** Reserva uma posicao na tabela antes de ler o conteudo. */
  reserve(): number {
    const index = this.objects.length;
    this.objects.push(null);
    return index;
  }

  place(index: number, value: RubyValue): RubyValue {
    this.objects[index] = value;
    return value;
  }

  register(value: RubyValue): RubyValue {
    this.objects.push(value);
    return value;
  }

  objectAt(index: number): RubyValue {
    if (index < 0 || index >= this.objects.length) {
      this.fail(`referencia de objeto ${index} fora da tabela`);
    }
    return this.objects[index] as RubyValue;
  }

  addSymbol(symbol: RubySymbol): RubySymbol {
    this.symbols.push(symbol);
    return symbol;
  }

  symbolAt(index: number): RubySymbol {
    const symbol = this.symbols[index];
    if (symbol === undefined) this.fail(`referencia de simbolo ${index}`);
    return symbol;
  }
}

/** Decodifica os bytes de uma Table serializada pelo RGSS. */
function readTable(bytes: Uint8Array): Table {
  if (bytes.length < 20) {
    throw new MarshalError("Table com cabecalho curto", 0);
  }
  const header = new DataView(bytes.buffer, bytes.byteOffset, 20);
  const dimensions = header.getInt32(0, true);
  const xSize = header.getInt32(4, true);
  const ySize = header.getInt32(8, true);
  const zSize = header.getInt32(12, true);
  const total = header.getInt32(16, true);

  const expected = 20 + total * 2;
  if (bytes.length < expected) {
    throw new MarshalError(
      `Table diz ter ${total} valores, mas so ha ${(bytes.length - 20) / 2}`,
      0,
    );
  }

  // Copia em vez de usar uma view: o buffer de origem e a leitura inteira do
  // arquivo, e manter uma view viva o prenderia na memoria.
  const data = new Uint16Array(total);
  const view = new DataView(bytes.buffer, bytes.byteOffset + 20, total * 2);
  for (let i = 0; i < total; i += 1) data[i] = view.getUint16(i * 2, true);

  return new Table(dimensions, xSize, ySize, zSize, data);
}

function readColorLike(bytes: Uint8Array): [number, number, number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [
    view.getFloat64(0, true),
    view.getFloat64(8, true),
    view.getFloat64(16, true),
    view.getFloat64(24, true),
  ];
}

function decodeUserDefined(className: string, bytes: Uint8Array): RubyValue {
  switch (className) {
    case "Table":
      return readTable(bytes);
    case "Color": {
      const [r, g, b, a] = readColorLike(bytes);
      return new RubyColor(r, g, b, a);
    }
    case "Tone": {
      const [r, g, b, gray] = readColorLike(bytes);
      return new RubyTone(r, g, b, gray);
    }
    default:
      return new RubyUserDefined(className, bytes);
  }
}

function readValue(reader: Reader): RubyValue {
  const type = String.fromCharCode(reader.byte());

  switch (type) {
    case "0":
      return null;
    case "T":
      return true;
    case "F":
      return false;
    case "i":
      return reader.fixnum();

    case ":": {
      const length = reader.fixnum();
      const name = new TextDecoder("utf-8").decode(reader.slice(length));
      return reader.addSymbol(new RubySymbol(name));
    }
    case ";":
      return reader.symbolAt(reader.fixnum());
    case "@":
      return reader.objectAt(reader.fixnum());

    case '"': {
      const length = reader.fixnum();
      const value = new RubyString(new Uint8Array(reader.slice(length)));
      return reader.register(value);
    }

    case "I": {
      // Objeto com variaveis de instancia anexadas. Na pratica, no RPG Maker,
      // sao strings carregando o marcador de encoding.
      const inner = readValue(reader);
      const count = reader.fixnum();
      let encoding: string | null = null;

      for (let i = 0; i < count; i += 1) {
        const key = readValue(reader);
        const value = readValue(reader);
        const name = key instanceof RubySymbol ? key.name : "";
        if (name === "E") encoding = value === true ? "UTF-8" : "US-ASCII";
        else if (name === "encoding" && value instanceof RubyString) {
          encoding = value.text;
        }
      }

      // Altera no lugar: a string ja esta na tabela de referencias e trocar o
      // objeto agora faria `@` devolver outra instancia.
      if (inner instanceof RubyString && encoding !== null) {
        inner.encoding = encoding;
      }
      return inner;
    }

    case "[": {
      const index = reader.reserve();
      const length = reader.fixnum();
      const array: RubyValue[] = [];
      reader.place(index, array);
      for (let i = 0; i < length; i += 1) array.push(readValue(reader));
      return array;
    }

    case "{": {
      const index = reader.reserve();
      const length = reader.fixnum();
      const map = new Map<RubyValue, RubyValue>();
      reader.place(index, map);
      for (let i = 0; i < length; i += 1) {
        const key = readValue(reader);
        map.set(key, readValue(reader));
      }
      return map;
    }

    case "o": {
      const index = reader.reserve();
      const className = readValue(reader);
      if (!(className instanceof RubySymbol)) {
        throw new MarshalError("classe de objeto nao e simbolo", reader.offset);
      }
      const object = new RubyObject(className.name);
      reader.place(index, object);

      const count = reader.fixnum();
      for (let i = 0; i < count; i += 1) {
        const key = readValue(reader);
        const value = readValue(reader);
        if (!(key instanceof RubySymbol)) {
          throw new MarshalError(
            "nome de variavel de instancia nao e simbolo",
            reader.offset,
          );
        }
        object.ivars.set(key.name, value);
      }
      return object;
    }

    case "u": {
      const className = readValue(reader);
      if (!(className instanceof RubySymbol)) {
        throw new MarshalError("classe de _load nao e simbolo", reader.offset);
      }
      const length = reader.fixnum();
      const bytes = new Uint8Array(reader.slice(length));
      return reader.register(decodeUserDefined(className.name, bytes));
    }

    case "f": {
      const length = reader.fixnum();
      const text = new TextDecoder("utf-8").decode(reader.slice(length));
      const value =
        text === "inf"
          ? Number.POSITIVE_INFINITY
          : text === "-inf"
            ? Number.NEGATIVE_INFINITY
            : text === "nan"
              ? Number.NaN
              : Number.parseFloat(text);
      return reader.register(value);
    }

    case "l": {
      const sign = String.fromCharCode(reader.byte());
      const words = reader.fixnum();
      let value = 0n;
      for (let i = 0; i < words; i += 1) {
        const low = BigInt(reader.byte());
        const high = BigInt(reader.byte());
        value |= (low | (high << 8n)) << BigInt(16 * i);
      }
      return reader.register(sign === "-" ? -value : value);
    }

    default:
      throw new MarshalError(
        `tipo Marshal nao suportado: ${JSON.stringify(type)}`,
        reader.offset - 1,
      );
  }
}

/** Le um documento Marshal 4.8 inteiro. */
export function load(bytes: Uint8Array): RubyValue {
  const reader = new Reader(bytes);
  const major = reader.byte();
  const minor = reader.byte();

  if (major !== MARSHAL_MAJOR || minor > MARSHAL_MINOR) {
    throw new MarshalError(
      `versao de Marshal ${major}.${minor} nao suportada; ` +
        `esperava ${MARSHAL_MAJOR}.${MARSHAL_MINOR}`,
      0,
    );
  }
  return readValue(reader);
}
