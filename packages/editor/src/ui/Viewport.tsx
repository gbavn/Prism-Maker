import { useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { OpenedMap } from "../project/loadProject.js";
import { assetUrl } from "../shared/ipc.js";
import {
  createViewport,
  type PickedCell,
  type ViewMode,
  type Viewport as View,
} from "./viewport/scene3d.js";
import type { BuiltScene } from "../scene/buildScene.js";

export interface ViewportHandle {
  redraw: (scene: BuiltScene) => void;
  highlight: (cell: PickedCell | null) => void;
  setMode: (mode: ViewMode) => void;
}

interface Props {
  map: OpenedMap | null;
  ref: React.Ref<ViewportHandle>;
  onHover: (cell: PickedCell | null) => void;
  onPaint: (cell: PickedCell, lower: boolean) => void;
}

/**
 * Monta as imagens que a viewport precisa para o mapa aberto.
 *
 * Os caminhos vem do processo principal e sao servidos pelo protocolo
 * prism-asset, que so alcanca arquivos de dentro do projeto.
 */
function imagesOf(map: OpenedMap): Map<string, string> {
  const sources = new Map<string, string>();
  if (map.graphics.tileset !== null) {
    sources.set("tileset", assetUrl(map.graphics.tileset));
  }
  map.graphics.autotiles.forEach((path, index) => {
    if (path !== null) sources.set(`autotile:${index}`, assetUrl(path));
  });
  return sources;
}

export function Viewport({ map, ref, onHover, onPaint }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View | null>(null);
  const pressed = useRef<{ x: number; y: number } | null>(null);

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
    void view.show(map.scene, { sources: imagesOf(map) }).then(() => {
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
        void view.show(scene, { sources: imagesOf(current) });
      },
      highlight: (cell) => viewRef.current?.highlight(cell),
      setMode: (mode) => viewRef.current?.setMode(mode),
    }),
    [map],
  );

  const handleMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const view = viewRef.current;
      if (view === null) return;
      const cell = view.pickCell(event.nativeEvent.offsetX, event.nativeEvent.offsetY);
      view.highlight(cell);
      onHover(cell);
    },
    [onHover],
  );

  const handleUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const start = pressed.current;
      pressed.current = null;
      if (start === null || event.button !== 0) return;

      // Arrastar orbita a camera; so o clique parado edita.
      const moved =
        Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y);
      if (moved > 4) return;

      const cell = viewRef.current?.pickCell(
        event.nativeEvent.offsetX,
        event.nativeEvent.offsetY,
      );
      if (cell) onPaint(cell, event.shiftKey);
    },
    [onPaint],
  );

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full outline-none"
      onPointerMove={handleMove}
      onPointerDown={(event) => {
        pressed.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={handleUp}
    />
  );
}
