import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { accountOverview, CHAMPION_LABEL, HEALTH_LABEL, suggestWorkshops } from "../lib/data";

export default defineTool({
  description:
    "Review customer accounts after the sale: renewals coming up and whether to save, grow or just renew each, usage against commit over six months, " +
    "which Vercel products each customer uses, pilots or doesn't use, upsell ideas with rough sizes, workshops worth running and who to invite, " +
    "and power users who could become champions. Managers see every account; SAs see the accounts they cover. Upsell sizes are rough rules, not quotes.",
  inputSchema: z.object({
    account: z.string().optional().describe("Optional account name to focus on, e.g. 'Bluewater Cruises'"),
  }),
  label: { start: ({ account }) => (account ? `Review ${account}` : "Review accounts") },
  async execute(input, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const all = await accountOverview(actor);
    const customers = input.account ? all.filter((c) => c.account.toLowerCase().includes(input.account!.toLowerCase()) || c.id === input.account) : all;
    if (input.account && customers.length === 0) return { found: false, accounts: all.map((c) => c.account) };
    return {
      page: "/accounts",
      accounts: customers.map((c) => ({
        account: c.account,
        sa: c.sa_name,
        arrUsd: c.arr_usd,
        commitUsd: c.commit_usd,
        renewsOn: c.renewal_on,
        daysToRenewal: c.days_to_renewal,
        health: HEALTH_LABEL[c.health],
        healthNote: c.health_note,
        competitor: c.competitor ? { id: c.competitor, page: `/compete/${c.competitor}` } : null,
        usagePctOfCommitLast6Months: c.usage_trend,
        usageChange3Months: c.trend_change,
        renewalFocus: c.focus,
        using: Object.entries(c.products).filter(([, s]) => s === "using").map(([p]) => p),
        piloting: Object.entries(c.products).filter(([, s]) => s === "piloting").map(([p]) => p),
        notUsing: Object.entries(c.products).filter(([, s]) => s === "not_using").map(([p]) => p),
        upsells: c.upsells.map((u) => ({ product: u.product, why: u.why, roughUsd: u.est_usd, libraryItem: u.library })),
        powerUsers: c.power_users.map((u) => ({ name: u.name, title: u.title, activity: u.activity, status: CHAMPION_LABEL[u.champion], nextMove: u.next_move })),
      })),
      workshops: suggestWorkshops(customers).map((w) => ({ title: w.title, pitch: w.pitch, accounts: w.accounts.map((a) => a.account), invite: w.invite, libraryItem: w.library })),
    };
  },
});
