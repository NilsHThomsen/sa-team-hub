import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { FORECASTS, findDeal, findPerson, PRESALES_STAGES } from "../lib/data";
import { upsertDeal } from "../lib/edits";
import { fiscalQuarter } from "../lib/fiscal";
import { managerConfirms } from "../lib/policies";

export default defineTool({
  description:
    "Create a deal, or change an open deal's account name, AE, SA (assign, reassign or 'none'), sales stage (1-5, 5 closes it), ACV, " +
    "close quarter, forecast, presales stage or next step. Leave out `deal` to create one; a new deal needs account, AE, stage, ACV and close quarter. " +
    "Close quarters follow Vercel's financial year (Feb to Jan), written like 'FY27 Q4'; 'this' and 'next' also work. Managers only; " +
    "the manager confirms in the chat before it is saved.",
  inputSchema: z.object({
    deal: z.string().optional().describe("Deal id or account name of an existing deal; omit to create"),
    account: z.string().min(2).max(120).optional(),
    ae: z.string().min(2).max(80).optional(),
    sa: z.string().optional().describe("Person id or name, or 'none' to unassign"),
    stage: z.number().int().min(1).max(5).optional(),
    acvUsd: z.number().int().min(0).optional(),
    closeQuarter: z.string().regex(/^(FY\d{2} Q[1-4]|this|next)$/).optional(),
    forecast: z.enum(FORECASTS).optional(),
    presalesStage: z.enum(PRESALES_STAGES).optional(),
    nextStep: z.string().min(5).max(300).optional(),
  }),
  approval: managerConfirms,
  label: { start: ({ deal, account }) => (deal ? `Update deal ${deal}` : `Create a deal for ${account ?? "a new account"}`) },
  async execute({ deal, sa, closeQuarter, ...input }, ctx) {
    let id: string | undefined;
    if (deal) {
      const found = await findDeal(deal);
      if (!found) throw new Error(`No open deal matches "${deal}".`);
      id = found.id;
    }
    let saId: string | null | undefined;
    if (sa !== undefined) {
      if (sa.toLowerCase() === "none") saId = null;
      else {
        const person = await findPerson(sa);
        if (!person) throw new Error(`No one called "${sa}" is on the team.`);
        saId = person.id;
      }
    }
    const quarter = closeQuarter === "this" ? fiscalQuarter() : closeQuarter === "next" ? fiscalQuarter(new Date(), 1) : closeQuarter;
    return upsertDeal(actorFromAuth(ctx.session.auth.current), { id, saId, closeQuarter: quarter, ...input });
  },
});
