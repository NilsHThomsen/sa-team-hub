import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { findDeal, updateDealNextStep } from "../lib/data";
import { signedInConfirms } from "../lib/policies";

export default defineTool({
  description:
    "Update the next step on an open deal in the CRM, and optionally mark whether the technical win is secured. " +
    "SAs can update only the deals they cover; managers can update any deal. Write the next step as a concrete action " +
    "with an owner and a date where the user gave them (e.g. 'Security review with CISO team, Thu 23 Oct'). " +
    "The user confirms the exact change in the chat before it is saved. Resolve the deal by account name if no id is given.",
  inputSchema: z.object({
    deal: z.string().min(1).describe("Deal id or account name, e.g. 'Acme Bank'"),
    nextStep: z.string().min(5).max(300),
    techWin: z.boolean().optional().describe("Set only if the user said the technical win is (or is no longer) secured"),
  }),
  // A write to a shared system of record: whoever asks confirms it first.
  approval: signedInConfirms,
  label: { start: ({ deal }) => `Update next step on ${deal}` },
  async execute(input, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const deal = await findDeal(input.deal);
    if (!deal) throw new Error(`No open deal matches "${input.deal}".`);
    return updateDealNextStep(actor, { dealId: deal.id, nextStep: input.nextStep, techWin: input.techWin }, ctx.callId);
  },
});
