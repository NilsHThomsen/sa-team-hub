import type { Viewer } from "@/agent/lib/session";
import type { Actor } from "@/agent/lib/actor";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { type ActionItem, actionItems } from "@/agent/lib/actions";
import { isManager } from "@/agent/lib/actor";
import { dealCoverage, latestDigest, listAchievements, listDevPlans, listPeople, listRetentionRisks, summarizeDeals } from "@/agent/lib/data";
import { byPeople, PEOPLE_PARAM, type SearchParams, selectedPeople } from "@/lib/people-filter";
import { requireActor } from "@/lib/viewer";
import { PersonFilter } from "./_person-filter";
import { PromotionButtons } from "./_promotion-buttons";
import { ShoutoutButtons } from "./_shoutout-buttons";
import { PageHeader, Pill, Section, Stat } from "./_ui";

const KIND_LABEL: Record<ActionItem["kind"], string> = {
  shoutout: "Shout-out",
  approval: "Approval",
  deal: "Deal",
  dev_plan: "Dev plan",
  retention: "Retention",
  career_goal: "Career goal",
  enablement: "Soft skills",
};

// The weekly digest is the same for every reader, holds no talent data (the
// schedule's instructions exclude it) and changes once a week, so it's cached
// instead of read from Postgres on every page view. "remote" keeps one shared
// copy across all function instances; plain "use cache" is in-memory per
// instance on serverless. It's written by an agent tool, not a Server Action,
// so it can't be cleared on save (updateTag is Server Actions only). Instead
// the chat panel clears the "digest" tag after each agent turn (afterAgentTurn in
// ./actions.ts). A digest written elsewhere, such as by the Friday schedule,
// shows within the hour: the "hours" profile refreshes it in the background.
async function cachedDigest() {
  "use cache: remote";
  cacheLife("hours");
  cacheTag("digest");
  return latestDigest();
}

export default async function HomePage({ searchParams }: { readonly searchParams: SearchParams }) {
  // Sign-in check (and its redirect) stays outside the cache.
  const [{ viewer, actor }, params] = await Promise.all([requireActor(), searchParams]);
  return <HomeBody actor={actor} params={params} viewer={viewer} />;
}

// "use cache: private": the result is kept only in this person's browser, never in a
// server cache, so personal data isn't shared. Back/forward and repeat visits within a
// minute reuse it without a server round trip. Server Actions (revalidatePath, and
// updateTag after each chat turn) clear it; a reload always fetches fresh data.
async function HomeBody({ viewer, actor, params }: { readonly viewer: Viewer; readonly actor: Actor; readonly params: Awaited<SearchParams> }) {
  "use cache: private";
  cacheLife({ stale: 60 });
  const manager = isManager(actor);

  // Independent queries run in parallel.
  const [coverageAll, plansAll, achievementsAll, digest, risksAll, people, filter, actionsAll] = await Promise.all([
    dealCoverage(actor),
    listDevPlans(actor),
    listAchievements(actor, { days: 90 }),
    cachedDigest(),
    manager ? listRetentionRisks(actor) : Promise.resolve([]),
    listPeople(),
    selectedPeople(Promise.resolve(params)),
    actionItems(actor),
  ]);
  // Managers can narrow the dashboard to one or more people; ICs already see only their own.
  const selected = manager ? filter : null;
  const plans = byPeople(plansAll, selected, (p) => p.person_id);
  const achievements = byPeople(achievementsAll, selected, (a) => a.person_id);
  const risks = byPeople(risksAll, selected, (r) => r.person_id);
  const filteredDeals = byPeople(coverageAll.deals, selected, (d) => d.sa_id);
  // Team-level items (such as a deal with no SA) stay visible under any filter.
  const actions = selected ? actionsAll.filter((a) => !a.personId || selected.has(a.personId)) : actionsAll;
  const coverage = { deals: filteredDeals, summary: selected ? summarizeDeals(filteredDeals) : coverageAll.summary };

  // Each number links to the tab behind it, carrying the person filter along.
  const suffix = selected ? `?${PEOPLE_PARAM}=${encodeURIComponent([...selected].join(","))}` : "";
  const to = (path: string) => `${path}${suffix}`;

  const overdue = plans.filter((p) => p.overdue).length;
  const flagged = coverage.deals.filter((d) => d.flags.length > 0).length;

  return (
    <>
      <PageHeader
        title={`Hi ${viewer.name.split(" ")[0]}`}
        subtitle={manager ? "Team health across talent, skills and deal coverage." : "Your achievements, development plan and deals."}
        actions={manager ? <PersonFilter people={people.filter((p) => p.role === "ic")} /> : null}
      />

      {manager ? (
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat href={to("/deals")} label="Stage 2+ deals with an SA" tone={coverage.summary.stage2plus_covered_pct >= 90 ? "good" : "warn"} value={`${coverage.summary.stage2plus_covered_pct}%`} />
          <Stat href={to("/deals")} label="Presales vs forecast mismatches" tone={coverage.summary.stage_misaligned > 0 ? "warn" : "good"} value={coverage.summary.stage_misaligned} />
          <Stat href={to("/deals")} label="Stale next steps" tone={coverage.summary.stale_next_steps > 0 ? "warn" : "good"} value={coverage.summary.stale_next_steps} />
          <Stat href={to("/dev-plans")} label="Overdue dev plans" tone={overdue > 0 ? "warn" : "good"} value={overdue} />
          <Stat href={to("/talent")} label="High retention risk" tone={risks.some((r) => r.risk === "high") ? "bad" : "good"} value={risks.filter((r) => r.risk === "high").length} />
          <Stat href={to("/achievements")} label="Achievements logged (90 days)" value={achievements.length} />
        </div>
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat href={to("/achievements")} label="My achievements (90 days)" value={achievements.length} />
          <Stat href={to("/dev-plans")} label="Dev plan" value={plans[0] ? <Pill value={plans[0].overdue ? "overdue" : plans[0].status} /> : "None"} />
          <Stat href={to("/deals")} label="My deals needing attention" tone={flagged > 0 ? "warn" : "good"} value={flagged} />
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Section note={actions.length ? `${actions.length} open` : undefined} title="Action items">
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {actions.slice(0, 8).map((a, i) => (
              <li className="flex gap-3 p-3" key={`${a.kind}-${a.title}-${i}`}>
                <span className={a.urgent ? "mt-1.5 size-2 shrink-0 rounded-full bg-amber-500" : "mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/30"} />
                <div className="min-w-0">
                  <Link className="font-medium underline-offset-2 hover:underline" href={to(a.href)}>
                    {a.title}
                  </Link>
                  <div className="text-muted-foreground text-xs">
                    {KIND_LABEL[a.kind]} · {a.detail}
                  </div>
                  {a.shoutoutId ? <ShoutoutButtons id={a.shoutoutId} /> : null}
                  {a.promotionCaseId ? <PromotionButtons id={a.promotionCaseId} /> : null}
                </div>
              </li>
            ))}
            {actions.length === 0 ? <li className="p-3 text-muted-foreground">Nothing needs you right now.</li> : null}
            {actions.length > 8 ? <li className="p-3 text-muted-foreground text-xs">and {actions.length - 8} more. Ask the agent &quot;what are my action items?&quot;</li> : null}
          </ul>
        </Section>

        <Section title="Recent Achievements">
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
            Log an Achievement by telling the agent →
          </Link>
        </Section>
      </div>

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
    </>
  );
}
