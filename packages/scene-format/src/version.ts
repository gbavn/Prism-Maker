/**
 * Versao do formato de cena.
 *
 * O formato vai mudar muito enquanto o editor amadurece. O gancho de migracao
 * existe desde a primeira versao de proposito: adicionar depois, com arquivos
 * ja escritos em disco, e muito mais caro.
 */
export const SCENE_FORMAT_VERSION = 1;

export type UnknownDocument = { formatVersion?: unknown } & Record<
  string,
  unknown
>;

export class UnsupportedFormatVersionError extends Error {
  constructor(
    readonly found: unknown,
    readonly supported: number,
  ) {
    super(
      `formatVersion ${JSON.stringify(found)} nao e suportado; ` +
        `esta versao le ate ${supported}`,
    );
    this.name = "UnsupportedFormatVersionError";
  }
}

/**
 * Traz um documento para a versao corrente.
 *
 * Hoje so existe a versao 1, entao a funcao apenas valida. Quando surgir a
 * versao 2, cada degrau vira um `case` aqui e os arquivos antigos continuam
 * abrindo sem intervencao manual.
 */
export function migrateDocument<T extends UnknownDocument>(document: T): T {
  const version = document.formatVersion;

  if (version === SCENE_FORMAT_VERSION) return document;

  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new UnsupportedFormatVersionError(version, SCENE_FORMAT_VERSION);
  }
  if (version > SCENE_FORMAT_VERSION) {
    throw new UnsupportedFormatVersionError(version, SCENE_FORMAT_VERSION);
  }

  // Aqui entram os degraus de migracao, do mais antigo para o mais novo.
  throw new UnsupportedFormatVersionError(version, SCENE_FORMAT_VERSION);
}
