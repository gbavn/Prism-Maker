import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import {
  dump,
  load,
  loadMap,
  loadMapInfos,
  loadTilesets,
  RubyObject,
  RubyString,
  RubySymbol,
  Table,
  type RPGMap,
  type RPGTileset,
  type RubyValue,
} from "@prism/rxdata-parser";
import {
  decodeElevation,
  encodeElevationRunLength,
  parseProject,
  parseScene,
  type Project,
  type Scene,
} from "@prism/scene-format";
import {
  buildScene,
  type BuiltScene,
  type PlacedObject,
} from "../scene/buildScene.js";
export type { PlacedObject };
import { MAP_LAYERS } from "@prism/scene-format";

/**
 * Abertura de um projeto Essentials do disco.
 *
 * Roda no processo principal do Electron, nao no renderer: e ali que o acesso
 * a disco e direto. O renderer recebe so a cena ja construida, o que mantem a
 * janela sem privilegio de arquivo.
 */

/**
 * Imagens que a viewport precisa carregar.
 *
 * Os caminhos sao relativos a raiz do projeto e a janela os busca pelo
 * protocolo prism-asset, que so serve arquivos de dentro do projeto aberto.
 * Passar o caminho em vez do conteudo evita jogar megabytes de PNG pelo IPC a
 * cada troca de mapa.
 */
export interface MapGraphics {
  /** Graphics/Tilesets/<nome>.png, ou null quando o tileset nao tem imagem. */
  tileset: string | null;
  /** Por indice de autotile, Graphics/Autotiles/<nome>.png ou null. */
  autotiles: (string | null)[];
  /**
   * Por nome de charset usado no mapa, Graphics/Characters/<nome>.png.
   *
   * So os charsets que este mapa usa: um projeto Essentials tem centenas
   * deles, e mandar a lista inteira a cada troca de mapa nao serviria para
   * nada.
   */
  characters: Record<string, string>;
}

/**
 * Uma pagina de evento, sem a lista de comandos.
 *
 * Os comandos ficam de fora de proposito: um evento de dialogo longo tem
 * centenas deles, e nada na interface de hoje os mostra. O que existe e a
 * contagem, que ja responde "esse evento faz alguma coisa?".
 */
export interface EventPageSummary {
  characterName: string;
  direction: number;
  pattern: number;
  tileId: number;
  opacity: number;
  /** 0 acao, 1 contato com o jogador, 2 contato com evento, 3 automatico, 4 paralelo. */
  trigger: number;
  moveType: number;
  moveSpeed: number;
  moveFrequency: number;
  walkAnime: boolean;
  stepAnime: boolean;
  directionFix: boolean;
  through: boolean;
  alwaysOnTop: boolean;
  commands: number;
}

export interface EventSummary {
  id: number;
  name: string;
  x: number;
  y: number;
  pages: EventPageSummary[];
}

export interface OpenedMap {
  id: number;
  name: string;
  /** Dimensoes da grade, para a ferramenta de elevacao saber onde pode pintar. */
  grid: { width: number; height: number };
  /** Altura de cada celula em degraus, na ordem de varredura do XP. */
  heights: number[];
  graphics: MapGraphics;
  /** Os eventos do mapa, para a lista e a inspecao do modo Events. */
  events: EventSummary[];
  /** Objetos 3D colocados pelo editor neste mapa. */
  objects: PlacedObject[];
  /** Grade de tiles, largura por altura por três camadas, na ordem do XP. */
  tiles: Uint16Array;
  scene: BuiltScene;
}

export interface OpenedProject {
  root: string;
  maps: { id: number; name: string }[];
}

function dataPath(root: string, file: string): string {
  return join(root, "Data", file);
}

function readBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

function mapFileName(id: number): string {
  return `Map${String(id).padStart(3, "0")}.rxdata`;
}

/**
 * Resolve o caminho de uma imagem, tolerando diferenca de caixa.
 *
 * Os nomes em Tilesets.rxdata nem sempre batem letra por letra com o arquivo
 * em disco, e em Linux isso e a diferenca entre funcionar e nao funcionar. O
 * Windows onde a maioria dos projetos e feito perdoa; nos nao podemos assumir
 * isso.
 */
