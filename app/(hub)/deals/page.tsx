import { alignmentFlag, dealCoverage, LABEL } from "@/agent/lib/data";
import { requireActor } from "@/lib/viewer";
import { PageHeader, Section, Stat, Table, Td } from "../_ui";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function DealsPage() {
  const { viewer, actor } = await requireActor();
  const { deals, summary } = await dealCoverage(actor);

  return (
    <>
      <PageHeader
        subtitle="From the business plan: every stage 2+ deal has an SA, a current next step, and a presales stage that matches the forecast."
        title="Deal Coverage"
      />
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Open deals" value={summary.open_deals} />
        <Stat label="Stage 2+ with an SA" tone={summary.stage2plus_covered_pct >= 90 ? "good" : "warn"} value={`${summary.stage2plus_covered_pct}%`} />
        <Stat label="Stage 3+ technical wins" value={`${summary.stage3plus_tech_win_pct}%`} />
        <Stat label="Presales vs forecast mismatches" tone={summary.stage_misaligned > 0 ? "warn" : "good"} value={summary.stage_misaligned} />
        <Stat label="Next steps older than 14 days" tone={summary.stale_next_steps > 0 ? "warn" : "good"} value={summary.stale_next_steps} />
      </div>
      <Section title={viewer.role === "manager" ? "All open deals" : "Deals you cover"}>
        <Table head={["Account", "Stage", "Presales", "Forecast", "ACV", "Close", "AE", "SA", "Next step", "Flags"]}>
          {deals.map((d) => (
            <tr key={d.id}>
              <Td className="font-medium">{d.account}</Td>
              <Td>{d.stage}</Td>
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
