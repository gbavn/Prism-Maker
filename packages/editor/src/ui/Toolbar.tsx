interface Props {
  brush: number;
  onBrush: (size: number) => void;
  mode: "2d" | "3d";
  onMode: (mode: "2d" | "3d") => void;
  dirty: boolean;
  onSave: () => void;
}

const buttonBase =
  "rounded border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-40";

export function Toolbar({
  brush,
  onBrush,
  mode,
  onMode,
  dirty,
  onSave,
}: Props) {
  return (
    <div className="absolute left-3 top-3 z-10 flex gap-1.5 rounded-md border border-line bg-ink-800/85 p-1.5 backdrop-blur">
      {[1, 3, 5].map((size) => (
        <button
          key={size}
          type="button"
          onClick={() => onBrush(size)}
          aria-pressed={size === brush}
          className={`${buttonBase} ${
            size === brush
              ? "border-accent text-accent"
              : "border-line bg-ink-600 text-body hover:bg-[#2b333f]"
          }`}
        >
          {size}×{size}
        </button>
      ))}

      <span className="mx-1 w-px bg-line" />

      {(["2d", "3d"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onMode(option)}
          aria-pressed={option === mode}
          className={`${buttonBase} ${
            option === mode
              ? "border-accent text-accent"
              : "border-line bg-ink-600 text-body hover:bg-[#2b333f]"
          }`}
        >
          {option.toUpperCase()}
        </button>
      ))}

      <span className="mx-1 w-px bg-line" />

      <button
        type="button"
        onClick={onSave}
        disabled={!dirty}
        className={`${buttonBase} border-[#3d5a7a] bg-[#2a4058] text-body hover:bg-[#345070]`}
      >
        salvar{dirty ? " *" : ""}
      </button>
    </div>
  );
}
