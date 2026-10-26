import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { findDeal, findLibraryItem, recordLibraryUse } from "../lib/data";

export default defineTool({
  description:
    "Log that a Library reference architecture or demo asset was used on a deal, so the Library shows what gets reused and by whom. " +
    "SAs log it on deals they cover; managers on any deal. Logging the same item on the same deal twice does nothing.",
  inputSchema: z.object({
    item: z.string().min(1).describe("Architecture or asset id or title, e.g. 'peak load demo script'"),
    deal: z.string().min(1).describe("Deal id or account name"),
  }),
  async execute(input, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const [item, deal] = await Promise.all([findLibraryItem(input.item), findDeal(input.deal)]);
    if (!item) throw new Error(`Nothing in the Library matches "${input.item}".`);
    if (!deal) throw new Error(`No open deal matches "${input.deal}".`);
    // ctx.callId is stable across a replayed step, so a re-run logs once.
    const result = await recordLibraryUse(actor, { itemId: item.id, dealId: deal.id }, ctx.callId);
    return { ...result, title: item.title };
  },
  label: {
    start: ({ item, deal }) => `Log ${item} on ${deal}`,
    complete: (_input, output) => (output.duplicate ? `Already logged on ${output.account}` : `Logged ${output.title} on ${output.account}`),
  },
});
