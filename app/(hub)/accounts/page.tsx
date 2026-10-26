import { cacheLife } from "next/cache";
import Link from "next/link";
import type { Actor } from "@/agent/lib/actor";
import { ADOPTION_PRODUCTS, accountOverview, CHAMPION_LABEL, type CustomerRow, HEALTH_LABEL, RENEWAL_WINDOW_DAYS, suggestWorkshops } from "@/agent/lib/data";
import type { Viewer } from "@/agent/lib/session";
import { cachedBattlecards, cachedLibrary } from "@/lib/cached";
import { cn } from "@/lib/utils";
import { requireActor } from "@/lib/viewer";
import { PageHeader, Pill, Section, Stat, Table, Td } from "../_ui";
import { AdoptionKey, AdoptionMark, UsageSparkline } from "./_parts";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const HEALTH_PILL = { healthy: "low", watch: "medium", at_risk: "high" } as const; // reuses the green, amber and red pills
const FOCUS = {
  save: { label: "Save", className: "text-red-700" },
  grow: { label: "Grow", className: "text-emerald-700" },
  renew: { label: "Renew", className: "text-muted-foreground" },
} as const;
const CHAMPION_PILL = { champion: "complete", potential: "next_focus", user: "not_started" } as const;

export default async function AccountsPage() {
  // Sign-in check (and its redirect) stays outside the cache.
  const { viewer, actor } = await requireActor();
  return <AccountsBody actor={actor} viewer={viewer} />;
}

