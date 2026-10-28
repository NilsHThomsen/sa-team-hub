import { cacheLife } from "next/cache";
import type { Actor } from "@/agent/lib/actor";
import { isManager } from "@/agent/lib/actor";
import {
  ACTIVITY_LABEL,
  OVERLOADED_AT,
  PLAN_DAYS,
  RAMP_TARGET,
  ROOM_BELOW,
  TIME_CATEGORIES,
  TIME_LABEL,
  type TeamActivity,
  teamUtilisation,
  UTILISATION_STATUS_LABEL,
  UTILISATION_TARGET,
  UTILISATION_WINDOW,
  type UtilisationStatus,
  WEEK_HOURS,
} from "@/agent/lib/data";
import { cn } from "@/lib/utils";
import { requireActor } from "@/lib/viewer";
import { ManagerOnly, PageHeader, Pill, Section, Stat, Table, Td } from "../_ui";
import { CategoryKey, TimeSplitBar, UtilisationBar, WeeklySparkline } from "./_parts";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
// Reuses the red, green, amber and grey pills; each also carries its label.
const STATUS_PILL: Record<UtilisationStatus, string> = { overloaded: "high", on_target: "low", room: "medium", ramping: "not_started" };
const STATUS_ORDER: Record<UtilisationStatus, number> = { overloaded: 0, room: 1, ramping: 2, on_target: 3 };

export default async function UtilisationPage() {
  const { actor } = await requireActor();
  // Hidden from ICs in the nav; check again for a typed URL. The data layer refuses them too.
  if (!isManager(actor)) return <ManagerOnly />;
  // Read the clock out here: the cached body gets today's date as an argument instead.
  return <UtilisationBody actor={actor} today={new Date().toISOString().slice(0, 10)} />;
}

