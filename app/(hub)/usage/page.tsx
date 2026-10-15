import { gateway } from "ai";
import { isManager } from "@/agent/lib/actor";
import { listPeople } from "@/agent/lib/data";
import { APP_TAG } from "@/agent/lib/models";
import { requireActor } from "@/lib/viewer";
import { ManagerOnly, PageHeader, Section, Table, Td } from "../_ui";

// AI spend per person, from AI Gateway Custom Reporting. Every model call this
// app makes is tagged with APP_TAG and the signed-in person's id as `user`
// (agent/lib/models.ts), so one query grouped by user gives the whole table.
// Reports are account-wide, hence the tag filter. New calls take a few minutes
// to show up. Each page view runs two report queries (per person, and per day
// for the monthly chart), which Gateway bills. The subtitle has no dates so
// loading.tsx can show the same one in the prerendered shell; the dates stream
// in the section note.

const DAYS = 30;
const MONTHS = 12;

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const usd = new Intl.NumberFormat("en-AU", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });

export default async function UsagePage() {
  const { actor } = await requireActor();
  // Hidden from ICs in the nav; check again for a typed URL.
  if (!isManager(actor)) return <ManagerOnly />;

  const end = new Date();
  const start = new Date(end.getTime() - (DAYS - 1) * 86_400_000);

  // Rolling 12 months: the first of the month 11 months ago, up to today.
  const monthsStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (MONTHS - 1), 1));

  const [people, report, daily] = await Promise.all([
    listPeople(),
    spendReport({ startDate: ymd(start), endDate: ymd(end), groupBy: "user", tags: [APP_TAG] }),
    spendReport({ startDate: ymd(monthsStart), endDate: ymd(end), groupBy: "day", tags: [APP_TAG] }),
  ]);

  const names = new Map(people.map((p) => [p.id, p.name]));
  const label = (user: string | undefined) => (!user ? "Not attributed" : user === "app" ? "Friday digest (app)" : (names.get(user) ?? user));
  const rows = report.ok ? [...report.rows].sort((a, b) => b.totalCost - a.totalCost) : [];
  const total = rows.reduce((sum, r) => sum + r.totalCost, 0);

  return (
    <>
      <PageHeader subtitle={`AI spend per person over the last ${DAYS} days.`} title="AI usage" />
      <Section note={`${ymd(start)} to ${ymd(end)} UTC, from AI Gateway reporting. New activity appears after a few minutes.`} title="Spend by person">
        {!report.ok ? (
          <p className="rounded-xl border border-dashed bg-card p-6 text-muted-foreground text-sm">Couldn&apos;t load the report from AI Gateway: {report.error}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-6 text-muted-foreground text-sm">No AI usage recorded for this app in the period yet.</p>
        ) : (
          <Table head={["Person", "Requests", "Input tokens", "Cached input tokens", "Output tokens", "Cost (USD)", "Share"]}>
            {rows.map((r) => (
              <tr key={r.user ?? "none"}>
                <Td className="whitespace-nowrap">{label(r.user)}</Td>
                <Td className="tabular-nums">{r.requestCount?.toLocaleString("en-AU") ?? "–"}</Td>
                <Td className="tabular-nums">{r.inputTokens?.toLocaleString("en-AU") ?? "–"}</Td>
                <Td className="tabular-nums">{r.cachedInputTokens?.toLocaleString("en-AU") ?? "–"}</Td>
                <Td className="tabular-nums">{r.outputTokens?.toLocaleString("en-AU") ?? "–"}</Td>
                <Td className="tabular-nums">{usd.format(r.totalCost)}</Td>
                <Td className="text-muted-foreground tabular-nums">{total > 0 ? `${Math.round((r.totalCost / total) * 100)}%` : "–"}</Td>
              </tr>
            ))}
            <tr className="font-medium">
              <Td>Total</Td>
              <Td className="tabular-nums">{rows.reduce((s, r) => s + (r.requestCount ?? 0), 0).toLocaleString("en-AU")}</Td>
              <Td />
              <Td />
              <Td />
              <Td className="tabular-nums">{usd.format(total)}</Td>
              <Td />
            </tr>
          </Table>
        )}
        <p className="text-muted-foreground text-xs">
          Chat spend is credited to whoever started the chat; promotion cases to the manager who asked for them. Calls made before per-person
          tagging was added show as Not attributed.
        </p>
      </Section>
      <Section note="Whole app, all people. Months are UTC." title="Monthly spend, last 12 months">
        {daily.ok ? (
          <MonthlyChart months={monthlyTotals(daily.rows, monthsStart, MONTHS)} />
        ) : (
          <p className="rounded-xl border border-dashed bg-card p-6 text-muted-foreground text-sm">Couldn&apos;t load monthly spend from AI Gateway: {daily.error}</p>
        )}
      </Section>
      <p className="border-t pt-4 text-muted-foreground text-xs">
        What this reporting costs: AI Gateway charges US$0.075 per 1,000 model calls tagged with a person, and US$5 per 1,000 report queries.
        Each view of this page runs two queries.
      </p>
    </>
  );
}

type GatewaySpendReportParams = Parameters<typeof gateway.getSpendReport>[0];
type GatewaySpendReportRow = Awaited<ReturnType<typeof gateway.getSpendReport>>["results"][number];
type Report = { ok: true; rows: GatewaySpendReportRow[] } | { ok: false; error: string };

function spendReport(params: GatewaySpendReportParams): Promise<Report> {
  return gateway
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
