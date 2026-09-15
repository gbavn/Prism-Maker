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
import { LAYER_GAP, type BuiltScene, type SceneBillboard } from "../../scene/buildScene.js";
import {
  placeSprite,
  spriteSource,
  type ImageSize as CharsetImageSize,
} from "../../scene/charset.js";
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
  /** Marca a celula de cada evento, para os que quase nao aparecem. */
  setEventMarks(on: boolean): void;
  /** Destaca um evento pelo id, ou nenhum. */
  selectEvent(id: number | null): void;
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

/**
 * Um quadrado vazado de lado um, no plano XY.
 *
 * Contorno e nao preenchimento, e a diferenca importa: a marca de um evento
 * cai em cima de um sprite que pode ser opaco e do tamanho da celula, como e o
 * caso das portas. Preenchimento esconderia justamente o que a marca aponta.
 */
function outlineGeometry(thickness: number): BufferGeometry {
  const outer = 0.5;
  const inner = 0.5 - thickness;

  const positions: number[] = [];
  const indices: number[] = [];

  /** Uma barra do contorno, em sentido anti horario. */
  const bar = (x0: number, y0: number, x1: number, y1: number) => {
    const base = positions.length / 3;
    positions.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  bar(-outer, inner, outer, outer);
  bar(-outer, -outer, outer, -inner);
  bar(-outer, -inner, -inner, inner);
  bar(inner, -inner, outer, inner);

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  return geometry;
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
   * Os sprites de evento, separados das malhas de tile.
   *
   * Um mesh por evento, e nao uma malha unica: em 3D cada sprite gira sozinho
   * para encarar a camera, e malha unida so gira inteira. Sao dezenas de
   * eventos por mapa, entao o custo nao aparece.
   */
  const sprites: { mesh: Mesh; billboard: SceneBillboard }[] = [];
  /**
   * Uma marca no chao por evento.
   *
   * Sem isso, metade dos eventos e invisivel para quem edita: porta e aviso
   * usam charset quase transparente de proposito, porque no jogo eles nao
   * devem aparecer. No editor eles precisam.
   */
  const marks: { mesh: Mesh; id: number }[] = [];
  let marksOn = false;
  let selected: number | null = null;
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
  /** Tamanhos das imagens do ultimo desenho, para recolocar ao trocar de vista. */
  let lastSizes: ReadonlyMap<string, ImageSize> = new Map();

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

  /** Remove as malhas e os sprites. As texturas ficam no cache, vivas. */
  function clear(): void {
    const all = [
      ...meshes,
      ...sprites.map((entry) => entry.mesh),
      ...marks.map((entry) => entry.mesh),
    ];
    for (const mesh of all) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    meshes.length = 0;
    sprites.length = 0;
    marks.length = 0;
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
      // O botao esquerdo fica livre para as ferramentas. Em 2D se edita, em 3D
      // se olha: e por isso que aqui a camera anda pelo direito e pelo meio.
      controls.mouseButtons = {
        LEFT: null,
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

  /**
   * Monta os sprites dos eventos.
   *
   * O plano tem uma unidade e o tamanho real sai da escala, para o mesmo mesh
   * servir a qualquer charset sem refazer geometria a cada troca de vista.
   */
  function drawEvents(
    target: BuiltScene,
    sizes: ReadonlyMap<string, CharsetImageSize>,
    loaded: ReadonlyMap<string, Texture>,
  ): void {
    for (const billboard of target.billboards) {
      const source = spriteSource(billboard, sizes);

      let material: MeshBasicMaterial;
      let frame = { x: 0, y: 0, width: 32, height: 32 };

      if (source.kind === "marker") {
        // Evento sem grafico: um losango violeta, so para existir na tela e
        // poder ser clicado.
        material = new MeshBasicMaterial({
          color: 0x9b8cfa,
          transparent: true,
          opacity: 0.7,
          side: DoubleSide,
        });
      } else {
        const texture = loaded.get(source.key);
        const size = sizes.get(source.key);
        if (texture === undefined || size === undefined) continue;
        frame = source.frame;

        // Recorte por UV em cima da textura compartilhada. Clonar a textura
        // por evento daria uma copia por sprite para descartar depois, que e
        // exatamente a corrida que ja custou caro aqui.
        material = new MeshBasicMaterial({
          map: texture,
          alphaTest: 0.5,
          transparent: billboard.opacity < 255,
          opacity: billboard.opacity / 255,
          side: DoubleSide,
        });
      }

      const geometry = new PlaneGeometry(1, 1);
      if (source.kind !== "marker") {
        const size = sizes.get(source.key);
        if (size !== undefined) {
          const u0 = frame.x / size.width;
          const u1 = (frame.x + frame.width) / size.width;
          const v0 = 1 - frame.y / size.height;
          const v1 = 1 - (frame.y + frame.height) / size.height;
          geometry.setAttribute(
            "uv",
            new BufferAttribute(
              new Float32Array([u0, v0, u1, v0, u0, v1, u1, v1]),
              2,
            ),
          );
        }
      }

      const mesh = new Mesh(geometry, material);
      mesh.name = `event:${billboard.id}`;
      mesh.renderOrder = 5;
      scene.add(mesh);
      sprites.push({ mesh, billboard });

      const mark = new Mesh(
        outlineGeometry(0.12),
        new MeshBasicMaterial({
          color: 0x9b8cfa,
          transparent: true,
          opacity: 0.55,
          depthTest: false,
          side: DoubleSide,
        }),
      );
      mark.rotation.x = -Math.PI / 2;
      mark.renderOrder = 8;
      mark.scale.set(target.tileSize, target.tileSize, 1);
      mark.position.set(
        billboard.x,
        billboard.base + LAYER_GAP * 5,
        billboard.z,
      );
      mark.visible = false;
      scene.add(mark);
      marks.push({ mesh: mark, id: billboard.id });
    }

    layoutEvents(target, sizes);
    paintMarks();
  }

  /**
   * Poe cada sprite no lugar, do jeito da vista atual.
   *
   * Em 2D deitado no chao, que e como o RPG Maker mostra e nao tapa a celula
   * de tras. Em 3D em pe, com os pes no chao. O mesmo evento, desenhado do
   * jeito que faz sentido em cada vista.
   */
  function layoutEvents(
    target: BuiltScene,
    sizes: ReadonlyMap<string, CharsetImageSize>,
  ): void {
    for (const { mesh, billboard } of sprites) {
      const source = spriteSource(billboard, sizes);
      const frame =
        source.kind === "marker"
          ? { x: 0, y: 0, width: 16, height: 16 }
          : source.frame;

      const at = placeSprite(billboard, frame, target.tileSize, mode);
      mesh.scale.set(at.width, at.height, 1);
      mesh.position.set(at.x, at.y, at.z);
      // O marcador nao tem pe: ele marca a celula, entao fica no meio dela.
      if (source.kind === "marker" && mode === "2d") mesh.position.z = billboard.z;
      mesh.rotation.set(mode === "2d" ? -Math.PI / 2 : 0, 0, 0);
    }
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

    lastSizes = sizes;
    drawEvents(next, sizes, loaded);

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

  /** Aplica a visibilidade e o destaque das marcas de evento. */
  function paintMarks(): void {
    for (const { mesh, id } of marks) {
      mesh.visible = marksOn;
      const material = mesh.material as MeshBasicMaterial;
      const chosen = id === selected;
      material.opacity = chosen ? 1 : 0.55;
      material.color.set(chosen ? 0xffffff : 0x9b8cfa);
    }
  }

  function setEventMarks(on: boolean): void {
    marksOn = on;
    paintMarks();
  }


  function selectEvent(id: number | null): void {
    selected = id;
    paintMarks();
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
    if (built !== null) {
      layoutEvents(built, lastSizes);
      frame(built);
    } else {
      resize();
    }
  }

  renderer.setAnimationLoop(() => {
    controls.update();

    // Em 3D o sprite gira so no eixo vertical para encarar a camera, sem
    // deitar junto com a inclinacao. E o que jogo 2.5D faz: o personagem
    // continua de pe por mais que a camera olhe de cima.
    if (mode === "3d") {
      for (const { mesh } of sprites) {
        mesh.rotation.y = Math.atan2(
          camera.position.x - mesh.position.x,
          camera.position.z - mesh.position.z,
        );
      }
    }

    renderer.render(scene, camera);
  });

  return {
    show,
    pickCell,
    highlight,
    setEventMarks,
    selectEvent,
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
