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
// to show up. Each page view is one report query, which Gateway bills.

const DAYS = 30;

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

  const [people, report] = await Promise.all([
    listPeople(),
    gateway
      .getSpendReport({ startDate: ymd(start), endDate: ymd(end), groupBy: "user", tags: [APP_TAG] })
      .then((r) => ({ ok: true as const, rows: r.results }))
      .catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) })),
  ]);

  const names = new Map(people.map((p) => [p.id, p.name]));
  const label = (user: string | undefined) => (!user ? "Not attributed" : user === "app" ? "Friday digest (app)" : (names.get(user) ?? user));
  const rows = report.ok ? [...report.rows].sort((a, b) => b.totalCost - a.totalCost) : [];
  const total = rows.reduce((sum, r) => sum + r.totalCost, 0);

  return (
    <>
      <PageHeader subtitle={`AI spend per person over the last ${DAYS} days (${ymd(start)} to ${ymd(end)}, UTC).`} title="AI usage" />
      <Section note="From AI Gateway reporting. New activity appears after a few minutes." title="Spend by person">
        {!report.ok ? (
          <p className="rounded-xl border border-dashed bg-card p-6 text-muted-foreground text-sm">Couldn&apos;t load the report from AI Gateway: {report.error}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-6 text-muted-foreground text-sm">No AI usage recorded for this app in the period yet.</p>
        ) : (
          <Table head={["Person", "Requests", "Input tokens", "Output tokens", "Cost (USD)", "Share"]}>
            {rows.map((r) => (
              <tr key={r.user ?? "none"}>
                <Td className="whitespace-nowrap">{label(r.user)}</Td>
                <Td className="tabular-nums">{r.requestCount?.toLocaleString("en-AU") ?? "–"}</Td>
                <Td className="tabular-nums">{r.inputTokens?.toLocaleString("en-AU") ?? "–"}</Td>
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
      <p className="border-t pt-4 text-muted-foreground text-xs">
        What this reporting costs: AI Gateway charges US$0.075 per 1,000 model calls tagged with a person, and US$5 per 1,000 report queries.
        Each view of this page runs one query.
      </p>
    </>
  );
}
