import type { OpenedMap, OpenedProject } from "../project/loadProject.js";

/** Canais de IPC entre o processo principal e a janela. */
export const IPC = {
  openProject: "prism:open-project",
  openMap: "prism:open-map",
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
}

declare global {
  interface Window {
    prism: PrismApi;
  }
}
