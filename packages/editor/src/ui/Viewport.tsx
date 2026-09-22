import { useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { OpenedMap } from "../project/loadProject.js";
import { assetUrl } from "../shared/ipc.js";
import { characterKey, objectKey } from "../scene/charset.js";
import {
  createViewport,
  type HighlightArea,
  type PickedCell,
  type ViewMode,
  type Viewport as View,
  type Zoom,
} from "./viewport/scene3d.js";
import type { BuiltScene } from "../scene/buildScene.js";

export interface ViewportHandle {
  redraw: (scene: BuiltScene) => void;
  highlight: (cell: PickedCell | null) => void;
  setZoom: (zoom: Zoom) => void;
  forgetAsset: (url: string) => void;
  setGrid: (on: boolean) => void;
  setActiveLayer: (layer: number | null) => void;
  setEventMarks: (on: boolean) => void;
  selectEvent: (id: number | null) => void;
  selectObject: (index: number | null) => void;
  setMode: (mode: ViewMode) => void;
}

interface Props {
  map: OpenedMap | null;
  ref: React.Ref<ViewportHandle>;
  /** Editing only happens in 2D: in 3D the left button orbits the camera. */
  editable: boolean;
  /** The area the current tool would paint, drawn under the cursor. */
  area: HighlightArea;
  /** The wheel steps the zoom instead of dollying the camera. */
  onZoomStep: (direction: 1 | -1) => void;
  onHover: (cell: PickedCell | null) => void;
  onStrokeStart: (cell: PickedCell, erase: boolean) => void;
  onStrokeMove: (cell: PickedCell) => void;
  onStrokeEnd: () => void;
}

/**
 * Monta as imagens que a viewport precisa para desenhar uma cena.
 *
 * Os caminhos vem do processo principal e sao servidos pelo protocolo
 * prism-asset, que so alcanca arquivos de dentro do projeto.
 *
 * Tileset, autotiles e charsets saem do mapa, que e onde eles moram. Os
 * objetos saem da **cena**, e nao do mapa: o mapa aberto e o que esta em
 * disco, congelado na abertura, e um objeto recem colocado existe so no
 * rascunho. Tirando a lista do mapa, a imagem do objeto novo nunca entrava
 * aqui, a viewport pulava o objeto por falta de textura, e ele so aparecia
 * depois de gravar e reabrir.
 */
function imagesOf(map: OpenedMap, scene: BuiltScene): Map<string, string> {
  const sources = new Map<string, string>();
  if (map.graphics.tileset !== null) {
    sources.set("tileset", assetUrl(map.graphics.tileset));
  }
  map.graphics.autotiles.forEach((path, index) => {
    if (path !== null) sources.set(`autotile:${index}`, assetUrl(path));
  });
  for (const [name, path] of Object.entries(map.graphics.characters)) {
    sources.set(characterKey(name), assetUrl(path));
  }
  for (const object of scene.objects) {
    sources.set(objectKey(object.name), assetUrl(`Graphics/Objects/${object.name}.png`));
  }
  return sources;
}

/**
 * Anuncia no documento quais objetos viraram mesh no ultimo desenho.
 *
 * O ensaio sem tela nao consegue olhar a cena, e print nao reprova nada
 * sozinho. Com a lista aqui, conferir que o objeto colocado apareceu vira uma
 * pergunta ao DOM.
 */
function publishObjects(view: View): void {
  document.body.dataset["objects"] = view.drawnObjects().join(",");
}

export function Viewport({
  map,
  ref,
  editable,
  area,
  onZoomStep,
  onHover,
  onStrokeStart,
  onStrokeMove,
  onStrokeEnd,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View | null>(null);
  const stroking = useRef(false);
  // A ultima celula pintada no traco. Sem isso, arrastar dentro da mesma
  // celula repetiria a pintura a cada pixel do movimento.
  const lastCell = useRef<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const view = createViewport(canvas);
    viewRef.current = view;

    const onResize = () => view.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      view.dispose();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null || map === null) return;
    void view.show(map.scene, { sources: imagesOf(map, map.scene) }).then(() => {
      publishObjects(view);
      document.body.dataset["ready"] = "true";
    });
  }, [map]);

  useImperativeHandle(
    ref,
    () => ({
      redraw: (scene) => {
        const view = viewRef.current;
        const current = map;
        if (view === null || current === null) return;
        void view.show(scene, { sources: imagesOf(current, scene) }).then(() => {
          publishObjects(view);
        });
      },
      highlight: (cell) => viewRef.current?.highlight(cell),
      setZoom: (zoom) => viewRef.current?.setZoom(zoom),
      forgetAsset: (url) => viewRef.current?.forgetAsset(url),
      setGrid: (on) => viewRef.current?.setGrid(on),
      setActiveLayer: (layer) => viewRef.current?.setActiveLayer(layer),
      setEventMarks: (on) => viewRef.current?.setEventMarks(on),
      selectEvent: (id) => viewRef.current?.selectEvent(id),
      selectObject: (index) => viewRef.current?.selectObject(index),
      setMode: (mode) => viewRef.current?.setMode(mode),
    }),
    [map],
  );

  const pick = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): PickedCell | null =>
      viewRef.current?.pickCell(
        event.nativeEvent.offsetX,
        event.nativeEvent.offsetY,
      ) ?? null,
    [],
  );

  const handleMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const cell = pick(event);
      viewRef.current?.highlight(cell, area);
      onHover(cell);

      if (!stroking.current || cell === null) return;

      const key = `${cell.x},${cell.y}`;
      if (key === lastCell.current) return;
      lastCell.current = key;
      onStrokeMove(cell);
    },
    [pick, area, onHover, onStrokeMove],
  );

  const handleDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!editable || event.button !== 0) return;

      const cell = pick(event);
      if (cell === null) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      stroking.current = true;
      lastCell.current = `${cell.x},${cell.y}`;
      onStrokeStart(cell, event.shiftKey);
    },
    [editable, pick, onStrokeStart],
  );

  const handleUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!stroking.current) return;
      stroking.current = false;
      lastCell.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onStrokeEnd();
    },
    [onStrokeEnd],
  );

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full outline-none"
      onPointerMove={handleMove}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onWheel={(wheel) => onZoomStep(wheel.deltaY < 0 ? 1 : -1)}
    />
  );
}
