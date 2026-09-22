import { Grid3x3 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyBrush, levelTo } from "../scene/elevation.js";
import {
  brushFootprint,
  fillRect,
  floodFill,
  singleStamp,
  stampAt,
  type Stamp,
} from "../scene/paint.js";
import { EventPanel } from "./chrome/EventPanel.jsx";
import { ObjectPanel } from "./chrome/ObjectPanel.jsx";
import { assetUrl, type ModelEntry } from "../shared/ipc.js";
import { bakeLoadedModel, loadModelFile } from "./viewport/objModel.js";
import { MapPanel } from "./chrome/MapPanel.jsx";
import { ModeRail, type ModeId } from "./chrome/ModeRail.jsx";
import { SOON_LABEL } from "./chrome/Soon.jsx";
import { StatusBar } from "./chrome/StatusBar.jsx";
import { TilePanel } from "./chrome/TilePanel.jsx";
import { ToolBar, type ToolId } from "./chrome/ToolBar.jsx";
import { TopBar } from "./chrome/TopBar.jsx";
import type { PlacedObject } from "../scene/buildScene.js";
import { useProject, type Draft } from "./useProject.js";
import { Viewport, type ViewportHandle } from "./Viewport.jsx";
import { ZOOM_STEPS, type PickedCell, type Zoom } from "./viewport/scene3d.js";

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
  const [grid, setGrid] = useState(true);
  const [zoom, setZoom] = useState<Zoom>(1);
  const [hovered, setHovered] = useState<PickedCell | null>(null);
  const [event, setEvent] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [models, setModels] = useState<readonly ModelEntry[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [object, setObject] = useState<number | null>(null);

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
        target.objects,
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
        return { heights, tiles: from.tiles, objects: from.objects };
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
      return { heights: from.heights, tiles: result.tiles, objects: from.objects };
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

  /** O catalogo de modelos, relido quando o projeto abre. */
  useEffect(() => {
    const root = state.project?.root;
    if (root === undefined) return;
    void window.prism.listModels(root).then((found) => {
      setModels(found);
      setModel((old) => old ?? found[0]?.path ?? null);
    });
  }, [state.project?.root]);

  /** Qual objeto do mapa cobre esta celula, ou null. */
  const objectAt = useCallback(
    (cell: PickedCell) => {
      const list = draft?.objects ?? [];
      // De tras para frente: o ultimo colocado e o que esta por cima, e e ele
      // que a pessoa espera pegar ao clicar.
      for (let index = list.length - 1; index >= 0; index -= 1) {
        const item = list[index];
        if (item === undefined) continue;
        if (
          cell.x >= item.x &&
          cell.x < item.x + item.width &&
          cell.y >= item.y &&
          cell.y < item.y + item.depth
        ) {
          return index;
        }
      }
      return null;
    },
    [draft?.objects],
  );

  /** Troca a lista de objetos, como um passo de desfazer. */
  const editObjects = useCallback(
    (next: readonly PlacedObject[]) => {
      if (draft === null) return;
      project.edit({ ...draft, objects: next });
    },
    [draft, project],
  );

  /**
   * Coloca o modelo escolhido na celula.
   *
   * A imagem assada grava na hora, porque e um arquivo em Graphics/Objects e
   * a mesma para todas as copias do modelo. A colocacao entra no rascunho, e
   * so vai para o .rxdata no ctrl+S: a partir do momento em que existe mover,
   * fingir que ctrl+Z nao desfaz colocar seria mentira.
   */
  const placeObject = useCallback(
    (cell: PickedCell) => {
      const root = state.project?.root;
      if (root === undefined || model === null || draft === null) return;

      void (async () => {
        try {
          const loaded = await loadModelFile(model);
          const baked = bakeLoadedModel(loaded);
          // O nome da imagem espelha a categoria do modelo, para um poste e um
          // predio poderem ter o mesmo nome sem um sobrescrever o outro.
          const name = model
            .replace(/^Prism\/Models\//, "")
            .replace(/\.obj$/i, "");

          await window.prism.bakeObject(root, name, baked.png);
          // A imagem acabou de mudar no disco, e o cache da viewport guarda a
          // anterior pela mesma URL.
          viewport.current?.forgetAsset(assetUrl(`Graphics/Objects/${name}.png`));

          const placed: PlacedObject = {
            name,
            model,
            x: cell.x,
            y: cell.y,
            width: loaded.area.width,
            depth: loaded.area.depth,
            anchorX: baked.anchorX,
            anchorY: baked.anchorY,
          };
          editObjects([...(draft.objects ?? []), placed]);
          setObject(draft.objects.length);
          setMessage(`placed ${name} at ${cell.x},${cell.y}`);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error));
        }
      })();
    },
    [state.project?.root, model, draft, editObjects],
  );

  /** Move o objeto selecionado para outra celula. */
  const moveObject = useCallback(
    (index: number, x: number, y: number) => {
      if (draft === null) return;
      const list = draft.objects;
      const item = list[index];
      if (item === undefined) return;
      if (item.x === x && item.y === y) return;
      editObjects(list.map((old, at) => (at === index ? { ...old, x, y } : old)));
    },
    [draft, editObjects],
  );

  /**
   * Gira o objeto selecionado, em quartos de volta.
   *
   * Reassa: a imagem assada e a ancora dependem do giro, e a area no chao
   * muda junto, porque um predio de 8 por 5 girado em 90 graus passa a ocupar
   * 5 por 8. Gravar so o angulo deixaria o mapa reservando a area errada.
   *
   * Quarto de volta e nao angulo livre: angulo livre pede previa ao vivo para
   * ser usavel, e isso e outra conversa.
   */
  const turnObject = useCallback(
    (index: number, yaw: number) => {
      const root = state.project?.root;
      if (root === undefined || draft === null) return;
      const item = draft.objects[index];
      if (item === undefined || item.model === undefined) return;

      void (async () => {
        try {
          const loaded = await loadModelFile(item.model as string, { yaw });
          const baked = bakeLoadedModel(loaded);
          await window.prism.bakeObject(root, item.name, baked.png);
          viewport.current?.forgetAsset(
            assetUrl(`Graphics/Objects/${item.name}.png`),
          );

          editObjects(
            draft.objects.map((old, at) =>
              at === index
                ? {
                    ...old,
                    yaw,
                    width: loaded.area.width,
                    depth: loaded.area.depth,
                    anchorX: baked.anchorX,
                    anchorY: baked.anchorY,
                  }
                : old,
            ),
          );
          setMessage(`turned to ${yaw}°`);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error));
        }
      })();
    },
    [state.project?.root, draft, editObjects],
  );

  const removeObject = useCallback(
    (index: number) => {
      if (draft === null) return;
      editObjects(draft.objects.filter((_, at) => at !== index));
      setObject(null);
      setMessage("object removed");
    },
    [draft, editObjects],
  );

  /** O arrasto de objeto: qual, e de onde o cursor pegou ele. */
  const dragging = useRef<{ index: number; dx: number; dy: number } | null>(null);

  const onStrokeStart = useCallback(
    (cell: PickedCell, erase: boolean) => {
      if (mode === "events") return selectAt(cell);
      if (mode === "objects") {
        // Clicar em cima de um objeto pega ele, clicar no vazio coloca. Pegar
        // guarda o deslocamento dentro do objeto, senao arrastar pelo canto
        // faria ele saltar para centralizar no cursor.
        const hit = objectAt(cell);
        if (hit !== null) {
          const item = draft?.objects[hit];
          setObject(hit);
          if (item) {
            dragging.current = {
              index: hit,
              dx: cell.x - item.x,
              dy: cell.y - item.y,
            };
          }
          return;
        }
        return placeObject(cell);
      }
      if (draft === null) return;

      const at: Stroke = { base: draft, from: cell, erase };
      stroke.current = at;

      const next = apply(draft, cell, at);
      if (next === null) return;

      project.edit(next);
      setMessage(null);
    },
    [mode, selectAt, objectAt, placeObject, draft, apply, project],
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
      if (mode === "objects") {
        const drag = dragging.current;
        if (drag !== null) moveObject(drag.index, cell.x - drag.dx, cell.y - drag.dy);
        return;
      }
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
    [draft, tool, mode, apply, project, redrawWith, moveObject],
  );

  const onStrokeEnd = useCallback(() => {
    stroke.current = null;
    dragging.current = null;
  }, []);

  /**
   * Anda um degrau de zoom.
   *
   * Sempre em escala inteira, nunca contínua: a viewport desenha pixel art, e
   * escala quebrada deixa uma coluna de tiles com um pixel a mais que a
   * vizinha. Vindo de "fit", o primeiro passo cai em 100 por cento.
   */
  const stepZoom = useCallback(
    (direction: 1 | -1) => {
      setZoom((current) => {
        if (current === "fit") return 1;
        const at = ZOOM_STEPS.indexOf(current as (typeof ZOOM_STEPS)[number]);
        const next = ZOOM_STEPS[Math.min(Math.max(at + direction, 0), ZOOM_STEPS.length - 1)];
        return next ?? current;
      });
    },
    [],
  );

  useEffect(() => {
    viewport.current?.setZoom(zoom);
  }, [zoom, state.map]);

  /** A camada em foco só faz sentido enquanto se desenha tile. */
  useEffect(() => {
    viewport.current?.setActiveLayer(mode === "draw" ? layer : null);
  }, [mode, layer, project.revision, state.map]);

  /**
   * Grava e devolve o que foi escrito, ou null quando nao havia o que gravar.
   *
   * Existe separado do botao porque o dialogo de alteracao pendente precisa
   * esperar a gravacao terminar antes de deixar sair do mapa.
   */
  const saveNow = useCallback(async () => {
    const written = await project.save();
    if (written !== null && written.length > 0) {
      setMessage(`saved ${written.join(" and ")}`);
    }
    return written;
  }, [project]);

  /**
   * Pergunta o que fazer com o que ainda nao foi gravado.
   *
   * Devolve true quando pode seguir. Trocar de mapa ou abrir o jogo joga fora
   * o rascunho, e jogar trabalho fora sem perguntar e o tipo de coisa que faz
   * a pessoa parar de confiar na ferramenta.
   */
  const guardChanges = useCallback(async () => {
    if (!project.dirty) return true;

    const answer = await window.prism.confirmSave(state.map?.name ?? "this map");
    if (answer === "cancel") return false;
    if (answer === "save") {
      try {
        await saveNow();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
        return false;
      }
    }
    return true;
  }, [project.dirty, state.map?.name, saveNow]);

  /** Abre outro mapa, perguntando antes se houver alteracao pendente. */
  const openMap = useCallback(
    (id: number) => {
      void (async () => {
        if (!(await guardChanges())) return;
        setEvent(null);
        await project.openMap(id);
      })();
    },
    [guardChanges, project],
  );

  const doPlaytest = useCallback(() => {
    const root = state.project?.root;
    if (root === undefined) return;

    void (async () => {
      if (!(await guardChanges())) return;
      const result = await window.prism.playtest(root);
      setMessage(result.started ? "playtest started" : result.detail);
    })();
  }, [state.project?.root, guardChanges]);

  const doSave = useCallback(() => {
    void saveNow().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : String(error));
    });
  }, [saveNow]);

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
    viewport.current?.setGrid(grid);
    viewport.current?.setEventMarks(mode === "events");
    viewport.current?.selectEvent(mode === "events" ? event : null);
    // O contorno do objeto acompanha a selecao, e some fora do modo Objects.
    viewport.current?.selectObject(mode === "objects" ? object : null);
  }, [mode, event, object, grid, project.revision, state.map]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.target instanceof HTMLInputElement) return;

      const grid = state.map?.grid;
      const key = event.key.toLowerCase();

      // No modo Objects as setas empurram o selecionado uma celula, e Delete
      // tira ele. Antes dos atalhos de pincel, senao 1, 2 e 3 roubariam a tecla
      // de quem esta posicionando um objeto.
      if (mode === "objects" && object !== null && draft !== null) {
        const item = draft.objects[object];
        if (item !== undefined) {
          const passo: Record<string, [number, number]> = {
            arrowleft: [-1, 0],
            arrowright: [1, 0],
            arrowup: [0, -1],
            arrowdown: [0, 1],
          };
          const anda = passo[key];
          if (anda) {
            event.preventDefault();
            moveObject(object, item.x + anda[0], item.y + anda[1]);
            return;
          }
          if (key === "delete" || key === "backspace") {
            event.preventDefault();
            removeObject(object);
            return;
          }
        }
      }

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
          project.edit({ heights, tiles: draft.tiles, objects: draft.objects });
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
  }, [
    state.map?.grid,
    draft,
    hovered,
    brush,
    mode,
    object,
    moveObject,
    removeObject,
    project,
    doSave,
    step,
  ]);

  const height =
    hovered && draft && state.map
      ? draft.heights[hovered.y * state.map.grid.width + hovered.x]
      : undefined;

  const projectName =
    state.project?.root.split("/").filter(Boolean).pop() ?? "no project";

  // A área que a ferramenta cobriria, para o cursor mostrar antes de pintar.
  const area =
    mode === "objects"
      ? { left: 0, top: 0, width: 1, height: 1 }
      : mode === "terrain"
      ? brushFootprint(singleStamp(0), brush)
      : mode === "events"
        ? { left: 0, top: 0, width: 1, height: 1 }
        : brushFootprint(tool === "erase" ? singleStamp(0) : stamp, brush);

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
          onPlaytest={doPlaytest}
        />

        <ToolBar
          mode={
            mode === "terrain"
              ? "terrain"
              : mode === "events"
                ? "events"
                : mode === "objects"
                  ? "objects"
                  : "draw"
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
            onSelect={openMap}
            onSoon={soon}
          />

          <main className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-edge bg-panel">
            <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
              {view === "2d" ? (
                <button
                  type="button"
                  onClick={() => {
                    setGrid(!grid);
                    viewport.current?.setGrid(!grid);
                  }}
                  aria-pressed={grid}
                  title="Cell grid"
                  data-grid={grid ? "on" : "off"}
                  className={`flex items-center gap-1.5 rounded-md bg-shell/80 px-2.5 py-1.5 text-[10.5px] font-medium tracking-wide backdrop-blur transition-colors ${
                    grid ? "text-brand" : "text-dim hover:text-body"
                  }`}
                >
                  <Grid3x3 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  GRID
                </button>
              ) : null}

              <div className="flex overflow-hidden rounded-md bg-shell/80 p-0.5 backdrop-blur">
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
              area={area}
              onZoomStep={stepZoom}
              onHover={setHovered}
              onStrokeStart={onStrokeStart}
              onStrokeMove={onStrokeMove}
              onStrokeEnd={onStrokeEnd}
            />
          </main>

          {mode === "objects" ? (
            <ObjectPanel
              models={models}
              chosen={model}
              onChoose={setModel}
              objects={draft?.objects ?? []}
              selected={object}
              onSelect={setObject}
              onRemove={removeObject}
              onTurn={turnObject}
            />
          ) : mode === "events" ? (
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
          hint={
            mode === "objects"
              ? "click places · drag moves · arrows nudge · Delete removes · ctrl+S saves"
              : mode === "events"
                ? "click an event to select it"
                : mode === "terrain"
                  ? "click raises · shift+click lowers · L levels · ctrl+S saves"
                  : "drag paints · shift erases · 1 2 3 size the brush · ctrl+S saves"
          }
          map={state.map}
          hovered={hovered}
          height={height}
          zoom={zoom}
          onZoom={setZoom}
          onZoomStep={stepZoom}
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