function findGraphic(root: string, folder: string, name: string): string | null {
  if (name.trim() === "") return null;

  const direct = join(root, "Graphics", folder, `${name}.png`);
  if (existsSync(direct)) return `Graphics/${folder}/${name}.png`;

  try {
    const wanted = `${name.toLowerCase()}.png`;
    const found = readdirSync(join(root, "Graphics", folder)).find(
      (file) => file.toLowerCase() === wanted,
    );
    return found === undefined ? null : `Graphics/${folder}/${found}`;
  } catch {
    return null;
  }
}

function mapGraphics(
  root: string,
  tileset: RPGTileset,
  map: RPGMap,
): MapGraphics {
  const characters: Record<string, string> = {};
  for (const event of map.events.values()) {
    for (const page of event.pages) {
      const name = page.graphic.characterName;
      if (name === "" || name in characters) continue;
      const path = findGraphic(root, "Characters", name);
      if (path !== null) characters[name] = path;
    }
  }

  return {
    tileset: findGraphic(root, "Tilesets", tileset.tilesetName),
    autotiles: tileset.autotileNames.map((name) =>
      findGraphic(root, "Autotiles", name),
    ),
    characters,
  };
}

/** Resume os eventos do mapa para a janela, sem as listas de comando. */
function mapEvents(map: RPGMap): EventSummary[] {
  return [...map.events.values()]
    .map((event) => ({
      id: event.id,
      name: event.name,
      x: event.x,
      y: event.y,
      pages: event.pages.map((page) => ({
        characterName: page.graphic.characterName,
        direction: page.graphic.direction,
        pattern: page.graphic.pattern,
        tileId: page.graphic.tileId,
        opacity: page.graphic.opacity,
        trigger: page.trigger,
        moveType: page.moveType,
        moveSpeed: page.moveSpeed,
        moveFrequency: page.moveFrequency,
        walkAnime: page.walkAnime,
        stepAnime: page.stepAnime,
        directionFix: page.directionFix,
        through: page.through,
        alwaysOnTop: page.alwaysOnTop,
        commands: page.commands.length,
      })),
    }))
    .sort((a, b) => a.id - b.id);
}

function sceneFileName(id: number): string {
  return `Map${String(id).padStart(3, "0")}.scene.json`;
}

/** Le a lista de mapas do projeto, sem carregar os mapas em si. */
export function openProject(root: string): OpenedProject {
  const infos = loadMapInfos(readBytes(dataPath(root, "MapInfos.rxdata")));
  const maps = [...infos.entries()]
    .map(([id, info]) => ({ id, name: info.name, order: info.order }))
    .sort((a, b) => a.order - b.order)
    .map(({ id, name }) => ({ id, name }));

  return { root, maps };
}

/**
 * Manifesto do projeto.
 *
 * Quando `prism.project.json` nao existe, o editor segue com os defaults do
 * scene-format em vez de recusar a abrir. Um projeto Essentials recem-aberto
 * nunca vai ter esse arquivo, e exigir configuracao antes de mostrar qualquer
 * coisa na tela seria o caminho errado.
 */
function loadManifest(root: string): Project {
  try {
    const text = readFileSync(join(root, "prism.project.json"), "utf8");
    return parseProject(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return parseProject({ formatVersion: 1 });
    }
    throw error;
  }
}

