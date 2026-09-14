import { createHash } from "node:crypto";
import type { Table } from "./marshal/values.js";

/**
 * Impressao digital de uma Table.
 *
 * Os valores em little endian, 16 bits, com SHA-256 por cima. E exatamente a
 * mesma conta que `tools/dump-expected.rb` faz do lado do Ruby, o que permite
 * comparar grades inteiras de tiles sem despejar milhares de numeros.
 */
export function tableFingerprint(table: Table): string {
  const bytes = new Uint8Array(table.data.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < table.data.length; i += 1) {
    view.setUint16(i * 2, table.data[i] as number, true);
  }
  return createHash("sha256").update(bytes).digest("hex");
}

export function tableSummary(table: Table): {
  dims: number;
  xSize: number;
  ySize: number;
  zSize: number;
  length: number;
  sha256: string;
} {
  return {
    dims: table.dimensions,
    xSize: table.xSize,
    ySize: table.ySize,
    zSize: table.zSize,
    length: table.data.length,
    sha256: tableFingerprint(table),
  };
}
