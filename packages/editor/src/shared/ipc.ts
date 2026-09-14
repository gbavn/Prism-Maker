import type { OpenedMap, OpenedProject } from "../project/loadProject.js";
import type { BuiltScene } from "../scene/buildScene.js";

/** Canais de IPC entre o processo principal e a janela. */
export const IPC = {
  openProject: "prism:open-project",
  openMap: "prism:open-map",
  buildScene: "prism:build-scene",
  saveElevation: "prism:save-elevation",
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
  ): Promise<BuiltScene>;
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
