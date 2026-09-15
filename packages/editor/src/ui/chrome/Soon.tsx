import type { ReactNode } from "react";

/**
 * A control that exists in the interface but does nothing yet.
 *
 * Showing it beats hiding it: the shape of the tool stays legible, and the
 * amber dot plus the message on click keep it honest about what already
 * works. Hiding would suggest a completeness the project does not have.
 */
export const SOON_LABEL = "Coming soon";

interface Props {
  children: ReactNode;
  label: string;
  onSoon: (label: string) => void;
  className?: string;
  /** The amber dot. Off in long lists, where it would be noise. */
  dot?: boolean;
}

export function Soon({ children, label, onSoon, className = "", dot = true }: Props) {
  return (
    <button
      type="button"
      title={`${label} · ${SOON_LABEL}`}
      onClick={() => onSoon(label)}
      className={`relative cursor-default text-dim/70 transition-colors hover:text-dim ${className}`}
    >
      {children}
      {dot ? (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400/90" />
      ) : null}
    </button>
  );
}
