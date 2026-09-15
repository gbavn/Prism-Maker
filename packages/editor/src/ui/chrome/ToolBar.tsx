import {
  CopyPlus,
  Eraser,
  MousePointer2,
  MoveDiagonal,
  PaintBucket,
  Pencil,
  Square,
  Trash2,
} from "lucide-react";
import { Soon } from "./Soon.jsx";

export type ToolId = "pencil" | "rectangle" | "fill" | "erase";

interface Props {
  mode: "draw" | "terrain" | "events";
  tool: ToolId;
  onTool: (tool: ToolId) => void;
  brush: number;
  onBrush: (size: number) => void;
  layer: number;
  onLayer: (layer: number) => void;
  step: number;
  onSoon: (label: string) => void;
}

const chip =
  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] transition-colors";
const idle = "text-dim hover:bg-raised hover:text-body";
const active = "bg-brand/15 text-brand";

const TOOLS = [
  { id: "pencil", label: "Pencil", icon: Pencil },
  { id: "rectangle", label: "Rectangle", icon: Square },
  { id: "fill", label: "Fill", icon: PaintBucket },
  { id: "erase", label: "Erase", icon: Eraser },
] as const;

const soonTools = [
  { label: "Select", icon: MousePointer2 },
  { label: "Place", icon: MoveDiagonal },
] as const;

/**
 * The tool strip.
 *
 * In Terrain mode only the pencil is shown: raising ground a rectangle at a
 * time is a different gesture, and pretending otherwise would put a button
 * there that lies about what it does.
 */
export function ToolBar({
  mode,
  tool,
  onTool,
  brush,
  onBrush,
  layer,
  onLayer,
  step,
  onSoon,
}: Props) {
  // Em Events nada do resto da barra serve: nao ha camada, nem pincel, nem
  // ferramenta de pintar. Repetir os controles ali so ensinaria errado.
  if (mode === "events") {
    return (
      <div className="flex items-center gap-1 rounded-lg border border-edge bg-panel px-2 py-1.5">
        <span className={`${chip} ${active}`}>
          <MousePointer2 className="h-3.5 w-3.5" strokeWidth={1.8} />
          Select
        </span>
        <span className="text-[11px] text-dim">
          click an event on the map or in the list
        </span>

        <span className="mx-1 h-5 w-px bg-edge" />

        {[
          { label: "New event", icon: CopyPlus },
          { label: "Delete event", icon: Trash2 },
        ].map((entry) => {
          const Glyph = entry.icon;
          return (
            <Soon
              key={entry.label}
              label={entry.label}
              onSoon={onSoon}
              className={`${chip} ${idle} pr-3.5`}
            >
              <Glyph className="h-3.5 w-3.5" strokeWidth={1.8} />
              {entry.label}
            </Soon>
          );
        })}
      </div>
    );
  }

  const tools = mode === "terrain" ? TOOLS.slice(0, 1) : TOOLS;

  return (
    <div className="flex items-center gap-1 rounded-lg border border-edge bg-panel px-2 py-1.5">
      {mode === "terrain" ? (
        <span className="rounded-md bg-raised px-2 py-1 font-mono text-[11px] text-dim">
          step {step}
        </span>
      ) : (
        <>
          <span className="text-[11px] text-dim">Layer</span>
          <div className="flex overflow-hidden rounded-md border border-edge">
            {[0, 1, 2].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onLayer(value)}
                aria-pressed={value === layer}
                data-layer={value}
                className={`px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  value === layer
                    ? "bg-brand/20 text-brand"
                    : "text-dim hover:bg-raised hover:text-body"
                }`}
              >
                {value + 1}
              </button>
            ))}
          </div>
        </>
      )}

      <span className="mx-1 h-5 w-px bg-edge" />

      {tools.map((entry) => {
        const Glyph = entry.icon;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onTool(entry.id)}
            aria-pressed={entry.id === tool}
            className={`${chip} ${entry.id === tool ? active : idle}`}
          >
            <Glyph className="h-3.5 w-3.5" strokeWidth={1.8} />
            {entry.label}
          </button>
        );
      })}

      {soonTools.map((entry) => {
        const Glyph = entry.icon;
        return (
          <Soon
            key={entry.label}
            label={entry.label}
            onSoon={onSoon}
            className={`${chip} ${idle} pr-3.5`}
          >
            <Glyph className="h-3.5 w-3.5" strokeWidth={1.8} />
            {entry.label}
          </Soon>
        );
      })}

      <span className="mx-1 h-5 w-px bg-edge" />

      <span className="text-[11px] text-dim">Brush</span>
      <div className="flex overflow-hidden rounded-md border border-edge">
        {[1, 3, 5].map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onBrush(size)}
            aria-pressed={size === brush}
            className={`px-2.5 py-1 font-mono text-[11px] transition-colors ${
              size === brush
                ? "bg-brand/20 text-brand"
                : "text-dim hover:bg-raised hover:text-body"
            }`}
          >
            {size}
          </button>
        ))}
      </div>
    </div>
  );
}
