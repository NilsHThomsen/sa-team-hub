import type { AdoptionStatus } from "@/agent/lib/data";
import { cn } from "@/lib/utils";

const MONTHS = 6;

/**
 * Six months of usage as a % of commit, with a dashed line at 100%. Each point has a
 * hover title on a target larger than the line; the latest value is printed beside the line, so it never relies on colour.
 */
export function UsageSparkline({ values }: { readonly values: readonly number[] }) {
  const w = 96;
  const h = 28;
  const max = Math.max(110, ...values);
  const x = (i: number) => 3 + (i * (w - 6)) / (MONTHS - 1);
  const y = (v: number) => h - 3 - (v / max) * (h - 6);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const last = values.at(-1) ?? 0;
  return (
    <span className="inline-flex items-center gap-2">
      <svg aria-label={`Usage over ${MONTHS} months, % of commit: ${values.join(", ")}`} className="text-foreground" height={h} role="img" width={w}>
        <line className="text-muted-foreground" stroke="currentColor" strokeDasharray="2 3" strokeOpacity={0.6} x1={0} x2={w} y1={y(100)} y2={y(100)} />
        <polyline fill="none" points={points} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        <circle cx={x(values.length - 1)} cy={y(last)} fill="currentColor" r={3} />
        {values.map((v, i) => (
          <circle cx={x(i)} cy={y(v)} fill="transparent" key={`m${MONTHS - 1 - i}`} r={7}>
            <title>{`${MONTHS - 1 - i === 0 ? "This month" : `${MONTHS - 1 - i} month${MONTHS - 1 - i === 1 ? "" : "s"} ago`}: ${v}% of commit`}</title>
          </circle>
        ))}
      </svg>
      <span className="tabular-nums text-xs">{last}%</span>
    </span>
  );
}

const STATUS: Record<AdoptionStatus, { mark: string; label: string; className: string }> = {
  using: { mark: "●", label: "Using", className: "text-foreground" },
  piloting: { mark: "◐", label: "Piloting", className: "text-amber-700" },
  not_using: { mark: "○", label: "Not using", className: "text-muted-foreground/60" },
};

/** One cell of the adoption grid: a shape plus a title, so status isn't colour alone. */
export function AdoptionMark({ status }: { readonly status: AdoptionStatus }) {
  const s = STATUS[status];
  return (
    <span className={cn("text-base leading-none", s.className)} title={s.label}>
      {s.mark}
      <span className="sr-only">{s.label}</span>
    </span>
  );
}

export function AdoptionKey() {
  return (
    <span className="flex gap-3">
      {(Object.keys(STATUS) as AdoptionStatus[]).map((k) => (
        <span className="inline-flex items-center gap-1" key={k}>
          <AdoptionMark status={k} /> {STATUS[k].label}
        </span>
      ))}
    </span>
  );
}
