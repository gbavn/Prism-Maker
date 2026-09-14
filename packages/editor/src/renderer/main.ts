import {
  applyBrush,
  History,
  levelTo,
  MAX_ELEVATION,
  MIN_ELEVATION,
  type Grid,
} from "../scene/elevation.js";
import { createViewer, type PickedCell } from "./scene3d.js";

const canvas = document.querySelector<HTMLCanvasElement>("#view");
const mapList = document.querySelector<HTMLElement>("#maps");
const status = document.querySelector<HTMLElement>("#status");
const toolbar = document.querySelector<HTMLElement>("#toolbar");

if (canvas === null || mapList === null || status === null || toolbar === null) {
  throw new Error("a pagina do editor esta incompleta");
}

const viewer = createViewer(canvas);

/** Estado do mapa aberto. Null antes de abrir o primeiro. */
interface OpenMapState {
  id: number;
  name: string;
  grid: Grid;
  history: History<number[]>;
  saved: number[];
}

let state: OpenMapState | null = null;
let projectRoot = "";
let brushSize = 1;
let hovered: PickedCell | null = null;

function report(lines: string[]): void {
  (status as HTMLElement).textContent = lines.join("\n");
}

function isDirty(): boolean {
  if (state === null) return false;
  const current = state.history.current;
  return current.some((step, index) => step !== state?.saved[index]);
}

function describe(extra?: string): void {
  if (state === null) return void report(["nenhum mapa aberto"]);

  const heights = state.history.current;
  const cell = hovered;
  const at =
    cell === null
      ? "fora do mapa"
      : `célula ${cell.x},${cell.y} · altura ${heights[cell.y * state.grid.width + cell.x]}`;

  report([
    `${state.name}${isDirty() ? " *" : ""}`,
    `${state.grid.width}x${state.grid.height} · pincel ${brushSize}x${brushSize}`,
    at,
    extra ?? "clique sobe · shift+clique desce · 1 2 3 pincel · L nivela · ctrl+Z ctrl+S",
  ]);
}

/**
 * Redesenha sem ir ao disco.
 *
 * Reabrir o mapa a cada pincelada seria simples de escrever e insuportavel de
 * usar: leria o .rxdata de novo a cada clique. O processo principal devolve a
 * cena construida, entao o renderer pede a reconstrucao so com as alturas
 * novas.
 */
async function redraw(): Promise<void> {
  if (state === null) return;
  const built = await window.prism.buildScene(
    projectRoot,
    state.id,
    state.history.current,
  );
  viewer.show(built);
  viewer.highlight(hovered);
}

async function edit(delta: number): Promise<void> {
  if (state === null || hovered === null) return;

  const { heights, changed } = applyBrush(state.history.current, state.grid, {
    x: hovered.x,
    y: hovered.y,
    size: brushSize,
    delta,
  });

  if (changed === 0) {
    describe(
      delta > 0
        ? `já no limite de ${MAX_ELEVATION}`
        : `já no limite de ${MIN_ELEVATION}`,
    );
    return;
  }

  state.history.push(heights);
  await redraw();
  describe();
}

async function level(): Promise<void> {
  if (state === null || hovered === null) return;

  const current = state.history.current;
  const target = current[hovered.y * state.grid.width + hovered.x] ?? 0;
  const { heights, changed } = levelTo(
    current,
    state.grid,
    { x: hovered.x, y: hovered.y, size: brushSize },
    target,
  );

  if (changed === 0) return void describe("já está nivelado");
  state.history.push(heights);
  await redraw();
  describe(`nivelado em ${target}`);
}

async function save(): Promise<void> {
  if (state === null) return;
  try {
    const result = await window.prism.saveElevation(
      projectRoot,
      state.id,
      state.history.current,
    );
    state.saved = [...state.history.current];
    describe(`salvo em ${result.path.split("/").pop() ?? result.path}`);
  } catch (error) {
    describe(`erro ao salvar: ${error instanceof Error ? error.message : error}`);
  }
}

