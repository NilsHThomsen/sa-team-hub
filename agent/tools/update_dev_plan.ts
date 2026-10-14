import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { findPerson } from "../lib/data";
import { DEV_PLAN_STATUSES, setDevPlan } from "../lib/edits";
import { signedInConfirms } from "../lib/policies";

export default defineTool({
  description:
    "Create or change someone's development plan: the goal, target level, next step, due date and status (on_track, at_risk, done). " +
    "Give only the fields that change; a new plan needs goal, target level, next step and due date. The career goal itself is " +
    "update_career_goal. SAs change only their own plan; managers anyone's. The user confirms in the chat before it is saved.",
  inputSchema: z.object({
    person: z.string().min(1).describe("Person id or name. The caller's own id for 'I' or 'me'."),
    goal: z.string().min(5).max(200).optional(),
    targetLevel: z.string().min(2).max(40).optional().describe("e.g. 'SSA', 'PSA', 'Manager'"),
    nextStep: z.string().min(5).max(300).optional(),
    dueOn: z.string().date().optional().describe("YYYY-MM-DD"),
    status: z.enum(DEV_PLAN_STATUSES).optional(),
  }),
  approval: signedInConfirms,
  label: { start: ({ person }) => `Update ${person}'s development plan` },
  async execute({ person: who, ...input }, ctx) {
    const person = await findPerson(who);
    if (!person) throw new Error(`No one called "${who}" is on the team.`);
    return { person: person.name, ...(await setDevPlan(actorFromAuth(ctx.session.auth.current), { personId: person.id, ...input })) };
  },
});
