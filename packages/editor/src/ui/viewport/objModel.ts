import { Box3, Group, Mesh, type Object3D, Vector3 } from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { assetUrl } from "../../shared/ipc.js";
import type { Extent } from "../../scene/model.js";
import { bakeSubject, type BakedImage } from "./bake.js";

/**
 * Carrega modelo 3D de arquivo, para o catalogo do editor.
 *
 * O Three ja traz `OBJLoader` e `MTLLoader`, e o editor ja serve o projeto por
 * um protocolo proprio com `supportFetchAPI`. Entao os dois carregadores
 * baixam por URL e resolvem MTL e textura relativos sozinhos: nao ha parser
 * escrito aqui, de proposito.
 *
 * O `.mtl` e opcional. Modelo sem material sai com o cinza padrao do Three, o
 * que ja serve para colocar e mover no mapa.
 */

/** Quantas unidades do arquivo valem uma celula. */
export const DEFAULT_UNITS_PER_CELL = 16;

export interface LoadedModel {
  /** A malha, ja escalada para celulas e assentada com a base em Y zero. */
  content: Object3D;
  /** Caixa envolvente em celulas, depois do giro. */
  box: Extent;
  /** Quantas celulas ocupa no chao. */
  area: { width: number; depth: number };
  yaw: number;
}

function extentOf(object: Object3D): Extent {
  const box = new Box3().setFromObject(object);
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };
}

/**
 * Le o OBJ, escala para celulas e assenta a base no chao.
 *
 * O assentamento nao e detalhe: modelo extraido de jogo costuma ter a base
 * longe do zero, e plantar em Y zero deixaria o objeto flutuando ou enterrado.
 * A mesma armadilha ja apareceu do lado do motor, com o Y do laboratorio
 * comecando em 1 e nao em 0.
 */
export async function loadModelFile(
  path: string,
  options: { unitsPerCell?: number; yaw?: number } = {},
): Promise<LoadedModel> {
  const unitsPerCell = options.unitsPerCell ?? DEFAULT_UNITS_PER_CELL;
  const yaw = options.yaw ?? 0;
  const url = assetUrl(path);

  const loader = new OBJLoader();
  const materialUrl = url.replace(/\.obj$/i, ".mtl");
  try {
    const mtl = new MTLLoader();
    // `Tr` tem duas convencoes em circulacao, e o modelo extraido de jogo usa a
    // que diz opacidade: ele escreve `d 1` e `Tr 1` para material opaco. O
    // Three assume a outra, em que `Tr` e transparencia, e lia `Tr 1` como
    // opacidade zero. O predio inteiro assava invisivel por causa disso, e o
    // editor mostrava so o contorno.
    mtl.setMaterialOptions({ invertTrProperty: true });
    const materials = await mtl.loadAsync(materialUrl);
    materials.preload();
    // Rede de seguranca para modelo que venha na outra convencao: material
    // completamente invisivel nunca e intencional num objeto de cenario, e sem
    // isto ele some sem deixar pista.
    for (const material of Object.values(materials.materials)) {
      if (material.opacity === 0) {
        material.opacity = 1;
        material.transparent = false;
      }
    }
    loader.setMaterials(materials);
  } catch {
    // Sem .mtl ao lado: segue com o material padrao.
  }

  const raw = await loader.loadAsync(url);
  raw.traverse((node) => {
    if (node instanceof Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });

  const escala = 1 / unitsPerCell;
  raw.scale.setScalar(escala);
  raw.updateMatrixWorld(true);

  // Gira em volta do centro da area no chao, que e a mesma regra das caixas.
  const bruto = extentOf(raw);
  const centro = new Vector3(
    ((bruto.min[0] ?? 0) + (bruto.max[0] ?? 0)) / 2,
    0,
    ((bruto.min[2] ?? 0) + (bruto.max[2] ?? 0)) / 2,
  );

  const group = new Group();
  group.rotation.y = (-yaw * Math.PI) / 180;
  raw.position.sub(centro);
  group.add(raw);
  group.position.copy(centro);
  group.updateMatrixWorld(true);

  // Assenta: desce o que sobrar entre a base do modelo e o chao.
  const girado = extentOf(group);
  group.position.y -= girado.min[1] ?? 0;
  group.updateMatrixWorld(true);

  const box = extentOf(group);
  const celulas = (span: number) => Math.max(1, Math.ceil(span - 1e-6));
  const area = {
    width: celulas((box.max[0] ?? 0) - (box.min[0] ?? 0)),
    depth: celulas((box.max[2] ?? 0) - (box.min[2] ?? 0)),
  };

  return { content: group, box, area, yaw };
}

/** Os oito cantos da caixa, que e o que o enquadramento precisa conter. */
function boxPoints(box: Extent): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (const x of [box.min[0] ?? 0, box.max[0] ?? 0]) {
    for (const y of [box.min[1] ?? 0, box.max[1] ?? 0]) {
      for (const z of [box.min[2] ?? 0, box.max[2] ?? 0]) {
        points.push([x, y, z]);
      }
    }
  }
  return points;
}

/** Assa um modelo de arquivo, pela mesma camera e luz das caixas. */
export function bakeLoadedModel(model: LoadedModel): BakedImage {
  return bakeSubject({
    content: model.content,
    box: model.box,
    area: model.area,
    points: boxPoints(model.box),
  });
}