function buildToolbar(): void {
  for (const size of [1, 3, 5]) {
    const button = document.createElement("button");
    button.textContent = `${size}×${size}`;
    button.addEventListener("click", () => {
      brushSize = size;
      syncToolbar();
      describe();
    });
    button.dataset["size"] = String(size);
    (toolbar as HTMLElement).append(button);
  }

  const saveButton = document.createElement("button");
  saveButton.textContent = "salvar";
  saveButton.className = "primary";
  saveButton.addEventListener("click", () => void save());
  (toolbar as HTMLElement).append(saveButton);
}

function syncToolbar(): void {
  for (const button of (toolbar as HTMLElement).querySelectorAll("button")) {
    const size = button.dataset["size"];
    if (size !== undefined) {
      button.setAttribute("aria-pressed", String(Number(size) === brushSize));
    }
  }
}

function bindInput(): void {
  canvas!.addEventListener("pointermove", (event) => {
    // Usa a coordenada do proprio evento: depender do ponteiro que o Babylon
    // guarda deixaria a selecao um evento atrasada.
    const cell = viewer.pickCell(event.offsetX, event.offsetY);
    const same = cell?.x === hovered?.x && cell?.y === hovered?.y;
    if (same) return;
    hovered = cell;
    viewer.highlight(cell);
    describe();
  });

  let pressedAt: { x: number; y: number } | null = null;

  canvas!.addEventListener("pointerdown", (event) => {
    pressedAt = { x: event.clientX, y: event.clientY };
  });

  canvas!.addEventListener("pointerup", (event) => {
    if (pressedAt === null) return;
    const moved =
      Math.abs(event.clientX - pressedAt.x) +
      Math.abs(event.clientY - pressedAt.y);
    pressedAt = null;
    // Arrastar orbita a camera; so o clique parado edita.
    if (moved > 4 || event.button !== 0) return;
    void edit(event.shiftKey ? -1 : 1);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "1") brushSize = 1;
    else if (event.key === "2") brushSize = 3;
    else if (event.key === "3") brushSize = 5;
    else if (event.key.toLowerCase() === "l") void level();
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (state === null) return;
      if (event.shiftKey) state.history.redo();
      else state.history.undo();
      void redraw().then(() => describe(event.shiftKey ? "refeito" : "desfeito"));
      return;
    } else return;

    syncToolbar();
    describe();
  });
}

async function main(): Promise<void> {
  report(["abrindo projeto…"]);
  const project = await window.prism.openProject();
  projectRoot = project.root;

  buildToolbar();
  syncToolbar();
  bindInput();

  let current: HTMLButtonElement | null = null;

  async function select(button: HTMLButtonElement, id: number): Promise<void> {
    if (current) current.removeAttribute("aria-current");
    button.setAttribute("aria-current", "true");
    current = button;

    report(["carregando mapa…"]);
    const opened = await window.prism.openMap(projectRoot, id);

    state = {
      id: opened.id,
      name: opened.name,
      grid: opened.grid,
      history: new History<number[]>([...opened.heights]),
      saved: [...opened.heights],
    };
    hovered = null;

    viewer.show(opened.scene);
    viewer.highlight(null);
    describe();
    document.body.dataset["ready"] = "true";
  }

  for (const map of project.maps) {
    const button = document.createElement("button");
    button.innerHTML = `<span>${String(map.id).padStart(3, "0")}</span>`;
    button.append(map.name);
    button.addEventListener("click", () => void select(button, map.id));
    (mapList as HTMLElement).append(button);
  }

  const first =
    project.maps.find((map) => map.name === "Lappet Town") ?? project.maps[0];
  const buttons = [...(mapList as HTMLElement).querySelectorAll("button")];
  const index = project.maps.findIndex((map) => map.id === first?.id);

  if (first && index >= 0) {
    await select(buttons[index] as HTMLButtonElement, first.id);
  } else {
    report(["nenhum mapa encontrado"]);
  }
}

void main().catch((error: unknown) => {
  report([`erro: ${error instanceof Error ? error.message : String(error)}`]);
});
