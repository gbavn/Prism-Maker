import type { ReactNode } from "react";

/**
 * Controle que existe na interface mas ainda nao faz nada.
 *
 * Preferi deixar o botao visivel a esconder o que falta: assim a forma da
 * ferramenta fica clara, e o ponto amarelo mais o aviso ao clicar deixam
 * honesto o que ja funciona e o que nao. Esconder daria uma impressao de
 * completude que o projeto ainda nao tem.
 */
export const SOON_LABEL = "Em desenvolvimento";

interface Props {
  children: ReactNode;
  label: string;
  onSoon: (label: string) => void;
  className?: string;
  /** Marca o ponto amarelo. Desligado em listas longas, onde poluiria. */
  dot?: boolean;
}

export function Soon({ children, label, onSoon, className = "", dot = true }: Props) {
  return (
    <button
      type="button"
      title={`${label} · ${SOON_LABEL}`}
      onClick={() => onSoon(label)}
      className={`relative cursor-default text-muted/70 hover:text-muted ${className}`}
    >
      {children}
      {dot ? (
        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400/80" />
      ) : null}
    </button>
  );
}
