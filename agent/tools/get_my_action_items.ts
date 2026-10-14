import { defineTool } from "eve/tools";
import { z } from "zod";
import { actionItems } from "../lib/actions";
import { actorFromAuth } from "../lib/actor";

export default defineTool({
  description:
    "List the signed-in person's action items, most urgent first: approvals waiting on them, deals needing an update or a forecast " +
    "conversation, overdue development plans, retention follow-ups (managers), career goals not set and certifications due. " +
    "The same list as the home page. Use it for 'what should I do today?' or 'what are my action items?'.",
  inputSchema: z.object({}),
  label: { start: () => "Check your action items" },
  async execute(_input, ctx) {
    const items = await actionItems(actorFromAuth(ctx.session.auth.current));
    return items.map(({ kind, title, detail, urgent }) => ({ kind, title, detail, urgent }));
  },
});
