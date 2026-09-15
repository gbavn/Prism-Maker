import type { OpenedMap } from "../../project/loadProject.js";
import { Soon } from "./Soon.jsx";

interface Props {
  map: OpenedMap | null;
  hovered: { x: number; y: number } | null;
  height: number | undefined;
  message: string | null;
  onSoon: (label: string) => void;
}

export function StatusBar({ map, hovered, height, message, onSoon }: Props) {
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

      <Soon label="Zoom" onSoon={onSoon} dot={false}>
        100%
      </Soon>
    </footer>
  );
}
