import { useCallback, useEffect, useRef, useState } from "react";
import { applyBrush, levelTo } from "../scene/elevation.js";
import { MapPanel } from "./chrome/MapPanel.jsx";
import { ModeRail, type ModeId } from "./chrome/ModeRail.jsx";
import { SOON_LABEL } from "./chrome/Soon.jsx";
import { StatusBar } from "./chrome/StatusBar.jsx";
import { TilePanel } from "./chrome/TilePanel.jsx";
import { ToolBar } from "./chrome/ToolBar.jsx";
import { TopBar } from "./chrome/TopBar.jsx";
import { useProject } from "./useProject.js";
import { Viewport, type ViewportHandle } from "./Viewport.jsx";
import type { PickedCell } from "./viewport/scene3d.js";

export function App() {
  const { state, history, revision, openMap, markDirty, save } = useProject();
  const viewport = useRef<ViewportHandle>(null);

  const [mode, setMode] = useState<ModeId>("terrain");
  const [brush, setBrush] = useState(1);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [hovered, setHovered] = useState<PickedCell | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const announce = useCallback((text: string) => {
    setMessage(text);
  }, []);

  const soon = useCallback(
    (label: string) => announce(`${label}: ${SOON_LABEL}`),
    [announce],
  );

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
   * O processo principal reconstrói a cena sem reler o .rxdata, então a
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
      if (changed === 0) return announce("already at the height limit");

      current.push(heights);
      markDirty();
      setMessage(null);
      void redraw();
    },
    [state.map?.grid, history, brush, markDirty, redraw, announce],
  );

  const doSave = useCallback(() => {
    void save().then((result) => {
      if (result) announce(`saved to ${result.path.split("/").pop()}`);
    });
  }, [save, announce]);

  const step = useCallback(
    (direction: "undo" | "redo") => {
      const current = history.current;
      if (current === null) return;
      if (direction === "undo") current.undo();
      else current.redo();
      markDirty();
      void redraw();
    },
    [history, markDirty, redraw],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.target instanceof HTMLInputElement) return;

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
          announce(`levelled to ${target}`);
        }
        return;
      }

      if (!(event.ctrlKey || event.metaKey)) return;

      if (key === "s") {
        event.preventDefault();
        doSave();
      } else if (key === "z") {
        event.preventDefault();
        step(event.shiftKey ? "redo" : "undo");
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, state.map?.grid, hovered, brush, markDirty, redraw, doSave, step, announce]);

  // Lido a cada revisão do histórico, para os botões não ficarem atrasados.
  void revision;
  const height =
    hovered && history.current && state.map
      ? history.current.current[hovered.y * state.map.grid.width + hovered.x]
      : undefined;

  const projectName =
    state.project?.root.split("/").filter(Boolean).pop() ?? "no project";

  return (
    <div className="flex h-full bg-shell font-sans text-body">
      <ModeRail mode={mode} onMode={setMode} onSoon={soon} />

      <div className="flex min-w-0 flex-1 flex-col gap-2 pb-2 pr-2 pt-0">
        <TopBar
          projectName={projectName}
          mapName={state.map?.name ?? null}
          dirty={state.dirty}
          canUndo={history.current?.canUndo ?? false}
          canRedo={history.current?.canRedo ?? false}
          onSave={doSave}
          onUndo={() => step("undo")}
          onRedo={() => step("redo")}
          onSoon={soon}
        />

        <ToolBar brush={brush} onBrush={setBrush} step={0.5} onSoon={soon} />

        <div className="flex min-h-0 flex-1 gap-2">
          <MapPanel
            project={state.project}
            currentId={state.map?.id ?? null}
            onSelect={(id) => void openMap(id)}
            onSoon={soon}
          />

          <main className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-edge bg-panel">
            <div className="absolute right-3 top-3 z-10 flex overflow-hidden rounded-md bg-shell/80 p-0.5 backdrop-blur">
              {(["2d", "3d"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setView(option);
                    viewport.current?.setMode(option);
                  }}
                  aria-pressed={option === view}
                  className={`rounded px-2.5 py-1 text-[10.5px] font-medium tracking-wide transition-colors ${
                    option === view
                      ? "bg-brand/20 text-brand"
                      : "text-dim hover:text-body"
                  }`}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>

            {state.error !== null ? (
              <div className="absolute inset-x-0 top-14 z-10 mx-auto w-fit rounded-md border border-red-500/30 bg-red-950/70 px-3 py-1.5 text-[11px] text-red-300">
                {state.error}
              </div>
            ) : null}

            <Viewport
              ref={viewport}
              map={state.map}
              onHover={setHovered}
              onPaint={paint}
            />
          </main>

          <TilePanel map={state.map} onSoon={soon} />
        </div>

        <StatusBar
          map={state.map}
          hovered={hovered}
          height={height}
          message={message}
          onSoon={soon}
        />
      </div>
    </div>
  );
}
