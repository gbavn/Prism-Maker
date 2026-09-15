import { Icon } from "./Icon.jsx";
import { Soon } from "./Soon.jsx";

interface Props {
  brush: number;
  onBrush: (size: number) => void;
  step: number;
  onSoon: (label: string) => void;
}

const chip =
  "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] transition-colors";
const idle = "border-line bg-ink-600 text-body hover:bg-[#2b333f]";
const active = "border-accent bg-[#263445] text-accent";

/**
 * Barra de ferramentas da aba GEOMETRIA.
 *
 * O que está ligado de verdade: o passo de altura, o lápis e o tamanho do
 * pincel. O resto ocupa o lugar que vai ocupar, marcado.
 */
export function ToolStrip({ brush, onBrush, step, onSoon }: Props) {
  return (
    <div className="flex items-center gap-1.5 border-b border-line bg-ink-700 px-3 py-1.5">
      <span className={`${chip} ${idle} cursor-default`}>
        <Icon name="mountain" className="h-3.5 w-3.5 text-accent" />
        Altura · {step}
      </span>

      <div className="mx-1 h-5 w-px bg-line" />

      <span className={`${chip} ${active}`}>
        <Icon name="pencil" className="h-3.5 w-3.5" />
        Lápis
      </span>

      {["Retângulo", "Balde", "Penhasco"].map((label) => (
        <Soon key={label} label={label} onSoon={onSoon} className={`${chip} ${idle}`}>
          {label}
        </Soon>
      ))}

      <div className="mx-1 h-5 w-px bg-line" />

      <span className="pr-1 text-[11px] text-muted">Pincel</span>
      {[1, 3, 5].map((size) => (
        <button
          key={size}
          type="button"
          onClick={() => onBrush(size)}
          aria-pressed={size === brush}
          className={`${chip} ${size === brush ? active : idle}`}
        >
          {size}×{size}
        </button>
      ))}

      <div className="mx-1 h-5 w-px bg-line" />

      {["Colocar", "Selecionar"].map((label) => (
        <Soon key={label} label={label} onSoon={onSoon} className={`${chip} ${idle}`}>
          {label}
        </Soon>
      ))}

      <div className="ml-auto flex items-center gap-1.5">
        <Soon label="Recarregar mapa" onSoon={onSoon} className={`${chip} ${idle}`}>
          <Icon name="refresh" className="h-3.5 w-3.5" />
        </Soon>
        <Soon label="Apagar" onSoon={onSoon} className={`${chip} ${idle}`}>
          <Icon name="trash" className="h-3.5 w-3.5" />
        </Soon>
      </div>
    </div>
  );
}
