import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../../../lib/actor";
import { PLAN_DAYS, TIME_LABEL, teamUtilisation, UTILISATION_STATUS_LABEL, UTILISATION_TARGET, UTILISATION_WINDOW } from "../../../lib/data";
import { managerOnly } from "../../../lib/policies";

export default defineTool({
  description:
    `Manager-only team utilisation: each SA's customer-facing % over the last ${UTILISATION_WINDOW} weeks (target ${UTILISATION_TARGET}%, lower while ramping), ` +
    "eight weeks of history, hours by category (deals, accounts, events, enablement, internal, leave), active deals and accounts, " +
    `status (overloaded, on target, has room, ramping) with the reasons, planned activities for the next ${PLAN_DAYS / 7} weeks with their ids, and rule-based rebalancing ideas.`,
  inputSchema: z.object({
    person: z.string().optional().describe("Optional SA name to focus on"),
  }),
  approval: managerOnly, // ICs are refused before execute runs
  label: { start: ({ person }) => (person ? `Check ${person}'s utilisation` : "Check team utilisation") },
  async execute({ person }, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const { people, weeks, team, suggestions } = await teamUtilisation(actor);
    const rows = person ? people.filter((p) => p.name.toLowerCase().includes(person.toLowerCase()) || p.person_id === person) : people;
    if (person && rows.length === 0) return { found: false, team: people.map((p) => p.name) };
    return {
      page: "/utilisation",
      weeks,
      teamUtilisationPct: team.utilisation,
      people: rows.map((p) => ({
        id: p.person_id,
        name: p.name,
        level: p.level,
        status: UTILISATION_STATUS_LABEL[p.status],
        reasons: p.reasons,
        customerFacingPct: p.utilisation,
        targetPct: p.target,
        weeklyPctOldestFirst: p.weeks.map((w) => w.utilisation),
        hoursPerWeek: p.hours_per_week,
        hoursByCategory: Object.fromEntries(Object.entries(p.split).map(([c, h]) => [TIME_LABEL[c as keyof typeof TIME_LABEL], h])),
        activeDeals: p.active_deals.map((d) => ({ id: d.id, account: d.account, stage: d.stage, presalesStage: d.presales_stage, acvUsd: d.acv_usd })),
        accounts: p.accounts,
        arrUsd: p.arr_usd,
        planned: p.upcoming.map((a) => ({ id: a.id, kind: a.kind, title: a.title, account: a.account, startsOn: a.starts_on, endsOn: a.ends_on, hours: a.hours })),
      })),
      suggestions: suggestions.map((s) => ({ kind: s.kind, text: s.text, dealId: s.deal_id })),
    };
  },
});
