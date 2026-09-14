import { useCallback, useEffect, useRef, useState } from "react";
import { applyBrush, levelTo } from "../scene/elevation.js";
import { MapList } from "./MapList.jsx";
import { Toolbar } from "./Toolbar.jsx";
import { useProject } from "./useProject.js";
import { Viewport, type ViewportHandle } from "./Viewport.jsx";
import type { PickedCell } from "./viewport/scene3d.js";

export function App() {
  const { state, history, openMap, markDirty, save } = useProject();
  const viewport = useRef<ViewportHandle>(null);

  const [brush, setBrush] = useState(1);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [hovered, setHovered] = useState<PickedCell | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  /** Abre Lappet Town de cara: um mapa externo mostra melhor o relevo. */
  useEffect(() => {
    if (state.project === null || state.map !== null) return;
    const first =
      state.project.maps.find((map) => map.name === "Lappet Town") ??
      state.project.maps[0];
    if (first) void openMap(first.id);
  }, [state.project, state.map, openMap]);

  /**
   * Redesenha a partir das alturas correntes.
   *
   * O processo principal reconstroi a cena sem reler o .rxdata, entao a
   * pincelada responde na hora.
   */
  const redraw = useCallback(async () => {
    const root = state.project?.root;
    const id = state.map?.id;
    const heights = history.current?.current;
    if (root === undefined || id === undefined || heights === undefined) return;

    const scene = await window.prism.buildScene(root, id, heights);
    viewport.current?.redraw(scene);
  }, [state.project?.root, state.map?.id, history]);

  const paint = useCallback(
    (cell: PickedCell, lower: boolean) => {
      const grid = state.map?.grid;
      const current = history.current;
      if (grid === undefined || current === null) return;

      const { heights, changed } = applyBrush(current.current, grid, {
        x: cell.x,
        y: cell.y,
        size: brush,
        delta: lower ? -1 : 1,
      });
      if (changed === 0) return void setMessage("já está no limite de altura");

      current.push(heights);
      markDirty();
      setMessage(null);
      void redraw();
    },
    [state.map?.grid, history, brush, markDirty, redraw],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const current = history.current;
      const grid = state.map?.grid;
      const key = event.key.toLowerCase();

      if (key === "1") return setBrush(1);
      if (key === "2") return setBrush(3);
      if (key === "3") return setBrush(5);

      if (key === "l" && current !== null && grid !== undefined && hovered) {
        const target = current.current[hovered.y * grid.width + hovered.x] ?? 0;
        const { heights, changed } = levelTo(
          current.current,
          grid,
          { x: hovered.x, y: hovered.y, size: brush },
          target,
        );
        if (changed > 0) {
          current.push(heights);
          markDirty();
          void redraw();
        }
        return;
      }

      if (!(event.ctrlKey || event.metaKey)) return;

      if (key === "s") {
        event.preventDefault();
        void save().then((result) => {
          if (result) setMessage(`salvo em ${result.path.split("/").pop()}`);
        });
      } else if (key === "z") {
        event.preventDefault();
        if (current === null) return;
        if (event.shiftKey) current.redo();
        else current.undo();
        markDirty();
        void redraw();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, state.map?.grid, hovered, brush, markDirty, redraw, save]);

  const height =
    hovered && history.current && state.map
      ? history.current.current[hovered.y * state.map.grid.width + hovered.x]
      : undefined;

  return (
    <div className="flex h-full bg-ink-800 font-sans text-body">
      <MapList
        project={state.project}
        currentId={state.map?.id ?? null}
        onSelect={(id) => void openMap(id)}
      />

      <main className="relative min-w-0 flex-1">
        <Toolbar
          brush={brush}
          onBrush={setBrush}
          mode={mode}
          onMode={(next) => {
            setMode(next);
            viewport.current?.setMode(next);
          }}
          dirty={state.dirty}
          onSave={() =>
            void save().then((result) => {
              if (result) setMessage(`salvo em ${result.path.split("/").pop()}`);
            })
          }
        />

        <Viewport
          ref={viewport}
          map={state.map}
          onHover={setHovered}
          onPaint={paint}
        />

        <div className="absolute bottom-3 left-3 rounded-md border border-line bg-ink-800/85 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted backdrop-blur">
          {state.error !== null ? (
            <span className="text-red-400">erro: {state.error}</span>
          ) : state.map === null ? (
            "carregando…"
          ) : (
            <>
              <div className="text-body">
                {state.map.name}
                {state.dirty ? " *" : ""}
              </div>
              <div>
                {state.map.grid.width}×{state.map.grid.height} · pincel {brush}×
                {brush} · {state.map.scene.quads.length} tiles
              </div>
              <div>
                {hovered
                  ? `célula ${hovered.x},${hovered.y} · altura ${height ?? 0}`
                  : "fora do mapa"}
              </div>
              <div>
                {message ??
                  "clique sobe · shift+clique desce · 1 2 3 pincel · L nivela · ctrl+Z ctrl+S"}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
