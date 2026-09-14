import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openMap, openProject, saveElevation } from "./loadProject.js";

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
