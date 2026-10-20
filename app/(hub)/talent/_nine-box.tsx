import { NINE_BOX_NAMES, type TalentRating } from "@/agent/lib/data";
import { cn } from "@/lib/utils";

// Classic 9-box: performance across, potential up, traffic-light colours from
// red (bottom left) to green (top right), each box with its suggested action.

const PERFORMANCE = ["Needs development", "Meets expectations", "Exceeds expectations"];
const POTENTIAL = ["Limited", "Growth", "High"];

/** Suggested action, indexed [potential - 1][performance - 1]. */
const ACTION = [
  ["Performance plan or move on", "Improve in current role", "Recognise and retain"],
  ["Improve in current role", "Develop in current role", "Broaden scope"],
  ["Coach in role or reassign", "Stretch assignments", "Promote and retain"],
];

/** Box colour, indexed the same way. */
const COLOUR = [
  ["from-rose-100 to-rose-200 text-rose-950", "from-orange-100 to-orange-200 text-orange-950", "from-amber-50 to-amber-100 text-amber-950"],
  ["from-orange-100 to-orange-200 text-orange-950", "from-amber-50 to-amber-100 text-amber-950", "from-lime-100 to-green-200 text-green-950"],
  ["from-amber-50 to-amber-100 text-amber-950", "from-lime-50 to-lime-100 text-lime-950", "from-lime-100 to-green-200 text-green-950"],
];

function Box({ potential, performance, people }: { readonly potential: number; readonly performance: number; readonly people: readonly TalentRating[] }) {
  return (
    <div className={cn("flex min-h-36 flex-col rounded-lg bg-gradient-to-br p-3 shadow-sm", COLOUR[potential - 1][performance - 1])}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-sm">{NINE_BOX_NAMES[potential - 1][performance - 1]}</span>
        <span className="font-semibold text-sm tabular-nums opacity-80">{people.length}</span>
      </div>
      <span className="text-xs opacity-80">{ACTION[potential - 1][performance - 1]}</span>
      <div className="flex flex-wrap gap-1.5 pt-3">
        {people.map((r) => (
          <span
            className="rounded-full bg-white px-2 py-0.5 font-medium text-slate-800 text-xs shadow-sm"
            key={r.person_id}
            title={r.note ? `${r.note} (updated ${r.updated_at})` : undefined}
          >
            {r.person_name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The 9-box. Hover a name for the note behind the placement. */
export function NineBox({ ratings, unrated }: { readonly ratings: readonly TalentRating[]; readonly unrated: readonly string[] }) {
  return (
    // On a phone the grid keeps a readable minimum width and scrolls sideways,
    // rather than squeezing names into boxes a few letters wide.
    <div className="space-y-2 overflow-x-auto">
      <div className="grid min-w-[34rem] grid-cols-[1.5rem_1fr_1fr_1fr_4.5rem] gap-x-2 gap-y-2">
        {/* Column headings */}
        <div />
        {PERFORMANCE.map((label) => (
          <div className="text-center font-medium text-muted-foreground text-xs" key={label}>
            {label}
          </div>
        ))}
        <div />

        {/* Potential axis, drawn down the left beside the three rows */}
        <div className="flex flex-col items-center justify-between py-1 text-muted-foreground" style={{ gridColumn: 1, gridRow: "2 / span 3" }}>
          <span className="text-[10px]">▲</span>
          <span className="-rotate-180 font-medium text-[11px] uppercase tracking-[0.3em] [writing-mode:vertical-rl]">Potential</span>
          <span className="text-[10px]">▼</span>
        </div>

        {/* The boxes, with a dashed zone around the top-right four */}
        <div className="relative grid grid-cols-3 gap-2" style={{ gridColumn: "2 / span 3", gridRow: "2 / span 3" }}>
          {[3, 2, 1].flatMap((potential) =>
            [1, 2, 3].map((performance) => (
              <Box
                key={`${potential}-${performance}`}
                people={ratings.filter((r) => r.potential === potential && r.performance === performance)}
                performance={performance}
                potential={potential}
              />
            )),
          )}
          <div className="pointer-events-none absolute top-0 right-0 bottom-[calc(33.333%+0.33rem)] left-[calc(33.333%+0.33rem)] rounded-xl border-2 border-green-600/40 border-dashed">
            <span className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 whitespace-nowrap rounded-md bg-white/90 px-3 py-1.5 font-semibold text-slate-700 text-xs shadow-md backdrop-blur">
              Prepare for future role
            </span>
          </div>
        </div>

        {/* Row labels on the right */}
        {[...POTENTIAL].reverse().map((label, i) => (
          <div className="flex items-center font-medium text-muted-foreground text-xs" key={label} style={{ gridColumn: 5, gridRow: i + 2 }}>
            {label}
          </div>
        ))}

        {/* Performance axis */}
        <div style={{ gridColumn: 1, gridRow: 5 }} className="text-muted-foreground text-xs">
          low
        </div>
        <div className="flex items-center gap-2 text-muted-foreground" style={{ gridColumn: "2 / span 3", gridRow: 5 }}>
          <span className="text-[10px]">◀</span>
          <span className="h-px flex-1 bg-border" />
          <span className="font-medium text-[11px] uppercase tracking-[0.3em]">Performance</span>
          <span className="h-px flex-1 bg-border" />
          <span className="text-[10px]">▶</span>
        </div>
        <div className="text-muted-foreground text-xs" style={{ gridColumn: 5, gridRow: 5 }}>
          high
        </div>
      </div>
      {unrated.length > 0 ? <p className="pl-8 text-muted-foreground text-xs">Not placed yet: {unrated.join(", ")}</p> : null}
    </div>
  );
}
