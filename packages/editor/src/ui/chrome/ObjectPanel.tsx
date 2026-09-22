import { Boxes, RotateCw, Trash2 } from "lucide-react";
import type { PlacedObject } from "../../scene/buildScene.js";
import type { ModelEntry } from "../../shared/ipc.js";

/**
 * O painel do modo Objects.
 *
 * Em cima o catalogo, embaixo o que esta no mapa. Os dois na mesma coluna
 * porque colocar e conferir sao a mesma tarefa: escolhe o modelo, clica no
 * mapa, olha a lista para ver se foi parar onde devia.
 *
 * O catalogo vem agrupado por categoria, que e a subpasta em Prism/Models. A
 * subpasta e o unico metadado que existe, e chega: ela separa predio de poste
 * sem o projeto precisar de arquivo de indice nenhum.
 */

interface Props {
  models: readonly ModelEntry[];
  chosen: string | null;
  onChoose: (path: string) => void;
  objects: readonly PlacedObject[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  onRemove: (index: number) => void;
  onTurn: (index: number, yaw: number) => void;
}

const card = "rounded-xl bg-panel/80 p-2 ring-1 ring-white/5";

export function ObjectPanel({
  models,
  chosen,
  onChoose,
  objects,
  selected,
  onSelect,
  onRemove,
  onTurn,
}: Props) {
  const byCategory = new Map<string, ModelEntry[]>();
  for (const model of models) {
    const list = byCategory.get(model.category) ?? [];
    list.push(model);
    byCategory.set(model.category, list);
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-2 overflow-y-auto">
      <div className={card}>
        <h2 className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-muted">
          Models
        </h2>

        {models.length === 0 ? (
          <p className="px-1 py-2 text-xs leading-relaxed text-muted">
            No models yet. Drop .obj files into{" "}
            <code className="text-body">Prism/Models/</code>, in a subfolder
            such as <code className="text-body">buildings</code>.
          </p>
        ) : (
          [...byCategory].map(([category, list]) => (
            <div key={category} className="mb-1">
              <h3 className="px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted/70">
                {category === "" ? "loose" : category}
              </h3>
              {list.map((model) => (
                <button
                  key={model.path}
                  type="button"
                  onClick={() => onChoose(model.path)}
                  aria-current={model.path === chosen}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs ${
                    model.path === chosen
                      ? "bg-brand/20 text-brand"
                      : "text-body hover:bg-white/5"
                  }`}
                >
                  <Boxes className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  <span className="truncate">{model.name}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>

      <div className={card}>
        <h2 className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-muted">
          On this map ({objects.length})
        </h2>

        {objects.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted">Nothing placed.</p>
        ) : (
          objects.map((object, index) => (
            <div
              key={`${object.name}-${index}`}
              className={`group flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${
                index === selected
                  ? "bg-brand/20 text-brand"
                  : "text-body hover:bg-white/5"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(index === selected ? null : index)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="truncate">{object.name}</span>
                <span className="ml-1 text-muted">
                  {object.x},{object.y}
                  {object.yaw ? ` · ${object.yaw}°` : ""}
                </span>
              </button>
              {object.model === undefined ? null : (
                <button
                  type="button"
                  onClick={() => onTurn(index, ((object.yaw ?? 0) + 90) % 360)}
                  title={`Turn (${object.yaw ?? 0}°)`}
                  className="shrink-0 rounded p-0.5 text-muted opacity-0 hover:text-body group-hover:opacity-100"
                >
                  <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(index)}
                title="Remove"
                className="shrink-0 rounded p-0.5 text-muted opacity-0 hover:text-body group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
