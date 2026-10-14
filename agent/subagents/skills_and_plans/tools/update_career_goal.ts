import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../../../lib/actor";
import { CAREER_GOALS } from "../../../lib/career-goals";
import { findPerson, setCareerGoal } from "../../../lib/data";
import { signedInConfirms } from "../../../lib/policies";

export default defineTool({
  description:
    "Set a person's career goal (the role they are working towards, e.g. Principal SA, Manager or Product Manager), " +
    "with an optional short note. SAs can set only their own goal; managers can set anyone's. " +
    "Leave `person` out when the user means themselves. The user confirms the change in the chat before it is saved.",
  inputSchema: z.object({
    person: z.string().min(1).optional().describe("Person id or name; omit for the signed-in user"),
    goal: z.enum(CAREER_GOALS),
    note: z.string().max(300).optional().describe("Why, or what they want from the move, in the user's words"),
  }),
  approval: signedInConfirms,
  label: { start: ({ person, goal }) => `Set ${person ?? "your"} career goal to ${goal}` },
  async execute(input, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    if (actor.kind !== "user") throw new Error("Career goals are changed by a signed-in person.");
    let personId = actor.personId;
    if (input.person) {
      const found = await findPerson(input.person);
      if (!found) throw new Error(`No one called "${input.person}" is on the team.`);
      personId = found.id;
    }
    // An upsert keyed on the person, so a replayed step leaves the same state.
    return setCareerGoal(actor, { personId, goal: input.goal, note: input.note });
  },
});
