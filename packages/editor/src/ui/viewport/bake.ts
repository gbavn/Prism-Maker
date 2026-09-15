import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { bakeSize, bounds, type Model } from "../../scene/model.js";
import { TILE_PIXELS } from "../../scene/tileAtlas.js";

/**
 * Assa um modelo numa imagem, no angulo da camera do jogo.
 *
 * O jogo desenha sprites 2D e nao tem 3D nenhum: o que entra nele e esta
 * imagem. Com a camera do jogo parada, um render no angulo certo e
 * indistinguivel de geometria desenhada a cada quadro, que e como os jogos de
 * DS resolviam cenario.
 *
 * Camera ortografica de proposito. Perspectiva daria fuga de ponto diferente
 * em cada objeto do mapa, e o tileset do Essentials e desenhado sem fuga.
 *
 * A inclinacao e mais baixa que a do mapa visto de cima: com a camera muito
 * alta so se ve o telhado, e o volume some. Quarenta e dois graus mostram a
 * frente e o topo, que e o que da a leitura de construcao dos jogos de DS.
 */

/** Inclinacao da camera, em graus acima do horizonte. */
export const BAKE_ELEVATION = 42;

export interface BakedImage {
  /** PNG em base64, sem o prefixo de data URL. */
  png: string;
  width: number;
  height: number;
}

export function bakeModel(model: Model): BakedImage {
  const { width, height } = bakeSize(model);

  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  // Ambiente baixo e sol forte de proposito. Com ambiente alto todas as faces
  // saem com o mesmo brilho, o objeto perde o volume e vira adesivo: o topo
  // precisa ser claramente mais claro que a frente.
  scene.add(new AmbientLight(0xffffff, 0.62));

  const sun = new DirectionalLight(0xffffff, 1.5);
  sun.position.set(-1.4, 3, 1.6);
  scene.add(sun);

  // Uma segunda luz fraca do lado oposto, so para a face escura nao virar um
  // buraco preto. E o mesmo truque do sombreamento dos tiles do Essentials.
  const fill = new DirectionalLight(0xffffff, 0.35);
  fill.position.set(1.6, 0.4, -1.2);
  scene.add(fill);

  for (const box of model.boxes) {
    const mesh = new Mesh(
      new BoxGeometry(box.size[0], box.size[1], box.size[2]),
      new MeshLambertMaterial({ color: new Color(box.color) }),
    );
    mesh.position.set(box.at[0], box.at[1], box.at[2]);
    scene.add(mesh);
  }

  const box = bounds(model);
  const centre = new Vector3(
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  );

  // Uma celula vale 32 pixels na imagem, a mesma escala do mapa. Assim o
  // objeto assado entra no jogo do tamanho que tinha no editor.
  const halfWidth = width / (2 * TILE_PIXELS);
  const halfHeight = height / (2 * TILE_PIXELS);
  const camera = new OrthographicCamera(
    -halfWidth,
    halfWidth,
    halfHeight,
    -halfHeight,
    0.1,
    100,
  );

  const angle = (BAKE_ELEVATION * Math.PI) / 180;
  camera.position.set(
    centre.x,
    centre.y + Math.sin(angle) * 20,
    centre.z + Math.cos(angle) * 20,
  );
  camera.lookAt(centre);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const png = renderer.domElement.toDataURL("image/png").split(",")[1] ?? "";

  renderer.dispose();
  return { png, width, height };
}
