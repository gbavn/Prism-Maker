import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MOUSE,
  NearestFilter,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Camera,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BuiltScene } from "../../scene/buildScene.js";
import {
  buildTileGeometry,
  cellOfFace,
  imageKeyOf,
  SKIRT_SUFFIX,
  type AtlasGeometry,
  type ImageSize,
} from "./geometry.js";

/**
 * A viewport 3D.
 *
 * Toda decisao de o que desenhar ja foi tomada em buildScene e em
 * buildTileGeometry, ambos puros e testados. Aqui so existe o trabalho de por
 * na tela: malhas, textura, camera e selecao.
 */

export interface PickedCell {
  x: number;
  y: number;
}

export interface ViewportImages {
  /** Chave "tileset" ou "autotile:<indice>" para URL. */
  sources: Map<string, string>;
}

/**
 * Modo de visualizacao.
 *
 * O dado de um mapa do RPG Maker e 2D, entao 2D e o padrao: camera
 * ortografica olhando de cima, sem rotacao, que e onde da para desenhar sem
 * lutar com a perspectiva. O 3D existe para conferir relevo, nao para editar
 * tile.
 */
export type ViewMode = "2d" | "3d";

export interface Viewport {
  show(scene: BuiltScene, images: ViewportImages): Promise<void>;
  pickCell(x: number, y: number): PickedCell | null;
  highlight(cell: PickedCell | null): void;
  setMode(mode: ViewMode): void;
  resize(): void;
  dispose(): void;
}

/**
 * Textura de pixel art.
 *
 * Filtro nearest e obrigatorio: qualquer interpolacao borra o pixel art e
 * ainda puxa cor do tile vizinho no atlas, o que aparece como costura fina
 * entre os tiles.
 */
function loadTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    new TextureLoader().load(
      url,
      (texture) => {
        texture.magFilter = NearestFilter;
        texture.minFilter = NearestFilter;
        texture.generateMipmaps = false;
        // Sem isto o Three trata o PNG como linear e clareia tudo: o verde do
        // Essentials sai lavado, parecendo menta. O arquivo esta em sRGB.
        texture.colorSpace = SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      () => reject(new Error(`nao consegui carregar ${url}`)),
    );
  });
}

