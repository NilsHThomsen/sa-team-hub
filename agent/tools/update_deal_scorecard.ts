import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { DEAL_DELIVERABLES, findDeal, updateDealScorecard } from "../lib/data";
import { signedInConfirms } from "../lib/policies";

export default defineTool({
  description:
    "Update a deal's scorecard: mark presales deliverables done (presentation, demo, poc, infosec_review), undo one marked by mistake, " +
    "and set the SA's comment. SAs can update only the deals they cover; managers can update any deal. The user confirms the change " +
    "in the chat before it is saved. Resolve the deal by account name if no id is given. The score is 15 per deliverable plus up to 40 for the presales stage.",
  inputSchema: z.object({
    deal: z.string().min(1).describe("Deal id or account name, e.g. 'Harbour Bank'"),
    done: z.array(z.enum(DEAL_DELIVERABLES)).optional().describe("Deliverables now completed"),
    undo: z.array(z.enum(DEAL_DELIVERABLES)).optional().describe("Only if the user says one was marked done by mistake"),
    comment: z.string().min(3).max(300).optional().describe("The SA's comment on where the deal stands, in their words"),
  }),
  approval: signedInConfirms,
  label: { start: ({ deal }) => `Update the scorecard on ${deal}` },
  async execute(input, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const deal = await findDeal(input.deal);
    if (!deal) throw new Error(`No open deal matches "${input.deal}".`);
    return updateDealScorecard(actor, { dealId: deal.id, done: input.done, undo: input.undo, comment: input.comment });
  },
});
