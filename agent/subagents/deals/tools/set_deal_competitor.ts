import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../../../lib/actor";
import { findBattlecard, findDeal, setDealCompetitor } from "../../../lib/data";
import { signedInConfirms } from "../../../lib/policies";

export default defineTool({
  description:
    "Record the main competitor on a deal, so the Compete battlecards count the deals each competitor shows up on. " +
    "Use 'none' to clear it. SAs set it on deals they cover; managers on any deal. The user confirms the change in the chat before it is saved.",
  inputSchema: z.object({
    deal: z.string().min(1).describe("Deal id or account name"),
    competitor: z.string().min(1).describe("Competitor name or id, e.g. 'Netlify', or 'none' to clear"),
  }),
  // A write to a shared system of record: whoever asks confirms it first.
  approval: signedInConfirms,
  async execute(input, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const clear = input.competitor.toLowerCase() === "none";
    const [deal, card] = await Promise.all([findDeal(input.deal), clear ? null : findBattlecard(input.competitor)]);
    if (!deal) throw new Error(`No open deal matches "${input.deal}".`);
    if (!clear && !card) throw new Error(`There's no battlecard for "${input.competitor}". The team has cards for Netlify, Cloudflare and AWS.`);
    // Setting the same value again changes nothing, so a replayed step is harmless.
    const result = await setDealCompetitor(actor, { dealId: deal.id, competitorId: card?.id ?? null });
    return { ...result, competitorName: card?.competitor ?? null };
  },
  label: {
    start: ({ deal, competitor }) => `Set ${competitor} on ${deal}`,
    complete: (_input, output) => (output.competitorName ? `${output.competitorName} set on ${output.account}` : `Competitor cleared on ${output.account}`),
  },
});
