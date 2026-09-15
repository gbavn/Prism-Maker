import { useCallback } from "react";
import type { OpenedMap } from "../../project/loadProject.js";
import { assetUrl } from "../../shared/ipc.js";
import { autotileTileId, tilesetTileId } from "../../scene/paint.js";
import { TILE_PIXELS } from "../../scene/tileAtlas.js";
import { autotileIndex, tileKind } from "@prism/scene-format";

interface Props {
  map: OpenedMap | null;
  selected: number;
  onSelect: (tileId: number) => void;
}

/**
 * The tile palette.
 *
 * It shows the real tileset and autotiles of the open map, and picking maps a
 * click straight to a tile id. The tileset image is served by the prism-asset
 * protocol, the same one the viewport uses, so no pixels travel over IPC.
 */
export function TilePanel({ map, selected, onSelect }: Props) {
  const autotiles = (map?.graphics.autotiles ?? []).map((path, index) => ({
    path,
    index,
  }));

  /**
   * From a click on the tileset image to a tile id.
   *
   * The image is scaled to the panel width, so the click has to be converted
   * back to source pixels before it means anything.
   */
  const pickFromTileset = useCallback(
    (event: React.MouseEvent<HTMLImageElement>) => {
      const image = event.currentTarget;
      const scale = image.naturalWidth / image.clientWidth;
      const x = Math.floor((event.nativeEvent.offsetX * scale) / TILE_PIXELS);
      const y = Math.floor((event.nativeEvent.offsetY * scale) / TILE_PIXELS);
      onSelect(tilesetTileId(x, y));
    },
    [onSelect],
  );

  const selectedAutotile =
    tileKind(selected) === "autotile" ? autotileIndex(selected) : null;

  return (
    <aside className="flex min-h-0 w-56 shrink-0 flex-col overflow-hidden rounded-lg border border-edge bg-panel">
      <header className="flex items-center gap-2 px-3 py-2">
        <span className="text-[10.5px] font-semibold tracking-[0.12em] text-dim">
          TILES
        </span>
        <span className="ml-auto font-mono text-[10px] text-brand/80">
          #{selected}
        </span>
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
                        onClick={() => onSelect(autotileTileId(index))}
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
                <img
                  src={assetUrl(map.graphics.tileset)}
                  alt=""
                  onClick={pickFromTileset}
                  className="w-full cursor-crosshair rounded border border-edge [image-rendering:pixelated]"
                />
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
