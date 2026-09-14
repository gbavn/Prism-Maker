import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4, Matrix, Vector3 } from "@babylonjs/core/Maths/math";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Meshes/thinInstanceMesh";
// Import de efeito colateral, obrigatorio com import seletivo do Babylon: sem
// ele scene.pick existe mas devolve vazio em qualquer ponto da tela, porque a
// maquinaria de raio nunca e registrada.
import "@babylonjs/core/Culling/ray";

import type { BuiltScene, SceneBox } from "../scene/buildScene.js";

/**
 * Desenho da cena com Babylon.
 *
 * Toda a decisao de o que desenhar ja foi tomada em buildScene, que e pura e
 * testada. Aqui so existe o trabalho de por na tela: malhas, instancias,
 * camera e luz. Essa separacao e o que permite comparar editor e runtime
 * depois, quando o mkxp-z tiver que produzir a mesma cena.
 */

/** Uma instancia por celula seria lenta em mapas grandes; thin instances nao. */
function fillInstances(mesh: Mesh, boxes: SceneBox[], tileSize: number): void {
  const matrices = new Float32Array(boxes.length * 16);
  boxes.forEach((box, index) => {
    Matrix.Compose(
      new Vector3(tileSize, box.height, tileSize),
      // Sem rotacao: caixas alinhadas a grade, como no estilo de DS.
      new Vector3(0, 0, 0).toQuaternion(),
      new Vector3(box.x, box.base + box.height / 2, box.z),
    ).copyToArray(matrices, index * 16);
  });
  mesh.thinInstanceSetBuffer("matrix", matrices, 16);
  // Sem isso a malha mantem o bounding box da caixa base, na origem, e o raio
  // de selecao erra quase todas as instancias. O sintoma e enganoso: a cena
  // desenha certo e so a selecao falha.
  mesh.thinInstanceRefreshBoundingInfo(true);
}

function solidMaterial(
  scene: Scene,
  name: string,
  color: [number, number, number],
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = new Color3(...color);
  // Sombreamento chapado, proximo do look de DS: sem brilho especular.
  material.specularColor = Color3.Black();
  return material;
}

/** Celula sob o cursor, em coordenadas da grade do mapa. */
export interface PickedCell {
  x: number;
  y: number;
}

export interface Viewer {
  show(built: BuiltScene): void;
  /**
   * Celula sob o ponto dado, em pixels do canvas. Sem argumento usa a posicao
   * corrente do ponteiro.
   */
  pickCell(x?: number, y?: number): PickedCell | null;
  /** Destaca uma celula, ou limpa o destaque com null. */
  highlight(cell: PickedCell | null): void;
  dispose(): void;
}