// "use cache: private" like Accounts: manager-only data stays in this manager's browser.
async function UtilisationBody({ actor, today }: { readonly actor: Actor; readonly today: string }) {
  "use cache: private";
  cacheLife({ stale: 300 });
  const { people, weeks, team, suggestions } = await teamUtilisation(actor);
  const sorted = [...people].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (b.utilisation ?? 0) - (a.utilisation ?? 0));
  const count = (s: UtilisationStatus) => people.filter((p) => p.status === s).length;
  const away = people.filter((p) => p.upcoming.some((a) => a.kind === "leave"));
  const teamTotal = TIME_CATEGORIES.reduce((n, c) => n + team.split[c], 0);
  const period = `Last ${UTILISATION_WINDOW} weeks, from the week of ${weeks.at(-UTILISATION_WINDOW) ?? weeks[0]}`;

  // The plan grid: six weeks from this Monday.
  const now = new Date(`${today}T00:00:00Z`);
  const monday = new Date(now.getTime() - ((now.getUTCDay() + 6) % 7) * 86_400_000);
  const planWeeks = Array.from({ length: PLAN_DAYS / 7 }, (_, i) => {
    const start = new Date(monday.getTime() + i * 7 * 86_400_000);
    const end = new Date(start.getTime() + 6 * 86_400_000);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), label: start.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }) };
  });
  const inWeek = (a: TeamActivity, wk: { start: string; end: string }) => a.starts_on <= wk.end && a.ends_on >= wk.start;

  return (
    <>
      <PageHeader
        subtitle="Where each SA's time goes, who is stretched or has room, and what's planned for the next six weeks. Utilisation is customer-facing time (deals, accounts, events) over a 40-hour week less leave."
        title="Team utilisation"
      />
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label={`Team utilisation, last ${UTILISATION_WINDOW} weeks (target ${UTILISATION_TARGET}%)`}
          tone={team.utilisation !== null && team.utilisation < UTILISATION_TARGET - 5 ? "warn" : "good"}
          value={team.utilisation === null ? "–" : `${team.utilisation}%`}
        />
        <Stat label="Overloaded" tone={count("overloaded") > 0 ? "bad" : "good"} value={count("overloaded")} />
        <Stat label="Have room for more" value={count("room")} />
        <Stat label="On leave in the next 6 weeks" value={away.length} />
      </div>

      <Section note={period} title="By SA">
        <Table head={["SA", "Status", "Customer-facing", `Last ${weeks.length} weeks`, "Where the time goes", "Hours a week", "Active deals", "Accounts"]}>
          {sorted.map((p) => (
            <tr key={p.person_id}>
              <Td className="whitespace-nowrap">
                <div className="font-medium">{p.name}</div>
                <div className="text-muted-foreground text-xs">
                  {p.level} · {p.segment}
                </div>
              </Td>
              <Td className="min-w-40">
                <Pill label={UTILISATION_STATUS_LABEL[p.status]} value={STATUS_PILL[p.status]} />
                {p.reasons.length > 0 ? <div className="mt-1 text-muted-foreground text-xs">{p.reasons.join("; ")}</div> : null}
              </Td>
              <Td className="whitespace-nowrap">
                <UtilisationBar target={p.target} value={p.utilisation} />
              </Td>
              <Td>
                <WeeklySparkline target={p.target} weeks={p.weeks} />
              </Td>
              <Td>
                <TimeSplitBar split={p.split} />
              </Td>
              <Td className="tabular-nums">{p.hours_per_week}</Td>
              <Td className="min-w-36">
                <span className="tabular-nums">{p.active_deals.length}</span>
                {p.active_deals.length > 0 ? <div className="text-muted-foreground text-xs">{p.active_deals.map((d) => d.account).join(", ")}</div> : null}
              </Td>
              <Td className="whitespace-nowrap tabular-nums">
                {p.accounts}
                {p.accounts > 0 ? <span className="text-muted-foreground text-xs"> · {usd.format(p.arr_usd)} ARR</span> : null}
              </Td>
            </tr>
          ))}
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
          <CategoryKey />
          <span>
            Tick = target ({UTILISATION_TARGET}%, or {RAMP_TARGET}% in someone&apos;s first 6 months). Overloaded at {OVERLOADED_AT}%, more than 3 active deals or
            44+ hours a week; room below {ROOM_BELOW}%.
          </span>
        </div>
      </Section>

      <Section note={period} title="Where the team's time goes">
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <TimeSplitBar className="h-4 w-full" split={team.split} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {TIME_CATEGORIES.map((c) => (
              <div className="flex justify-between gap-2" key={c}>
                <dt className="text-muted-foreground">{TIME_LABEL[c]}</dt>
                <dd className="tabular-nums">
                  {Math.round(team.split[c])} h · {teamTotal > 0 ? Math.round((100 * team.split[c]) / teamTotal) : 0}%
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section note="Plain rules, so you can see why each one is here" title="Rebalancing ideas">
        {suggestions.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing to rebalance right now.</p>
        ) : (
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li className="rounded-xl border bg-card p-3 text-sm" key={s.text}>
                <span className="mr-2 font-medium capitalize">{s.kind}:</span>
                {s.text}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section note="Ask the agent to add or remove an activity" title="Next 6 weeks">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">SA</th>
                {planWeeks.map((wk) => (
                  <th className="whitespace-nowrap px-2 py-2 font-medium" key={wk.start}>
                    Week of {wk.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((p) => (
                <tr key={p.person_id}>
                  <Td className="whitespace-nowrap font-medium">{p.name}</Td>
                  {planWeeks.map((wk) => (
                    <Td className="min-w-32 space-y-1" key={wk.start}>
                      {p.upcoming
                        .filter((a) => inWeek(a, wk))
                        .map((a) => (
                          <div
                            className={cn("rounded-md border px-1.5 py-1 text-xs", a.kind === "leave" ? "border-dashed bg-muted/40 text-muted-foreground" : "bg-background")}
                            key={a.id}
                            title={`${a.title}${a.account ? `, ${a.account}` : ""}: ${a.starts_on} to ${a.ends_on}${a.hours ? `, ${a.hours} h planned` : ""}`}
                          >
                            <span className="font-medium">{ACTIVITY_LABEL[a.kind]}</span> · {a.account ?? a.title}
                          </div>
                        ))}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <p className="border-t pt-4 text-muted-foreground text-xs">
        Sample data. In production the hours would come from calendars and CRM activity rather than timesheets. A {WEEK_HOURS}-hour week is assumed.
      </p>
    </>
  );
}
