import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { findBattlecard, listBattlecards } from "../lib/data";

export default defineTool({
  description:
    "Get the team's competitive battlecards (Netlify, Cloudflare, AWS including Amplify and self-hosting): positioning, where they win, " +
    "where we win, discovery questions, objections with answers, Library items to demo, and dated sources. " +
    "Use it to help position against a competitor on a deal. Leave competitor out for a summary of every card.",
  inputSchema: z.object({
    competitor: z.string().optional().describe("Competitor name or id, e.g. 'Netlify', 'Amplify' or 'cloudflare'"),
  }),
  label: { start: ({ competitor }) => (competitor ? `Open the ${competitor} battlecard` : "List battlecards") },
  async execute(input, ctx) {
    actorFromAuth(ctx.session.auth.current); // signed-in callers only
    const cards = await listBattlecards();
    if (!input.competitor) {
      return { cards: cards.map((c) => ({ id: c.id, competitor: c.competitor, positioning: c.positioning, page: `/compete/${c.id}`, openDeals: c.open_deals, won: c.won_deals })) };
    }
    const match = await findBattlecard(input.competitor);
    const card = match && cards.find((c) => c.id === match.id);
    if (!card) return { found: false, cards: cards.map((c) => c.competitor) };
    const { owner_id: _ownerId, ...rest } = card;
    return { found: true, ...rest, page: `/compete/${card.id}` };
  },
});
