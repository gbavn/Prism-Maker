import type { BuiltScene } from "../../scene/buildScene.js";
import {
  autotileQuarters,
  imageKey,
  QUARTER_PIXELS,
  TILE_PIXELS,
  tileSource,
  type TileSource,
} from "../../scene/tileAtlas.js";

/**
 * Monta a geometria da viewport a partir da cena.
 *
 * Uma malha unica por imagem, em vez de uma instancia por tile com shader
 * proprio. Um mapa grande do Essentials tem alguns milhares de tiles, o que da
 * uma malha pequena para GPU nenhuma reclamar, e assim nao existe shader
 * customizado para manter em paridade com o runtime depois.
 *
 * Puro de proposito: recebe a cena e os tamanhos das imagens, devolve arrays.
 * Nao importa Three, entao tem teste sem abrir janela.
 */

export interface ImageSize {
  width: number;
  height: number;
}

export interface AtlasGeometry {
  /** "tileset", "autotile:<indice>", com sufixo de parede quando for degrau. */
  key: string;
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Celula de origem de cada quad, na mesma ordem, para a selecao. */
  cells: Int32Array;
}

/**
 * Sufixo das paredes de degrau.
 *
 * As paredes saem em malha separada para receberem material proprio, mais
 * escuro. Sem isso o relevo nao se le: material sem iluminacao com a mesma
 * textura em cima e na lateral deixa um plato parecendo chao plano.
 */
export const SKIRT_SUFFIX = "|skirt";

/**
 * Sufixo de camada.
 *
 * Cada camada do XP vira malha propria, mesmo saindo da mesma imagem. Custa
 * algumas malhas a mais e paga na hora de destacar a camada que esta sendo
 * editada: sem essa separacao, apagar as outras apagaria tudo junto.
 */
export function layerSuffix(layer: number): string {
  return `@${layer}`;
}

/** Imagem de origem de uma chave de malha, sem sufixo de parede nem de camada. */
export function imageKeyOf(key: string): string {
  const withoutSkirt = key.endsWith(SKIRT_SUFFIX)
    ? key.slice(0, -SKIRT_SUFFIX.length)
    : key;
  const at = withoutSkirt.lastIndexOf("@");
  return at === -1 ? withoutSkirt : withoutSkirt.slice(0, at);
}

/** Camada de uma chave de malha, ou null quando ela nao pertence a nenhuma. */
export function layerOf(key: string): number | null {
  if (key.endsWith(SKIRT_SUFFIX)) return null;
  const at = key.lastIndexOf("@");
  if (at === -1) return null;
  const layer = Number(key.slice(at + 1));
  return Number.isInteger(layer) ? layer : null;
}

interface Bucket {
  positions: number[];
  uvs: number[];
  indices: number[];
  cells: number[];
  quads: number;
}

function bucketFor(buckets: Map<string, Bucket>, key: string): Bucket {
  let bucket = buckets.get(key);
  if (bucket === undefined) {
    bucket = { positions: [], uvs: [], indices: [], cells: [], quads: 0 };
    buckets.set(key, bucket);
  }
  return bucket;
}

/** Um quad deitado no plano do chao, com o recorte da imagem em pixels. */
function pushFloorQuad(
  bucket: Bucket,
  world: { x0: number; z0: number; x1: number; z1: number; y: number },
  crop: { x: number; y: number; size: number },
  size: ImageSize,
  cellX: number,
  cellY: number,
): void {
  // A textura e lida com flipY ligado, o padrao do Three, entao v cresce de
  // baixo para cima enquanto o recorte vem contado do topo da imagem.
  const u0 = crop.x / size.width;
  const u1 = (crop.x + crop.size) / size.width;
  const vTop = 1 - crop.y / size.height;
  const vBottom = 1 - (crop.y + crop.size) / size.height;

  const base = bucket.quads * 4;
  bucket.positions.push(
    world.x0, world.y, world.z0,
    world.x1, world.y, world.z0,
    world.x1, world.y, world.z1,
    world.x0, world.y, world.z1,
  );
  bucket.uvs.push(u0, vTop, u1, vTop, u1, vBottom, u0, vBottom);
  bucket.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  bucket.cells.push(cellX, cellY);
  bucket.quads += 1;
}

/**
 * Autotile com altura de 32 pixels nao tem forma, so quadros de animacao.
 *
 * O molde com as 48 formas tem 128 pixels de altura. Imagens baixas, como o
 * "Black" do Essentials, sao um tile so repetido em quadros lado a lado.
 */
function isSimpleAutotile(size: ImageSize): boolean {
  return size.height <= TILE_PIXELS;
}

