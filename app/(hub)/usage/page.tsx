import { createGateway } from "ai";
import Link from "next/link";
import { isManager } from "@/agent/lib/actor";
import { countPromotionCases, getMonthlyBudget, listPeople } from "@/agent/lib/data";
import { APP_TAG, fallbackFor, isModelId, MODEL_OPTIONS, type ModelId, modelLabel, primaryModel } from "@/agent/lib/models";
import type { SearchParams } from "@/lib/people-filter";
import { requireActor } from "@/lib/viewer";
import { ManagerOnly, PageHeader, Section, Stat, Table, Td } from "../_ui";
import { FEATURES, type FeatureId } from "@/lib/usage-features";
import { UsageFilters } from "./_filters";

// AI spend from AI Gateway Custom Reporting. Every model call this app makes is
// tagged with APP_TAG plus `feature:chat` or `feature:promotion-case`, and the
// signed-in person's id as `user` (agent/lib/models.ts). Reports are
// account-wide, hence the APP_TAG filter. New calls take a few minutes to show
// up. The Person, Model and Feature filters live in the URL and narrow every
// report on the page except the budget, which is always the whole app. Each
// report query is billed by Gateway. The subtitle has no dates so loading.tsx
// can show the same one in the prerendered shell; the dates stream in the
// section notes.

const DAYS = 30;
const MONTHS = 12;

// Gateway matches requests carrying ANY of the listed tags unless the report
// asks for tags_match=all (Custom Reporting docs). The AI SDK doesn't send that
// parameter yet, so this client adds it to report requests: with a feature
// filter on, a row must carry both our app tag and that feature tag.
const reporting = createGateway({
  fetch: (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname.endsWith("/v1/report")) url.searchParams.set("tags_match", "all");
    return fetch(url, init);
  },
});

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const usd = new Intl.NumberFormat("en-AU", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const usd0 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

type Filters = { person?: string; model?: ModelId; feature?: FeatureId };

function one(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value) || undefined;
}

/** Only values the page offers; anything else in the URL is ignored. */
function readFilters(params: Record<string, string | string[] | undefined>, personIds: ReadonlySet<string>): Filters {
  const person = one(params.person);
  const model = one(params.model);
  const feature = one(params.feature);
  return {
    person: person && personIds.has(person) ? person : undefined,
    model: model && isModelId(model) ? model : undefined,
    feature: FEATURES.find((f) => f.id === feature)?.id,
  };
}

/** Share of input served from the prompt cache. Gateway reports cached input separately from other input. */
function cachedShare(r: GatewaySpendReportRow): string {
  const cached = r.cachedInputTokens ?? 0;
  const all = cached + (r.inputTokens ?? 0);
  return all > 0 ? `${Math.round((cached / all) * 100)}%` : "–";
}

function share(cost: number, total: number): string {
  return total > 0 ? `${Math.round((cost / total) * 100)}%` : "–";
}

