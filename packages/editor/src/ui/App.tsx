import { useCallback, useEffect, useRef, useState } from "react";
import { applyBrush, levelTo } from "../scene/elevation.js";
import {
  fillRect,
  floodFill,
  singleStamp,
  stampAt,
  type Stamp,
} from "../scene/paint.js";
import { EventPanel } from "./chrome/EventPanel.jsx";
import { MapPanel } from "./chrome/MapPanel.jsx";
import { ModeRail, type ModeId } from "./chrome/ModeRail.jsx";
import { SOON_LABEL } from "./chrome/Soon.jsx";
import { StatusBar } from "./chrome/StatusBar.jsx";
import { TilePanel } from "./chrome/TilePanel.jsx";
import { ToolBar, type ToolId } from "./chrome/ToolBar.jsx";
import { TopBar } from "./chrome/TopBar.jsx";
import { useProject, type Draft } from "./useProject.js";
import { Viewport, type ViewportHandle } from "./Viewport.jsx";
import type { PickedCell } from "./viewport/scene3d.js";

/** O que um traco precisa lembrar entre o apertar e o soltar do botao. */
interface Stroke {
  /** O rascunho de antes do traco, que o retangulo refaz a cada movimento. */
  base: Draft;
  from: PickedCell;
  erase: boolean;
}

const ERASER: Stamp = singleStamp(0);

