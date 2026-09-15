import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, net, protocol } from "electron";
import {
  openMap,
  openProject,
  rebuildScene,
  saveElevation,
  saveObjects,
  saveTiles,
} from "../project/loadProject.js";
import type { PlacedObject } from "../scene/buildScene.js";
import { IPC } from "../shared/ipc.js";

const here = dirname(fileURLToPath(import.meta.url));
const editorRoot = resolve(here, "..", "..");

/**
 * Projeto aberto por padrao.
 *
 * O Essentials de referencia mora no proprio repositorio, entao abrir o
 * editor ja mostra um mapa de verdade sem nenhum passo manual. Isso e o que
 * faz o marco visual valer: a pessoa roda e ve.
 */
function defaultProjectRoot(): string | null {
  // PRISM_PROJECT aponta para outro projeto. O smoke test usa isso para
  // gravar numa copia: um ensaio que responde "Save" escreveria no Essentials
  // versionado do repositorio, e teste que suja o repositorio e teste que a
  // gente aprende a nao rodar.
  const chosen = process.env["PRISM_PROJECT"];
  const candidate =
    chosen !== undefined && chosen !== ""
      ? resolve(chosen)
      : resolve(editorRoot, "..", "..", "Game", "essentials-v21.1");
  return existsSync(join(candidate, "Data", "MapInfos.rxdata")) ? candidate : null;
}

async function chooseProjectRoot(): Promise<string> {
  const picked = await dialog.showOpenDialog({
    title: "Escolha a pasta do projeto Essentials",
    properties: ["openDirectory"],
  });
  const chosen = picked.filePaths[0];
  if (picked.canceled || chosen === undefined) {
    throw new Error("nenhuma pasta escolhida");
  }
  return chosen;
}

ipcMain.handle(IPC.openProject, async (_event, root?: string) => {
  const target = root ?? defaultProjectRoot() ?? (await chooseProjectRoot());
  assetRoot = resolve(target);
  return openProject(target);
});

ipcMain.handle(IPC.openMap, (_event, root: string, id: number) =>
  openMap(root, id),
);

ipcMain.handle(
  IPC.buildScene,
  (_event, root: string, id: number, heights: number[], tiles?: Uint16Array) =>
    rebuildScene(root, id, heights, tiles),
);

ipcMain.handle(
  IPC.saveTiles,
  (_event, root: string, id: number, tiles: Uint16Array) =>
    saveTiles(root, id, tiles),
);

ipcMain.handle(
  IPC.saveElevation,
  (_event, root: string, id: number, heights: number[]) =>
    saveElevation(root, id, heights),
);

/**
 * Grava um objeto 3D no projeto.
 *
 * Duas escritas: a imagem assada em Graphics/Objects, e a colocacao dentro do
 * .rxdata do mapa. A imagem vai para a pasta de graficos do projeto porque e
 * de la que o jogo carrega qualquer bitmap, pelo RPG::Cache.
 */
ipcMain.handle(
  IPC.placeObject,
  (_event, root: string, id: number, object: PlacedObject, png: string) => {
    const folder = join(root, "Graphics", "Objects");
    mkdirSync(folder, { recursive: true });

    const image = join(folder, `${object.name}.png`);
    writeFileSync(image, Buffer.from(png, "base64"));

    const { count } = saveObjects(root, id, [object]);
    return { image, count };
  },
);

/**
 * Pergunta o que fazer com alteracao pendente.
 *
 * Dialogo do sistema, e nao uma janela desenhada por nos: perder trabalho e
 * irreversivel, e vale usar a caixa que a pessoa ja reconhece como aviso
 * serio. Fecha em "Cancel" por tecla Escape, que e o lado seguro.
 */
