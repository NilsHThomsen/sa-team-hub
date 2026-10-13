import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { findPerson, setRetentionRisk } from "../lib/data";
import { managerConfirms } from "../lib/policies";

export default defineTool({
  description:
    "Change a person's retention risk (low, medium or high) with the reason and the action plan. Managers only. " +
    "The manager is asked to confirm the exact change in the chat before it is saved.",
  inputSchema: z.object({
    person: z.string().min(1).describe("Person id or name"),
    risk: z.enum(["low", "medium", "high"]),
    reason: z.string().min(10).max(400),
    actionPlan: z.string().min(10).max(400),
  }),
  // Sensitive and user-impacting, so a person signs off on every change.
  approval: managerConfirms,
  label: { start: ({ person, risk }) => `Set ${person}'s retention risk to ${risk}` },
  async execute(input, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const person = await findPerson(input.person);
    if (!person) throw new Error(`No one called "${input.person}" is on the team.`);
    // An upsert keyed on person_id, so a replayed step leaves the same final state.
    return setRetentionRisk(actor, { personId: person.id, risk: input.risk, reason: input.reason, actionPlan: input.actionPlan });
  },
});
