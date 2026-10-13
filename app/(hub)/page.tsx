import Link from "next/link";
import { isManager } from "@/agent/lib/actor";
import { dealCoverage, latestDigest, listAchievements, listDevPlans, listRetentionRisks } from "@/agent/lib/data";
import { requireActor } from "@/lib/viewer";
import { PageHeader, Pill, Section, Stat } from "./_ui";

export default async function HomePage() {
  const { viewer, actor } = await requireActor();
  const manager = isManager(actor);

  // Independent queries run in parallel.
  const [coverage, plans, achievements, digest, risks] = await Promise.all([
    dealCoverage(actor),
    listDevPlans(actor),
    listAchievements(actor, { days: 90 }),
    latestDigest(),
    manager ? listRetentionRisks(actor) : Promise.resolve([]),
  ]);

  const overdue = plans.filter((p) => p.overdue).length;
  const flagged = coverage.deals.filter((d) => d.flags.length > 0).length;

  return (
    <>
      <PageHeader
        title={`Hi ${viewer.name.split(" ")[0]}`}
        subtitle={manager ? "Team health across talent, skills and deal coverage." : "Your achievements, development plan and deals."}
      />

      {manager ? (
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Stage 2+ deals with an SA" tone={coverage.summary.stage2plus_covered_pct >= 90 ? "good" : "warn"} value={`${coverage.summary.stage2plus_covered_pct}%`} />
          <Stat label="Stage 3+ technical wins" value={`${coverage.summary.stage3plus_tech_win_pct}%`} />
          <Stat label="Stale next steps" tone={coverage.summary.stale_next_steps > 0 ? "warn" : "good"} value={coverage.summary.stale_next_steps} />
          <Stat label="Overdue dev plans" tone={overdue > 0 ? "warn" : "good"} value={overdue} />
          <Stat label="High retention risk" tone={risks.some((r) => r.risk === "high") ? "bad" : "good"} value={risks.filter((r) => r.risk === "high").length} />
          <Stat label="Wins logged (90 days)" value={achievements.length} />
        </div>
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label="My wins (90 days)" value={achievements.length} />
          <Stat label="Dev plan" value={plans[0] ? <Pill value={plans[0].overdue ? "overdue" : plans[0].status} /> : "None"} />
          <Stat label="My deals needing attention" tone={flagged > 0 ? "warn" : "good"} value={flagged} />
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Section note="Written by the Friday digest schedule" title="Weekly digest">
          <div className="whitespace-pre-wrap rounded-xl border bg-card p-4 text-sm">
            {digest ? (
              <>
                <div className="mb-2 text-muted-foreground text-xs">Week of {digest.week_of}</div>
                {digest.body}
              </>
            ) : (
              <span className="text-muted-foreground">
                No digest yet. It runs every Friday, or ask the agent to &quot;write this week&apos;s digest&quot;.
              </span>
            )}
          </div>
        </Section>

        <Section title="Recent wins">
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {achievements.slice(0, 6).map((a) => (
              <li className="p-3" key={a.id}>
                <div className="font-medium">{a.title}</div>
                <div className="text-muted-foreground text-xs">
                  {a.person_name} · {a.occurred_on} · {a.category}
                </div>
              </li>
            ))}
            {achievements.length === 0 ? <li className="p-3 text-muted-foreground">Nothing logged in the last 90 days.</li> : null}
          </ul>
          <Link className="text-sm underline-offset-2 hover:underline" href="/s">
            Log a win by telling the agent →
          </Link>
        </Section>
      </div>
    </>
  );
}
