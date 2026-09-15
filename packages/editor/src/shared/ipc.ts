import type { OpenedMap, OpenedProject } from "../project/loadProject.js";
import type { BuiltScene } from "../scene/buildScene.js";

/** Canais de IPC entre o processo principal e a janela. */
export const IPC = {
  openProject: "prism:open-project",
  openMap: "prism:open-map",
  buildScene: "prism:build-scene",
  saveElevation: "prism:save-elevation",
  saveTiles: "prism:save-tiles",
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
