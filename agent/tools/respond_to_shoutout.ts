import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { decideShoutout, listPendingShoutoutsFor } from "../lib/data";
import { wakeShoutoutWorkflow } from "../lib/shoutouts";

export default defineTool({
  description:
    "Accept or decline a shout-out a teammate sent the signed-in user. Accepting adds it to their achievements doc. " +
    "Call with no `decision` to list the shout-outs waiting for them. If only one is waiting, `shoutoutId` can be left out.",
  inputSchema: z.object({
    decision: z.enum(["accept", "decline"]).optional(),
    shoutoutId: z.number().int().optional().describe("From the list; needed when more than one is waiting"),
  }),
  label: { start: ({ decision }) => (decision ? `${decision === "accept" ? "Accept" : "Decline"} a shout-out` : "Check shout-outs waiting for you") },
  async execute({ decision, shoutoutId }, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const pending = await listPendingShoutoutsFor(actor);
    const waiting = pending.map(({ id, from_name, title, message, created_at }) => ({ id, from: from_name, title, message, sent: created_at }));
    if (!decision) return { waiting };

    const id = shoutoutId ?? (pending.length === 1 ? pending[0].id : undefined);
    if (id === undefined) {
      return pending.length === 0 ? { error: "No shout-outs are waiting for you." } : { error: "More than one shout-out is waiting. Ask which one.", waiting };
    }
    // Only the recipient can decide; decideShoutout enforces that.
    const result = await decideShoutout(actor, id, decision === "accept");
    await wakeShoutoutWorkflow(result.webhookUrl);
    return { id, status: result.status, note: result.status === "accepted" ? "It will appear in the achievements doc in a moment." : undefined };
  },
});
