import {
  Building2,
  FlaskConical,
  Home,
  type LucideIcon,
  Map as MapIcon,
  Mountain,
  Plus,
  Search,
  Signpost,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { OpenedProject } from "../../project/loadProject.js";
import { Soon } from "./Soon.jsx";

interface Props {
  project: OpenedProject | null;
  currentId: number | null;
  onSelect: (id: number) => void;
  onSoon: (label: string) => void;
}

/**
 * Icon guessed from the map name.
 *
 * RPG Maker stores no map type, so this is a guess. It is wrong sometimes and
 * costs nothing when it is, which is the bar a guess has to clear to belong in
 * an interface.
 */
function iconFor(name: string): LucideIcon {
  const lower = name.toLowerCase();
  if (lower.includes("route")) return Signpost;
  if (lower.includes("cave") || lower.includes("mt.") || lower.includes("mount")) {
    return Mountain;
  }
  if (lower.includes("intro")) return FlaskConical;
  if (lower.includes("house") || lower.includes("town") || lower.includes("home")) {
    return Home;
  }
  if (lower.includes("city") || lower.includes("dept") || lower.includes("center")) {
    return Building2;
  }
  return MapIcon;
}

export function MapPanel({ project, currentId, onSelect, onSoon }: Props) {
  const [filter, setFilter] = useState("");

  const maps = useMemo(() => {
    const all = project?.maps ?? [];
    const needle = filter.trim().toLowerCase();
    if (needle === "") return all;
    return all.filter(
      (map) =>
        map.name.toLowerCase().includes(needle) ||
        String(map.id).padStart(3, "0").includes(needle),
    );
  }, [project, filter]);

  return (
    <aside className="flex min-h-0 w-60 shrink-0 flex-col overflow-hidden rounded-lg border border-edge bg-panel">
      <header className="flex items-center gap-2 px-3 py-2">
        <span className="text-[10.5px] font-semibold tracking-[0.12em] text-dim">
          MAPS
        </span>
        <span className="font-mono text-[10px] text-dim/60">
          {project?.maps.length ?? 0}
        </span>
        <Soon
          label="New map"
          onSoon={onSoon}
          dot={false}
          className="ml-auto grid h-6 w-6 place-items-center rounded-md hover:bg-raised"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        </Soon>
      </header>

      <div className="px-2 pb-2">
        <div className="flex items-center gap-1.5 rounded-md bg-raised px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-dim" strokeWidth={1.8} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter maps"
            className="w-full bg-transparent text-[12px] text-body outline-none placeholder:text-dim/60"
          />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        {maps.map((map) => {
          const Glyph = iconFor(map.name);
          const current = map.id === currentId;

          return (
            <button
              key={map.id}
              type="button"
              onClick={() => onSelect(map.id)}
              data-map={map.id}
              aria-current={current}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
                current
                  ? "bg-brand/15 text-brand"
                  : "text-body/85 hover:bg-raised hover:text-body"
              }`}
            >
              <Glyph
                className={`h-3.5 w-3.5 shrink-0 ${current ? "text-brand" : "text-dim"}`}
                strokeWidth={1.8}
              />
              <span className="shrink-0 font-mono text-[10px] text-dim/70">
                {String(map.id).padStart(3, "0")}
              </span>
              <span className="truncate">{map.name}</span>
            </button>
          );
        })}

        {maps.length === 0 ? (
          <p className="px-2 py-2 text-[11px] text-dim">no maps match</p>
        ) : null}
      </nav>
    </aside>
  );
}