ipcMain.handle(IPC.confirmSave, async (event, mapName: string) => {
  // Caixa do sistema nao da para clicar em teste sem tela. Com
  // PRISM_SMOKE_ANSWER o ensaio responde por ela, e assim o caminho perigoso,
  // o de trocar de mapa com edicao pendente, fica coberto por print.
  const canned = process.env["PRISM_SMOKE_ANSWER"];
  if (canned !== undefined) return canned;

  const window = BrowserWindow.fromWebContents(event.sender);
  const options = {
    type: "question" as const,
    buttons: ["Save", "Discard", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    title: "Unsaved changes",
    message: `Save the changes to ${mapName}?`,
    detail: "Your edits have not been written to the project yet.",
    noLink: true,
  };

  const { response } =
    window === null
      ? await dialog.showMessageBox(options)
      : await dialog.showMessageBox(window, options);

  return response === 0 ? "save" : response === 1 ? "discard" : "cancel";
});

/**
 * Abre o jogo do projeto.
 *
 * Aberto em modo de depuracao, com o argumento `debug`. Verificado no fonte do
 * mkxp-z, `src/config.cpp`: `debug` ou `test` como primeiro argumento liga o
 * modo do editor, que e o que faz `$DEBUG` valer true no Ruby. Isso importa
 * porque o Essentials so compila plugin novo em depuracao, entao sem esse
 * argumento o plugin do Prism nem seria carregado. E tambem e o que o proprio
 * RPG Maker faz ao testar o jogo.
 *
 * O processo e solto do editor: fechar o Prism nao pode matar o jogo aberto.
 */
ipcMain.handle(IPC.playtest, (_event, root: string) => {
  const executable = join(root, "Game.exe");

  if (!existsSync(executable)) {
    return { started: false, detail: `Game.exe not found in ${root}` };
  }
  if (process.platform !== "win32") {
    return {
      started: false,
      detail: "Game.exe only runs on Windows: this kit ships the Windows build",
    };
  }

  const game = spawn(executable, ["debug"], {
    cwd: root,
    detached: true,
    stdio: "ignore",
  });
  game.unref();

  return { started: true, detail: executable };
});

/**
 * Smoke test com imagem.
 *
 * Com PRISM_SMOKE_SHOT apontando para um arquivo, o editor sobe, espera a
 * primeira cena aparecer, salva um PNG e sai. Serve para provar que o app
 * realmente renderiza, em vez de confiar que "deve funcionar", e roda em
 * maquina sem tela com xvfb mais swiftshader.
 */
const smokeShot = process.env["PRISM_SMOKE_SHOT"];

if (smokeShot !== undefined) {
  app.commandLine.appendSwitch("use-gl", "swiftshader");
  app.commandLine.appendSwitch("enable-unsafe-swiftshader");
}

/**
 * Ensaio de edicao para o smoke test.
 *
 * Um print de que o mapa abre nao prova que a ferramenta de elevacao
 * funciona. Aqui o proprio Electron injeta movimento de mouse, tecla e
 * clique, o que exercita a cadeia inteira: selecao por raio sobre thin
 * instances, pincel, reconstrucao da cena e destaque.
 */
async function rehearseEditing(window: BrowserWindow): Promise<void> {
  const send = (event: Parameters<typeof window.webContents.sendInputEvent>[0]) =>
    window.webContents.sendInputEvent(event);
  const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

  /** Aperta e solta o botao esquerdo num ponto. */
  const click = async (x: number, y: number) => {
    send({ type: "mouseMove", x, y });
    await wait(120);
    send({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
    send({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
    await wait(250);
  };

  /** Arrasta de um ponto ao outro, passando pelo meio do caminho. */
  const drag = async (from: [number, number], to: [number, number]) => {
    const steps = 10;
    send({ type: "mouseMove", x: from[0], y: from[1] });
    await wait(120);
    send({
      type: "mouseDown", x: from[0], y: from[1], button: "left", clickCount: 1,
    });
    for (let step = 1; step <= steps; step += 1) {
      const x = Math.round(from[0] + ((to[0] - from[0]) * step) / steps);
      const y = Math.round(from[1] + ((to[1] - from[1]) * step) / steps);
      send({ type: "mouseMove", x, y });
      await wait(90);
    }
    send({ type: "mouseUp", x: to[0], y: to[1], button: "left", clickCount: 1 });
    await wait(400);
  };

  // Escolhe o primeiro autotile da paleta, que e agua: contraste alto contra a
  // grama, entao o print mostra na hora se a ferramenta pintou ou nao.
  await click(1150, 175);

  // Retangulo, arrastado sobre o mapa.
  await click(315, 73);
  await drag([470, 300], [600, 380]);

  // Lapis, arrastado: um traco continuo prova que nao e um clique por celula.
  await click(230, 73);
  await drag([660, 300], [800, 300]);

  // Bloco de tiles na paleta, escolhido arrastando sobre o tileset.
  await drag([1085, 505], [1145, 560]);

  // Volta para um tile so: com bloco escolhido, o bloco manda no pincel, e o
  // que se quer medir aqui e o pincel.
  await click(1150, 175);

  // Pincel de cinco e cursor parado: o destaque tem que cobrir as vinte e
  // cinco celulas que a pincelada escreveria, nao so a celula apontada.
  send({ type: "keyDown", keyCode: "3" });
  send({ type: "keyUp", keyCode: "3" });
  await wait(200);
  send({ type: "mouseMove", x: 700, y: 430 });
  await wait(500);
}

/**
 * Ensaio do modo Events.
 *
 * Entra no modo pela trilha lateral e clica na celula de um evento, que e o
 * caminho que prova as duas coisas de uma vez: os sprites desenhados e a
 * selecao por celula.
 */
async function rehearseEvents(window: BrowserWindow): Promise<void> {
  const send = (event: Parameters<typeof window.webContents.sendInputEvent>[0]) =>
    window.webContents.sendInputEvent(event);
  const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

  const click = async (x: number, y: number) => {
    send({ type: "mouseMove", x, y });
    await wait(150);
    send({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
    send({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
    await wait(400);
  };

  // Modo Events na trilha lateral.
  await click(27, 174);

  // A celula do NPC que explica as portas, em 12,7 no mapa. Em escala fixa a
  // conta e direta: o centro da viewport mostra o centro do mapa, e cada
  // celula vale 32 pixels.
  const centre = { x: 672, y: 412 };
  const cell = { x: 12, y: 7 };
  const map = { width: 32, height: 21 };
  await click(
    Math.round(centre.x + (cell.x - (map.width - 1) / 2) * 32),
    Math.round(centre.y + (cell.y - (map.height - 1) / 2) * 32),
  );
  await wait(400);

  // Desliga e liga a grade, para o ensaio passar pelos dois sentidos do
  // botao e ainda assim terminar com ela ligada para o print.
  for (const _ of [0, 1]) {
    await window.webContents.executeJavaScript(
      "document.querySelector('[data-grid]')?.click()",
    );
    await wait(300);
  }
}

/**
 * Ensaio de colocacao de objeto 3D.
 *
 * Recebe "<mapa>:<dx>,<dy>": abre o mapa, escolhe a ferramenta Place e clica
 * no centro da viewport deslocado de dx e dy celulas. O centro e usado porque
 * a camera centraliza o mapa ao abrir, entao a conta vale para qualquer
 * tamanho de mapa.
 */
async function rehearsePlacing(window: BrowserWindow, spec: string): Promise<void> {
  const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
  const [mapPart, cellPart] = spec.split(":");
  const [dx, dy] = (cellPart ?? "0,0").split(",").map((value) => Number(value) || 0);

  await window.webContents.executeJavaScript(
    `document.querySelector('[data-map="${mapPart}"]')?.click()`,
  );
  await wait(2500);

  await window.webContents.executeJavaScript(
    "document.querySelector('[data-tool=\"place\"]')?.click()",
  );
  await wait(600);

  const x = Math.round(672 + (dx ?? 0) * 32);
  const y = Math.round(412 + (dy ?? 0) * 32);
  window.webContents.sendInputEvent({ type: "mouseMove", x, y });
  await wait(200);
  window.webContents.sendInputEvent({
    type: "mouseDown", x, y, button: "left", clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: "mouseUp", x, y, button: "left", clickCount: 1,
  });
  await wait(3000);
}

async function captureAndQuit(
  window: BrowserWindow,
  target: string,
): Promise<void> {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(
      'document.body.dataset.ready === "true"',
    );
    if (ready === true) {
      // Um quadro a mais para o Babylon terminar de desenhar.
      await new Promise((done) => setTimeout(done, 1500));
      if (process.env["PRISM_SMOKE_EDIT"] === "1") {
        await rehearseEditing(window);
      }
      if (process.env["PRISM_SMOKE_SWITCH"] === "1") {
        // Clica em outro mapa na lista, que e o que dispara a pergunta.
        window.webContents.sendInputEvent({ type: "mouseMove", x: 170, y: 257 });
        window.webContents.sendInputEvent({
          type: "mouseDown", x: 170, y: 257, button: "left", clickCount: 1,
        });
        window.webContents.sendInputEvent({
          type: "mouseUp", x: 170, y: 257, button: "left", clickCount: 1,
        });
        await new Promise((done) => setTimeout(done, 2000));
      }
      const place = process.env["PRISM_SMOKE_PLACE"];
      if (place !== undefined) {
        await rehearsePlacing(window, place);
      }
      const layer = process.env["PRISM_SMOKE_LAYER"];
      if (layer !== undefined) {
        // Troca a camada em foco, que apaga as outras na viewport.
        await window.webContents.executeJavaScript(
          `document.querySelector('[data-layer="${layer}"]')?.click()`,
        );
        await new Promise((done) => setTimeout(done, 800));
      }
      if (process.env["PRISM_SMOKE_EVENTS"] === "1") {
        await rehearseEvents(window);
      }
      if (process.env["PRISM_SMOKE_3D"] === "1") {
        // Pelo seletor e nao por coordenada: o botao anda na tela conforme o
        // painel da direita muda de largura, e o ensaio quebrava junto.
        await window.webContents.executeJavaScript(
          'document.querySelector(\'[data-view="3d"]\')?.click()',
        );
        await new Promise((done) => setTimeout(done, 1500));
      }
      const image = await window.webContents.capturePage();
      writeFileSync(target, image.toPNG());
      app.exit(0);
      return;
    }
    await new Promise((done) => setTimeout(done, 250));
  }

  const message = await window.webContents.executeJavaScript(
    "document.querySelector('#status')?.textContent ?? 'sem status'",
  );
  console.error(`a cena nao ficou pronta: ${String(message)}`);
  app.exit(1);
}

/**
 * Protocolo que serve imagens do projeto para a janela.
 *
 * A janela nao tem acesso a disco, entao precisa de um canal para os PNGs de
 * tileset. Mandar o conteudo pelo IPC custaria megabytes a cada troca de mapa,
 * e liberar file:// daria a janela o disco inteiro. Um protocolo proprio, com
 * a raiz do projeto como limite, resolve os dois.
 *
 * O confinamento e verificado com caminho resolvido, nao com comparacao de
 * texto: "Graphics/../../.." precisa falhar.
 */
let assetRoot: string | null = null;

function resolveAsset(requestUrl: string): string | null {
  if (assetRoot === null) return null;

  const raw = decodeURIComponent(new URL(requestUrl).pathname).replace(/^\/+/, "");
  const target = resolve(assetRoot, raw);
  const inside = relative(assetRoot, target);

  if (inside === "" || inside.startsWith("..") || inside.startsWith(`..${sep}`)) {
    return null;
  }
  return target;
}

function registerAssetProtocol(): void {
  protocol.handle("prism-asset", async (request) => {
    const target = resolveAsset(request.url);
    if (target === null) return new Response("fora do projeto", { status: 403 });
    return net.fetch(pathToFileURL(target).toString());
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#14181d",
    title: "Prism",
    webPreferences: {
      // O preload precisa ser CommonJS: o Electron nao carrega preload em
      // ESM sem desligar o sandbox, e desligar o sandbox por conveniencia
      // seria trocar seguranca por comodidade.
      preload: join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void window.loadFile(join(editorRoot, "dist", "renderer", "index.html"));

  if (smokeShot !== undefined) {
    window.webContents.once("did-finish-load", () => {
      void captureAndQuit(window, smokeShot);
    });
  }
}

protocol.registerSchemesAsPrivileged([
  { scheme: "prism-asset", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

void app.whenReady().then(() => {
  registerAssetProtocol();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
