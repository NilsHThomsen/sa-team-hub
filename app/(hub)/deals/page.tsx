import { alignmentFlag, dealCoverage, LABEL, listPeople, summarizeDeals } from "@/agent/lib/data";
import { byPeople, type SearchParams, selectedPeople } from "@/lib/people-filter";
import { requireActor } from "@/lib/viewer";
import { PersonFilter } from "../_person-filter";
import { PageHeader, Section, Stat, Table, Td } from "../_ui";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function DealsPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const { viewer, actor } = await requireActor();
  const [coverage, people, selected] = await Promise.all([dealCoverage(actor), listPeople(), selectedPeople(searchParams)]);
  const manager = viewer.role === "manager";
  // Filter by the covering SA. ICs already see only their own deals, so the filter is for managers.
  const deals = manager ? byPeople(coverage.deals, selected, (d) => d.sa_id) : coverage.deals;
  const summary = manager && selected ? summarizeDeals(deals) : coverage.summary;

  return (
    <>
      <PageHeader
        subtitle="From the business plan: every stage 2+ deal has an SA, a current next step, and a presales stage that matches the forecast."
        title="Deal Coverage"
        actions={manager ? <PersonFilter people={people.filter((p) => p.role === "ic")} /> : null}
      />
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Open deals" value={summary.open_deals} />
        <Stat label="Stage 2+ with an SA" tone={summary.stage2plus_covered_pct >= 90 ? "good" : "warn"} value={`${summary.stage2plus_covered_pct}%`} />
        <Stat label="Stage 3+ technical wins" value={`${summary.stage3plus_tech_win_pct}%`} />
        <Stat label="Presales vs forecast mismatches" tone={summary.stage_misaligned > 0 ? "warn" : "good"} value={summary.stage_misaligned} />
        <Stat label="Next steps older than 14 days" tone={summary.stale_next_steps > 0 ? "warn" : "good"} value={summary.stale_next_steps} />
      </div>
      <Section title={!manager ? "Deals you cover" : selected ? "Open deals for the selected people" : "All open deals"}>
        <Table head={["Account", "Presales Stage", "Forecast", "ACV", "Close", "AE", "SA", "Next step", "Flags"]}>
          {deals.map((d) => (
            <tr key={d.id}>
              <Td className="font-medium">{d.account}</Td>
              <Td className={alignmentFlag(d.presales_stage, d.forecast) ? "whitespace-nowrap font-medium text-amber-700" : "whitespace-nowrap"}>
                {LABEL[d.presales_stage]}
              </Td>
              <Td className={alignmentFlag(d.presales_stage, d.forecast) ? "whitespace-nowrap font-medium text-amber-700" : "whitespace-nowrap"}>
                {LABEL[d.forecast]}
              </Td>
              <Td className="tabular-nums">{usd.format(d.acv_usd)}</Td>
              <Td>{d.close_quarter}</Td>
              <Td className="whitespace-nowrap">{d.ae}</Td>
              <Td className="whitespace-nowrap">{d.sa_name ?? "—"}</Td>
              <Td>
                {d.next_step}
                <div className="text-muted-foreground text-xs">updated {d.days_since_update} days ago</div>
              </Td>
              <Td className="text-amber-700">{d.flags.join("; ")}</Td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
