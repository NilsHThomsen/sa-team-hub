import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { currentQuarter, dealCoverage, dealScore, topDeals } from "../lib/data";

export default defineTool({
  description:
    "Review open deals against the presales coverage rules: every stage 2+ deal has an SA, next steps are updated within 14 days, " +
    "stage 3+ deals have a technical win, the presales stage agrees with the sales forecast (tech wins in Strong Upside or Commit, " +
    "no Commit without a tech win), and no SA carries more than 3 active deals. Also returns the scorecard for the top 5 deals closing this " +
    "quarter (deliverables done, SA comment, score out of 100). Managers see every deal; ICs see the deals they cover.",
  inputSchema: z.object({
    onlyFlagged: z.boolean().default(true).describe("Return only deals that break a rule"),
  }),
  label: { start: () => "Review deal coverage" },
  async execute({ onlyFlagged }, ctx) {
    const { deals, summary } = await dealCoverage(actorFromAuth(ctx.session.auth.current));
    const list = onlyFlagged ? deals.filter((d) => d.flags.length > 0) : deals;
    return {
      summary,
      topDealsThisQuarter: topDeals(deals).map((d) => ({ account: d.account, acv_usd: d.acv_usd, sa: d.sa_name, presales_stage: d.presales_stage, deliverables: d.deliverables, sa_comment: d.sa_comment, score: dealScore(d) })),
      quarter: currentQuarter(),
      deals: list.map(({ id, account, ae, sa_name, stage, acv_usd, close_quarter, next_step, days_since_update, presales_stage, forecast, flags }) => ({
        id, account, ae, sa: sa_name, stage, acv_usd, close_quarter, next_step, days_since_update, presales_stage, forecast, flags,
      })),
    };
  },
});