export function createViewport(canvas: HTMLCanvasElement): Viewport {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(new Color(0x0f1318), 1);

  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1));

  let mode: ViewMode = "2d";
  let camera: Camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 4000);
  let controls = new OrbitControls(camera, canvas);

  const raycaster = new Raycaster();
  const pointer = new Vector2();

  const meshes: Mesh[] = [];
  const geometries = new Map<Mesh, AtlasGeometry>();
  /**
   * Textura por URL, viva enquanto a viewport existir.
   *
   * Recarregar a cada redesenho parece inofensivo e nao e: cada pincelada
   * dispara um redesenho, e descartar a textura enquanto o redesenho anterior
   * ainda a usava deixa a malha com textura morta, que aparece como um
   * retangulo preto exatamente nas celulas recem editadas.
   */
  const textureCache = new Map<string, Texture>();
  /** Descarta resultado de um redesenho que ja foi substituido por outro. */
  let generation = 0;

  let built: BuiltScene | null = null;
  let framedFor = "";

  const marker = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({
      color: 0xffd94d,
      transparent: true,
      opacity: 0.45,
      depthTest: false,
      side: DoubleSide,
    }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 10;
  marker.visible = false;
  scene.add(marker);

  /** Remove as malhas. As texturas ficam no cache, vivas. */
  function clear(): void {
    for (const mesh of meshes) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    meshes.length = 0;
    geometries.clear();
  }

  async function ensureTexture(url: string): Promise<Texture | null> {
    const cached = textureCache.get(url);
    if (cached !== undefined) return cached;
    try {
      const texture = await loadTexture(url);
      textureCache.set(url, texture);
      return texture;
    } catch {
      return null;
    }
  }

  /**
   * Meia altura visivel em 2D, em unidades de mundo.
   *
   * Enquadra o maior lado com uma folga pequena, e respeita o zoom que a
   * pessoa ja aplicou: reenquadrar a cada redesenho arrancaria a camera do
   * lugar no meio da edicao.
   */
  let orthoSpan = 10;

  function resize(): void {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setSize(width, height, false);
    const aspect = width / height;

    if (camera instanceof PerspectiveCamera) {
      camera.aspect = aspect;
    } else if (camera instanceof OrthographicCamera) {
      camera.left = -orthoSpan * aspect;
      camera.right = orthoSpan * aspect;
      camera.top = orthoSpan;
      camera.bottom = -orthoSpan;
    }
    (camera as PerspectiveCamera | OrthographicCamera).updateProjectionMatrix();
  }

  function place(target: BuiltScene): void {
    const center = new Vector3(target.center.x, 0, target.center.z);
    const span = Math.max(target.width, target.height) * target.tileSize;
    controls.target.copy(center);

    if (mode === "2d") {
      // Olhando reto para baixo. Sem rotacao: em 2D girar a camera so
      // atrapalha, e a grade do mapa precisa ficar alinhada com a tela.
      orthoSpan = (span / 2) * 1.08;
      camera.position.set(center.x, span, center.z);
      controls.enableRotate = false;
      controls.mouseButtons = {
        LEFT: MOUSE.PAN,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.PAN,
      };
    } else {
      // Angulo proximo do usado nos jogos de DS: de cima, inclinado.
      camera.position.set(center.x, span * 1.05, center.z + span * 0.78);
      controls.enableRotate = true;
      controls.mouseButtons = {
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.PAN,
      };
    }
    controls.update();
    resize();
  }

  function frame(target: BuiltScene): void {
    const key = `${mode}:${target.width}x${target.height}`;
    if (framedFor === key) return;
    framedFor = key;
    place(target);
  }

  async function show(next: BuiltScene, images: ViewportImages): Promise<void> {
    const mine = ++generation;

    const sizes = new Map<string, ImageSize>();
    const loaded = new Map<string, Texture>();

    await Promise.all(
      [...images.sources].map(async ([key, url]) => {
        const texture = await ensureTexture(url);
        // Segue sem essa imagem: o mapa aparece com buracos em vez de falhar
        // inteiro, o que e mais util para descobrir o que faltou.
        if (texture === null) return;
        const image = texture.image as { width: number; height: number };
        sizes.set(key, { width: image.width, height: image.height });
        loaded.set(key, texture);
      }),
    );

    // Outro redesenho comecou enquanto as texturas carregavam: aquele vence.
    if (mine !== generation) return;

    clear();
    built = next;

    for (const atlas of buildTileGeometry(next, sizes)) {
      const texture = loaded.get(imageKeyOf(atlas.key));
      if (texture === undefined) continue;
      const isSkirt = atlas.key.endsWith(SKIRT_SUFFIX);

      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(atlas.positions, 3));
      geometry.setAttribute("uv", new BufferAttribute(atlas.uvs, 2));
      geometry.setIndex(new BufferAttribute(atlas.indices, 1));

      const mesh = new Mesh(
        geometry,
        new MeshBasicMaterial({
          map: texture,
          // Recorte em vez de transparencia com ordenacao: o tileset tem area
          // vazia, e alphaTest evita o problema de ordem entre camadas.
          alphaTest: 0.5,
          side: DoubleSide,
          // Parede de degrau sai escurecida: e o unico indicio de profundidade
          // em um material sem iluminacao.
          color: isSkirt ? 0x6e7a86 : 0xffffff,
        }),
      );
      mesh.name = atlas.key;
      scene.add(mesh);
      meshes.push(mesh);
      geometries.set(mesh, atlas);
    }

    frame(next);
    resize();
  }

  function pickCell(x: number, y: number): PickedCell | null {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    pointer.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);

    for (const intersection of raycaster.intersectObjects(meshes, false)) {
      const atlas = geometries.get(intersection.object as Mesh);
      const face = intersection.faceIndex;
      if (atlas === undefined || face === undefined || face === null) continue;
      const cell = cellOfFace(atlas, face);
      if (cell !== null) return cell;
    }
    return null;
  }

  function highlight(cell: PickedCell | null): void {
    if (cell === null || built === null) {
      marker.visible = false;
      return;
    }
    const top = built.surface[cell.y * built.width + cell.x] ?? 0;
    marker.scale.set(built.tileSize, built.tileSize, 1);
    marker.position.set(
      cell.x * built.tileSize,
      top + 0.02,
      cell.y * built.tileSize,
    );
    marker.visible = true;
  }

  function setMode(next: ViewMode): void {
    if (next === mode) return;
    mode = next;

    controls.dispose();
    camera =
      next === "2d"
        ? new OrthographicCamera(-10, 10, 10, -10, 0.1, 4000)
        : new PerspectiveCamera(45, 1, 0.1, 4000);
    controls = new OrbitControls(camera, canvas);

    framedFor = "";
    if (built !== null) frame(built);
    else resize();
  }

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    show,
    pickCell,
    highlight,
    setMode,
    resize,
    dispose(): void {
      clear();
      for (const texture of textureCache.values()) texture.dispose();
      textureCache.clear();
      controls.dispose();
      renderer.setAnimationLoop(null);
      renderer.dispose();
    },
  };
}
