import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenedMap, OpenedProject } from "../project/loadProject.js";
import { History } from "../scene/elevation.js";

/**
 * Estado do projeto e do mapa aberto.
 *
 * A elevacao vive aqui em um historico, e nao dentro do React, porque as
 * alturas sao um array de milhares de numeros trocado a cada pincelada: passar
 * isso por estado do React a cada clique geraria renderizacao a toa. O React
 * fica com o que muda a vista, e o array com o historico.
 */
export interface ProjectState {
  project: OpenedProject | null;
  map: OpenedMap | null;
  loading: boolean;
  error: string | null;
  dirty: boolean;
}

export function useProject() {
  const [state, setState] = useState<ProjectState>({
    project: null,
    map: null,
    loading: true,
    error: null,
    dirty: false,
  });

  const history = useRef<History<number[]> | null>(null);
  const saved = useRef<number[]>([]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const project = await window.prism.openProject();
        if (!cancelled) {
          setState((old) => ({ ...old, project, loading: false }));
        }
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
        history.current = new History<number[]>([...map.heights]);
        saved.current = [...map.heights];
        setState((old) => ({ ...old, map, loading: false, dirty: false }));
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
    [state.project?.root],
  );

  const markDirty = useCallback(() => {
    const current = history.current?.current;
    const isDirty =
      current !== undefined &&
      current.some((step, index) => step !== saved.current[index]);
    setState((old) => (old.dirty === isDirty ? old : { ...old, dirty: isDirty }));
  }, []);

  const save = useCallback(async () => {
    const root = state.project?.root;
    const id = state.map?.id;
    const heights = history.current?.current;
    if (root === undefined || id === undefined || heights === undefined) return null;

    const result = await window.prism.saveElevation(root, id, heights);
    saved.current = [...heights];
    setState((old) => ({ ...old, dirty: false }));
    return result;
  }, [state.project?.root, state.map?.id]);

  return { state, history, openMap, markDirty, save };
}
