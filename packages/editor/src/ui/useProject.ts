import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenedMap, OpenedProject } from "../project/loadProject.js";
import { History } from "../scene/elevation.js";

/**
 * O rascunho do mapa aberto.
 *
 * Elevação e tiles vivem no mesmo objeto porque o desfazer é um só: quem
 * aperta ctrl+Z espera voltar a última coisa que fez, não a última coisa que
 * fez naquela ferramenta.
 *
 * Os dois campos são trocados por referência, nunca alterados no lugar. Assim
 * uma edição de tile reaproveita o array de alturas anterior, e cada passo do
 * histórico custa só a metade que mudou.
 */
export interface Draft {
  heights: number[];
  tiles: Uint16Array;
}

export interface ProjectState {
  project: OpenedProject | null;
  map: OpenedMap | null;
  loading: boolean;
  error: string | null;
}

export function useProject() {
  const [state, setState] = useState<ProjectState>({
    project: null,
    map: null,
    loading: true,
    error: null,
  });

  const history = useRef<History<Draft> | null>(null);
  const saved = useRef<Draft | null>(null);
  /**
   * Contador que força o React a redesenhar depois de mexer no histórico.
   *
   * O rascunho vive num ref, e não em estado, porque são milhares de números
   * trocados a cada pincelada. O preço é que desfazer e refazer não
   * redesenhariam sozinhos e os botões ficariam com estado velho.
   */
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const project = await window.prism.openProject();
        if (!cancelled) setState((old) => ({ ...old, project, loading: false }));
      } catch (error) {
        if (!cancelled) {
          setState((old) => ({
            ...old,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const openMap = useCallback(
    async (id: number) => {
      const root = state.project?.root;
      if (root === undefined) return null;

      setState((old) => ({ ...old, loading: true, error: null }));
      try {
        const map = await window.prism.openMap(root, id);
        const draft: Draft = {
          heights: [...map.heights],
          tiles: new Uint16Array(map.tiles),
        };
        history.current = new History<Draft>(draft);
        saved.current = draft;
        setState((old) => ({ ...old, map, loading: false }));
        bump();
        return map;
      } catch (error) {
        setState((old) => ({
          ...old,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        }));
        return null;
      }
    },
    [state.project?.root, bump],
  );

  const edit = useCallback(
    (next: Draft) => {
      history.current?.push(next);
      bump();
    },
    [bump],
  );

  const undo = useCallback(() => {
    history.current?.undo();
    bump();
  }, [bump]);

  const redo = useCallback(() => {
    history.current?.redo();
    bump();
  }, [bump]);

  const current = history.current?.current ?? null;
  const base = saved.current;

  const heightsDirty =
    current !== null &&
    base !== null &&
    current.heights.some((step, i) => step !== base.heights[i]);
  const tilesDirty = current !== null && base !== null && current.tiles !== base.tiles;

  /**
   * Grava só o que mudou.
   *
   * Elevação vai para o .scene.json e tiles vão para o .rxdata, dois arquivos
   * diferentes. Gravar os dois sempre encheria o histórico do git de ruído a
   * cada salvamento.
   */
  const save = useCallback(async () => {
    const root = state.project?.root;
    const id = state.map?.id;
    const draft = history.current?.current;
    if (root === undefined || id === undefined || draft === undefined) return null;

    const written: string[] = [];

    if (base === null || draft.heights.some((step, i) => step !== base.heights[i])) {
      const result = await window.prism.saveElevation(root, id, draft.heights);
      written.push(result.path.split("/").pop() ?? "scene");
    }
    if (base === null || draft.tiles !== base.tiles) {
      const result = await window.prism.saveTiles(root, id, draft.tiles);
      written.push(result.path.split("/").pop() ?? "map");
    }

    saved.current = draft;
    bump();
    return written;
  }, [state.project?.root, state.map?.id, base, bump]);

  return {
    state,
    draft: current,
    revision,
    dirty: heightsDirty || tilesDirty,
    canUndo: history.current?.canUndo ?? false,
    canRedo: history.current?.canRedo ?? false,
    openMap,
    edit,
    undo,
    redo,
    save,
  };
}