export default async function UsagePage({ searchParams }: { readonly searchParams: SearchParams }) {
  const { actor } = await requireActor();
  // Hidden from ICs in the nav; check again for a typed URL.
  if (!isManager(actor)) return <ManagerOnly />;

  const [people, params] = await Promise.all([listPeople(), searchParams]);
  const filters = readFilters(params, new Set([...people.map((p) => p.id), "app"]));
  const filtered = Boolean(filters.person || filters.model || filters.feature);

  const end = new Date();
  const start = new Date(end.getTime() - (DAYS - 1) * 86_400_000);
  // Rolling 12 months: the first of the month 11 months ago, up to today.
  const monthsStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (MONTHS - 1), 1));
  const monthStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  const scope = {
    tags: filters.feature ? [APP_TAG, `feature:${filters.feature}`] : [APP_TAG],
    userId: filters.person,
    model: filters.model,
  };
  const period = { startDate: ymd(start), endDate: ymd(end) };

  const [primary, budget, byPerson, byFeature, byModel, daily, wholeMonth, cases] = await Promise.all([
    primaryModel(),
    getMonthlyBudget(actor),
    spendReport({ ...period, ...scope, groupBy: "user" }),
    spendReport({ ...period, ...scope, groupBy: "tag" }),
    spendReport({ ...period, ...scope, groupBy: "model" }),
    spendReport({ startDate: ymd(monthsStart), endDate: ymd(end), ...scope, groupBy: "day" }),
    // The budget is for the whole app, so with a filter on it needs its own unfiltered query.
    filtered ? spendReport({ startDate: ymd(monthStart), endDate: ymd(end), tags: [APP_TAG], groupBy: "day" }) : null,
    countPromotionCases(actor, period.startDate, period.endDate, filters.person),
  ]);

  const names = new Map(people.map((p) => [p.id, p.name]));
  const label = (user: string | undefined) => (!user ? "Not attributed" : user === "app" ? "Friday digest (app)" : (names.get(user) ?? user));
  const rows = byPerson.ok ? [...byPerson.rows].sort((a, b) => b.totalCost - a.totalCost) : [];
  const total = rows.reduce((sum, r) => sum + r.totalCost, 0);

  const range = `${period.startDate} to ${period.endDate} UTC`;
  const filterNote = filtered
    ? [
        filters.person ? label(filters.person) : null,
        filters.model ? modelLabel(filters.model) : null,
        filters.feature ? FEATURES.find((f) => f.id === filters.feature)?.name : null,
      ]
        .filter(Boolean)
        .join(", ")
    : null;
  const note = filterNote ? `${range}. Filtered: ${filterNote}.` : `${range}, from AI Gateway reporting. New activity appears after a few minutes.`;

  // This month by day for the budget: from the unfiltered query when a filter is on, else from the daily rows.
  const monthSource = filtered ? wholeMonth : daily;
  const monthDays = spendByDay(monthSource, end);

  return (
    <>
      <PageHeader
        actions={<UsageFilters models={MODEL_OPTIONS.map((m) => ({ id: m.id, name: m.label }))} people={[...people.map((p) => ({ id: p.id, name: p.name })), { id: "app", name: "Friday digest (app)" }]} />}
        subtitle={`AI spend per person over the last ${DAYS} days.`}
        title="AI usage"
      />

      <Section note="Whole app, this month, UTC. Filters don't apply." title="This month against budget">
        <BudgetView budget={budget} days={monthDays} end={end} />
      </Section>

      <Section note={note} title="Spend by person">
        {!byPerson.ok ? (
          <ReportError error={byPerson.error} />
        ) : rows.length === 0 ? (
          <Empty />
        ) : (
          <Table head={["Person", "Model calls", "Input tokens", "Cached input tokens", "Cached share", "Output tokens", "Cost (USD)", "Share"]}>
            {rows.map((r) => (
              <tr key={r.user ?? "none"}>
                <Td className="whitespace-nowrap">{label(r.user)}</Td>
                <Td className="tabular-nums">{r.requestCount?.toLocaleString("en-AU") ?? "–"}</Td>
                <Td className="tabular-nums">{r.inputTokens?.toLocaleString("en-AU") ?? "–"}</Td>
                <Td className="tabular-nums">{r.cachedInputTokens?.toLocaleString("en-AU") ?? "–"}</Td>
                <Td className="tabular-nums">{cachedShare(r)}</Td>
                <Td className="tabular-nums">{r.outputTokens?.toLocaleString("en-AU") ?? "–"}</Td>
                <Td className="tabular-nums">{usd.format(r.totalCost)}</Td>
                <Td className="text-muted-foreground tabular-nums">{share(r.totalCost, total)}</Td>
              </tr>
            ))}
            <tr className="font-medium">
              <Td>Total</Td>
              <Td className="tabular-nums">{rows.reduce((s, r) => s + (r.requestCount ?? 0), 0).toLocaleString("en-AU")}</Td>
              <Td />
              <Td />
              <Td className="tabular-nums">{cachedShare({ totalCost: total, inputTokens: rows.reduce((s, r) => s + (r.inputTokens ?? 0), 0), cachedInputTokens: rows.reduce((s, r) => s + (r.cachedInputTokens ?? 0), 0) })}</Td>
              <Td />
              <Td className="tabular-nums">{usd.format(total)}</Td>
              <Td />
            </tr>
          </Table>
        )}
        <p className="text-muted-foreground text-xs">
          Chat spend is credited to whoever started the chat; promotion cases to the manager who asked for them. Calls made before per-person
          tagging was added show as Not attributed. Cached share is the part of the input served from the prompt cache, which is billed at a
          fraction of the normal input price.
        </p>
      </Section>

      <Section note={note} title="Spend by feature">
        {byFeature.ok ? <FeatureTable cases={cases} modelFiltered={Boolean(filters.model)} rows={byFeature.rows} /> : <ReportError error={byFeature.error} />}
      </Section>

      <Section note={note} title="Spend by model">
        {byModel.ok ? <ModelTable primary={primary} rows={byModel.rows} /> : <ReportError error={byModel.error} />}
      </Section>

      <Section note={filterNote ? `Filtered: ${filterNote}. Months are UTC.` : "Whole app, all people. Months are UTC."} title="Monthly spend, last 12 months">
        {daily.ok ? <MonthlyChart months={monthlyTotals(daily.rows, monthsStart, MONTHS)} /> : <ReportError error={daily.error} />}
      </Section>

      <p className="border-t pt-4 text-muted-foreground text-xs">
        What this reporting costs: AI Gateway charges US$0.075 per 1,000 model calls tagged with a person, and US$5 per 1,000 report queries.
        Each view of this page runs four queries, or five with a filter on.
      </p>
    </>
  );
}

