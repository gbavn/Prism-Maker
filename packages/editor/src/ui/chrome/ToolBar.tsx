import {
  Eraser,
  MousePointer2,
  MoveDiagonal,
  PaintBucket,
  Pencil,
  Square,
  Triangle,
} from "lucide-react";
import { Soon } from "./Soon.jsx";

interface Props {
  mode: "draw" | "terrain";
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

const soonTools = [
  { label: "Rectangle", icon: Square },
  { label: "Fill", icon: PaintBucket },
  { label: "Cliff", icon: Triangle },
  { label: "Erase", icon: Eraser },
  { label: "Select", icon: MousePointer2 },
  { label: "Place", icon: MoveDiagonal },
] as const;

/**
 * The tool strip.
 *
 * Wired for real: the pencil, the brush size, and the layer in Draw mode. The
 * rest holds the place it will hold, marked.
 */
export function ToolBar({
  mode,
  brush,
  onBrush,
  layer,
  onLayer,
  step,
  onSoon,
}: Props) {
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

      <span className={`${chip} ${active}`}>
        <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
        Pencil
      </span>

      {soonTools.map((tool) => {
        const Glyph = tool.icon;
        return (
          <Soon
            key={tool.label}
            label={tool.label}
            onSoon={onSoon}
            className={`${chip} ${idle} pr-3.5`}
          >
            <Glyph className="h-3.5 w-3.5" strokeWidth={1.8} />
            {tool.label}
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
