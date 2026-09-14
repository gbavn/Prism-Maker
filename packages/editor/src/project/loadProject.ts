import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadMap,
  loadMapInfos,
  loadTilesets,
  type RPGMap,
  type RPGTileset,
} from "@prism/rxdata-parser";
import { parseProject, parseScene, type Project, type Scene } from "@prism/scene-format";
import { buildScene, type BuiltScene } from "../scene/buildScene.js";

/**
 * Abertura de um projeto Essentials do disco.
 *
 * Roda no processo principal do Electron, nao no renderer: e ali que o acesso
 * a disco e direto. O renderer recebe so a cena ja construida, o que mantem a
 * janela sem privilegio de arquivo.
 */

export interface OpenedMap {
  id: number;
  name: string;
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
    const path = dataPath(root, `Map${String(id).padStart(3, "0")}.scene.json`);
    return parseScene(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function openMap(root: string, id: number): OpenedMap {
  const map: RPGMap = loadMap(readBytes(dataPath(root, mapFileName(id))));
  const tilesets = loadTilesets(readBytes(dataPath(root, "Tilesets.rxdata")));
  const tileset: RPGTileset | undefined = tilesets.get(map.tilesetId);

  if (tileset === undefined) {
    throw new Error(
      `o mapa ${id} usa o tileset ${map.tilesetId}, que nao existe no projeto`,
    );
  }

  const infos = loadMapInfos(readBytes(dataPath(root, "MapInfos.rxdata")));
  const scene = loadSceneFile(root, id);

  return {
    id,
    name: infos.get(id)?.name ?? `Map${id}`,
    scene: buildScene({
      map,
      tileset,
      project: loadManifest(root),
      ...(scene ? { elevation: scene.elevation } : {}),
    }),
  };
}