function ReportError({ error }: { readonly error: string }) {
  return <p className="rounded-xl border border-dashed bg-card p-6 text-muted-foreground text-sm">Couldn&apos;t load the report from AI Gateway: {error}</p>;
}

function Empty() {
  return <p className="rounded-xl border border-dashed bg-card p-6 text-muted-foreground text-sm">No AI usage recorded for this app in the period yet.</p>;
}

const TREND_DAYS = 7;

/**
 * Spend per day of the current UTC month, day 1 to today. Days with no rows are 0.
 * Null when the report failed.
 */
function spendByDay(source: Report | null, end: Date): number[] | null {
  if (!source?.ok) return null;
  const key = ymd(end).slice(0, 7);
  const days = Array.from({ length: end.getUTCDate() }, () => 0);
  for (const r of source.rows) {
    if (!r.day?.startsWith(key)) continue;
    const i = Number(r.day.slice(8, 10)) - 1;
    if (i >= 0 && i < days.length) days[i] += r.totalCost;
  }
  return days;
}

type Burn = {
  day: number;
  daysInMonth: number;
  spent: number;
  /** Dollars per day the projection uses. */
  rate: number;
  /** How many full days the rate is averaged over (0 on the 1st, when only today is known). */
  rateDays: number;
  projected: number;
  /** Day of the month the budget runs out at the current rate, if that's before month end. */
  runOutDay: number | null;
};

/**
 * Burn-down maths. The rate is the average of the last 7 full days (today is
 * still running, so it's left out), or of every full day so far early in the
 * month. That follows the recent trend instead of the whole month's average.
 */
function burn(days: readonly number[], end: Date, budget: number | null): Burn {
  const day = days.length;
  const daysInMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  const spent = days.reduce((s, d) => s + d, 0);
  const full = days.slice(0, -1);
  const window = full.slice(-TREND_DAYS);
  const rate = window.length > 0 ? window.reduce((s, d) => s + d, 0) / window.length : spent;
  // Today counts as one more day at the trend rate, less what today has already spent.
  const daysLeft = daysInMonth - day + 1;
  const projected = spent - (days[day - 1] ?? 0) + rate * daysLeft;
  let runOutDay: number | null = null;
  if (budget && rate > 0) {
    if (spent >= budget) runOutDay = day;
    else {
      const left = budget - (spent - (days[day - 1] ?? 0));
      const when = day + Math.ceil(left / rate) - 1;
      runOutDay = when <= daysInMonth ? when : null;
    }
  }
  return { day, daysInMonth, spent, rate, rateDays: window.length, projected, runOutDay };
}

function monthDay(end: Date, d: number): string {
  return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), d)).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
}