export function App() {
  const project = useProject();
  const { state, draft } = project;
  const viewport = useRef<ViewportHandle>(null);

  const [mode, setMode] = useState<ModeId>("draw");
  const [tool, setTool] = useState<ToolId>("pencil");
  const [brush, setBrush] = useState(1);
  const [layer, setLayer] = useState(0);
  const [stamp, setStamp] = useState<Stamp>(singleStamp(384));
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [hovered, setHovered] = useState<PickedCell | null>(null);
  const [event, setEvent] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const stroke = useRef<Stroke | null>(null);

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
   * Redraws from a given draft.
   *
   * The main process rebuilds the scene without re-reading the .rxdata, so a
   * brush stroke answers right away.
   */
  const redrawWith = useCallback(
    async (target: Draft) => {
      const root = state.project?.root;
      const id = state.map?.id;
      if (root === undefined || id === undefined) return;

      const scene = await window.prism.buildScene(
        root,
        id,
        target.heights,
        target.tiles,
      );
      viewport.current?.redraw(scene);
    },
    [state.project?.root, state.map?.id],
  );

  const redraw = useCallback(async () => {
    if (draft === null) return;
    await redrawWith(draft);
  }, [draft, redrawWith]);

  /**
   * Runs the current tool over a draft and returns the result.
   *
   * Pure on purpose: the rectangle recomputes from the draft as it was when
   * the drag started, and the pencil accumulates over the running one, so the
   * caller decides which draft goes in.
   */
  const apply = useCallback(
    (from: Draft, cell: PickedCell, at: Stroke): Draft | null => {
      const grid = state.map?.grid;
      if (grid === undefined) return null;

      if (mode === "terrain") {
        const { heights, changed } = applyBrush(from.heights, grid, {
          x: cell.x,
          y: cell.y,
          size: brush,
          delta: at.erase ? -1 : 1,
        });
        if (changed === 0) {
          setMessage("already at the height limit");
          return null;
        }
        return { heights, tiles: from.tiles };
      }

      // Shift erases whatever the tool is: the same gesture that lowers
      // terrain, which keeps the two modes consistent instead of inventing a
      // second convention.
      const painting = at.erase || tool === "erase" ? ERASER : stamp;

      const result =
        tool === "rectangle"
          ? fillRect(from.tiles, grid, {
              layer,
              stamp: painting,
              from: at.from,
              to: cell,
            })
          : tool === "fill"
            ? floodFill(from.tiles, grid, {
                x: cell.x,
                y: cell.y,
                layer,
                stamp: painting,
              })
            : stampAt(from.tiles, grid, {
                x: cell.x,
                y: cell.y,
                layer,
                stamp: painting,
                size: brush,
              });

      if (result.changed === 0) return null;
      return { heights: from.heights, tiles: result.tiles };
    },
    [state.map?.grid, mode, tool, brush, layer, stamp],
  );

  /** Seleciona o evento que estiver na celula, se houver algum. */
  const selectAt = useCallback(
    (cell: PickedCell) => {
      const found = state.map?.events.find(
        (entry) => entry.x === cell.x && entry.y === cell.y,
      );
      setEvent(found?.id ?? null);
      viewport.current?.selectEvent(found?.id ?? null);
      setMessage(
        found === undefined
          ? "no event on this cell"
          : `${found.name === "" ? `Event ${found.id}` : found.name} · ${found.pages.length} page${found.pages.length === 1 ? "" : "s"}`,
      );
    },
    [state.map?.events],
  );

  const onStrokeStart = useCallback(
    (cell: PickedCell, erase: boolean) => {
      if (mode === "events") return selectAt(cell);
      if (draft === null) return;

      const at: Stroke = { base: draft, from: cell, erase };
      stroke.current = at;

      const next = apply(draft, cell, at);
      if (next === null) return;

      project.edit(next);
      setMessage(null);
    },
    [mode, selectAt, draft, apply, project],
  );

  /**
   * Continues the stroke.
   *
   * The whole drag is one undo step: the first cell pushes, every cell after
   * it amends. Undoing a painted street should give the street back, not one
   * tile of it.
   */
  const onStrokeMove = useCallback(
    (cell: PickedCell) => {
      const at = stroke.current;
      if (at === null || draft === null || mode === "events") return;
      // O balde ja pintou a regiao inteira no primeiro clique.
      if (tool === "fill" && mode !== "terrain") return;

      // O retangulo parte do rascunho de antes do traco: arrastar de volta
      // precisa desfazer o que o retangulo maior tinha pintado.
      const from = tool === "rectangle" && mode !== "terrain" ? at.base : draft;
      const next = apply(from, cell, at);
      if (next === null) return;

      project.amend(next);
      void redrawWith(next);
    },
    [draft, tool, mode, apply, project, redrawWith],
  );

  const onStrokeEnd = useCallback(() => {
    stroke.current = null;
  }, []);

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

  /**
   * As marcas de evento acompanham o modo.
   *
   * Roda tambem depois de cada redesenho, porque redesenhar refaz as malhas e
   * as marcas nascem escondidas.
   */
  useEffect(() => {
    viewport.current?.setEventMarks(mode === "events");
    viewport.current?.selectEvent(mode === "events" ? event : null);
  }, [mode, event, project.revision, state.map]);

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

  const brushLabel =
    stamp.width === 1 && stamp.height === 1
      ? `tile #${stamp.tiles[0] ?? 0}`
      : `${stamp.width}×${stamp.height} block`;

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
          mode={
            mode === "terrain" ? "terrain" : mode === "events" ? "events" : "draw"
          }
          tool={mode === "terrain" ? "pencil" : tool}
          onTool={setTool}
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
                  data-view={option}
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
              editable={view === "2d"}
              onHover={setHovered}
              onStrokeStart={onStrokeStart}
              onStrokeMove={onStrokeMove}
              onStrokeEnd={onStrokeEnd}
            />
          </main>

          {mode === "events" ? (
            <EventPanel
              map={state.map}
              selected={event}
              onSelect={(id) => {
                setEvent(id);
                viewport.current?.selectEvent(id);
              }}
              onSoon={soon}
            />
          ) : (
            <TilePanel map={state.map} stamp={stamp} onSelect={setStamp} />
          )}
        </div>

        <StatusBar
          map={state.map}
          hovered={hovered}
          height={height}
          message={
            message ??
            (mode === "draw"
              ? `layer ${layer + 1} · ${tool} · ${brushLabel} · drag paints · shift erases`
              : mode === "events"
                ? `${state.map?.events.length ?? 0} events · click one to inspect · editing comes later`
                : null)
          }
          onSoon={soon}
        />
      </div>
    </div>
  );
}
