import { Play, Redo2, Save, Undo2 } from "lucide-react";
import { Soon } from "./Soon.jsx";

interface Props {
  projectName: string;
  mapName: string | null;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSoon: (label: string) => void;
}

const ghost =
  "grid h-7 w-7 place-items-center rounded-md transition-colors disabled:opacity-25";

export function TopBar({
  projectName,
  mapName,
  dirty,
  canUndo,
  canRedo,
  onSave,
  onUndo,
  onRedo,
  onSoon,
}: Props) {
  return (
    <header className="flex items-center gap-3 py-2 pl-1 pr-1">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="text-[13px] font-semibold tracking-tight text-body">
          Prism
        </span>
        <span className="truncate text-[11px] text-dim">
          {projectName}
          {mapName === null ? "" : ` · ${mapName}`}
          {dirty ? " ·" : ""}
        </span>
        {dirty ? (
          <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] text-amber-300">
            unsaved
          </span>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (ctrl+Z)"
          className={`${ghost} text-dim hover:bg-raised hover:text-body`}
        >
          <Undo2 className="h-4 w-4" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (ctrl+shift+Z)"
          className={`${ghost} text-dim hover:bg-raised hover:text-body`}
        >
          <Redo2 className="h-4 w-4" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty}
          title="Save elevation (ctrl+S)"
          className={`${ghost} ${
            dirty ? "bg-brand/15 text-brand hover:bg-brand/25" : "text-dim"
          }`}
        >
          <Save className="h-4 w-4" strokeWidth={1.8} />
        </button>

        <span className="mx-1 h-5 w-px bg-edge" />

        <Soon
          label="Playtest"
          onSoon={onSoon}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-brand/40 py-1 pl-3 pr-4 text-[11px] text-brand/90"
        >
          <Play className="h-3.5 w-3.5" strokeWidth={2} />
          Playtest
        </Soon>
      </div>
    </header>
  );
}