function BudgetView({ budget, days, end }: { readonly budget: number | null; readonly days: readonly number[] | null; readonly end: Date }) {
  if (days === null) return <ReportError error="no data for this month" />;
  const b = burn(days, end, budget);
  const used = budget ? b.spent / budget : null;

  // One sentence answering "will it run out, or leave money on the table?"
  let verdict: { text: string; tone: "good" | "warn" | "bad" | "neutral" };
  if (!budget) verdict = { text: `On the recent trend the month ends at about ${usd0.format(b.projected)}. Set a budget in Settings to see the burn-down.`, tone: "neutral" };
  else if (b.spent >= budget) verdict = { text: `The budget is used up: ${usd0.format(b.spent - budget)} over so far.`, tone: "bad" };
  else if (b.runOutDay !== null)
    verdict = { text: `At the recent rate the budget runs out on ${monthDay(end, b.runOutDay)}, ${b.daysInMonth - b.runOutDay} days before the month ends.`, tone: "bad" };
  else {
    const left = budget - b.projected;
    const pct = Math.round((left / budget) * 100);
    verdict =
      pct >= 25
        ? { text: `On track to leave about ${usd0.format(left)} unused (${pct}% of the budget).`, tone: "warn" }
        : { text: `On track to finish within budget, with about ${usd0.format(left)} to spare.`, tone: "good" };
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={`Spent (day ${b.day} of ${b.daysInMonth})`} tone={budget && b.spent > budget ? "bad" : "neutral"} value={usd0.format(b.spent)} />
        <Stat label={`Recent rate (${b.rateDays || 1}-day average)`} value={`${usd0.format(b.rate)}/day`} />
        <Stat label="Projected for the month" tone={budget && b.projected > budget ? "warn" : "neutral"} value={usd0.format(b.projected)} />
        <Stat href="/settings#budget" label="Budget" value={budget ? usd0.format(budget) : "Not set"} />
      </div>
      <p
        className={`rounded-xl border bg-card p-4 font-medium text-sm ${verdict.tone === "bad" ? "text-red-600" : verdict.tone === "warn" ? "text-amber-600" : verdict.tone === "good" ? "text-emerald-600" : ""}`}
      >
        {verdict.text}
      </p>
      {budget && used !== null ? <BurnDown budget={budget} burn={b} days={days} end={end} /> : null}
      <p className="text-muted-foreground text-xs">
        The budget is a target for this page, set in <Link className="underline" href="/settings#budget">Settings</Link>; it doesn&apos;t stop any
        calls. A hard stop is an AI Gateway budget in the Vercel dashboard. The projection uses the average of the last {TREND_DAYS} full days, so
        a quiet week early in the month can understate it.
      </p>
    </div>
  );
}

const W = 600;
const H = 180;

