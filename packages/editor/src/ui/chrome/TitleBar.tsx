import { Icon } from "./Icon.jsx";
import { Soon } from "./Soon.jsx";

/** As abas da ferramenta. Só GEOMETRIA tem conteúdo por enquanto. */
export const TABS = [
  { id: "desenho", label: "DESENHO", ready: false },
  { id: "geometria", label: "GEOMETRIA", ready: true },
  { id: "mapa", label: "MAPA", ready: false },
  { id: "eventos", label: "EVENTOS", ready: false },
  { id: "vista", label: "VISTA", ready: false },
  { id: "mundo", label: "MUNDO", ready: false },
  { id: "notas", label: "NOTAS", ready: false },
] as const;

export type TabId = (typeof TABS)[number]["id"];

interface Props {
  tab: TabId;
  onTab: (tab: TabId) => void;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSoon: (label: string) => void;
}

const iconButton =
  "grid h-7 w-7 place-items-center rounded transition-colors disabled:opacity-30";

export function TitleBar({
  tab,
  onTab,
  dirty,
  canUndo,
  canRedo,
  onSave,
  onUndo,
  onRedo,
  onSoon,
}: Props) {
  return (
    <header className="flex items-center gap-1 border-b border-black/30 bg-[#2a4260] px-3 py-1.5">
      <div className="flex items-center gap-2 pr-2">
        <Icon name="cube" className="h-4 w-4 text-accent" />
        <span className="text-[13px] font-semibold text-white">Prism</span>
      </div>

      <div className="mx-1 h-5 w-px bg-white/15" />

      <button
        type="button"
        onClick={onSave}
        disabled={!dirty}
        title="Salvar elevação (ctrl+S)"
        className={`${iconButton} ${dirty ? "text-white hover:bg-white/10" : "text-white/40"}`}
      >
        <Icon name="save" />
      </button>
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title="Desfazer (ctrl+Z)"
        className={`${iconButton} text-white hover:bg-white/10`}
      >
        <Icon name="undo" />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title="Refazer (ctrl+shift+Z)"
        className={`${iconButton} text-white hover:bg-white/10`}
      >
        <Icon name="redo" />
      </button>

      <nav className="ml-3 flex items-center gap-0.5">
        {TABS.map((item) =>
          item.ready ? (
            <button
              key={item.id}
              type="button"
              onClick={() => onTab(item.id)}
              aria-current={item.id === tab}
              className={`rounded-full px-3 py-1 text-[11px] font-medium tracking-wide transition-colors ${
                item.id === tab
                  ? "bg-white text-[#2a4260]"
                  : "text-white/80 hover:bg-white/10"
              }`}
            >
              {item.label}
            </button>
          ) : (
            <Soon
              key={item.id}
              label={item.label}
              onSoon={onSoon}
              dot={false}
              className="rounded-full px-3 py-1 text-[11px] font-medium tracking-wide text-white/45 hover:bg-white/5"
            >
              {item.label}
            </Soon>
          ),
        )}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        {["grid", "eye", "layers", "contrast", "link", "chat"].map((name) => (
          <Soon
            key={name}
            label={`Painel ${name}`}
            onSoon={onSoon}
            dot={false}
            className={`${iconButton} text-white/50 hover:bg-white/10`}
          >
            <Icon name={name} />
          </Soon>
        ))}

        <Soon
          label="Playtest"
          onSoon={onSoon}
          className="ml-2 flex items-center gap-1.5 rounded-full bg-emerald-600/80 px-3 py-1 text-[11px] font-medium text-white"
        >
          <Icon name="play" className="h-3.5 w-3.5" />
          Playtest
        </Soon>
      </div>
    </header>
  );
}
