import type { BuiltScene } from "../../scene/buildScene.js";
import { TILE_PIXELS, tileSource } from "../../scene/tileAtlas.js";

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
  /** "tileset" ou "autotile:<indice>". */
  key: string;
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Celula de origem de cada quad, na mesma ordem, para a selecao. */
  cells: Int32Array;
}

function sourceKey(kind: "tileset" | "autotile", autotile: number): string {
  return kind === "tileset" ? "tileset" : `autotile:${autotile}`;
}

/**
 * Sufixo das paredes de degrau.
 *
 * As paredes saem em malha separada para receberem material proprio, mais
 * escuro. Sem isso o relevo nao se le: material sem iluminacao com a mesma
 * textura em cima e na lateral deixa um plato parecendo chao plano.
 */
export const SKIRT_SUFFIX = "|skirt";

/** Imagem de origem de uma chave de malha, ignorando o sufixo de parede. */
export function imageKeyOf(key: string): string {
  return key.endsWith(SKIRT_SUFFIX) ? key.slice(0, -SKIRT_SUFFIX.length) : key;
}

export function buildTileGeometry(
  scene: BuiltScene,
  sizes: ReadonlyMap<string, ImageSize>,
): AtlasGeometry[] {
  const half = scene.tileSize / 2;

  interface Bucket {
    positions: number[];
    uvs: number[];
    indices: number[];
    cells: number[];
    quads: number;
  }
  const buckets = new Map<string, Bucket>();

  for (const quad of scene.quads) {
    const source = tileSource(quad.tileId);
    if (source === null) continue;

    const key = sourceKey(source.kind, source.autotile);
    const size = sizes.get(key);
    // Sem a imagem carregada nao da para calcular UV. Pular e melhor que
    // desenhar o tile errado: um buraco na tela e um sintoma legivel.
    if (size === undefined) continue;

    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = { positions: [], uvs: [], indices: [], cells: [], quads: 0 };
      buckets.set(key, bucket);
    }

    const x = quad.cellX * scene.tileSize;
    const z = quad.cellY * scene.tileSize;
    const y = quad.y;

    // A textura e lida com flipY ligado, o padrao do Three, entao v cresce de
    // baixo para cima enquanto o recorte vem contado do topo da imagem.
    const u0 = source.x / size.width;
    const u1 = (source.x + TILE_PIXELS) / size.width;
    const vTop = 1 - source.y / size.height;
    const vBottom = 1 - (source.y + TILE_PIXELS) / size.height;

    const base = bucket.quads * 4;
    bucket.positions.push(
      x - half, y, z - half,
      x + half, y, z - half,
      x + half, y, z + half,
      x - half, y, z + half,
    );
    bucket.uvs.push(u0, vTop, u1, vTop, u1, vBottom, u0, vBottom);
    bucket.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    bucket.cells.push(quad.cellX, quad.cellY);
    bucket.quads += 1;
  }

  for (const skirt of scene.skirts) {
    const source = tileSource(skirt.tileId);
    if (source === null) continue;

    const imageKey = sourceKey(source.kind, source.autotile);
    const size = sizes.get(imageKey);
    if (size === undefined) continue;

    const key = imageKey + SKIRT_SUFFIX;
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = { positions: [], uvs: [], indices: [], cells: [], quads: 0 };
      buckets.set(key, bucket);
    }

    const x = skirt.cellX * scene.tileSize;
    const z = skirt.cellY * scene.tileSize;
    const u0 = source.x / size.width;
    const u1 = (source.x + TILE_PIXELS) / size.width;
    const vTop = 1 - source.y / size.height;
    const vBottom = 1 - (source.y + TILE_PIXELS) / size.height;

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
      ax as number, skirt.top, az as number,
      bx as number, skirt.top, bz as number,
      bx as number, skirt.bottom, bz as number,
      ax as number, skirt.bottom, az as number,
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
 * quad, e dai sai a celula.
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
