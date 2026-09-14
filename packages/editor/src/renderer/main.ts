import { createViewer } from "./scene3d.js";

const canvas = document.querySelector<HTMLCanvasElement>("#view");
const mapList = document.querySelector<HTMLElement>("#maps");
const status = document.querySelector<HTMLElement>("#status");

if (canvas === null || mapList === null || status === null) {
  throw new Error("a pagina do editor esta incompleta");
}

const viewer = createViewer(canvas);

function report(text: string): void {
  (status as HTMLElement).textContent = text;
}

async function main(): Promise<void> {
  report("abrindo projeto…");
  const project = await window.prism.openProject();

  let current: HTMLButtonElement | null = null;

  async function select(button: HTMLButtonElement, id: number): Promise<void> {
    if (current) current.removeAttribute("aria-current");
    button.setAttribute("aria-current", "true");
    current = button;

    report("carregando mapa…");
    const opened = await window.prism.openMap(project.root, id);
    viewer.show(opened.scene);
    report(
      `${opened.name}\n${opened.scene.width}x${opened.scene.height} células\n` +
        `${opened.scene.boxes.length} blocos, ${opened.scene.billboards.length} eventos`,
    );
    // Sinal para o smoke test saber que ja ha cena na tela.
    document.body.dataset["ready"] = "true";
  }

  for (const map of project.maps) {
    const button = document.createElement("button");
    button.innerHTML = `<span>${String(map.id).padStart(3, "0")}</span>`;
    button.append(map.name);
    button.addEventListener("click", () => {
      void select(button, map.id);
    });
    (mapList as HTMLElement).append(button);
  }

  // Abre um mapa externo de cara, que mostra melhor o relevo do que um interior.
  const first =
    project.maps.find((map) => map.name === "Lappet Town") ?? project.maps[0];
  const buttons = [...(mapList as HTMLElement).querySelectorAll("button")];
  const index = project.maps.findIndex((map) => map.id === first?.id);

  if (first && index >= 0) {
    await select(buttons[index] as HTMLButtonElement, first.id);
  } else {
    report("nenhum mapa encontrado");
  }
}

void main().catch((error: unknown) => {
  report(`erro: ${error instanceof Error ? error.message : String(error)}`);
});
