import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  openMap,
  openProject,
  saveElevation,
  saveObjects,
  saveTiles,
} from "./loadProject.js";

const sourceData = fileURLToPath(
  new URL("../../../../Game/essentials-v21.1/Data/", import.meta.url),
);

/**
 * Projeto de trabalho temporario.
 *
 * Os testes gravam arquivos, e gravar dentro de Game/ sujaria o projeto de
 * referencia versionado. Uma copia so com o que o editor precisa resolve, e
 * de quebra prova que o editor nao depende de nada alem desses arquivos.
 */
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "prism-test-"));
  mkdirSync(join(root, "Data"));
  for (const file of ["MapInfos.rxdata", "Tilesets.rxdata", "Map002.rxdata"]) {
    copyFileSync(join(sourceData, file), join(root, "Data", file));
  }

  // Charsets vazios, so para a resolucao de caminho ter o que achar. Um deles
  // sai com a caixa trocada de proposito: e assim que projeto feito no Windows
  // chega aqui, e em Linux isso e a diferenca entre achar e nao achar.
  mkdirSync(join(root, "Graphics", "Characters"), { recursive: true });
  for (const file of ["NPC 06.png", "Doors3.png", "doors5.png"]) {
    writeFileSync(join(root, "Graphics", "Characters", file), "");
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("abrir projeto", () => {
  it("lista os mapas na ordem do RPG Maker", () => {
    const project = openProject(root);
    expect(project.maps.length).toBeGreaterThan(60);
    expect(project.maps[0]?.name).toBe("Intro");
    expect(project.maps.find((map) => map.id === 2)?.name).toBe("Lappet Town");
  });
});

describe("abrir mapa sem .scene.json", () => {
  it("assume mapa plano em vez de recusar a abrir", () => {
    const opened = openMap(root, 2);
    expect(opened.grid).toEqual({ width: 32, height: 21 });
    expect(opened.heights).toHaveLength(32 * 21);
    expect(opened.heights.every((step) => step === 0)).toBe(true);
    expect(opened.scene.quads.length).toBeGreaterThan(0);
  });
});

describe("gravar elevacao", () => {
  it("salva e le de volta as mesmas alturas", () => {
    const opened = openMap(root, 2);
    const heights = [...opened.heights];
    heights[0] = 3;
    heights[100] = -2;
    heights[heights.length - 1] = 5;

    const result = saveElevation(root, 2, heights);
    expect(result.cells).toBe(32 * 21);

    const reopened = openMap(root, 2);
    expect(reopened.heights).toEqual(heights);
    // A geometria tem que refletir a altura: passo padrao 0.5.
    expect(reopened.scene.surface[0]).toBe(1.5);
  });

  it("escreve ao lado do .rxdata, sem toca-lo", () => {
    const before = readFileSync(join(root, "Data", "Map002.rxdata"));
    saveElevation(root, 2, openMap(root, 2).heights);
    const after = readFileSync(join(root, "Data", "Map002.rxdata"));
    expect(after.equals(before)).toBe(true);
  });

  it("guarda a elevacao em RLE, nao como lista solta", () => {
    saveElevation(root, 2, new Array<number>(32 * 21).fill(1));
    const written = JSON.parse(
      readFileSync(join(root, "Data", "Map002.scene.json"), "utf8"),
    ) as { elevation: { encoding: string; data: unknown[] } };

    expect(written.elevation.encoding).toBe("rle");
    // Um mapa inteiramente plano cabe em uma unica run.
    expect(written.elevation.data).toHaveLength(1);
  });

  it("preserva o que ja existia no arquivo", () => {
    const path = join(root, "Data", "Map002.scene.json");
    saveElevation(root, 2, openMap(root, 2).heights);

    const document = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      unknown
    >;
    document["camera"] = { pitch: 70, rotation: "locked" };
    document["cells"] = { "3,3": { collision: "solid" } };
    writeFileSync(path, JSON.stringify(document), "utf8");

    const heights = [...openMap(root, 2).heights];
    heights[5] = 4;
    saveElevation(root, 2, heights);

    const after = JSON.parse(readFileSync(path, "utf8")) as {
      camera?: { pitch: number; rotation: string };
      cells?: Record<string, unknown>;
    };
    expect(after.camera?.pitch).toBe(70);
    expect(after.camera?.rotation).toBe("locked");
    expect(after.cells?.["3,3"]).toEqual({ collision: "solid" });
  });

  it("recusa elevacao do tamanho errado", () => {
    expect(() => saveElevation(root, 2, [1, 2, 3])).toThrow(/3 celulas.*32x21/);
  });
});

describe("gravar tiles no .rxdata", () => {
  it("escreve e lê de volta a mesma grade", () => {
    const opened = openMap(root, 2);
    const tiles = new Uint16Array(opened.tiles);
    // Três células escolhidas em camadas diferentes.
    tiles[0] = 800;
    tiles[32 * 21 + 5] = 0;
    tiles[2 * 32 * 21 + 10] = 1200;

    const result = saveTiles(root, 2, tiles);
    expect(result.cells).toBe(32 * 21 * 3);

    const reopened = openMap(root, 2);
    expect(reopened.tiles[0]).toBe(800);
    expect(reopened.tiles[32 * 21 + 5]).toBe(0);
    expect(reopened.tiles[2 * 32 * 21 + 10]).toBe(1200);
  });

  it("traz os eventos do mapa com a página um", () => {
    const opened = openMap(root, 2);
    // Lappet Town: três portas e um NPC que explica as portas.
    expect(opened.events.map((entry) => entry.name)).toEqual([
      "Home door",
      "Lab door",
      "Door explainer",
      "Next door",
    ]);

    const explainer = opened.events.find(
      (entry) => entry.name === "Door explainer",
    );
    expect(explainer?.pages[0]?.characterName).toBe("NPC 06");
    // A contagem de comandos é o que responde "esse evento faz alguma coisa?".
    expect(explainer?.pages[0]?.commands).toBeGreaterThan(0);
  });

  it("resolve só os charsets que o mapa usa", () => {
    const opened = openMap(root, 2);
    // Nem a pasta inteira de personagens, nem uma lista vazia: só os três
    // charsets que os eventos deste mapa pedem.
    expect(Object.keys(opened.graphics.characters).sort()).toEqual([
      "NPC 06",
      "doors3",
      "doors5",
    ]);
    // O arquivo em disco e Doors3.png, com D maiusculo, e o .rxdata pede
    // doors3. Tem que achar mesmo assim.
    expect(opened.graphics.characters["doors3"]).toBe(
      "Graphics/Characters/Doors3.png",
    );
  });

  it("preserva tudo que não é tile", () => {
    // Os eventos são o que mais importa aqui: eles vivem no mesmo arquivo, e
    // uma gravação que os perdesse destruiria o trabalho de quem usa.
    const before = openMap(root, 2);
    const events = before.scene.billboards.map((b) => `${b.id}:${b.name}:${b.x},${b.z}`);

    saveTiles(root, 2, new Uint16Array(before.tiles));

    const after = openMap(root, 2);
    expect(after.scene.billboards.map((b) => `${b.id}:${b.name}:${b.x},${b.z}`)).toEqual(
      events,
    );
    expect(after.scene.quads.length).toBe(before.scene.quads.length);
  });

  it("faz backup antes da primeira escrita", () => {
    saveTiles(root, 2, new Uint16Array(openMap(root, 2).tiles));

    const backups = join(root, ".prism", "backups");
    expect(existsSync(backups)).toBe(true);

    const sessions = readdirSync(backups);
    expect(sessions.length).toBeGreaterThan(0);
    expect(readdirSync(join(backups, sessions[0]!))).toContain("Map002.rxdata");
  });

  it("recusa grade com tamanho errado", () => {
    expect(() => saveTiles(root, 2, new Uint16Array(10))).toThrow(/10 células/);
  });

  it("recusa gravar por cima de edição feita fora do editor", () => {
    const opened = openMap(root, 2);
    const path = join(root, "Data", "Map002.rxdata");

    // Alguém salvou o mapa no RPG Maker enquanto o editor estava aberto.
    const bytes = readFileSync(path);
    utimesSync(path, new Date(), new Date(Date.now() + 5000));

    expect(() => saveTiles(root, 2, new Uint16Array(opened.tiles))).toThrow(
      /mudou em disco/,
    );
    // E o arquivo continua como estava.
    expect(readFileSync(path).equals(bytes)).toBe(true);
  });
});

describe("gravar objetos 3D no .rxdata", () => {
  it("escreve e lê de volta o modelo e o giro", () => {
    openProject(root);
    openMap(root, 2);

    saveObjects(root, 2, [
      {
        name: "buildings/lab",
        model: "Prism/Models/buildings/lab.obj",
        x: 12,
        y: 6,
        width: 8,
        depth: 5,
        anchorX: 40,
        anchorY: 96,
        yaw: 24,
      },
    ]);

    const again = openMap(root, 2);
    expect(again.objects).toHaveLength(1);
    expect(again.objects[0]?.model).toBe("Prism/Models/buildings/lab.obj");
    expect(again.objects[0]?.yaw).toBe(24);
    expect(again.objects[0]?.x).toBe(12);
  });

  it("omite modelo e giro quando não há, para o mapa antigo sair igual", () => {
    openProject(root);
    openMap(root, 2);

    saveObjects(root, 2, [
      { name: "foodtruck", x: 3, y: 4, width: 4, depth: 3, anchorX: 1, anchorY: 2 },
    ]);

    const again = openMap(root, 2);
    expect(again.objects[0]?.model).toBeUndefined();
    expect(again.objects[0]?.yaw).toBeUndefined();
  });

  it("apaga a lista quando o último objeto sai", () => {
    openProject(root);
    openMap(root, 2);

    saveObjects(root, 2, [
      { name: "foodtruck", x: 1, y: 1, width: 2, depth: 2, anchorX: 0, anchorY: 0 },
    ]);
    saveObjects(root, 2, []);

    expect(openMap(root, 2).objects).toHaveLength(0);
  });
});
