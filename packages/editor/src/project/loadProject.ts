import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadMap,
  loadMapInfos,
  loadTilesets,
  type RPGMap,
  type RPGTileset,
} from "@prism/rxdata-parser";
import {
  decodeElevation,
  encodeElevationRunLength,
  parseProject,
  parseScene,
  type Project,
  type Scene,
} from "@prism/scene-format";
import { buildScene, type BuiltScene } from "../scene/buildScene.js";

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
}

export interface OpenedMap {
  id: number;
  name: string;
  /** Dimensoes da grade, para a ferramenta de elevacao saber onde pode pintar. */
  grid: { width: number; height: number };
  /** Altura de cada celula em degraus, na ordem de varredura do XP. */
  heights: number[];
  graphics: MapGraphics;
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

function mapGraphics(root: string, tileset: RPGTileset): MapGraphics {
  return {
    tileset: findGraphic(root, "Tilesets", tileset.tilesetName),
    autotiles: tileset.autotileNames.map((name) =>
      findGraphic(root, "Autotiles", name),
    ),
  };
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
const loaded = new Map<string, { map: RPGMap; tileset: RPGTileset }>();

function cacheKey(root: string, id: number): string {
  return `${root}\u0000${id}`;
}

function readMapAndTileset(
  root: string,
  id: number,
): { map: RPGMap; tileset: RPGTileset } {
  const map: RPGMap = loadMap(readBytes(dataPath(root, mapFileName(id))));
  const tilesets = loadTilesets(readBytes(dataPath(root, "Tilesets.rxdata")));
  const tileset = tilesets.get(map.tilesetId);

  if (tileset === undefined) {
    throw new Error(
      `o mapa ${id} usa o tileset ${map.tilesetId}, que nao existe no projeto`,
    );
  }
  return { map, tileset };
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
): BuiltScene {
  const entry = loaded.get(cacheKey(root, id)) ?? readMapAndTileset(root, id);
  loaded.set(cacheKey(root, id), entry);

  return buildScene({
    map: entry.map,
    tileset: entry.tileset,
    project: loadManifest(root),
    heights,
  });
}

export function openMap(root: string, id: number): OpenedMap {
  const entry = readMapAndTileset(root, id);
  loaded.set(cacheKey(root, id), entry);
  const { map, tileset } = entry;

  const infos = loadMapInfos(readBytes(dataPath(root, "MapInfos.rxdata")));
  const scene = loadSceneFile(root, id);
  const heights = scene
    ? decodeElevation(scene.elevation)
    : new Array<number>(map.width * map.height).fill(0);

  return {
    id,
    name: infos.get(id)?.name ?? `Map${id}`,
    grid: { width: map.width, height: map.height },
    graphics: mapGraphics(root, tileset),
    heights,
    scene: buildScene({ map, tileset, project: loadManifest(root), heights }),
  };
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
