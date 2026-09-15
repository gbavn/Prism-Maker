import type { OpenedMap } from "../../project/loadProject.js";
import { Soon } from "./Soon.jsx";

interface Props {
  map: OpenedMap | null;
  dirty: boolean;
  hovered: { x: number; y: number } | null;
  height: number | undefined;
  message: string | null;
  onSoon: (label: string) => void;
}

export function StatusBar({ map, dirty, hovered, height, message, onSoon }: Props) {
  return (
    <footer className="flex items-center gap-3 border-t border-line bg-ink-700 px-3 py-1 text-[11px] text-muted">
      <span className="text-body">
        {map === null ? "carregando…" : map.name}
        {dirty ? " *" : ""}
      </span>

      {map !== null ? (
        <>
          <span className="font-mono">
            {map.grid.width}×{map.grid.height}
          </span>
          <span className="rounded bg-ink-600 px-1.5 py-0.5 font-mono">3L</span>
          <span className="rounded bg-ink-600 px-1.5 py-0.5 font-mono">
            {map.scene.quads.length} tiles
          </span>
        </>
      ) : null}

      <span className="text-muted/80">
        {hovered
          ? `célula ${hovered.x},${hovered.y} · altura ${height ?? 0}`
          : "fora do mapa"}
      </span>

      <span className="ml-auto truncate text-muted/80">
        {message ?? "clique sobe · shift+clique desce · L nivela · ctrl+Z ctrl+S"}
      </span>

      <Soon label="Zoom" onSoon={onSoon} dot={false} className="font-mono">
        100%
      </Soon>
    </footer>
  );
}
