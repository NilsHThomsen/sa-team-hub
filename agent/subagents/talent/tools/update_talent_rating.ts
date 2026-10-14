import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../../../lib/actor";
import { findPerson, setTalentRating } from "../../../lib/data";
import { managerConfirms } from "../../../lib/policies";

const LEVEL = { low: 1, medium: 2, high: 3 } as const;

export default defineTool({
  description:
    "Move a person on the 9-box (2P matrix) by setting their performance and potential (low, medium or high), with an optional short note. " +
    "Managers only. The manager is asked to confirm the change in the chat before it is saved.",
  inputSchema: z.object({
    person: z.string().min(1).describe("Person id or name"),
    performance: z.enum(["low", "medium", "high"]),
    potential: z.enum(["low", "medium", "high"]),
    note: z.string().max(300).optional().describe("Why, in the manager's words"),
  }),
  approval: managerConfirms,
  label: { start: ({ person, performance, potential }) => `Place ${person} at ${performance} performance, ${potential} potential` },
  async execute(input, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const person = await findPerson(input.person);
    if (!person) throw new Error(`No one called "${input.person}" is on the team.`);
    // An upsert keyed on the person, so a replayed step leaves the same state.
    return setTalentRating(actor, { personId: person.id, performance: LEVEL[input.performance], potential: LEVEL[input.potential], note: input.note });
  },
});
