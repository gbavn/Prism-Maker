import {
  Boxes,
  Brush,
  Globe2,
  Map as MapIcon,
  Mountain,
  StickyNote,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Soon } from "./Soon.jsx";

/**
 * Modes live on a vertical rail, not in a tab bar.
 *
 * A rail keeps the horizontal space for the map, which is the thing that
 * actually needs it, and it scales to more modes without the row wrapping.
 */
export const MODES = [
  { id: "draw", label: "Draw", icon: Brush, ready: true },
  { id: "terrain", label: "Terrain", icon: Mountain, ready: true },
  { id: "events", label: "Events", icon: Users, ready: true },
  { id: "objects", label: "Objects", icon: Boxes, ready: true },
  { id: "map", label: "Map", icon: MapIcon, ready: false },
  { id: "world", label: "World", icon: Globe2, ready: false },
  { id: "notes", label: "Notes", icon: StickyNote, ready: false },
] as const satisfies readonly {
  id: string;
  label: string;
  icon: LucideIcon;
  ready: boolean;
}[];

export type ModeId = (typeof MODES)[number]["id"];

interface Props {
  mode: ModeId;
  onMode: (mode: ModeId) => void;
  onSoon: (label: string) => void;
}

const slot =
  "group relative flex h-12 w-full flex-col items-center justify-center gap-0.5";

export function ModeRail({ mode, onMode, onSoon }: Props) {
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-1 py-2">
      <div className="mb-2 grid h-8 w-8 place-items-center rounded-lg bg-brand/15 text-brand">
        <Mountain className="h-4 w-4" strokeWidth={2} />
      </div>

      {MODES.map((item) => {
        const Glyph = item.icon;
        const current = item.id === mode;

        return item.ready ? (
          <button
            key={item.id}
            type="button"
            onClick={() => onMode(item.id)}
            aria-current={current}
            title={item.label}
            data-mode={item.id}
            className={`${slot} rounded-lg transition-colors ${
              current
                ? "bg-brand/15 text-brand"
                : "text-dim hover:bg-raised hover:text-body"
            }`}
          >
            <Glyph className="h-4 w-4" strokeWidth={1.8} />
            <span className="text-[9px] tracking-wide">{item.label}</span>
            {current ? (
              <span className="absolute left-0 top-2 h-8 w-0.5 rounded-r bg-brand" />
            ) : null}
          </button>
        ) : (
          <Soon
            key={item.id}
            label={item.label}
            onSoon={onSoon}
            dot={false}
            className={`${slot} rounded-lg hover:bg-raised`}
          >
            <Glyph className="h-4 w-4" strokeWidth={1.8} />
            <span className="text-[9px] tracking-wide">{item.label}</span>
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-amber-400/70" />
          </Soon>
        );
      })}
    </nav>
  );
}