/** Remaining budget by day: actual so far (solid), the even pace (grey dashes) and the projection (blue dashes). */
function BurnDown({ budget, days, burn: b, end }: { readonly budget: number; readonly days: readonly number[]; readonly burn: Burn; readonly end: Date }) {
  // x: start of day 1 (0) to end of the month (daysInMonth). y: remaining budget, floored at 0.
  const x = (d: number) => (d / b.daysInMonth) * W;
  const y = (remaining: number) => H - (Math.max(0, remaining) / budget) * H;

  let running = budget;
  const actual = [`${x(0)},${y(budget)}`];
  const points = days.map((spend, i) => {
    running -= spend;
    actual.push(`${x(i + 1)},${y(running)}`);
    return { day: i + 1, spend, remaining: running };
  });
  const startProjection = budget - (b.spent - (days[b.day - 1] ?? 0)); // remaining at the start of today
  const projectionEnd = b.runOutDay !== null ? { d: b.runOutDay, r: 0 } : { d: b.daysInMonth, r: budget - b.projected };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded bg-[#2a78d6] dark:bg-[#3987e5]" />
          Budget left
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-[#2a78d6] border-t-2 border-dashed dark:border-[#3987e5]" />
          Projection
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-muted-foreground/60 border-t-2 border-dashed" />
          Even pace
        </span>
      </div>
      <div className="relative" style={{ height: H }}>
        <svg aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" viewBox={`0 0 ${W} ${H}`}>
          <line className="stroke-border" vectorEffect="non-scaling-stroke" x1={0} x2={W} y1={H} y2={H} />
          <line className="stroke-muted-foreground/50" strokeDasharray="4 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" x1={x(0)} x2={x(b.daysInMonth)} y1={y(budget)} y2={y(0)} />
          <line
            className="stroke-[#2a78d6] dark:stroke-[#3987e5]"
            strokeDasharray="5 4"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            x1={x(b.day - 1)}
            x2={x(projectionEnd.d)}
            y1={y(startProjection)}
            y2={y(projectionEnd.r)}
          />
          <polyline
            className="stroke-[#2a78d6] dark:stroke-[#3987e5]"
            fill="none"
            points={actual.join(" ")}
            strokeLinejoin="round"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          {points.map((p) => (
            // Hover target is the whole day column, wider than the line.
            <rect fill="transparent" height={H} key={p.day} width={W / b.daysInMonth} x={x(p.day - 1)} y={0}>
              <title>{`${monthDay(end, p.day)}: spent ${usd.format(p.spend)}, ${usd0.format(Math.max(0, p.remaining))} left`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex justify-between text-muted-foreground text-xs">
        <span>{monthDay(end, 1)}</span>
        <span>
          {b.runOutDay !== null && b.runOutDay < b.daysInMonth ? `Runs out ${monthDay(end, b.runOutDay)}` : `${usd0.format(Math.max(0, budget - b.projected))} left at month end`}
        </span>
        <span>{monthDay(end, b.daysInMonth)}</span>
      </div>
      <table className="sr-only">
        <caption>Budget left by day this month, in USD</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <th scope="row">{monthDay(end, p.day)}</th>
              <td>{usd.format(p.spend)} spent</td>
              <td>{usd0.format(Math.max(0, p.remaining))} left</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeatureTable({ rows, cases, modelFiltered }: { readonly rows: readonly GatewaySpendReportRow[]; readonly cases: number; readonly modelFiltered: boolean }) {
  // Grouped by tag, every request also has a row for the app tag; keep the feature rows.
  const features = rows.filter((r) => r.tag?.startsWith("feature:")).sort((a, b) => b.totalCost - a.totalCost);
  if (features.length === 0) return <Empty />;
  const total = features.reduce((s, r) => s + r.totalCost, 0);
  return (
    <>
      <Table head={["Feature", "Model calls", "Cached share", "Cost (USD)", "Share", "Average"]}>
        {features.map((r) => {
          const id = r.tag?.slice("feature:".length);
          const known = FEATURES.find((f) => f.id === id);
          const average =
            id === "promotion-case"
              ? modelFiltered
                ? "Clear the model filter to see cost per case"
                : cases > 0
                  ? `${usd.format(r.totalCost / cases)} per case drafted (${cases})`
                  : "No cases drafted in the period"
              : r.requestCount
                ? `${usd.format(r.totalCost / r.requestCount)} per model call`
                : "–";
          return (
            <tr key={r.tag}>
              <Td className="whitespace-nowrap">{known?.name ?? r.tag}</Td>
              <Td className="tabular-nums">{r.requestCount?.toLocaleString("en-AU") ?? "–"}</Td>
              <Td className="tabular-nums">{cachedShare(r)}</Td>
              <Td className="tabular-nums">{usd.format(r.totalCost)}</Td>
              <Td className="text-muted-foreground tabular-nums">{share(r.totalCost, total)}</Td>
              <Td className="text-muted-foreground">{average}</Td>
            </tr>
          );
        })}
      </Table>
      <p className="text-muted-foreground text-xs">
        Chat includes the specialists and the Friday digest. Promotion cases counts only the drafting call inside the workflow; the chat turns
        around it are under Chat. Cases drafted come from the database for the same dates and person.
      </p>
    </>
  );
}

function ModelTable({ rows, primary }: { readonly rows: readonly GatewaySpendReportRow[]; readonly primary: ModelId }) {
  const models = [...rows].sort((a, b) => b.totalCost - a.totalCost);
  if (models.length === 0) return <Empty />;
  const total = models.reduce((s, r) => s + r.totalCost, 0);
  const fallback = fallbackFor(primary);
  const role = (model: string | undefined) => (model === primary ? "Selected in Settings" : model === fallback ? "Fallback" : "–");
  return (
    <>
      <Table head={["Model", "Role today", "Model calls", "Cached share", "Cost (USD)", "Share"]}>
        {models.map((r) => (
          <tr key={r.model ?? "none"}>
            <Td className="whitespace-nowrap">
              {r.model ? modelLabel(r.model) : "Unknown"}
              <span className="ml-2 font-mono text-muted-foreground text-xs">{r.model}</span>
            </Td>
            <Td className="text-muted-foreground">{role(r.model)}</Td>
            <Td className="tabular-nums">{r.requestCount?.toLocaleString("en-AU") ?? "–"}</Td>
            <Td className="tabular-nums">{cachedShare(r)}</Td>
            <Td className="tabular-nums">{usd.format(r.totalCost)}</Td>
            <Td className="text-muted-foreground tabular-nums">{share(r.totalCost, total)}</Td>
          </tr>
        ))}
      </Table>
      <p className="text-muted-foreground text-xs">
        Role is against today&apos;s setting ({modelLabel(primary)}, falling back to {modelLabel(fallback)}). Calls on the fallback mean Gateway
        retried on another provider because the selected one failed, unless the fallback was itself selected earlier in the period.
      </p>
    </>
  );
}

type GatewaySpendReportParams = Parameters<typeof reporting.getSpendReport>[0];
type GatewaySpendReportRow = Awaited<ReturnType<typeof reporting.getSpendReport>>["results"][number];
type Report = { ok: true; rows: GatewaySpendReportRow[] } | { ok: false; error: string };

function spendReport(params: GatewaySpendReportParams): Promise<Report> {
  return reporting
    .getSpendReport(params)
    .then((r): Report => ({ ok: true, rows: r.results }))
    .catch((error: unknown): Report => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
}

type Month = { key: string; label: string; cost: number };

/** Sums daily rows into calendar months, keeping months with no spend so the axis is continuous. */
function monthlyTotals(rows: readonly GatewaySpendReportRow[], from: Date, count: number): Month[] {
  const months: Month[] = Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1));
    return {
      key: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString("en-AU", { month: "short", year: "2-digit", timeZone: "UTC" }),
      cost: 0,
    };
  });
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const r of rows) {
    const month = r.day ? byKey.get(r.day.slice(0, 7)) : undefined;
    if (month) month.cost += r.totalCost;
  }
  return months;
}

const CHART_HEIGHT = 160; // px of bar area

function MonthlyChart({ months }: { readonly months: readonly Month[] }) {
  const max = Math.max(...months.map((m) => m.cost));
  if (max === 0) {
    return <p className="rounded-xl border border-dashed bg-card p-6 text-muted-foreground text-sm">No AI spend recorded for this app in the last 12 months.</p>;
  }
  const peak = months.findIndex((m) => m.cost === max);
  const last = months.length - 1;
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="relative border-b" style={{ height: CHART_HEIGHT + 24 }}>
        {/* One recessive gridline at the peak, labelled on the left. */}
        <div className="absolute inset-x-0 border-t border-dashed border-muted" style={{ bottom: CHART_HEIGHT }} />
        <div className="absolute inset-0 flex items-end">
          {months.map((m, i) => {
            const h = m.cost > 0 ? Math.max(2, (m.cost / max) * CHART_HEIGHT) : 0;
            const labelled = i === peak || i === last; // direct labels on the peak and the current month only
            return (
              <div className="group relative flex h-full flex-1 flex-col items-center justify-end" key={m.key} title={`${m.label}: ${usd.format(m.cost)}`}>
                {/* Hover target is the whole column, wider than the bar. */}
                <span
                  className={`pointer-events-none mb-1 whitespace-nowrap text-muted-foreground text-xs tabular-nums ${labelled ? "" : "opacity-0 group-hover:opacity-100"}`}
                >
                  {usd.format(m.cost)}
                </span>
                <div className="w-full max-w-6 rounded-t bg-[#2a78d6] transition-opacity group-hover:opacity-80 dark:bg-[#3987e5]" style={{ height: h }} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex">
        {months.map((m) => (
          <span className="flex-1 text-center text-muted-foreground text-xs" key={m.key}>
            {m.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Monthly AI spend in USD</caption>
        <tbody>
          {months.map((m) => (
            <tr key={m.key}>
              <th scope="row">{m.label}</th>
              <td>{usd.format(m.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
