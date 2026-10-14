import { NINE_BOX_LEVELS, NINE_BOX_NAMES, type TalentRating } from "@/agent/lib/data";
import { cn } from "@/lib/utils";

// Tint by how far up and to the right a box sits (performance + potential):
// greens top right, amber on the middle diagonal, warmer towards bottom left.
const TINT: Record<number, string> = {
  2: "bg-rose-50 border-rose-200",
  3: "bg-orange-50 border-orange-200",
  4: "bg-amber-50 border-amber-200",
  5: "bg-emerald-50 border-emerald-200",
  6: "bg-emerald-100 border-emerald-300",
};

/** The 9-box: performance across, potential up. Names sit in their box; hover for the note. */
export function NineBox({ ratings, unrated }: { readonly ratings: readonly TalentRating[]; readonly unrated: readonly string[] }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <div className="flex w-5 items-center justify-center">
          <span className="-rotate-90 whitespace-nowrap font-medium text-muted-foreground text-xs">Potential →</span>
        </div>
        <div className="grid flex-1 grid-cols-[auto_1fr_1fr_1fr] gap-2">
          {[3, 2, 1].map((potential) => (
            <Row key={potential} potential={potential} ratings={ratings} />
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

function Row({ potential, ratings }: { readonly potential: number; readonly ratings: readonly TalentRating[] }) {
  return (
    <>
      <div className="flex items-center text-muted-foreground text-xs">{NINE_BOX_LEVELS[potential - 1]}</div>
      {[1, 2, 3].map((performance) => {
        const people = ratings.filter((r) => r.potential === potential && r.performance === performance);
        return (
          <div className={cn("min-h-24 rounded-xl border p-3", TINT[potential + performance])} key={performance}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-xs">{NINE_BOX_NAMES[potential - 1][performance - 1]}</span>
              <span className="text-muted-foreground text-xs tabular-nums">{people.length}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {people.map((r) => (
                <span className="rounded-full border bg-white px-2 py-0.5 text-xs" key={r.person_id} title={r.note ? `${r.note} (updated ${r.updated_at})` : undefined}>
                  {r.person_name}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