function pushTile(
  bucket: Bucket,
  source: TileSource,
  size: ImageSize,
  world: { x0: number; z0: number; x1: number; z1: number; y: number },
  cellX: number,
  cellY: number,
): void {
  if (source.kind === "tileset") {
    pushFloorQuad(bucket, world, { x: source.x, y: source.y, size: TILE_PIXELS }, size, cellX, cellY);
    return;
  }

  if (isSimpleAutotile(size)) {
    pushFloorQuad(bucket, world, { x: 0, y: 0, size: TILE_PIXELS }, size, cellX, cellY);
    return;
  }

  const quarters = autotileQuarters(source.shape);
  if (quarters === null) return;

  // Os quatro quartos, na ordem noroeste, nordeste, sudoeste, sudeste.
  const midX = (world.x0 + world.x1) / 2;
  const midZ = (world.z0 + world.z1) / 2;
  const corners = [
    { x0: world.x0, z0: world.z0, x1: midX, z1: midZ },
    { x0: midX, z0: world.z0, x1: world.x1, z1: midZ },
    { x0: world.x0, z0: midZ, x1: midX, z1: world.z1 },
    { x0: midX, z0: midZ, x1: world.x1, z1: world.z1 },
  ];

  quarters.forEach((quarter, index) => {
    const corner = corners[index]!;
    pushFloorQuad(
      bucket,
      { ...corner, y: world.y },
      { x: quarter.x, y: quarter.y, size: QUARTER_PIXELS },
      size,
      cellX,
      cellY,
    );
  });
}

export function buildTileGeometry(
  scene: BuiltScene,
  sizes: ReadonlyMap<string, ImageSize>,
): AtlasGeometry[] {
  const half = scene.tileSize / 2;
  const buckets = new Map<string, Bucket>();

  for (const quad of scene.quads) {
    const source = tileSource(quad.tileId);
    if (source === null) continue;

    const key = imageKey(source);
    const size = sizes.get(key);
    // Sem a imagem carregada nao da para calcular UV. Pular e melhor que
    // desenhar o tile errado: um buraco na tela e um sintoma legivel.
    if (size === undefined) continue;

    const x = quad.cellX * scene.tileSize;
    const z = quad.cellY * scene.tileSize;

    pushTile(
      bucketFor(buckets, key + layerSuffix(quad.layer)),
      source,
      size,
      { x0: x - half, z0: z - half, x1: x + half, z1: z + half, y: quad.y },
      quad.cellX,
      quad.cellY,
    );
  }

  for (const skirt of scene.skirts) {
    const source = tileSource(skirt.tileId);
    if (source === null) continue;

    const key = imageKey(source);
    const size = sizes.get(key);
    if (size === undefined) continue;

    // A parede usa um recorte unico, sem montar quartos: e uma faixa vertical
    // esticada, e compor forma ali nao acrescentaria nada.
    const crop =
      source.kind === "tileset"
        ? { x: source.x, y: source.y, size: TILE_PIXELS }
        : isSimpleAutotile(size)
          ? { x: 0, y: 0, size: TILE_PIXELS }
          : { x: TILE_PIXELS, y: 2 * TILE_PIXELS, size: TILE_PIXELS };

    const bucket = bucketFor(buckets, key + SKIRT_SUFFIX);
    const x = skirt.cellX * scene.tileSize;
    const z = skirt.cellY * scene.tileSize;

    const u0 = crop.x / size.width;
    const u1 = (crop.x + crop.size) / size.width;
    const vTop = 1 - crop.y / size.height;
    const vBottom = 1 - (crop.y + crop.size) / size.height;

    // Os quatro cantos da parede, no plano da borda entre as duas celulas.
    const [ax, az, bx, bz] =
      skirt.side === "north"
        ? [x - half, z - half, x + half, z - half]
        : skirt.side === "south"
          ? [x + half, z + half, x - half, z + half]
          : skirt.side === "west"
            ? [x - half, z + half, x - half, z - half]
            : [x + half, z - half, x + half, z + half];

    const base = bucket.quads * 4;
    bucket.positions.push(
      ax, skirt.top, az,
      bx, skirt.top, bz,
      bx, skirt.bottom, bz,
      ax, skirt.bottom, az,
    );
    bucket.uvs.push(u0, vTop, u1, vTop, u1, vBottom, u0, vBottom);
    bucket.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    bucket.cells.push(skirt.cellX, skirt.cellY);
    bucket.quads += 1;
  }

  return [...buckets.entries()].map(([key, bucket]) => ({
    key,
    positions: new Float32Array(bucket.positions),
    uvs: new Float32Array(bucket.uvs),
    indices: new Uint32Array(bucket.indices),
    cells: new Int32Array(bucket.cells),
  }));
}

/**
 * Celula de um quad a partir do indice do triangulo atingido.
 *
 * Cada quad sao dois triangulos, entao o indice da face dividido por dois da o
 * quad, e dai sai a celula. Autotile vira quatro quads, um por quarto, e cada
 * um carrega a mesma celula.
 */
export function cellOfFace(
  geometry: AtlasGeometry,
  faceIndex: number,
): { x: number; y: number } | null {
  const quad = Math.floor(faceIndex / 2);
  const x = geometry.cells[quad * 2];
  const y = geometry.cells[quad * 2 + 1];
  return x === undefined || y === undefined ? null : { x, y };
}
