import { useMemo, useState } from "react";
import type { OpenedProject } from "../../project/loadProject.js";
import { Icon } from "./Icon.jsx";
import { Soon } from "./Soon.jsx";

interface Props {
  project: OpenedProject | null;
  currentId: number | null;
  onSelect: (id: number) => void;
  onSoon: (label: string) => void;
}

/**
 * Ícone por tipo de mapa, deduzido do nome.
 *
 * O RPG Maker não guarda tipo de mapa, então isto é palpite a partir do nome.
 * Erra às vezes e não custa nada quando erra, que é o critério para aceitar
 * um palpite na interface.
 */
function iconFor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("route") || lower.includes("rota")) return "route";
  if (lower.includes("gate") || lower.includes("portão")) return "gate";
  if (lower.includes("cave") || lower.includes("mt.") || lower.includes("mount")) {
    return "mountain";
  }
  if (lower.includes("intro")) return "flask";
  if (lower.includes("town") || lower.includes("house") || lower.includes("home")) {
    return "house";
  }
  if (lower.includes("city") || lower.includes("dept") || lower.includes("center")) {
    return "building";
  }
  return "grid";
}

export function MapTree({ project, currentId, onSelect, onSoon }: Props) {
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
    <aside className="flex min-h-0 w-64 flex-col border-r border-line bg-ink-700">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="text-[11px] font-semibold tracking-widest text-muted">
          MAPAS
        </span>
        <div className="ml-auto flex gap-1">
          <Soon
            label="Reordenar mapas"
            onSoon={onSoon}
            dot={false}
            className="grid h-6 w-6 place-items-center rounded-full bg-ink-600"
          >
            <Icon name="link" className="h-3.5 w-3.5" />
          </Soon>
          <Soon
            label="Novo mapa"
            onSoon={onSoon}
            dot={false}
            className="grid h-6 w-6 place-items-center rounded-full bg-[#2a4058] text-white"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
          </Soon>
        </div>
      </header>

      <div className="border-b border-line px-2 py-2">
        <div className="flex items-center gap-1.5 rounded border border-line bg-ink-800 px-2 py-1">
          <Icon name="search" className="h-3.5 w-3.5 text-muted" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filtrar..."
            className="w-full bg-transparent text-[12px] text-body outline-none placeholder:text-muted"
          />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto py-1">
        {maps.map((map) => {
          const isCurrent = map.id === currentId;
          return (
            <button
              key={map.id}
              type="button"
              onClick={() => onSelect(map.id)}
              aria-current={isCurrent}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] ${
                isCurrent
                  ? "bg-[#263445] text-accent shadow-[inset_2px_0_0_var(--color-accent)]"
                  : "text-body hover:bg-ink-600"
              }`}
            >
              <Icon
                name={iconFor(map.name)}
                className={`h-3.5 w-3.5 shrink-0 ${isCurrent ? "text-accent" : "text-muted"}`}
              />
              <span className="shrink-0 font-mono text-[10.5px] text-muted">
                {String(map.id).padStart(3, "0")}
              </span>
              <span className="truncate">{map.name}</span>
            </button>
          );
        })}

        {maps.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-muted">nenhum mapa encontrado</p>
        ) : null}
      </nav>
    </aside>
  );
}
