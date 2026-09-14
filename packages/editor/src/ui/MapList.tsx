import type { OpenedProject } from "../project/loadProject.js";

interface Props {
  project: OpenedProject | null;
  currentId: number | null;
  onSelect: (id: number) => void;
}

export function MapList({ project, currentId, onSelect }: Props) {
  return (
    <aside className="flex min-h-0 w-64 flex-col border-r border-line bg-ink-700">
      <header className="border-b border-line px-4 py-3">
        <h1 className="text-sm font-semibold tracking-wide text-body">Prism</h1>
        <p className="text-[11px] text-muted">Editor de mundo 2.5D</p>
      </header>

      <nav className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {project?.maps.map((map) => {
          const active = map.id === currentId;
          return (
            <button
              key={map.id}
              type="button"
              onClick={() => onSelect(map.id)}
              aria-current={active}
              className={`flex w-full items-baseline gap-2 px-4 py-1.5 text-left text-[13px] ${
                active
                  ? "bg-[#263445] text-accent shadow-[inset_2px_0_0_var(--color-accent)]"
                  : "text-body hover:bg-ink-600"
              }`}
            >
              <span className="font-mono text-[11px] text-muted">
                {String(map.id).padStart(3, "0")}
              </span>
              {map.name}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
