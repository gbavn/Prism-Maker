import { useCallback, useEffect, useRef, useState } from "react";
import { applyBrush, levelTo } from "../scene/elevation.js";
import { paint } from "../scene/paint.js";
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
  const project = useProject();
  const { state, draft } = project;
  const viewport = useRef<ViewportHandle>(null);

  const [mode, setMode] = useState<ModeId>("draw");
  const [brush, setBrush] = useState(1);
  const [layer, setLayer] = useState(0);
  const [tile, setTile] = useState(384);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [hovered, setHovered] = useState<PickedCell | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const soon = useCallback(
    (label: string) => setMessage(`${label}: ${SOON_LABEL}`),
    [],
  );

  /** Opens Lappet Town first: an outdoor map shows the tools off better. */
  useEffect(() => {
    if (state.project === null || state.map !== null) return;
    const first =
      state.project.maps.find((map) => map.name === "Lappet Town") ??
      state.project.maps[0];
    if (first) void project.openMap(first.id);
  }, [state.project, state.map, project]);

  /**
   * Redraws from the current draft.
   *
   * The main process rebuilds the scene without re-reading the .rxdata, so a
   * brush stroke answers right away.
   */
  const redraw = useCallback(async () => {
    const root = state.project?.root;
    const id = state.map?.id;
    if (root === undefined || id === undefined || draft === null) return;

    const scene = await window.prism.buildScene(root, id, draft.heights, draft.tiles);
    viewport.current?.redraw(scene);
  }, [state.project?.root, state.map?.id, draft]);

  const onPaint = useCallback(
    (cell: PickedCell, secondary: boolean) => {
      const grid = state.map?.grid;
      if (grid === undefined || draft === null) return;

      if (mode === "terrain") {
        const { heights, changed } = applyBrush(draft.heights, grid, {
          x: cell.x,
          y: cell.y,
          size: brush,
          delta: secondary ? -1 : 1,
        });
        if (changed === 0) return setMessage("already at the height limit");

        project.edit({ heights, tiles: draft.tiles });
        setMessage(null);
        return;
      }

      // Shift erases: the same gesture that lowers terrain, which keeps the
      // two tools consistent instead of inventing a second convention.
      const { tiles, changed } = paint(draft.tiles, grid, {
        x: cell.x,
        y: cell.y,
        layer,
        tileId: secondary ? 0 : tile,
        size: brush,
      });
      if (changed === 0) return;

      project.edit({ heights: draft.heights, tiles });
      setMessage(null);
    },
    [state.map?.grid, draft, mode, brush, layer, tile, project],
  );

  const doSave = useCallback(() => {
    void project
      .save()
      .then((written) => {
        if (written !== null && written.length > 0) {
          setMessage(`saved ${written.join(" and ")}`);
        }
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : String(error));
      });
  }, [project]);

  const step = useCallback(
    (direction: "undo" | "redo") => {
      if (direction === "undo") project.undo();
      else project.redo();
    },
    [project],
  );

  /**
   * One single redraw path.
   *
   * Every edit bumps the revision, so the viewport follows the draft from
   * here instead of each handler redrawing with the value it happened to
   * capture. Undo is where that difference bites: the handler was built
   * before the swap, so its copy of the draft is already stale.
   */
  useEffect(() => {
    void redraw();
  }, [project.revision, redraw]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.target instanceof HTMLInputElement) return;

      const grid = state.map?.grid;
      const key = event.key.toLowerCase();

      if (key === "1") return setBrush(1);
      if (key === "2") return setBrush(3);
      if (key === "3") return setBrush(5);

      if (key === "l" && draft !== null && grid !== undefined && hovered) {
        if (mode !== "terrain") return;
        const target = draft.heights[hovered.y * grid.width + hovered.x] ?? 0;
        const { heights, changed } = levelTo(
          draft.heights,
          grid,
          { x: hovered.x, y: hovered.y, size: brush },
          target,
        );
        if (changed > 0) {
          project.edit({ heights, tiles: draft.tiles });
          setMessage(`levelled to ${target}`);
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
  }, [state.map?.grid, draft, hovered, brush, mode, project, doSave, step]);

  const height =
    hovered && draft && state.map
      ? draft.heights[hovered.y * state.map.grid.width + hovered.x]
      : undefined;

  const projectName =
    state.project?.root.split("/").filter(Boolean).pop() ?? "no project";

  return (
    <div className="flex h-full bg-shell font-sans text-body">
      <ModeRail mode={mode} onMode={setMode} onSoon={soon} />

      <div className="flex min-w-0 flex-1 flex-col gap-2 pb-2 pr-2">
        <TopBar
          projectName={projectName}
          mapName={state.map?.name ?? null}
          dirty={project.dirty}
          canUndo={project.canUndo}
          canRedo={project.canRedo}
          onSave={doSave}
          onUndo={() => step("undo")}
          onRedo={() => step("redo")}
          onSoon={soon}
        />

        <ToolBar
          mode={mode === "terrain" ? "terrain" : "draw"}
          brush={brush}
          onBrush={setBrush}
          layer={layer}
          onLayer={setLayer}
          step={0.5}
          onSoon={soon}
        />

        <div className="flex min-h-0 flex-1 gap-2">
          <MapPanel
            project={state.project}
            currentId={state.map?.id ?? null}
            onSelect={(id) => void project.openMap(id)}
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
              onPaint={onPaint}
            />
          </main>

          <TilePanel map={state.map} selected={tile} onSelect={setTile} />
        </div>

        <StatusBar
          map={state.map}
          hovered={hovered}
          height={height}
          message={
            message ??
            (mode === "draw"
              ? `layer ${layer + 1} · tile #${tile} · click paints · shift+click erases`
              : null)
          }
          onSoon={soon}
        />
      </div>
    </div>
  );
}
