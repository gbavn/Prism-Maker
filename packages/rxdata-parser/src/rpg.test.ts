import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tableSummary } from "./fixture.js";
import { loadMap, loadMapInfos, loadTilesets } from "./rpg.js";

/**
 * Estes testes comparam o leitor em TypeScript contra um arquivo de
 * referencia produzido pelo Marshal do proprio Ruby, em
 * `tools/dump-expected.rb`. Sem esse contraponto, os testes so confirmariam
 * que o leitor concorda consigo mesmo.
 */

const repoRoot = new URL("../../../", import.meta.url);

function readData(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`Game/essentials-v21.1/Data/${name}`, repoRoot))),
  );
}

interface Expected {
  maps: Record<string, unknown>;
  tilesetCount: number;
  tilesets: { id: number }[];
  mapInfoCount: number;
  mapInfos: Record<string, unknown>;
}

const expected = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("packages/rxdata-parser/fixtures/essentials-v21.1.json", repoRoot)),
    "utf8",
  ),
) as Expected;

describe("loadMap contra a referencia do Ruby", () => {
  for (const file of Object.keys(expected.maps)) {
    it(`le ${file} igual ao Ruby`, () => {
      const map = loadMap(readData(file));
      const events = [...map.events.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, event]) => {
          const page = event.pages[0]!;
          return {
            id: event.id,
            name: event.name,
            x: event.x,
            y: event.y,
            pageCount: event.pages.length,
            firstPage: {
              trigger: page.trigger,
              moveType: page.moveType,
              moveSpeed: page.moveSpeed,
              moveFrequency: page.moveFrequency,
              walkAnime: page.walkAnime,
              alwaysOnTop: page.alwaysOnTop,
              commandCount: page.commands.length,
              firstCommandCode: page.commands[0]!.code,
              graphic: page.graphic,
            },
          };
        });

      expect({
        tilesetId: map.tilesetId,
        width: map.width,
        height: map.height,
        data: tableSummary(map.data),
        events,
      }).toEqual(expected.maps[file]);
    });
  }
});

describe("loadTilesets contra a referencia do Ruby", () => {
  const tilesets = loadTilesets(readData("Tilesets.rxdata"));

  it("encontra a mesma quantidade de tilesets", () => {
    expect(tilesets.size).toBe(expected.tilesetCount);
  });

  for (const want of expected.tilesets) {
    it(`le o tileset ${want.id} igual ao Ruby`, () => {
      const got = tilesets.get(want.id);
      expect(got).toBeDefined();
      expect({
        id: got!.id,
        name: got!.name,
        tilesetName: got!.tilesetName,
        autotileNames: got!.autotileNames,
        passages: tableSummary(got!.passages),
        priorities: tableSummary(got!.priorities),
        terrainTags: tableSummary(got!.terrainTags),
      }).toEqual(want);
    });
  }
});

describe("loadMapInfos contra a referencia do Ruby", () => {
  const infos = loadMapInfos(readData("MapInfos.rxdata"));

  it("encontra a mesma quantidade de mapas", () => {
    expect(infos.size).toBe(expected.mapInfoCount);
  });

  it("le os primeiros mapas igual ao Ruby", () => {
    for (const [id, want] of Object.entries(expected.mapInfos)) {
      expect(infos.get(Number(id))).toEqual(want);
    }
  });

  it("decodifica acento em UTF-8", () => {
    // O mapa 4 chama-se "Pokémon Lab" e vem em UTF-8 sem marcador de encoding.
    expect(infos.get(4)?.name).toBe("Pokémon Lab");
  });
});

describe("leitura de todos os mapas do projeto", () => {
  it("le os 69 mapas sem erro", () => {
    const infos = loadMapInfos(readData("MapInfos.rxdata"));
    let read = 0;
    for (const id of infos.keys()) {
      const file = `Map${String(id).padStart(3, "0")}.rxdata`;
      const map = loadMap(readData(file));
      expect(map.data.zSize).toBe(3);
      expect(map.data.data.length).toBe(map.width * map.height * 3);
      read += 1;
    }
    expect(read).toBe(infos.size);
  });
});
