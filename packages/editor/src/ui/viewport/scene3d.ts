import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MOUSE,
  LineBasicMaterial,
  LineSegments,
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
import { TILE_PIXELS } from "../../scene/tileAtlas.js";
import {
  objectKey,
  placeSprite,
  spriteSource,
  type ImageSize as CharsetImageSize,
} from "../../scene/charset.js";
import {
  buildTileGeometry,
  cellOfFace,
  imageKeyOf,
  layerOf,
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

/**
 * Area coberta pelo cursor, em celulas, relativa a celula apontada.
 *
 * Vem pronta de fora, calculada pela mesma funcao que decide o que a pincelada
 * escreve. Refazer a conta aqui daria um cursor que um dia mente.
 */
export interface HighlightArea {
  left: number;
  top: number;
  width: number;
  height: number;
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

/**
 * Escala da vista 2D.
 *
 * Numero e escala fixa, onde 1 quer dizer um tile de 32 pixels ocupando 32
 * pixels de tela. "fit" encaixa o mapa inteiro na janela, que e util para
 * olhar o conjunto e ruim para desenhar: a reducao deixa uma celula com 17
 * pixels e a vizinha com 18, e o pixel art sai deformado.
 */
export type Zoom = number | "fit";

/** Escalas oferecidas, todas inteiras ou metade exata. */
export const ZOOM_STEPS = [0.5, 1, 2, 4] as const;

export interface Viewport {
  show(scene: BuiltScene, images: ViewportImages): Promise<void>;
  pickCell(x: number, y: number): PickedCell | null;
  /** Marca a celula sob o cursor, cobrindo a area que a ferramenta vai pintar. */
  highlight(cell: PickedCell | null, area?: HighlightArea): void;
  /** Escala do 2D: 1 e um tile por 32 pixels de tela, "fit" cabe o mapa todo. */
  setZoom(zoom: Zoom): void;
  /** Esquece uma imagem em cache, para reler do disco no proximo desenho. */
  forgetAsset(url: string): void;
  /** Liga a grade de celulas, que so aparece em 2D. */
  setGrid(on: boolean): void;
  /** Camada em foco no modo Draw. As outras saem apagadas. */
  setActiveLayer(layer: number | null): void;
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
function outlineGeometry(thickness: number, thicknessY = thickness): BufferGeometry {
  const outer = 0.5;
  const inner = 0.5 - thickness;
  const innerY = 0.5 - thicknessY;

  const positions: number[] = [];
  const indices: number[] = [];

  /** Uma barra do contorno, em sentido anti horario. */
  const bar = (x0: number, y0: number, x1: number, y1: number) => {
    const base = positions.length / 3;
    positions.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  bar(-outer, innerY, outer, outer);
  bar(-outer, -outer, outer, -innerY);
  bar(-outer, -innerY, -inner, innerY);
  bar(inner, -innerY, outer, innerY);

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
  // Pixel de tela de verdade. Sem isto, em monitor com escala do Windows em
  // 125 ou 150 por cento, o Electron entrega um buffer menor que a janela e o
  // pixel art chega esticado por interpolacao do proprio sistema.
  renderer.setPixelRatio(window.devicePixelRatio);

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
  /** Os objetos 3D assados, com o tamanho da imagem que cada um usa. */
  const placed: {
    mesh: Mesh;
    object: BuiltScene["objects"][number];
    size: CharsetImageSize;
  }[] = [];
  const marks: { mesh: Mesh; id: number }[] = [];
  let marksOn = false;
  let selected: number | null = null;

  /**
   * A grade de celulas.
   *
   * Plana e por cima de tudo, sem teste de profundidade. Em 2D a camera olha
   * reto para baixo, entao uma grade plana cai exatamente em cima das bordas
   * de celula por mais que o terreno suba: elevacao muda a altura, nao a
   * posicao no plano. Em 3D ela some, porque grade plana cortando relevo nao
   * ajuda a ler nada.
   */
  let grid: { minor: LineSegments; major: LineSegments } | null = null;
  let gridOn = true;
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
      color: 0xffe9a3,
      transparent: true,
      opacity: 0.22,
      depthTest: false,
      side: DoubleSide,
    }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 10;
  marker.visible = false;
  scene.add(marker);

  /**
   * O contorno do cursor.
   *
   * So o preenchimento claro nao serve de mira: com pincel de cinco vira uma
   * mancha sem limite legivel. O contorno diz exatamente onde a pincelada
   * comeca e acaba, e deixa o preenchimento poder continuar discreto.
   */
  const cursor = new Mesh(
    outlineGeometry(0.04),
    new MeshBasicMaterial({
      color: 0xffe9a3,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
      side: DoubleSide,
    }),
  );
  cursor.rotation.x = -Math.PI / 2;
  cursor.renderOrder = 10;
  cursor.visible = false;
  scene.add(cursor);
  /** Tamanho de area que o contorno atual foi montado para servir. */
  let cursorFor = "";

  /**
   * O anel do evento selecionado.
   *
   * Uma malha so, reaproveitada, e nao a marca do evento pintada de outra cor:
   * a marca e fina de proposito para nao poluir o mapa, e o selecionado
   * precisa de traco mais grosso para ser achado de longe. Duas coisas
   * diferentes, dois objetos.
   */
  const ring = new Mesh(
    outlineGeometry(0.16),
    new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      side: DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 11;
  ring.visible = false;
  scene.add(ring);

  /** Remove as malhas e os sprites. As texturas ficam no cache, vivas. */
  function clear(): void {
    const all = [
      ...meshes,
      ...sprites.map((entry) => entry.mesh),
      ...placed.map((entry) => entry.mesh),
      ...marks.map((entry) => entry.mesh),
    ];
    for (const mesh of all) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    meshes.length = 0;
    sprites.length = 0;
    placed.length = 0;
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
  let zoom: Zoom = 1;
  /** Camada em foco, ou null quando nenhuma se destaca. */
  let activeLayer: number | null = null;

  /**
   * Quantas unidades de mundo cabem num pixel do buffer, na escala atual.
   *
   * A conta e arredondada para um numero inteiro de pixels por pixel de
   * textura. Com escala do Windows em 125 por cento, 32 pixels de tile dariam
   * 40 pixels de tela e cada pixel de textura ocuparia 1,25, que e justamente
   * o que faz uma coluna sair com um pixel a mais que a vizinha.
   */
  function worldPerPixel(target: BuiltScene): number {
    const ratio = renderer.getPixelRatio();
    const scale = Math.max(1, Math.round((zoom === "fit" ? 1 : zoom) * ratio));
    return target.tileSize / (TILE_PIXELS * scale);
  }

  function resize(): void {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setSize(width, height, false);
    const aspect = width / height;

    if (camera instanceof PerspectiveCamera) {
      camera.aspect = aspect;
    } else if (camera instanceof OrthographicCamera) {
      if (zoom !== "fit" && built !== null) {
        // Escala fixa: a janela mostra o pedaco do mapa que couber, e o resto
        // se alcanca arrastando. E o que o RPG Maker faz, e o contrario de
        // encolher o mapa para caber.
        const unit = worldPerPixel(built);
        const ratio = renderer.getPixelRatio();
        camera.left = (-width * ratio * unit) / 2;
        camera.right = (width * ratio * unit) / 2;
        camera.top = (height * ratio * unit) / 2;
        camera.bottom = (-height * ratio * unit) / 2;
      } else {
        camera.left = -orthoSpan * aspect;
        camera.right = orthoSpan * aspect;
        camera.top = orthoSpan;
        camera.bottom = -orthoSpan;
      }
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
      // se olha: e por isso que aqui a camera so anda, pelo direito e pelo
      // meio. A roda tambem nao aproxima sozinha, porque em escala fixa o
      // zoom anda de degrau em degrau e quem controla isso e a interface.
      controls.mouseButtons = {
        LEFT: null,
        MIDDLE: MOUSE.PAN,
        RIGHT: MOUSE.PAN,
      };
      controls.enableZoom = false;
    } else {
      // Angulo proximo do usado nos jogos de DS: de cima, inclinado.
      camera.position.set(center.x, span * 1.05, center.z + span * 0.78);
      controls.enableRotate = true;
      controls.enableZoom = true;
      controls.mouseButtons = {
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.PAN,
      };
    }
    controls.update();
    resize();
  }

  /**
   * Descarta uma textura do cache.
   *
   * O cache existe para nao recarregar imagem a cada pincelada, e assume que
   * o arquivo nao muda. Quando o editor reassa um objeto, muda: sem isto, a
   * viewport seguiria mostrando a imagem antiga ate reabrir o programa.
   */
  function forgetAsset(url: string): void {
    const texture = textureCache.get(url);
    if (texture === undefined) return;
    textureCache.delete(url);
    texture.dispose();
  }

  function setZoom(next: Zoom): void {
    if (next === zoom) return;
    zoom = next;

    if (built !== null && mode === "2d") {
      framedFor = "";
      frame(built);
    }
    resize();
  }

  /**
   * Prende a camera na grade de pixels.
   *
   * Em escala fixa, meio pixel de deslocamento faz uma coluna de tiles sair
   * com um pixel a mais que a vizinha, que e exatamente a deformacao que a
   * escala inteira existe para evitar. Arrastar move de pixel em pixel.
   */
  function snapCamera(): void {
    if (mode !== "2d" || zoom === "fit" || built === null) return;
    const unit = worldPerPixel(built);
    const snap = (value: number) => Math.round(value / unit) * unit;

    camera.position.x = snap(camera.position.x);
    camera.position.z = snap(camera.position.z);
    controls.target.x = snap(controls.target.x);
    controls.target.z = snap(controls.target.z);
  }

  function frame(target: BuiltScene): void {
    const key = `${mode}:${String(zoom)}:${target.width}x${target.height}`;
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
        outlineGeometry(0.09),
        new MeshBasicMaterial({
          color: 0x9b8cfa,
          transparent: true,
          opacity: 0.5,
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

    drawObjects(target, sizes, loaded);
    layoutEvents(target, sizes);
    paintMarks();
  }

  /**
   * Desenha os objetos 3D ja assados em imagem.
   *
   * A mesma imagem que o jogo vai mostrar, no mesmo lugar: e isso que faz o
   * editor e o jogo concordarem. O que muda entre os dois e so a camera.
   */
  function drawObjects(
    target: BuiltScene,
    sizes: ReadonlyMap<string, CharsetImageSize>,
    loaded: ReadonlyMap<string, Texture>,
  ): void {
    for (const object of target.objects) {
      const key = objectKey(object.name);
      const texture = loaded.get(key);
      const size = sizes.get(key);
      if (texture === undefined || size === undefined) continue;

      const geometry = new PlaneGeometry(1, 1);
      const mesh = new Mesh(
        geometry,
        new MeshBasicMaterial({
          map: texture,
          alphaTest: 0.5,
          side: DoubleSide,
        }),
      );
      mesh.name = `object:${object.name}`;
      mesh.renderOrder = 5;
      scene.add(mesh);
      placed.push({ mesh, object, size });
    }

    layoutObjects(target);
  }

  /**
   * Poe os objetos no lugar pela ancora.
   *
   * A imagem tem margem, e o objeto girado nao encosta nas bordas dela, entao
   * apoiar pelo rodape da imagem erraria a posicao. A ancora diz qual pixel da
   * imagem e o canto sudoeste da area no chao, e o resto e subtracao.
   */
  function layoutObjects(target: BuiltScene): void {
    const unit = target.tileSize / TILE_PIXELS;

    for (const { mesh, object, size } of placed) {
      const width = size.width * unit;
      const height = size.height * unit;

      // Canto da imagem, a partir do ponto de ancoragem no mundo.
      const left = object.centreX - object.anchorX * unit;

      mesh.scale.set(width, height, 1);
      mesh.rotation.set(mode === "2d" ? -Math.PI / 2 : 0, 0, 0);

      if (mode === "2d") {
        // Deitado: a altura da imagem corre para o norte a partir da ancora.
        const bottom = object.footZ + (size.height - object.anchorY) * unit;
        mesh.position.set(
          left + width / 2,
          object.base + LAYER_GAP * 4,
          bottom - height / 2,
        );
      } else {
        // Em pe: a linha da ancora fica no chao, e a sombra assada fica
        // abaixo dela, enterrada, que e onde ela some sozinha.
        mesh.position.set(
          left + width / 2,
          object.base + (object.anchorY * unit) - height / 2,
          object.footZ,
        );
      }
    }
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
      if (source.kind === "marker" && mode === "2d") {
        mesh.position.z = billboard.z;
      }
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
    paintLayers();
    drawEvents(next, sizes, loaded);
    buildGrid(next);

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

  function highlight(cell: PickedCell | null, area?: HighlightArea): void {
    if (cell === null || built === null) {
      marker.visible = false;
      cursor.visible = false;
      return;
    }

    const span = area ?? { left: 0, top: 0, width: 1, height: 1 };
    const size = built.tileSize;

    // O centro da area, que nao e a celula apontada quando o carimbo e um
    // bloco: bloco cai com o canto no cursor, e o cursor precisa mostrar isso.
    const centreX = cell.x + span.left + (span.width - 1) / 2;
    const centreY = cell.y + span.top + (span.height - 1) / 2;

    const top = built.surface[cell.y * built.width + cell.x] ?? 0;
    marker.scale.set(size * span.width, size * span.height, 1);
    marker.position.set(centreX * size, top + 0.02, centreY * size);
    marker.visible = true;

    // A espessura e em celula, entao uma area larga precisa de fracao menor
    // para a borda sair com a mesma grossura nos dois eixos. Refeita so
    // quando o tamanho muda, e nao a cada movimento do mouse.
    const key = `${span.width}x${span.height}`;
    if (key !== cursorFor) {
      cursorFor = key;
      cursor.geometry.dispose();
      cursor.geometry = outlineGeometry(0.06 / span.width, 0.06 / span.height);
    }
    cursor.scale.copy(marker.scale);
    cursor.position.copy(marker.position);
    cursor.visible = true;
  }

  /**
   * Refaz a grade para o mapa aberto.
   *
   * Duas malhas: a fina em cada celula, e uma mais firme a cada oito, que e o
   * passo do tileset e o que deixa contar distancia sem ficar somando de um
   * em um.
   */
  function buildGrid(target: BuiltScene): void {
    if (grid !== null) {
      for (const lines of [grid.minor, grid.major]) {
        scene.remove(lines);
        lines.geometry.dispose();
        (lines.material as LineBasicMaterial).dispose();
      }
      grid = null;
    }

    const step = target.tileSize;
    const half = step / 2;
    const left = -half;
    const top = -half;
    const right = (target.width - 1) * step + half;
    const bottom = (target.height - 1) * step + half;
    // Acima de tudo que a cena desenha, e sem teste de profundidade: a grade e
    // ajuda de edicao, nao parte do mundo.
    const y = 0.5;

    const minor: number[] = [];
    const major: number[] = [];
    const MAJOR_EVERY = 8;

    for (let x = 0; x <= target.width; x += 1) {
      const at = left + x * step;
      const into = x % MAJOR_EVERY === 0 ? major : minor;
      into.push(at, y, top, at, y, bottom);
    }
    for (let z = 0; z <= target.height; z += 1) {
      const at = top + z * step;
      const into = z % MAJOR_EVERY === 0 ? major : minor;
      into.push(left, y, at, right, y, at);
    }

    const lines = (points: number[], color: number, opacity: number) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(points), 3),
      );
      const mesh = new LineSegments(
        geometry,
        new LineBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthTest: false,
        }),
      );
      mesh.renderOrder = 9;
      scene.add(mesh);
      return mesh;
    };

    grid = {
      minor: lines(minor, 0xdfe3ea, 0.5),
      major: lines(major, 0xdfe3ea, 0.85),
    };
    paintGrid();
  }

  /** A grade vale so em 2D, e so quando ligada. */
  function paintGrid(): void {
    const on = gridOn && mode === "2d";
    if (grid === null) return;
    grid.minor.visible = on;
    grid.major.visible = on;
  }

  function setGrid(on: boolean): void {
    gridOn = on;
    paintGrid();
  }

  /**
   * Apaga as camadas que nao estao em foco.
   *
   * O tile continua na tela, so mais escuro: sumir com ele esconderia o que
   * ja existe embaixo e faria a pessoa pintar por cima sem saber. As camadas
   * acima da atual ficam mais apagadas que as de baixo, porque sao elas que
   * tapam o que esta sendo desenhado.
   */
  function paintLayers(): void {
    for (const mesh of meshes) {
      const layer = layerOf(mesh.name);
      if (layer === null) continue;

      const material = mesh.material as MeshBasicMaterial;
      const shade =
        activeLayer === null || layer === activeLayer
          ? 1
          : layer < activeLayer
            ? 0.5
            : 0.36;
      material.color.setScalar(shade);
    }
  }

  function setActiveLayer(layer: number | null): void {
    activeLayer = layer;
    paintLayers();
  }

  /** Aplica a visibilidade das marcas de evento e do anel do selecionado. */
  function paintMarks(): void {
    ring.visible = false;

    for (const { mesh, id } of marks) {
      mesh.visible = marksOn;
      if (!marksOn || id !== selected || built === null) continue;

      const found = built.billboards.find((entry) => entry.id === id);
      if (found === undefined) continue;

      ring.scale.set(built.tileSize, built.tileSize, 1);
      ring.position.set(found.x, found.base + LAYER_GAP * 6, found.z);
      ring.visible = true;
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
    paintGrid();
    if (built !== null) {
      layoutObjects(built);
      layoutEvents(built, lastSizes);
      frame(built);
    } else {
      resize();
    }
  }

  renderer.setAnimationLoop(() => {
    controls.update();
    snapCamera();

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
    setZoom,
    forgetAsset,
    setGrid,
    setActiveLayer,
    setEventMarks,
    selectEvent,
    setMode,
    resize,
    dispose(): void {
      clear();
      if (grid !== null) {
        for (const lines of [grid.minor, grid.major]) {
          scene.remove(lines);
          lines.geometry.dispose();
          (lines.material as LineBasicMaterial).dispose();
        }
        grid = null;
      }
      for (const texture of textureCache.values()) texture.dispose();
      textureCache.clear();
      cursor.geometry.dispose();
      (cursor.material as MeshBasicMaterial).dispose();
      ring.geometry.dispose();
      (ring.material as MeshBasicMaterial).dispose();
      controls.dispose();
      renderer.setAnimationLoop(null);
      renderer.dispose();
    },
  };
}
