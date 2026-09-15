import { MapPin, Users } from "lucide-react";
import type { EventSummary, OpenedMap } from "../../project/loadProject.js";
import { Soon } from "./Soon.jsx";

interface Props {
  map: OpenedMap | null;
  selected: number | null;
  onSelect: (id: number) => void;
  onSoon: (label: string) => void;
}

/** What starts the event, straight from the XP trigger codes. */
const TRIGGERS = [
  "Action button",
  "Player touch",
  "Event touch",
  "Autorun",
  "Parallel process",
] as const;

/** How the event moves, from the XP move type codes. */
const MOVEMENT = ["Fixed", "Random", "Approach", "Custom"] as const;

function label(list: readonly string[], value: number): string {
  return list[value] ?? `unknown (${value})`;
}

/** The flags of a page, listed only when they are on. */
function flagsOf(page: EventSummary["pages"][number]): string[] {
  const flags: string[] = [];
  if (page.walkAnime) flags.push("walk anim");
  if (page.stepAnime) flags.push("step anim");
  if (page.directionFix) flags.push("direction fix");
  if (page.through) flags.push("through");
  if (page.alwaysOnTop) flags.push("always on top");
  return flags;
}

/**
 * The event list and what a selected event is made of.
 *
 * Read only for now, and it says so: nothing here writes to the .rxdata yet.
 * Showing the real page beats showing an empty shell, because it makes plain
 * which parts the editor already understands.
 */
export function EventPanel({ map, selected, onSelect, onSoon }: Props) {
  const events = map?.events ?? [];
  const current = events.find((event) => event.id === selected) ?? null;
  const page = current?.pages[0] ?? null;

  return (
    <aside className="flex min-h-0 w-64 shrink-0 flex-col overflow-hidden rounded-lg border border-edge bg-panel">
      <header className="flex items-center gap-2 px-3 py-2">
        <span className="text-[10.5px] font-semibold tracking-[0.12em] text-dim">
          EVENTS
        </span>
        <span className="ml-auto font-mono text-[10px] text-brand/80">
          {events.length}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {map === null ? (
          <p className="px-1 py-2 text-[11px] text-dim">no map open</p>
        ) : events.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-dim">this map has no events</p>
        ) : (
          <ul className="flex flex-col gap-0.5 pb-2">
            {events.map((event) => {
              const chosen = event.id === selected;
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(event.id)}
                    aria-current={chosen}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                      chosen
                        ? "bg-brand/15 text-brand"
                        : "text-body/85 hover:bg-raised"
                    }`}
                  >
                    <Users className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                    <span className="min-w-0 flex-1 truncate text-[11.5px]">
                      {event.name === "" ? `Event ${event.id}` : event.name}
                    </span>
                    <span className="font-mono text-[10px] text-dim">
                      {event.x},{event.y}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {current !== null && page !== null ? (
        <section className="border-t border-edge px-3 py-2">
          <h3 className="flex items-center gap-1.5 pb-1.5 text-[10px] font-medium tracking-wide text-brand/80">
            <MapPin className="h-3 w-3" strokeWidth={2} />
            Page 1 of {current.pages.length}
          </h3>

          <dl className="flex flex-col gap-1 font-mono text-[10.5px] text-dim">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0">graphic</dt>
              <dd className="min-w-0 truncate text-body/85">
                {page.characterName !== ""
                  ? page.characterName
                  : page.tileId > 0
                    ? `tile #${page.tileId}`
                    : "none"}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0">trigger</dt>
              <dd className="min-w-0 truncate text-body/85">
                {label(TRIGGERS, page.trigger)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0">movement</dt>
              <dd className="min-w-0 truncate text-body/85">
                {label(MOVEMENT, page.moveType)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0">commands</dt>
              <dd className="text-body/85">{page.commands}</dd>
            </div>
            {flagsOf(page).length > 0 ? (
              <div className="flex gap-2">
                <dt className="w-20 shrink-0">flags</dt>
                <dd className="min-w-0 text-body/85">{flagsOf(page).join(", ")}</dd>
              </div>
            ) : null}
          </dl>

          <Soon
            label="Edit event"
            onSoon={onSoon}
            dot={false}
            className="mt-2 w-full rounded-md border border-edge px-2 py-1.5 text-[11px]"
          >
            Edit event
            <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400/90 align-middle" />
          </Soon>
        </section>
      ) : null}
    </aside>
  );
}