// "use cache: private", like Deal Coverage: managers see every account and SAs their
// own, so the result stays in this person's browser and never in a shared cache.
async function AccountsBody({ viewer, actor }: { readonly viewer: Viewer; readonly actor: Actor }) {
  "use cache: private";
  cacheLife({ stale: 300 });
  const [customers, { architectures, assets }, battlecards] = await Promise.all([accountOverview(actor), cachedLibrary(), cachedBattlecards()]);
  const manager = viewer.role === "manager";
  const renewals = customers.filter((c) => c.focus !== null);
  const workshops = suggestWorkshops(customers);
  const upsells = customers
    .flatMap((c) => c.upsells.map((u) => ({ ...u, customer: c })))
    .sort((a, b) => a.customer.days_to_renewal - b.customer.days_to_renewal || b.est_usd - a.est_usd);
  // Who to reach out to: anyone with a next move, soonest renewal first.
  const reachOut = customers
    .flatMap((c) => c.power_users.map((u) => ({ ...u, customer: c })))
    .sort((a, b) => Number(b.next_move !== null) - Number(a.next_move !== null) || a.customer.days_to_renewal - b.customer.days_to_renewal);

  const libraryItem = (id: string | null) => {
    if (!id) return null;
    const arch = architectures.find((a) => a.id === id);
    if (arch) return { title: arch.title, href: `/library/${id}`, file: false };
    const asset = assets.find((a) => a.id === id);
    return asset ? { title: asset.title, href: asset.href, file: true } : null;
  };
  const battlecard = (id: string | null) => battlecards.find((b) => b.id === id) ?? null;

  const sum = (rows: CustomerRow[]) => rows.reduce((n, c) => n + c.arr_usd, 0);
  const renewing = customers.filter((c) => c.days_to_renewal <= RENEWAL_WINDOW_DAYS);
  const atRisk = customers.filter((c) => c.health === "at_risk" || c.trend_change <= -10);

  return (
    <>
      <PageHeader
        subtitle={
          manager
            ? "How customers are adopting Vercel, which renewals need us, and who could become a champion. Upsell sizes are rough rules, not quotes."
            : "How your customers are adopting Vercel, which renewals need you, and who could become a champion. Upsell sizes are rough rules, not quotes."
        }
        title="Accounts"
      />
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={manager ? "ARR we cover" : "ARR you cover"} value={usd.format(sum(customers))} />
        <Stat label={`Renewing in the next 6 months (${renewing.length})`} value={usd.format(sum(renewing))} />
        <Stat label="ARR at risk" tone={atRisk.length > 0 ? "bad" : "good"} value={usd.format(sum(atRisk))} />
        <Stat label="Expansion spotted" tone="good" value={usd.format(upsells.reduce((n, u) => n + u.est_usd, 0))} />
      </div>

      <Section note="Next 6 months, soonest first" title="Renewals coming up">
        {renewals.length === 0 ? (
          <p className="text-muted-foreground text-sm">No renewals in the next 6 months.</p>
        ) : (
          <Table head={["Account", "Renews", "ARR", "Health", "Usage vs commit", "Focus", "SA"]}>
            {renewals.map((c) => {
              const card = battlecard(c.competitor);
              const focus = FOCUS[c.focus ?? "renew"];
              return (
                <tr key={c.id}>
                  <Td className="whitespace-nowrap">
                    <div className="font-medium">{c.account}</div>
                    <div className="text-muted-foreground text-xs">{c.segment}</div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {c.renewal_on}
                    <div className="text-muted-foreground text-xs">in {c.days_to_renewal} days</div>
                  </Td>
                  <Td className="tabular-nums">{usd.format(c.arr_usd)}</Td>
                  <Td>
                    <Pill label={HEALTH_LABEL[c.health]} value={HEALTH_PILL[c.health]} />
                  </Td>
                  <Td className="whitespace-nowrap">
                    <UsageSparkline values={c.usage_trend} />
                    <div className="text-muted-foreground text-xs">
                      {c.trend_change >= 0 ? "+" : ""}
                      {c.trend_change} pts in 3 months
                    </div>
                  </Td>
                  <Td className="min-w-64">
                    <span className={cn("font-medium", focus.className)}>{focus.label}: </span>
                    {c.focus === "grow" && c.upsells[0] ? `${c.upsells[0].product}. ` : null}
                    <span className="text-muted-foreground">{c.health_note}</span>
                    {card ? (
                      <div className="mt-1 text-xs">
                        <Link className="underline underline-offset-2" href={`/compete/${card.id}`} prefetch>
                          {card.competitor.split(" (")[0]} battlecard
                        </Link>
                      </div>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap">{c.sa_name ?? "—"}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section note="The gaps are the whitespace" title="Adoption">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Account</th>
                {ADOPTION_PRODUCTS.map((p) => (
                  <th className="px-2 py-2 text-center font-medium" key={p}>
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.map((c) => (
                <tr key={c.id}>
                  <Td className="whitespace-nowrap font-medium">{c.account}</Td>
                  {ADOPTION_PRODUCTS.map((p) => (
                    <td className="px-2 py-2 text-center" key={p}>
                      <AdoptionMark status={c.products[p]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-muted-foreground text-xs">
          <AdoptionKey />
        </div>
      </Section>

      <Section note="Soonest renewal first; at-risk accounts are left out until they're saved" title="Upsell opportunities">
        {upsells.length === 0 ? (
          <p className="text-muted-foreground text-sm">No upsell ideas from the current adoption.</p>
        ) : (
          <Table head={["Account", "Opportunity", "Why", "Rough size", "Helps"]}>
            {upsells.map((u) => {
              const item = libraryItem(u.library);
              return (
                <tr key={`${u.customer.id}-${u.product}`}>
                  <Td className="whitespace-nowrap font-medium">{u.customer.account}</Td>
                  <Td className="whitespace-nowrap">{u.product}</Td>
                  <Td className="min-w-64 text-muted-foreground">{u.why}</Td>
                  <Td className="tabular-nums">{usd.format(u.est_usd)}</Td>
                  <Td className="min-w-40">
                    {item ? (
                      item.file ? (
                        <a className="underline-offset-2 hover:underline" href={item.href} rel="noreferrer" target="_blank">
                          {item.title}
                        </a>
                      ) : (
                        <Link className="underline-offset-2 hover:underline" href={item.href} prefetch>
                          {item.title}
                        </Link>
                      )
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section note="From the adoption gaps, biggest ARR first" title="Workshops to run">
        <div className="grid gap-4 md:grid-cols-2">
          {workshops.map((w) => {
            const item = libraryItem(w.library);
            return (
              <div className="space-y-2 rounded-xl border bg-card p-4" key={w.id}>
                <div className="font-medium">{w.title}</div>
                <p className="text-muted-foreground text-sm">{w.pitch}</p>
                <div className="text-sm">
                  <span className="text-muted-foreground">For: </span>
                  {w.accounts.map((a) => a.account).join(", ")}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Invite: </span>
                  {w.invite.length > 0 ? w.invite.map((p) => `${p.name} (${p.account})`).join(", ") : "find a technical contact first"}
                </div>
                {item ? (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Run it with: </span>
                    <a className="underline underline-offset-2" href={item.href} rel="noreferrer" target={item.file ? "_blank" : undefined}>
                      {item.title}
                    </a>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Section>

      <Section note="People with a next move first, then by renewal date" title="Who to reach out to">
        <Table head={["Person", "Account", "Why they matter", "Status", "Next move"]}>
          {reachOut.map((u) => (
            <tr key={u.id}>
              <Td className="whitespace-nowrap">
                <div className="font-medium">{u.name}</div>
                <div className="text-muted-foreground text-xs">{u.title}</div>
              </Td>
              <Td className="whitespace-nowrap">
                {u.customer.account}
                <div className="text-muted-foreground text-xs">renews in {u.customer.days_to_renewal} days</div>
              </Td>
              <Td className="min-w-56 text-muted-foreground">{u.activity}</Td>
              <Td>
                <Pill label={CHAMPION_LABEL[u.champion]} value={CHAMPION_PILL[u.champion]} />
              </Td>
              <Td className={cn("min-w-56", !u.next_move && "text-muted-foreground")}>{u.next_move ?? "No next move yet"}</Td>
            </tr>
          ))}
        </Table>
      </Section>
      <p className="text-muted-foreground text-xs">
        Ask the agent, for example "Which renewals should we focus on this quarter, and what can we upsell?" or "Sam Wright at Canopy Health is now our champion. Next move: exec readout with their CTO."
      </p>
    </>
  );
}