export function createViewer(canvas: HTMLCanvasElement, tileSize = 1): Viewer {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true }, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.08, 0.09, 0.11, 1);

  const camera = new ArcRotateCamera(
    "camera",
    // Angulos iniciais no estilo HGSS: olhando de cima, em diagonal.
    -Math.PI / 2,
    (55 * Math.PI) / 180,
    30,
    Vector3.Zero(),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 4;
  camera.upperRadiusLimit = 160;
  // Nunca deixa a camera passar por baixo do chao.
  camera.upperBetaLimit = (85 * Math.PI) / 180;
  camera.wheelPrecision = 12;
  camera.panningSensibility = 40;

  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.75;
  const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.4), scene);
  sun.intensity = 0.55;

  let created: Mesh[] = [];
  /** Por malha, a lista de caixas na mesma ordem das thin instances. */
  const pickIndex = new Map<string, SceneBox[]>();

  function clear(): void {
    for (const mesh of created) mesh.dispose();
    created = [];
    pickIndex.clear();
  }

  function show(built: BuiltScene): void {
    clear();
    lastBuilt = built;

    const byKind = new Map<string, SceneBox[]>();
    for (const box of built.boxes) {
      const list = byKind.get(box.kind);
      if (list) list.push(box);
      else byKind.set(box.kind, [box]);
    }

    for (const [kind, boxes] of byKind) {
      const first = boxes[0];
      if (first === undefined) continue;
      const mesh = CreateBox(`tiles-${kind}`, { size: 1 }, scene);
      mesh.material = solidMaterial(scene, `mat-${kind}`, first.color);
      // Sem isso o clique atravessa as instancias e nada e selecionavel.
      mesh.thinInstanceEnablePicking = true;
      fillInstances(mesh, boxes, tileSize);
      pickIndex.set(mesh.name, boxes);
      created.push(mesh);
    }

    if (built.billboards.length > 0) {
      // Uma malha por evento, e nao thin instances: o billboard orienta a
      // malha inteira, entao um lote instanciado giraria junto e so o
      // primeiro evento encararia a camera de verdade. Mapas tem dezenas de
      // eventos, nao milhares, entao o custo e irrelevante.
      const material = solidMaterial(scene, "mat-event", [0.88, 0.75, 0.38]);

      for (const billboard of built.billboards) {
        const plane = CreatePlane(
          `event-${billboard.id}`,
          { width: tileSize * 0.8, height: billboard.height },
          scene,
        );
        plane.material = material;
        plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
        plane.position.set(
          billboard.x,
          billboard.base + billboard.height / 2,
          billboard.z,
        );
        created.push(plane);
      }
    }

    if (framedFor !== builtKey(built)) {
      // Reenquadra so quando o mapa muda. Reenquadrar a cada pincelada
      // arrancaria a camera do lugar no meio da edicao.
      framedFor = builtKey(built);
      camera.setTarget(new Vector3(built.center.x, 0, built.center.z));
      camera.radius = Math.max(built.width, built.height) * tileSize * 1.1;
    }
  }

  /**
   * Caixa de destaque.
   *
   * Vive fora da lista de descarte porque sobrevive a troca de mapa, e fica
   * um pouco maior que a celula para nao brigar com o bloco por z-fighting.
   */
  const marker = CreateBox("highlight", { size: 1 }, scene);
  const markerMaterial = new StandardMaterial("mat-highlight", scene);
  markerMaterial.diffuseColor = new Color3(1, 0.85, 0.3);
  markerMaterial.emissiveColor = new Color3(0.5, 0.4, 0.1);
  markerMaterial.specularColor = Color3.Black();
  markerMaterial.alpha = 0.45;
  marker.material = markerMaterial;
  marker.isPickable = false;
  marker.setEnabled(false);

  let lastBuilt: BuiltScene | null = null;
  let framedFor = "";

  const builtKey = (built: BuiltScene): string =>
    `${built.width}x${built.height}@${built.center.x},${built.center.z}`;

  function boxAt(cell: PickedCell): SceneBox | undefined {
    return lastBuilt?.boxes.find(
      (box) => box.cellX === cell.x && box.cellY === cell.y,
    );
  }

  function pickCell(x?: number, y?: number): PickedCell | null {
    const hit = scene.pick(x ?? scene.pointerX, y ?? scene.pointerY, (mesh) =>
      pickIndex.has(mesh.name),
    );
    if (!hit?.hit || hit.pickedMesh === null) return null;

    const boxes = pickIndex.get(hit.pickedMesh.name);
    const box = boxes?.[hit.thinInstanceIndex];
    return box ? { x: box.cellX, y: box.cellY } : null;
  }

  function highlight(cell: PickedCell | null): void {
    if (cell === null) {
      marker.setEnabled(false);
      return;
    }
    const box = boxAt(cell);
    if (box === undefined) {
      marker.setEnabled(false);
      return;
    }
    marker.scaling.set(tileSize * 1.04, box.height + 0.04, tileSize * 1.04);
    marker.position.set(box.x, box.base + box.height / 2, box.z);
    marker.setEnabled(true);
  }

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());

  return {
    show,
    pickCell,
    highlight,
    dispose(): void {
      clear();
      engine.dispose();
    },
  };
}
