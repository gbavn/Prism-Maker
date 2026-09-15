import type { OpenedMap } from "../../project/loadProject.js";
import { assetUrl } from "../../shared/ipc.js";
import { SOON_LABEL } from "./Soon.jsx";

interface Props {
  map: OpenedMap | null;
  onSoon: (label: string) => void;
}

/**
 * The tile palette.
 *
 * It already shows the real tileset and autotiles of the open map. Picking a
 * tile does nothing yet, but showing the actual image costs one `img` tag,
 * because the prism-asset protocol already serves those files to the
 * viewport, and it is useful information right away.
 */
export function TilePanel({ map, onSoon }: Props) {
  const autotiles = (map?.graphics.autotiles ?? []).filter(
    (path): path is string => path !== null,
  );

  return (
    <aside className="flex min-h-0 w-56 shrink-0 flex-col overflow-hidden rounded-lg border border-edge bg-panel">
      <header className="flex items-center gap-2 px-3 py-2">
        <span className="text-[10.5px] font-semibold tracking-[0.12em] text-dim">
          TILES
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-dim/70">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400/90" />
          read only
        </span>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onClick={() => onSoon("Pick tile")}
        title={`Pick tile · ${SOON_LABEL}`}
      >
        {map === null ? (
          <p className="px-3 py-2 text-[11px] text-dim">no map open</p>
        ) : (
          <>
            {autotiles.length > 0 ? (
              <section className="px-2">
                <h3 className="px-1 pb-1.5 text-[10px] font-medium tracking-wide text-brand/80">
                  Autotiles
                </h3>
                <div className="flex flex-col gap-1 pb-3">
                  {autotiles.map((path) => (
                    <img
                      key={path}
                      src={assetUrl(path)}
                      alt=""
                      className="w-full rounded border border-edge bg-shell [image-rendering:pixelated]"
                    />
                  ))}
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
                  className="w-full rounded border border-edge [image-rendering:pixelated]"
                />
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
