import { Maximize2, Minus, Plus } from "lucide-react";
import type { OpenedMap } from "../../project/loadProject.js";
import type { Zoom } from "../viewport/scene3d.js";
import { Soon } from "./Soon.jsx";

interface Props {
  map: OpenedMap | null;
  hovered: { x: number; y: number } | null;
  height: number | undefined;
  message: string | null;
  zoom: Zoom;
  onZoom: (zoom: Zoom) => void;
  onZoomStep: (direction: 1 | -1) => void;
  onSoon: (label: string) => void;
}

const button =
  "grid h-5 w-5 place-items-center rounded transition-colors hover:bg-raised hover:text-body";

export function StatusBar({
  map,
  hovered,
  height,
  message,
  zoom,
  onZoom,
  onZoomStep,
  onSoon,
}: Props) {
  return (
    <footer className="flex items-center gap-4 px-2 py-1.5 font-mono text-[10.5px] text-dim">
      {map !== null ? (
        <>
          <span className="text-body/70">
            #{String(map.id).padStart(3, "0")}
          </span>
          <span>
            {map.grid.width}×{map.grid.height}
          </span>
          <span>3 layers</span>
          <span>{map.scene.quads.length} tiles</span>
          <span className="text-body/70">
            {hovered
              ? `${hovered.x},${hovered.y} · h${height ?? 0}`
              : "— · —"}
          </span>
        </>
      ) : (
        <span>loading…</span>
      )}

      <span className="ml-auto truncate font-sans text-[11px]">
        {message ?? "click raises · shift+click lowers · L levels · ctrl+S saves"}
      </span>

      {/*
        Zoom em degraus, e não contínuo: a viewport desenha pixel art, e
        escala quebrada deforma o tile. Fit existe para olhar o mapa inteiro,
        que é justamente quando a deformação não importa.
      */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onZoomStep(-1)}
          title="Zoom out"
          className={button}
        >
          <Minus className="h-3 w-3" strokeWidth={2} />
        </button>
        <span className="w-10 text-center text-body/70">
          {zoom === "fit" ? "fit" : `${zoom * 100}%`}
        </span>
        <button
          type="button"
          onClick={() => onZoomStep(1)}
          title="Zoom in"
          className={button}
        >
          <Plus className="h-3 w-3" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => onZoom(zoom === "fit" ? 1 : "fit")}
          aria-pressed={zoom === "fit"}
          title="Fit the whole map"
          data-zoom-fit
          className={`${button} ${zoom === "fit" ? "bg-brand/20 text-brand" : ""}`}
        >
          <Maximize2 className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>

      <Soon label="Minimap" onSoon={onSoon} dot={false}>
        map
      </Soon>
    </footer>
  );
}
