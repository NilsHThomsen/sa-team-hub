import type { TimeCategory, UtilisationWeek } from "@/agent/lib/data";
import { TIME_CATEGORIES, TIME_LABEL } from "@/agent/lib/data";
import { cn } from "@/lib/utils";

// Categorical slots 1-5 in fixed order, validated for adjacent pairs in light and dark.
// Leave is grey: it's time away, not a kind of work.
export const CATEGORY_COLOUR: Record<TimeCategory, string> = {
  deals: "bg-[#2a78d6] dark:bg-[#3987e5]",
  accounts: "bg-[#eb6834] dark:bg-[#d95926]",
  events: "bg-[#1baf7a] dark:bg-[#199e70]",
  enablement: "bg-[#eda100] dark:bg-[#c98500]",
  internal: "bg-[#e87ba4] dark:bg-[#d55181]",
  leave: "bg-muted-foreground/30",
};

/** Hours by category as one stacked bar, with a 2px gap between segments and a title on each. */
export function TimeSplitBar({ split, className }: { readonly split: Record<TimeCategory, number>; readonly className?: string }) {
  const total = TIME_CATEGORIES.reduce((n, c) => n + split[c], 0);
  if (total === 0) return null;
  return (
    <div aria-label={TIME_CATEGORIES.map((c) => `${TIME_LABEL[c]} ${Math.round((100 * split[c]) / total)}%`).join(", ")} className={cn("flex h-3 w-40 gap-0.5", className)} role="img">
      {TIME_CATEGORIES.filter((c) => split[c] > 0).map((c) => (
        <div
          className={cn("h-full first:rounded-l last:rounded-r", CATEGORY_COLOUR[c])}
          key={c}
          style={{ width: `${(100 * split[c]) / total}%` }}
          title={`${TIME_LABEL[c]}: ${split[c]} h (${Math.round((100 * split[c]) / total)}%)`}
        />
      ))}
    </div>
  );
}

export function CategoryKey() {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {TIME_CATEGORIES.map((c) => (
        <span className="inline-flex items-center gap-1.5" key={c}>
          <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", CATEGORY_COLOUR[c])} />
          {TIME_LABEL[c]}
        </span>
      ))}
    </span>
  );
}

/** Customer-facing % as a bar out of 100, with a tick at the person's target. The number is printed beside it. */
export function UtilisationBar({ value, target }: { readonly value: number | null; readonly target: number }) {
  if (value === null) return <span className="text-muted-foreground text-xs">On leave</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-block h-2 w-24 rounded bg-muted" title={`${value}% customer-facing, target ${target}%`}>
        <span className="absolute inset-y-0 left-0 rounded bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${Math.min(100, value)}%` }} />
        <span className="absolute -inset-y-1 w-0.5 rounded bg-foreground" style={{ left: `${target}%` }} />
      </span>
      <span className="font-medium tabular-nums">{value}%</span>
    </span>
  );
}

/** Weekly customer-facing % with a dashed line at the target. Weeks on leave leave a gap. */
export function WeeklySparkline({ weeks, target }: { readonly weeks: readonly UtilisationWeek[]; readonly target: number }) {
  const w = 104;
  const h = 28;
  const n = weeks.length;
  const x = (i: number) => 3 + (i * (w - 6)) / Math.max(1, n - 1);
  const y = (v: number) => h - 3 - (v / 100) * (h - 6);
  // Split the line at leave weeks rather than drawing through them.
  const runs: string[][] = [[]];
  weeks.forEach((wk, i) => {
    if (wk.utilisation === null) runs.push([]);
    else runs[runs.length - 1].push(`${x(i)},${y(wk.utilisation)}`);
  });
  const lastIndex = weeks.findLastIndex((wk) => wk.utilisation !== null);
  return (
    <svg aria-label={`Customer-facing % by week, oldest first: ${weeks.map((wk) => wk.utilisation ?? "leave").join(", ")}`} className="text-foreground" height={h} role="img" width={w}>
      <line className="text-muted-foreground" stroke="currentColor" strokeDasharray="2 3" strokeOpacity={0.6} x1={0} x2={w} y1={y(target)} y2={y(target)} />
      {runs
        .filter((r) => r.length > 0)
        .map((r) => (
          <polyline fill="none" key={r[0]} points={r.join(" ")} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        ))}
      {lastIndex >= 0 ? <circle cx={x(lastIndex)} cy={y(weeks[lastIndex].utilisation ?? 0)} fill="currentColor" r={3} /> : null}
      {weeks.map((wk, i) => (
        <rect fill="transparent" height={h} key={wk.week_of} width={w / n} x={x(i) - w / n / 2} y={0}>
          <title>{`Week of ${wk.week_of}: ${wk.utilisation === null ? "on leave" : `${wk.utilisation}% customer-facing`}`}</title>
        </rect>
      ))}
    </svg>
  );
}
