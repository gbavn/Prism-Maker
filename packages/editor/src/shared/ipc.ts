import type { OpenedMap, OpenedProject } from "../project/loadProject.js";
import type { PlacedObject } from "../scene/buildScene.js";
import type { BuiltScene } from "../scene/buildScene.js";

/** Canais de IPC entre o processo principal e a janela. */
export const IPC = {
  openProject: "prism:open-project",
  openMap: "prism:open-map",
  buildScene: "prism:build-scene",
  saveElevation: "prism:save-elevation",
  saveTiles: "prism:save-tiles",
  confirmSave: "prism:confirm-save",
  playtest: "prism:playtest",
  bakeObject: "prism:bake-object",
  listModels: "prism:list-models",
  saveObjects: "prism:save-objects",
} as const;

/**
 * O que o preload expoe para a janela.
 *
 * A janela nao tem acesso a disco nem ao Node: tudo passa por aqui. Manter a
 * superficie pequena e o que permite deixar contextIsolation ligado sem
 * abrir mao de nada.
 */
export interface PrismApi {
  openProject(root?: string): Promise<OpenedProject>;
  openMap(root: string, id: number): Promise<OpenedMap>;
  /** Reconstroi a cena com alturas novas, sem reler o .rxdata. */
  buildScene(
    root: string,
    id: number,
    heights: readonly number[],
    tiles?: Uint16Array,
    objects?: readonly PlacedObject[],
  ): Promise<BuiltScene>;
  /** Grava a grade de tiles de volta no .rxdata. */
  saveTiles(
    root: string,
    id: number,
    tiles: Uint16Array,
  ): Promise<{ path: string; cells: number }>;
  saveElevation(
    root: string,
    id: number,
    heights: readonly number[],
  ): Promise<{ path: string; cells: number }>;
  /** Pergunta o que fazer com alteracao pendente antes de sair do mapa. */
  confirmSave(mapName: string): Promise<SaveAnswer>;
  /** Abre o jogo do projeto. */
  playtest(root: string): Promise<PlaytestResult>;
  /**
   * Grava a imagem assada em Graphics/Objects e a colocacao no .rxdata.
   *
   * O render acontece na janela, que e onde existe WebGL; aqui vai so o PNG
   * pronto, em base64.
   */
  /**
   * Grava a imagem assada em Graphics/Objects.
   *
   * So a imagem: a colocacao no mapa fica com o `saveObjects`, porque ela e
   * alteracao pendente como tile e elevacao, e a imagem nao e. O render
   * acontece na janela, que e onde existe WebGL, entao aqui chega o PNG
   * pronto, em base64.
   */
  bakeObject(
    root: string,
    name: string,
    png: string,
  ): Promise<{ image: string }>;
  /** Os modelos 3D do projeto, varridos de Prism/Models. */
  listModels(root: string): Promise<ModelEntry[]>;
  /** Grava a lista de objetos do mapa no .rxdata, sem assar nada. */
  saveObjects(
    root: string,
    id: number,
    objects: readonly PlacedObject[],
  ): Promise<{ path: string; count: number }>;
}

/**
 * Um modelo no catalogo.
 *
 * A categoria e a subpasta: `Prism/Models/buildings/lab.obj` vira categoria
 * "buildings" e nome "lab". Separar por subpasta e o que evita colisao de nome
 * entre um poste e um predio, e da ao painel um agrupamento sem inventar
 * metadado nenhum.
 */
export interface ModelEntry {
  /** Categoria, ou seja a subpasta. Vazio quando o arquivo esta na raiz. */
  category: string;
  /** Nome do arquivo sem extensao. */
  name: string;
  /** Caminho relativo a raiz do projeto, com barras normais. */
  path: string;
}

/** Resposta do dialogo de alteracao pendente. */
export type SaveAnswer = "save" | "discard" | "cancel";

export interface PlaytestResult {
  started: boolean;
  /** Caminho do executavel, ou o motivo de nao ter aberto. */
  detail: string;
}

declare global {
  interface Window {
    prism: PrismApi;
  }
}

/** Monta a URL de um arquivo do projeto para a janela carregar. */
export function assetUrl(relativePath: string): string {
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  return `prism-asset://project/${encoded}`;
}
