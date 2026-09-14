import { describe, expect, it } from "vitest";
import {
  applyBrush,
  cellIndex,
  clampElevation,
  createHeights,
  History,
  levelTo,
  MAX_ELEVATION,
  MIN_ELEVATION,
} from "./elevation.js";

const grid = { width: 5, height: 4 };

/** Desenha a grade como texto, que torna a falha legivel de imediato. */
function draw(heights: readonly number[]): string {
  const rows: string[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    rows.push(heights.slice(y * grid.width, (y + 1) * grid.width).join(" "));
  }
  return rows.join("\n");
}

describe("limites de altura", () => {
  it("arredonda e limita", () => {
    expect(clampElevation(2.4)).toBe(2);
    expect(clampElevation(2.6)).toBe(3);
    expect(clampElevation(999)).toBe(MAX_ELEVATION);
    expect(clampElevation(-999)).toBe(MIN_ELEVATION);
  });
});

describe("indice de celula", () => {
  it("devolve null fora da grade", () => {
    expect(cellIndex(grid, 0, 0)).toBe(0);
    expect(cellIndex(grid, 4, 3)).toBe(19);
    expect(cellIndex(grid, 5, 0)).toBeNull();
    expect(cellIndex(grid, 0, 4)).toBeNull();
    expect(cellIndex(grid, -1, 0)).toBeNull();
  });
});

describe("pincel", () => {
  const flat = createHeights(grid.width, grid.height);

  it("levanta uma celula so com tamanho 1", () => {
    const { heights, changed } = applyBrush(flat, grid, {
      x: 2,
      y: 1,
      size: 1,
      delta: 1,
    });
    expect(changed).toBe(1);
    expect(draw(heights)).toBe(
      ["0 0 0 0 0", "0 0 1 0 0", "0 0 0 0 0", "0 0 0 0 0"].join("\n"),
    );
  });

  it("levanta um quadrado 3 por 3", () => {
    const { heights, changed } = applyBrush(flat, grid, {
      x: 2,
      y: 1,
      size: 3,
      delta: 2,
    });
    expect(changed).toBe(9);
    expect(draw(heights)).toBe(
      ["0 2 2 2 0", "0 2 2 2 0", "0 2 2 2 0", "0 0 0 0 0"].join("\n"),
    );
  });

  it("recorta o pincel na borda em vez de estourar", () => {
    const { heights, changed } = applyBrush(flat, grid, {
      x: 0,
      y: 0,
      size: 3,
      delta: 1,
    });
    // So as quatro celulas dentro da grade sao afetadas.
    expect(changed).toBe(4);
    expect(draw(heights)).toBe(
      ["1 1 0 0 0", "1 1 0 0 0", "0 0 0 0 0", "0 0 0 0 0"].join("\n"),
    );
  });

  it("nao altera o array original", () => {
    const before = draw(flat);
    applyBrush(flat, grid, { x: 1, y: 1, size: 3, delta: 5 });
    expect(draw(flat)).toBe(before);
  });

  it("nao conta mudanca quando ja esta no limite", () => {
    const topped = createHeights(grid.width, grid.height, MAX_ELEVATION);
    const { changed } = applyBrush(topped, grid, {
      x: 2,
      y: 1,
      size: 1,
      delta: 1,
    });
    expect(changed).toBe(0);
  });

  it("recusa grade com tamanho errado", () => {
    expect(() => applyBrush([1, 2, 3], grid, { x: 0, y: 0, size: 1, delta: 1 }))
      .toThrow(/3 celulas.*5x4/);
  });
});

describe("nivelar", () => {
  it("achata o bloco na altura de referencia", () => {
    const bumpy = applyBrush(createHeights(grid.width, grid.height), grid, {
      x: 2,
      y: 1,
      size: 3,
      delta: 3,
    }).heights;

    const { heights, changed } = levelTo(bumpy, grid, { x: 2, y: 1, size: 3 }, 1);
    expect(changed).toBe(9);
    expect(draw(heights)).toBe(
      ["0 1 1 1 0", "0 1 1 1 0", "0 1 1 1 0", "0 0 0 0 0"].join("\n"),
    );
  });
});

describe("historico", () => {
  it("desfaz e refaz", () => {
    const history = new History([0, 0]);
    history.push([1, 0]);
    history.push([1, 1]);

    expect(history.current).toEqual([1, 1]);
    expect(history.undo()).toEqual([1, 0]);
    expect(history.undo()).toEqual([0, 0]);
    expect(history.canUndo).toBe(false);
    // Desfazer no fundo da pilha nao pode explodir nem inventar estado.
    expect(history.undo()).toEqual([0, 0]);

    expect(history.redo()).toEqual([1, 0]);
    expect(history.redo()).toEqual([1, 1]);
    expect(history.canRedo).toBe(false);
  });

  it("uma edicao nova descarta o refazer", () => {
    const history = new History([0]);
    history.push([1]);
    history.undo();
    history.push([2]);
    expect(history.canRedo).toBe(false);
    expect(history.current).toEqual([2]);
  });

  it("respeita o limite de passos guardados", () => {
    const history = new History(0, 3);
    for (let i = 1; i <= 10; i += 1) history.push(i);
    let steps = 0;
    while (history.canUndo) {
      history.undo();
      steps += 1;
    }
    expect(steps).toBe(3);
  });
});
