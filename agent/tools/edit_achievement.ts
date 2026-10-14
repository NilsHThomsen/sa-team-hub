import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { editAchievement } from "../lib/edits";
import { signedInConfirms } from "../lib/policies";

export default defineTool({
  description:
    "Correct or remove an achievement already in someone's Achievements Doc. Find its id with list_recent_achievements first. " +
    "Give only the fields that change. SAs change only their own; managers anyone's. The user confirms in the chat before it is saved.",
  inputSchema: z.object({
    id: z.number().int().describe("From list_recent_achievements"),
    title: z.string().min(3).max(160).optional(),
    impact: z.string().min(3).max(600).optional(),
    occurredOn: z.string().date().optional(),
    category: z.enum(["customer", "pipeline", "enablement", "community", "leadership"]).optional(),
    remove: z.boolean().optional(),
  }),
  approval: signedInConfirms,
  label: { start: ({ id, remove }) => `${remove ? "Remove" : "Edit"} achievement ${id}` },
  async execute(input, ctx) {
    return editAchievement(actorFromAuth(ctx.session.auth.current), input);
  },
});
