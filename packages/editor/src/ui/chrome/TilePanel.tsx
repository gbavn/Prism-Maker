import type { OpenedMap } from "../../project/loadProject.js";
import { assetUrl } from "../../shared/ipc.js";
import { SOON_LABEL } from "./Soon.jsx";

interface Props {
  map: OpenedMap | null;
  onSoon: (label: string) => void;
}

/**
 * Painel de tiles.
 *
 * Mostra o tileset e os autotiles reais do mapa aberto. Selecionar ainda não
 * faz nada, mas exibir a imagem de verdade já é informação útil, e não custa
 * mais que um `img`: o protocolo prism-asset já serve esses arquivos para a
 * viewport.
 */
export function TilePanel({ map, onSoon }: Props) {
  const autotiles = (map?.graphics.autotiles ?? []).filter(
    (path): path is string => path !== null,
  );

  return (
    <aside className="flex min-h-0 w-64 flex-col border-l border-line bg-ink-700">
      <header className="flex items-baseline gap-2 border-b border-line px-3 py-2">
        <span className="text-[11px] font-semibold tracking-widest text-muted">
          TILES
        </span>
        <span className="ml-auto rounded bg-ink-600 px-1.5 py-0.5 text-[10px] text-muted">
          somente leitura
        </span>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onClick={() => onSoon("Selecionar tile")}
        title={`Selecionar tile · ${SOON_LABEL}`}
      >
        {map === null ? (
          <p className="px-3 py-3 text-[11px] text-muted">nenhum mapa aberto</p>
        ) : (
          <>
            {autotiles.length > 0 ? (
              <section>
                <h3 className="px-3 py-1.5 text-[10.5px] font-medium tracking-wide text-accent">
                  Autotiles
                </h3>
                <div className="flex flex-wrap gap-1 px-2 pb-2">
                  {autotiles.map((path) => (
                    <img
                      key={path}
                      src={assetUrl(path)}
                      alt=""
                      className="h-8 border border-line bg-[#0c1016] [image-rendering:pixelated]"
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {map.graphics.tileset === null ? (
              <p className="px-3 py-3 text-[11px] text-muted">
                este tileset não tem imagem
              </p>
            ) : (
              <section>
                <h3 className="px-3 py-1.5 text-[10.5px] font-medium tracking-wide text-accent">
                  Tileset
                </h3>
                <img
                  src={assetUrl(map.graphics.tileset)}
                  alt=""
                  className="w-full [image-rendering:pixelated]"
                />
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
