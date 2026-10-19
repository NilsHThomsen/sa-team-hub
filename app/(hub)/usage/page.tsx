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

  // Month to date for the budget: from the unfiltered query when a filter is on, else from the daily rows.
  const monthKey = ymd(monthStart).slice(0, 7);
  const monthSource = filtered ? wholeMonth : daily;
  const monthToDate = monthSource?.ok ? monthSource.rows.filter((r) => r.day?.startsWith(monthKey)).reduce((s, r) => s + r.totalCost, 0) : null;

  return (
    <>
      <PageHeader
        actions={<UsageFilters models={MODEL_OPTIONS.map((m) => ({ id: m.id, name: m.label }))} people={[...people.map((p) => ({ id: p.id, name: p.name })), { id: "app", name: "Friday digest (app)" }]} />}
        subtitle={`AI spend per person over the last ${DAYS} days.`}
        title="AI usage"
      />

      <Section note="Whole app, this month, UTC. Filters don't apply." title="This month against budget">
        <BudgetView budget={budget} end={end} monthToDate={monthToDate} />
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

function BudgetView({ budget, monthToDate, end }: { readonly budget: number | null; readonly monthToDate: number | null; readonly end: Date }) {
  if (monthToDate === null) return <ReportError error="no data for this month" />;
  const day = end.getUTCDate();
  const daysInMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  // Straight line: spend so far, divided by days so far, times days in the month.
  const forecast = (monthToDate / day) * daysInMonth;
  const used = budget ? monthToDate / budget : null;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={`So far (day ${day} of ${daysInMonth})`} tone={budget && monthToDate > budget ? "bad" : "neutral"} value={usd0.format(monthToDate)} />
        <Stat label="Forecast for the month" tone={budget && forecast > budget ? "warn" : "neutral"} value={usd0.format(forecast)} />
        <Stat href="/settings#budget" label="Budget" value={budget ? usd0.format(budget) : "Not set"} />
      </div>
      {budget && used !== null ? (
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex justify-between text-muted-foreground text-xs">
            <span>{Math.round(used * 100)}% of the budget used</span>
            <span>Forecast {Math.round((forecast / budget) * 100)}%</span>
          </div>
          <div className="relative h-2 rounded-full bg-muted">
            <div className={`h-2 rounded-full ${used > 1 ? "bg-red-600" : forecast > budget ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${Math.min(100, used * 100)}%` }} />
          </div>
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">
        The budget is a target for this page, set in <Link className="underline" href="/settings#budget">Settings</Link>; it doesn&apos;t stop any
        calls. A hard stop is an AI Gateway budget in the Vercel dashboard. The forecast assumes the rest of the month looks like the days so far.
      </p>
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
