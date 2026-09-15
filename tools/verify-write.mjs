// Prova que o arquivo gravado pelo Prism continua abrindo no motor.
//
// O caminho e este: copia um mapa do projeto de referencia, pinta tiles com o
// mesmo codigo que o editor usa, grava, e manda o Ruby de verdade abrir o
// resultado. RGSS e mkxp-z carregam o mapa com Marshal, entao o Ruby lendo o
// que escrevemos, com os valores certos e os eventos intactos, e a garantia
// mais forte que da para ter sem abrir o jogo.
//
// Uso, a partir da raiz do repositorio:
//
//   node tools/verify-write.mjs
//
// Precisa de Ruby instalado, e por isso roda fora do CI, como o
// dump-expected.rb.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMap, saveTiles } from "../packages/editor/dist/project/loadProject.js";
import { index, paint, autotileTileId } from "../packages/editor/dist/scene/paint.js";

const source = join(import.meta.dirname, "..", "Game", "essentials-v21.1");
const root = mkdtempSync(join(tmpdir(), "prism-verify-"));
mkdirSync(join(root, "Data"));
for (const file of ["MapInfos.rxdata", "Tilesets.rxdata", "Map002.rxdata"]) {
  copyFileSync(join(source, "Data", file), join(root, "Data", file));
}

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(`${label}: esperava ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
  console.log(`${ok ? "ok  " : "FALHA"} ${label}`);
};

/** Roda o inspetor em Ruby e devolve o relatorio. */
const inspect = (path, ...probes) =>
  JSON.parse(
    execFileSync(
      "ruby",
      [join(import.meta.dirname, "inspect-map.rb"), path, ...probes],
      { encoding: "utf8" },
    ),
  );

const written = join(root, "Data", "Map002.rxdata");
const original = inspect(written);

const before = openMap(root, 2);
const grid = before.grid;

// Duas escritas de natureza diferente: um tile comum do tileset, e agua, que
// e autotile e tem a forma recalculada pela vizinhanca.
let tiles = new Uint16Array(before.tiles);
tiles[index(grid, 3, 3, 2)] = 1000;
tiles = paint(tiles, grid, { x: 10, y: 10, layer: 0, tileId: autotileTileId(0), size: 3 }).tiles;

saveTiles(root, 2, tiles);

const report = inspect(written, "3,3,2", "10,10,0", "9,9,0");

console.log();
check("o Ruby abre e a raiz e RPG::Map", report.class, "RPG::Map");
check("tileset continua o do arquivo original", report.tilesetId, original.tilesetId);
check("largura e altura", [report.width, report.height], [grid.width, grid.height]);
check("a Table tem tres camadas inteiras", report.table, {
  xSize: grid.width,
  ySize: grid.height,
  zSize: 3,
  length: grid.width * grid.height * 3,
});
check(
  "campo que o editor nao toca sobreviveu",
  report.autoplayBgm,
  original.autoplayBgm,
);
const eventLine = (event) =>
  `${event.id}:${event.name}:${event.x},${event.y}:${event.pages}`;
check(
  "os eventos continuam la, com nome, posicao e paginas",
  report.events.map(eventLine),
  original.events.map(eventLine),
);

const probe = (cell) => report.probes.find((entry) => entry.cell === cell)?.tileId;
check("o tile comum chegou no arquivo", probe("3,3,2"), 1000);
check("o centro da agua e a forma cheia", probe("10,10,0"), autotileTileId(0));
check(
  "a borda da agua recebeu forma propria",
  probe("9,9,0") !== autotileTileId(0) && probe("9,9,0") >= 48,
  true,
);

rmSync(root, { recursive: true, force: true });

console.log();
if (failures.length > 0) {
  console.error(`${failures.length} verificacao(oes) falharam:`);
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log("o Ruby abriu o arquivo gravado pelo Prism e achou tudo no lugar");
