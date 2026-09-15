/**
 * Icones desenhados a mao.
 *
 * Sao poucos e simples, entao uma biblioteca de icones custaria mais peso e
 * mais dependencia do que escrever os tracos.
 */
const paths: Record<string, string> = {
  save: "M4 3h8l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 0v4h5V3M6 11h6v5H6z",
  undo: "M7 5 3 9l4 4M3 9h7a4 4 0 0 1 0 8H8",
  redo: "m11 5 4 4-4 4M15 9H8a4 4 0 0 0 0 8h2",
  play: "m6 4 9 5-9 5z",
  grid: "M3 3h12v12H3zM3 7h12M3 11h12M7 3v12M11 3v12",
  eye: "M1 9s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Zm8 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  layers: "m9 2 7 4-7 4-7-4zM2 10l7 4 7-4M2 13l7 4 7-4",
  contrast: "M9 2a7 7 0 1 0 0 14A7 7 0 0 0 9 2Zm0 2v10a5 5 0 0 1 0-10Z",
  link: "M7 11a3 3 0 0 0 4 0l3-3a3 3 0 0 0-4-4l-1 1M11 7a3 3 0 0 0-4 0l-3 3a3 3 0 0 0 4 4l1-1",
  flask: "M7 2h4M8 2v5l-4 8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l-4-8V2",
  chat: "M3 4h12v8H8l-4 3v-3H3z",
  refresh: "M15 9a6 6 0 1 1-2-4.5M15 3v3h-3",
  trash: "M4 5h10M7 5V3h4v2M6 5l1 10h4l1-10",
  plus: "M9 4v10M4 9h10",
  pencil: "m3 15 1-4 8-8 3 3-8 8zM11 4l3 3",
  search: "M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3Zm4 9 3 3",
  house: "m2 8 7-5 7 5v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z",
  route: "M3 15c4 0 2-6 6-6s4-6 6-6",
  gate: "M3 15V5h12v10M6 15V8h6v7",
  building: "M4 15V3h10v12M7 6h1M11 6h1M7 9h1M11 9h1M7 12h1M11 12h1",
  mountain: "m2 15 5-9 3 5 2-3 4 7z",
  cube: "m9 2 7 4v7l-7 4-7-4V6zM9 2v4m0 0 7-4M9 6 2 2m7 4v11",
};

interface Props {
  name: keyof typeof paths | string;
  className?: string;
}

export function Icon({ name, className = "h-4 w-4" }: Props) {
  const d = paths[name] ?? paths["grid"]!;
  return (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
