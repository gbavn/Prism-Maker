import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { openMap, openProject } from "../project/loadProject.js";
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
  const candidate = resolve(editorRoot, "..", "..", "Game", "essentials-v21.1");
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
  return openProject(target);
});

ipcMain.handle(IPC.openMap, (_event, root: string, id: number) =>
  openMap(root, id),
);

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

void app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
