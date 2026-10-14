import { NINE_BOX_LEVELS, NINE_BOX_NAMES, type TalentRating } from "@/agent/lib/data";
import { cn } from "@/lib/utils";

// Candidate looks while the team picks one (?box=soft|banded|mono|scale). Same
// grid: performance across, potential up, names in their box.
export const BOX_STYLES = ["soft", "banded", "mono", "scale"] as const;
export type BoxStyle = (typeof BOX_STYLES)[number];
export const isBoxStyle = (v: unknown): v is BoxStyle => typeof v === "string" && (BOX_STYLES as readonly string[]).includes(v);

// Box "score" = performance + potential, 2 (bottom left) to 6 (top right).
const SOFT: Record<number, string> = {
  2: "bg-rose-50 border-rose-200",
  3: "bg-orange-50 border-orange-200",
  4: "bg-amber-50 border-amber-200",
  5: "bg-emerald-50 border-emerald-200",
  6: "bg-emerald-100 border-emerald-300",
};
const BAND: Record<number, string> = { 2: "bg-rose-500", 3: "bg-orange-400", 4: "bg-amber-400", 5: "bg-emerald-500", 6: "bg-emerald-600" };
const SCALE: Record<number, string> = {
  2: "bg-slate-100 text-slate-700",
  3: "bg-indigo-100 text-indigo-950",
  4: "bg-indigo-200 text-indigo-950",
  5: "bg-indigo-400 text-white",
  6: "bg-indigo-600 text-white",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function Chip({ r, style }: { readonly r: TalentRating; readonly style: BoxStyle }) {
  const title = r.note ? `${r.note} (updated ${r.updated_at})` : undefined;
  if (style === "mono")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs" title={title}>
        <span className="flex size-6 items-center justify-center rounded-full bg-slate-800 font-semibold text-[10px] text-white">{initials(r.person_name)}</span>
        {r.person_name}
      </span>
    );
  if (style === "scale")
    return (
      <span className="block truncate text-xs opacity-90" title={title}>
        {r.person_name}
      </span>
    );
  return (
    <span className="rounded-full border bg-white px-2 py-0.5 text-slate-800 text-xs" title={title}>
      {r.person_name}
    </span>
  );
}

function Box({ style, potential, performance, people }: { readonly style: BoxStyle; readonly potential: number; readonly performance: number; readonly people: readonly TalentRating[] }) {
  const score = potential + performance;
  const name = NINE_BOX_NAMES[potential - 1][performance - 1];

  if (style === "banded")
    return (
      <div className="min-h-28 overflow-hidden rounded-xl border bg-card">
        <div className={cn("h-1.5", BAND[score])} />
        <div className="p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-xs">{name}</span>
            <span className="text-muted-foreground text-xs tabular-nums">{people.length}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {people.map((r) => (
              <Chip key={r.person_id} r={r} style={style} />
            ))}
          </div>
        </div>
      </div>
    );

  if (style === "mono")
    return (
      <div className={cn("min-h-28 rounded-xl border p-3", score === 6 ? "border-indigo-300 bg-indigo-50" : "bg-card")}>
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("text-[11px] uppercase tracking-wider", score === 6 ? "text-indigo-700" : "text-muted-foreground")}>{name}</span>
          <span className="text-muted-foreground text-xs tabular-nums">{people.length}</span>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          {people.map((r) => (
            <Chip key={r.person_id} r={r} style={style} />
          ))}
        </div>
      </div>
    );

  if (style === "scale")
    return (
      <div className={cn("flex min-h-32 flex-col rounded-lg p-3", SCALE[score])}>
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium text-xs">{name}</span>
          <span className="font-semibold text-2xl tabular-nums leading-none">{people.length}</span>
        </div>
        <div className="mt-auto space-y-0.5">
          {people.map((r) => (
            <Chip key={r.person_id} r={r} style={style} />
          ))}
        </div>
      </div>
    );

  return (
    <div className={cn("min-h-24 rounded-xl border p-3", SOFT[score])}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-xs">{name}</span>
        <span className="text-muted-foreground text-xs tabular-nums">{people.length}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {people.map((r) => (
          <Chip key={r.person_id} r={r} style={style} />
        ))}
      </div>
    </div>
  );
}

/** The 9-box: performance across, potential up. Hover a name for the note. */
export function NineBox({ ratings, unrated, style = "soft" }: { readonly ratings: readonly TalentRating[]; readonly unrated: readonly string[]; readonly style?: BoxStyle }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <div className="flex w-5 items-center justify-center">
          <span className="-rotate-90 whitespace-nowrap font-medium text-muted-foreground text-xs">Potential →</span>
        </div>
        <div className={cn("grid flex-1 grid-cols-[auto_1fr_1fr_1fr]", style === "scale" ? "gap-1" : "gap-2")}>
          {[3, 2, 1].map((potential) => (
            <div className="contents" key={potential}>
              <div className="flex items-center pr-1 text-muted-foreground text-xs">{NINE_BOX_LEVELS[potential - 1]}</div>
              {[1, 2, 3].map((performance) => (
                <Box
                  key={performance}
                  people={ratings.filter((r) => r.potential === potential && r.performance === performance)}
                  performance={performance}
                  potential={potential}
                  style={style}
                />
              ))}
            </div>
          ))}
          <div />
          {NINE_BOX_LEVELS.map((label) => (
            <div className="text-center text-muted-foreground text-xs" key={label}>
              {label}
            </div>
          ))}
        </div>
      </div>
      <div className="pl-8 text-center font-medium text-muted-foreground text-xs">Performance →</div>
      {unrated.length > 0 ? <p className="pl-8 text-muted-foreground text-xs">Not placed yet: {unrated.join(", ")}</p> : null}
    </div>
  );
}
