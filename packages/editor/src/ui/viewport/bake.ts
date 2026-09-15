import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  PCFSoftShadowMap,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { boxCorners, bounds, footprint, pivot, type Model } from "../../scene/model.js";
import { TILE_PIXELS } from "../../scene/tileAtlas.js";

/**
 * Assa um modelo numa imagem, na projecao da camera do jogo.
 *
 * O jogo desenha sprites 2D e nao tem 3D nenhum: o que entra nele e esta
 * imagem. O 3D acontece aqui, uma vez.
 *
 * A camera e **ortografica e olhando de frente para o norte**, que e a mesma
 * projecao com que o tileset do Essentials foi desenhado. Nao e escolha
 * estetica: o chao do mapa e desenhado assim, e um objeto assado em outra
 * projecao discorda do chao em que esta pisando. Perspectiva de verdade
 * exigiria desenhar o chao junto, em perspectiva, que e justamente o que o
 * motor 2D nao faz e o que so o fork do mkxp-z resolveria.
 *
 * O volume vem de duas outras coisas: o objeto girado no proprio eixo, que
 * mostra a lateral alem da frente, e a sombra no chao, que prende o objeto ao
 * terreno em vez de deixar ele flutuando como adesivo.
 */

/** Inclinacao da camera, em graus acima do horizonte. */
export const BAKE_ELEVATION = 45;

/** Margem em volta do objeto, em celulas, para a sombra caber na imagem. */
const MARGIN = 0.35;

export interface BakedImage {
  /** PNG em base64, sem o prefixo de data URL. */
  png: string;
  width: number;
  height: number;
  /**
   * Onde, dentro da imagem, fica o canto sudoeste da area no chao.
   *
   * Em pixels a partir do canto superior esquerdo. Sem isso o jogo teria que
   * adivinhar o alinhamento: a imagem tem margem para a sombra caber, e o
   * objeto girado nao encosta nas bordas dela. Com a ancora, encaixar e uma
   * subtracao, e vale para qualquer modelo, giro ou tamanho.
   */
  anchorX: number;
  anchorY: number;
}

export function bakeModel(model: Model): BakedImage {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();

  // Ambiente baixo e sol forte de proposito. Com ambiente alto todas as faces
  // saem com o mesmo brilho, o objeto perde o volume e vira adesivo.
  scene.add(new AmbientLight(0xffffff, 0.66));

  const centre = pivot(model);
  const box = bounds(model);
  const middle = new Vector3(
    ((box.min[0] ?? 0) + (box.max[0] ?? 0)) / 2,
    ((box.min[1] ?? 0) + (box.max[1] ?? 0)) / 2,
    ((box.min[2] ?? 0) + (box.max[2] ?? 0)) / 2,
  );

  const sun = new DirectionalLight(0xffffff, 1.45);
  sun.position.set(middle.x - 3, middle.y + 6, middle.z - 2.4);
  sun.target.position.copy(middle);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const reach = 6;
  sun.shadow.camera.left = -reach;
  sun.shadow.camera.right = reach;
  sun.shadow.camera.top = reach;
  sun.shadow.camera.bottom = -reach;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 24;
  scene.add(sun);
  scene.add(sun.target);

  // Luz fraca do lado oposto, so para a face escura nao virar buraco preto.
  const fill = new DirectionalLight(0xffffff, 0.3);
  fill.position.set(middle.x + 3, middle.y + 1, middle.z + 3);
  scene.add(fill);

  const group = new Group();
  group.position.set(centre[0], 0, centre[1]);
  group.rotation.y = (-model.yaw * Math.PI) / 180;
  scene.add(group);

  for (const entry of model.boxes) {
    const mesh = new Mesh(
      new BoxGeometry(entry.size[0], entry.size[1], entry.size[2]),
      new MeshLambertMaterial({ color: new Color(entry.color) }),
    );
    // Dentro do grupo as caixas ficam relativas ao pivo do giro.
    mesh.position.set(
      (entry.at[0] ?? 0) - centre[0],
      entry.at[1] ?? 0,
      (entry.at[2] ?? 0) - centre[1],
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Chao invisivel que so recebe sombra: e ele que assenta o objeto no mundo.
  const ground = new Mesh(
    new PlaneGeometry(40, 40),
    new ShadowMaterial({ opacity: 0.38 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(middle.x, 0, middle.z);
  ground.receiveShadow = true;
  scene.add(ground);

  // Enquadramento exato: todos os cantos do modelo girado, mais os quatro
  // cantos da area no chao, medidos no espaco da camera. Assim a base da
  // imagem cai na borda sul da area, que e onde o jogo vai apoiar o sprite.
  const area = footprint(model);
  const groundCorners: [number, number, number][] = [
    [box.min[0] ?? 0, 0, box.min[2] ?? 0],
    [box.max[0] ?? 0, 0, box.min[2] ?? 0],
    [box.min[0] ?? 0, 0, (box.min[2] ?? 0) + area.depth],
    [box.max[0] ?? 0, 0, (box.min[2] ?? 0) + area.depth],
  ];

  const points: [number, number, number][] = [...groundCorners];
  for (const entry of model.boxes) {
    points.push(...boxCorners(entry, model.yaw, centre));
  }

  const angle = (BAKE_ELEVATION * Math.PI) / 180;
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(
    middle.x,
    middle.y + Math.sin(angle) * 30,
    middle.z + Math.cos(angle) * 30,
  );
  camera.lookAt(middle);
  camera.updateMatrixWorld();

  // No espaco da camera, x e y ja sao as coordenadas da imagem.
  const view = camera.matrixWorldInverse;
  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;

  for (const point of points) {
    const at = new Vector3(point[0], point[1], point[2]).applyMatrix4(view);
    left = Math.min(left, at.x);
    right = Math.max(right, at.x);
    bottom = Math.min(bottom, at.y);
    top = Math.max(top, at.y);
  }

  left -= MARGIN;
  right += MARGIN;
  bottom -= MARGIN;
  top += MARGIN;

  const width = Math.ceil((right - left) * TILE_PIXELS);
  const height = Math.ceil((top - bottom) * TILE_PIXELS);

  camera.left = left;
  camera.right = left + width / TILE_PIXELS;
  camera.bottom = bottom;
  camera.top = bottom + height / TILE_PIXELS;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height, false);
  renderer.render(scene, camera);
  const png = renderer.domElement.toDataURL("image/png").split(",")[1] ?? "";
  renderer.dispose();

  // A ancora: o canto sudoeste da area reservada, projetado na imagem.
  const anchor = new Vector3(
    box.min[0] ?? 0,
    0,
    (box.min[2] ?? 0) + area.depth,
  ).applyMatrix4(view);

  return {
    png,
    width,
    height,
    anchorX: Math.round((anchor.x - camera.left) * TILE_PIXELS),
    anchorY: Math.round((camera.top - anchor.y) * TILE_PIXELS),
  };
}
