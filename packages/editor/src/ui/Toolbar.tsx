interface Props {
  brush: number;
  onBrush: (size: number) => void;
  projection: "perspective" | "orthographic";
  onProjection: (mode: "perspective" | "orthographic") => void;
  dirty: boolean;
  onSave: () => void;
}

const buttonBase =
  "rounded border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-40";

export function Toolbar({
  brush,
  onBrush,
  projection,
  onProjection,
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

      {(["perspective", "orthographic"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onProjection(mode)}
          aria-pressed={mode === projection}
          className={`${buttonBase} ${
            mode === projection
              ? "border-accent text-accent"
              : "border-line bg-ink-600 text-body hover:bg-[#2b333f]"
          }`}
        >
          {mode === "perspective" ? "perspectiva" : "ortográfica"}
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
