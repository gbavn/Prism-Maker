import { useCallback, useRef, useState } from "react";
import type { OpenedMap } from "../../project/loadProject.js";
import { assetUrl } from "../../shared/ipc.js";
import {
  autotileTileId,
  singleStamp,
  tilesetTileId,
  type Stamp,
} from "../../scene/paint.js";
import { TILE_PIXELS } from "../../scene/tileAtlas.js";
import { autotileIndex, tileKind } from "@prism/scene-format";

interface Props {
  map: OpenedMap | null;
  stamp: Stamp;
  onSelect: (stamp: Stamp) => void;
}

/** The tile under the cursor, in tileset columns and rows. */
interface Cell {
  column: number;
  row: number;
}

/**
 * The tile palette.
 *
 * It shows the real tileset and autotiles of the open map, and picking maps a
 * click straight to a tile id. Dragging picks a block instead of a tile, which
 * is how a house front or a tree gets painted in one gesture rather than tile
 * by tile. The tileset image is served by the prism-asset protocol, the same
 * one the viewport uses, so no pixels travel over IPC.
 */
export function TilePanel({ map, stamp, onSelect }: Props) {
  const autotiles = (map?.graphics.autotiles ?? []).map((path, index) => ({
    path,
    index,
  }));

  // Medido quando a imagem carrega: converter o clique de volta para pixels da
  // fonte precisa do tamanho real do bitmap, que so existe depois disso.
  const [columns, setColumns] = useState(8);
  const [rows, setRows] = useState(0);
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [block, setBlock] = useState<{ from: Cell; to: Cell } | null>(null);
  const dragging = useRef(false);

  /** Da posicao do ponteiro sobre a imagem para coluna e linha do tileset. */
  const cellAt = useCallback(
    (event: React.PointerEvent<HTMLImageElement>): Cell => {
      const image = event.currentTarget;
      const scale = image.naturalWidth / image.clientWidth;
      const column = Math.floor((event.nativeEvent.offsetX * scale) / TILE_PIXELS);
      const row = Math.floor((event.nativeEvent.offsetY * scale) / TILE_PIXELS);
      return {
        column: Math.min(Math.max(column, 0), columns - 1),
        row: Math.max(row, 0),
      };
    },
    [columns],
  );

  /** Monta o carimbo a partir dos dois cantos escolhidos na paleta. */
  const emit = useCallback(
    (from: Cell, to: Cell) => {
      const left = Math.min(from.column, to.column);
      const right = Math.max(from.column, to.column);
      const top = Math.min(from.row, to.row);
      const bottom = Math.max(from.row, to.row);

      const tiles: number[] = [];
      for (let row = top; row <= bottom; row += 1) {
        for (let column = left; column <= right; column += 1) {
          tiles.push(tilesetTileId(column, row));
        }
      }
      onSelect({ width: right - left + 1, height: bottom - top + 1, tiles });
      setBlock({ from: { column: left, row: top }, to: { column: right, row: bottom } });
    },
    [onSelect],
  );

  const selectedAutotile =
    stamp.width === 1 && stamp.height === 1 && tileKind(stamp.tiles[0] ?? 0) === "autotile"
      ? autotileIndex(stamp.tiles[0] ?? 0)
      : null;

  const label =
    stamp.width === 1 && stamp.height === 1
      ? `#${stamp.tiles[0] ?? 0}`
      : `${stamp.width}×${stamp.height}`;

  // Em porcentagem, para o retangulo acompanhar a imagem em qualquer largura.
  const overlay =
    block === null || rows === 0
      ? null
      : {
          left: `${(block.from.column / columns) * 100}%`,
          top: `${(block.from.row / rows) * 100}%`,
          width: `${((block.to.column - block.from.column + 1) / columns) * 100}%`,
          height: `${((block.to.row - block.from.row + 1) / rows) * 100}%`,
        };

  return (
    <aside className="flex min-h-0 w-56 shrink-0 flex-col overflow-hidden rounded-lg border border-edge bg-panel">
      <header className="flex items-center gap-2 px-3 py-2">
        <span className="text-[10.5px] font-semibold tracking-[0.12em] text-dim">
          TILES
        </span>
        <span className="ml-auto font-mono text-[10px] text-brand/80">{label}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {map === null ? (
          <p className="px-3 py-2 text-[11px] text-dim">no map open</p>
        ) : (
          <>
            {autotiles.some((entry) => entry.path !== null) ? (
              <section className="px-2">
                <h3 className="px-1 pb-1.5 text-[10px] font-medium tracking-wide text-brand/80">
                  Autotiles
                </h3>
                <div className="flex flex-col gap-1 pb-3">
                  {autotiles.map(({ path, index }) =>
                    path === null ? null : (
                      <button
                        key={path}
                        type="button"
                        onClick={() => {
                          onSelect(singleStamp(autotileTileId(index)));
                          setBlock(null);
                        }}
                        className={`overflow-hidden rounded border transition-colors ${
                          selectedAutotile === index
                            ? "border-brand"
                            : "border-edge hover:border-dim"
                        }`}
                      >
                        <img
                          src={assetUrl(path)}
                          alt=""
                          className="w-full bg-shell [image-rendering:pixelated]"
                        />
                      </button>
                    ),
                  )}
                </div>
              </section>
            ) : null}

            {map.graphics.tileset === null ? (
              <p className="px-3 py-2 text-[11px] text-dim">
                this tileset has no image
              </p>
            ) : (
              <section className="px-2 pb-2">
                <h3 className="px-1 pb-1.5 text-[10px] font-medium tracking-wide text-brand/80">
                  Tileset
                </h3>
                <div className="relative">
                  <img
                    src={assetUrl(map.graphics.tileset)}
                    alt=""
                    onLoad={(event) => {
                      const image = event.currentTarget;
                      setColumns(Math.max(1, image.naturalWidth / TILE_PIXELS));
                      setRows(Math.max(1, image.naturalHeight / TILE_PIXELS));
                    }}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragging.current = true;
                      const cell = cellAt(event);
                      setAnchor(cell);
                      emit(cell, cell);
                    }}
                    onPointerMove={(event) => {
                      if (!dragging.current || anchor === null) return;
                      emit(anchor, cellAt(event));
                    }}
                    onPointerUp={(event) => {
                      dragging.current = false;
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                    className="w-full cursor-crosshair select-none rounded border border-edge [image-rendering:pixelated]"
                    draggable={false}
                  />
                  {overlay === null ? null : (
                    <span
                      aria-hidden
                      style={overlay}
                      className="pointer-events-none absolute rounded-sm border border-brand bg-brand/20"
                    />
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
