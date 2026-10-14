import { alignmentFlag, currentQuarter, DEAL_DELIVERABLES, type DealRow, dealCoverage, dealScore, DELIVERABLE_LABEL, LABEL, listPeople, summarizeDeals, topDeals } from "@/agent/lib/data";
import { cn } from "@/lib/utils";
import { byPeople, type SearchParams, selectedPeople } from "@/lib/people-filter";
import { requireActor } from "@/lib/viewer";
import { PersonFilter } from "../_person-filter";
import { PageHeader, Section, Stat, Table, Td } from "../_ui";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** The four presales deliverables, ticked when done. */
function Deliverables({ done }: { readonly done: DealRow["deliverables"] }) {
  return (
    <div className="grid w-max grid-cols-2 gap-1.5">
      {DEAL_DELIVERABLES.map((d) => {
        const complete = done.includes(d);
        return (
          <span
            className={cn(
              "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs",
              complete ? "bg-emerald-100 font-medium text-emerald-800" : "text-muted-foreground ring-1 ring-border",
            )}
            key={d}
            title={`${DELIVERABLE_LABEL[d]}: ${complete ? "done" : "not done yet"}`}
          >
            {complete ? "✓" : null} {d === "infosec_review" ? "InfoSec" : DELIVERABLE_LABEL[d]}
          </span>
        );
      })}
    </div>
  );
}

function Score({ value }: { readonly value: number }) {
  const tone = value >= 80 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 text-right font-semibold tabular-nums">{value}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </span>
    </div>
  );
}

export default async function DealsPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const { viewer, actor } = await requireActor();
  const [coverage, people, selected] = await Promise.all([dealCoverage(actor), listPeople(), selectedPeople(searchParams)]);
  const manager = viewer.role === "manager";
  // Filter by the covering SA. ICs already see only their own deals, so the filter is for managers.
  const deals = manager ? byPeople(coverage.deals, selected, (d) => d.sa_id) : coverage.deals;
  const summary = manager && selected ? summarizeDeals(deals) : coverage.summary;
  const top = topDeals(deals);

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
      <Section note="Score: 15 for each deliverable done, plus up to 40 for the SA stage" title={manager ? `Top 5 deals this quarter (${currentQuarter()})` : `Your top deals this quarter (${currentQuarter()})`}>
        {top.length === 0 ? (
          <p className="text-muted-foreground text-sm">{manager ? "No open deals close this quarter." : "None of your deals close this quarter."}</p>
        ) : (
          <Table head={["Account", "ACV", "SA", "SA stage", "Deliverables", "Score", "SA comments"]}>
            {top.map((d) => (
              <tr key={d.id}>
                <Td className="whitespace-nowrap font-medium">{d.account}</Td>
                <Td className="tabular-nums">{usd.format(d.acv_usd)}</Td>
                <Td className="whitespace-nowrap">{d.sa_name ?? "—"}</Td>
                <Td className="whitespace-nowrap">{LABEL[d.presales_stage]}</Td>
                <Td>
                  <Deliverables done={d.deliverables} />
                </Td>
                <Td>
                  <Score value={dealScore(d)} />
                </Td>
                <Td className={cn("min-w-56", !d.sa_comment && "text-muted-foreground")}>{d.sa_comment ?? "No comment yet"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
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
              <Td className="whitespace-nowrap">{d.close_quarter}</Td>
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
