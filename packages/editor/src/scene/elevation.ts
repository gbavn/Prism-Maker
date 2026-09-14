/**
 * Edicao de elevacao.
 *
 * Toda a regra vive aqui, pura e sem Babylon, pelo mesmo motivo de buildScene:
 * o relevo e dado de jogo, nao enfeite do editor. O runtime vai precisar
 * interpretar as mesmas alturas, e ter a regra isolada torna a comparacao
 * possivel.
 */

/**
 * Limites de altura.
 *
 * Nao existe limite tecnico, mas existe um limite de bom senso: um penhasco
 * de trinta degraus nao e HGSS, e um numero solto por engano numa celula
 * quebraria o enquadramento da camera. Os valores sao generosos e existem
 * para pegar acidente, nao para restringir desenho.
 */
export const MIN_ELEVATION = -8;
export const MAX_ELEVATION = 24;

export function clampElevation(value: number): number {
  return Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, Math.round(value)));
}

export function createHeights(
  width: number,
  height: number,
  level = 0,
): number[] {
  return new Array<number>(width * height).fill(clampElevation(level));
}

export interface Grid {
  width: number;
  height: number;
}

/** Indice de uma celula no array de alturas, ou null se estiver fora. */
export function cellIndex(grid: Grid, x: number, y: number): number | null {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return null;
  return y * grid.width + x;
}

export interface BrushOptions {
  /** Centro do pincel, em celulas. */
  x: number;
  y: number;
  /**
   * Tamanho do lado do pincel, em celulas. 1 pinta uma celula, 3 pinta um
   * quadrado de 3 por 3 centrado no ponto.
   */
  size: number;
  /** Quantos degraus somar. Negativo abaixa. */
  delta: number;
}

export interface BrushResult {
  heights: number[];
  /** Quantas celulas realmente mudaram. Zero significa que nada foi feito. */
  changed: number;
}

/**
 * Aplica o pincel e devolve um array novo.
 *
 * Nao altera o original de proposito: o desfazer guarda as versoes anteriores,
 * e mutar no lugar faria o historico apontar todo para o mesmo array.
 */
export function applyBrush(
  heights: readonly number[],
  grid: Grid,
  brush: BrushOptions,
): BrushResult {
  if (heights.length !== grid.width * grid.height) {
    throw new Error(
      `a elevacao tem ${heights.length} celulas, mas a grade e ` +
        `${grid.width}x${grid.height}`,
    );
  }

  const next = [...heights];
  const reach = Math.floor(Math.max(1, brush.size) / 2);
  let changed = 0;

  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const index = cellIndex(grid, brush.x + dx, brush.y + dy);
      if (index === null) continue;

      const before = next[index] as number;
      const after = clampElevation(before + brush.delta);
      if (after !== before) {
        next[index] = after;
        changed += 1;
      }
    }
  }

  return { heights: next, changed };
}

/**
 * Nivela um bloco na altura de uma celula de referencia.
 *
 * E a operacao que mais aparece na pratica: achatar um platô depois de
 * levantar uma borda a mais.
 */
export function levelTo(
  heights: readonly number[],
  grid: Grid,
  brush: Omit<BrushOptions, "delta">,
  target: number,
): BrushResult {
  const next = [...heights];
  const reach = Math.floor(Math.max(1, brush.size) / 2);
  const level = clampElevation(target);
  let changed = 0;

  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const index = cellIndex(grid, brush.x + dx, brush.y + dy);
      if (index === null) continue;
      if (next[index] !== level) {
        next[index] = level;
        changed += 1;
      }
    }
  }

  return { heights: next, changed };
}

/**
 * Historico de desfazer e refazer.
 *
 * Guarda estados inteiros, nao diferencas. Um mapa grande do Essentials tem
 * uns poucos milhares de celulas, entao cada passo custa alguns kilobytes; a
 * simplicidade compensa de longe, e evita a classe de bug em que desfazer
 * reconstroi o estado errado.
 */
export class History<T> {
  private readonly past: T[] = [];
  private readonly future: T[] = [];

  constructor(
    private state: T,
    private readonly limit = 100,
  ) {}

  get current(): T {
    return this.state;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  push(next: T): void {
    this.past.push(this.state);
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
    this.state = next;
  }

  undo(): T {
    const previous = this.past.pop();
    if (previous === undefined) return this.state;
    this.future.push(this.state);
    this.state = previous;
    return this.state;
  }

  redo(): T {
    const next = this.future.pop();
    if (next === undefined) return this.state;
    this.past.push(this.state);
    this.state = next;
    return this.state;
  }
}