/** Cena de um mapa, se existir um .scene.json ao lado do .rxdata. */
function loadSceneFile(root: string, id: number): Scene | undefined {
  try {
    const path = dataPath(root, sceneFileName(id));
    return parseScene(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Mapa e tileset ja lidos, por projeto e por id.
 *
 * A ferramenta de elevacao reconstroi a cena a cada pincelada. Reler o
 * .rxdata nesse caminho tornaria a edicao travada sem nenhum ganho: o mapa em
 * si nao muda enquanto se edita relevo. O cache e invalidado ao reabrir o
 * mapa, que e quando o arquivo pode ter mudado por fora.
 */
const loaded = new Map<
  string,
  { map: RPGMap; tileset: RPGTileset; objects: PlacedObject[] }
>();

function cacheKey(root: string, id: number): string {
  return `${root}\u0000${id}`;
}

/**
 * Le os objetos colocados pelo Prism dentro do .rxdata.
 *
 * Ivar propria, que o RPG Maker ignora. Um arquivo sem ela e o caso comum, e
 * nao e erro: mapa nenhum do Essentials tem objeto do Prism.
 */
function readObjects(bytes: Uint8Array): PlacedObject[] {
  const document = load(bytes);
  if (!(document instanceof RubyObject)) return [];

  const list = document.ivars.get("@prism_objects");
  if (!Array.isArray(list)) return [];

  const objects: PlacedObject[] = [];
  for (const entry of list) {
    if (!(entry instanceof Map)) continue;
    const field = (name: string) => {
      for (const [key, value] of entry) {
        if (key instanceof RubySymbol && key.name === name) return value;
      }
      return undefined;
    };

    const name = field("name");
    const x = field("x");
    const y = field("y");
    const width = field("width");
    const depth = field("depth");
    const anchorX = field("anchor_x");
    const anchorY = field("anchor_y");

    if (
      !(name instanceof RubyString) ||
      typeof x !== "number" ||
      typeof y !== "number" ||
      typeof width !== "number" ||
      typeof depth !== "number"
    ) {
      continue;
    }
    objects.push({
      name: name.text,
      x,
      y,
      width,
      depth,
      anchorX: typeof anchorX === "number" ? anchorX : 0,
      anchorY: typeof anchorY === "number" ? anchorY : 0,
    });
  }
  return objects;
}

function readMapAndTileset(
  root: string,
  id: number,
): { map: RPGMap; tileset: RPGTileset; objects: PlacedObject[] } {
  const bytes = readBytes(dataPath(root, mapFileName(id)));
  const map: RPGMap = loadMap(bytes);
  const objects = readObjects(bytes);
  const tilesets = loadTilesets(readBytes(dataPath(root, "Tilesets.rxdata")));
  const tileset = tilesets.get(map.tilesetId);

  if (tileset === undefined) {
    throw new Error(
      `o mapa ${id} usa o tileset ${map.tilesetId}, que nao existe no projeto`,
    );
  }
  return { map, tileset, objects };
}

/**
 * Reconstroi a cena com alturas novas, sem tocar no disco.
 *
 * E o caminho quente da ferramenta de elevacao.
 */
export function rebuildScene(
  root: string,
  id: number,
  heights: readonly number[],
  tiles?: Uint16Array,
): BuiltScene {
  const entry = loaded.get(cacheKey(root, id)) ?? readMapAndTileset(root, id);
  loaded.set(cacheKey(root, id), entry);

  // Com tiles novos, a cena é construída sobre uma grade temporária. O mapa em
  // cache continua com o que está em disco, porque é ele que vai ser
  // reescrito na gravação e misturar os dois perderia a referência.
  const map =
    tiles === undefined
      ? entry.map
      : {
          ...entry.map,
          data: new Table(3, entry.map.width, entry.map.height, MAP_LAYERS, tiles),
        };

  return buildScene({
    map,
    tileset: entry.tileset,
    project: loadManifest(root),
    heights,
    objects: entry.objects,
  });
}

export function openMap(root: string, id: number): OpenedMap {
  const entry = readMapAndTileset(root, id);
  loaded.set(cacheKey(root, id), entry);
  rememberMtime(root, id);
  const { map, tileset, objects } = entry;

  const infos = loadMapInfos(readBytes(dataPath(root, "MapInfos.rxdata")));
  const scene = loadSceneFile(root, id);
  const heights = scene
    ? decodeElevation(scene.elevation)
    : new Array<number>(map.width * map.height).fill(0);

  return {
    id,
    name: infos.get(id)?.name ?? `Map${id}`,
    grid: { width: map.width, height: map.height },
    graphics: mapGraphics(root, tileset, map),
    events: mapEvents(map),
    objects,
    tiles: new Uint16Array(map.data.data),
    heights,
    scene: buildScene({
      map,
      tileset,
      project: loadManifest(root),
      heights,
      objects,
    }),
  };
}

/** Uma string do Ruby em UTF-8, com o marcador de encoding que o Marshal usa. */
function utf8(text: string): RubyString {
  const value = new RubyString(new TextEncoder().encode(text));
  value.ivars.set("E", true);
  return value;
}

/**
 * Grava os objetos do mapa dentro do proprio .rxdata.
 *
 * Numa variavel de instancia a mais, `@prism_objects`, no RPG::Map. O Marshal
 * do Ruby serializa qualquer ivar que o objeto tiver, e o RPG Maker XP ignora
 * o que nao conhece: o projeto continua abrindo no editor original e no jogo
 * sem o plugin. E a mesma tecnica que o Maker Studio usa para as camadas
 * extras dele, verificada no codigo da integracao deles.
 *
 * Diferenca proposital: eles guardam uma string JSON, porque o editor deles e
 * JavaScript e escrever estrutura Ruby daria trabalho. Aqui vai um Array de
 * Hash de verdade, que o jogo le sem parser nenhum. O mkxp-z nao traz a
 * biblioteca json, entao a alternativa custaria um parser escrito a mao.
 */
export function saveObjects(
  root: string,
  id: number,
  objects: readonly PlacedObject[],
): { path: string; count: number } {
  assertUnchanged(root, id);

  const relative = join("Data", mapFileName(id));
  const source = join(root, relative);
  const document = load(readBytes(source));

  if (!(document instanceof RubyObject) || document.className !== "RPG::Map") {
    throw new Error(`${mapFileName(id)} não é um RPG::Map`);
  }

  const list = objects.map((object) => {
    // Chaves em simbolo, que no Ruby se le `object[:name]`. Valor de texto
    // com o marcador de encoding, senao a string chega ao jogo como bytes
    // sem encoding declarado.
    const entry = new Map<RubyValue, RubyValue>();
    entry.set(new RubySymbol("name"), utf8(object.name));
    entry.set(new RubySymbol("x"), object.x);
    entry.set(new RubySymbol("y"), object.y);
    entry.set(new RubySymbol("width"), object.width);
    entry.set(new RubySymbol("depth"), object.depth);
    entry.set(new RubySymbol("anchor_x"), object.anchorX);
    entry.set(new RubySymbol("anchor_y"), object.anchorY);
    return entry;
  });

  backupOnce(root, relative);
  document.ivars.set("@prism_objects", list);

  const temporary = `${source}.prism-tmp`;
  writeFileSync(temporary, dump(document));
  renameSync(temporary, source);

  loaded.delete(cacheKey(root, id));
  rememberMtime(root, id);

  return { path: source, count: objects.length };
}

/**
 * Grava a elevacao no MapNNN.scene.json ao lado do .rxdata.
 *
 * Tres cuidados que parecem detalhe e nao sao:
 *
 * O `.rxdata` nao e tocado. O relevo e informacao que o RPG Maker nao tem, e
 * escrever nele quebraria a promessa de que o projeto continua um projeto
 * Essentials valido.
 *
 * O que ja existe no arquivo e preservado. Camera, excecoes por celula e
 * colocacao de eventos foram escritos por outra parte do editor ou a mao;
 * salvar elevacao nao pode apaga-los.
 *
 * O documento passa pelo schema antes de ir para o disco. Gravar primeiro e
 * validar depois deixaria um arquivo invalido no projeto da pessoa.
 */
export function saveElevation(
  root: string,
  id: number,
  heights: readonly number[],
): { path: string; cells: number } {
  const map = loadMap(readBytes(dataPath(root, mapFileName(id))));

  if (heights.length !== map.width * map.height) {
    throw new Error(
      `a elevacao tem ${heights.length} celulas, mas o mapa ${id} e ` +
        `${map.width}x${map.height}`,
    );
  }

  const existing = loadSceneFile(root, id);
  const document = {
    ...(existing ?? {}),
    formatVersion: 1,
    map: {
      id,
      width: map.width,
      height: map.height,
      tilesetId: map.tilesetId,
    },
    elevation: encodeElevationRunLength(heights),
  };

  const validated = parseScene(document);
  const path = dataPath(root, sceneFileName(id));
  writeFileSync(path, `${JSON.stringify(validated, null, 2)}\n`, "utf8");

  return { path, cells: heights.length };
}

/**
 * Pasta de backup da sessão.
 *
 * Uma por execução do editor, e não uma por gravação: quem quer voltar atrás
 * quer o estado de antes de mexer, não trinta cópias intermediárias.
 */
const sessionStamp = new Date().toISOString().replace(/[:.]/g, "-");
const backedUp = new Set<string>();

/**
 * Copia o arquivo antes da primeira escrita da sessão.
 *
 * É a rede de segurança que faz valer a pena escrever no .rxdata: mesmo que
 * tudo dê errado, o original da sessão está a um `cp` de distância.
 */
function backupOnce(root: string, relative: string): void {
  const key = `${root}\u0000${relative}`;
  if (backedUp.has(key)) return;

  const source = join(root, relative);
  if (!existsSync(source)) return;

  const folder = join(root, ".prism", "backups", sessionStamp);
  mkdirSync(folder, { recursive: true });
  copyFileSync(source, join(folder, basename(relative)));
  backedUp.add(key);
}

/** Quando cada arquivo foi lido, para detectar edição por fora. */
const readAt = new Map<string, number>();

function rememberMtime(root: string, id: number): void {
  const path = dataPath(root, mapFileName(id));
  if (existsSync(path)) readAt.set(cacheKey(root, id), statSync(path).mtimeMs);
}

function assertUnchanged(root: string, id: number): void {
  const seen = readAt.get(cacheKey(root, id));
  const path = dataPath(root, mapFileName(id));
  if (seen === undefined || !existsSync(path)) return;

  if (statSync(path).mtimeMs !== seen) {
    throw new Error(
      `o mapa ${id} mudou em disco depois que foi aberto aqui; ` +
        "reabra o mapa antes de gravar para não apagar a edição de fora",
    );
  }
}

/**
 * Escreve a grade de tiles de volta no .rxdata.
 *
 * O documento inteiro é lido, só a Table é alterada e o resto sai como
 * entrou. Isso importa porque o .rxdata guarda muito mais que tiles: eventos,
 * áudio, encontros. Reconstruir o documento a partir dos nossos tipos
 * descartaria em silêncio qualquer campo que o parser não conheça, e o teste
 * de ida e volta byte a byte é o que garante que a reescrita é fiel.
 */
export function saveTiles(
  root: string,
  id: number,
  tiles: Uint16Array,
): { path: string; cells: number } {
  assertUnchanged(root, id);

  const relative = join("Data", mapFileName(id));
  const source = join(root, relative);
  const document = load(readBytes(source));

  if (!(document instanceof RubyObject) || document.className !== "RPG::Map") {
    throw new Error(`${mapFileName(id)} não é um RPG::Map`);
  }

  const table = document.get("data");
  if (!(table instanceof Table)) {
    throw new Error(`${mapFileName(id)} não tem a grade de tiles`);
  }
  if (table.data.length !== tiles.length) {
    throw new Error(
      `a grade tem ${tiles.length} células, mas o mapa tem ${table.data.length}`,
    );
  }

  backupOnce(root, relative);
  table.data.set(tiles);

  // Escrita atômica: um arquivo temporário e um rename. Sem isso, uma queda no
  // meio da escrita deixaria um .rxdata pela metade, e o projeto não abriria
  // mais nem aqui nem no RPG Maker.
  const temporary = `${source}.prism-tmp`;
  writeFileSync(temporary, dump(document));
  renameSync(temporary, source);

  loaded.delete(cacheKey(root, id));
  rememberMtime(root, id);

  return { path: source, cells: tiles.length };
}
