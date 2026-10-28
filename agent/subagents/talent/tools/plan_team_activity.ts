import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../../../lib/actor";
import { ACTIVITY_KINDS, findPerson, planTeamActivity } from "../../../lib/data";
import { managerConfirms } from "../../../lib/policies";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export default defineTool({
  description:
    "Add a planned activity for an SA to the Team utilisation plan: a workshop, POC, event, enablement, leave or travel, with dates and planned hours. " +
    "Managers only; the manager confirms the exact entry in the chat before it is saved.",
  inputSchema: z.object({
    person: z.string().min(1).describe("Person id or name"),
    kind: z.enum(ACTIVITY_KINDS),
    title: z.string().min(3).max(120),
    account: z.string().max(120).optional().describe("Customer or deal account, if there is one"),
    startsOn: date,
    endsOn: date.optional().describe("Defaults to the start date"),
    hours: z.number().int().min(0).max(200).optional().describe("Planned hours; leave counts as 0"),
  }),
  approval: managerConfirms,
  async execute(input, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const person = await findPerson(input.person);
    if (!person) throw new Error(`No one called "${input.person}" is on the team.`);
    return planTeamActivity(actor, { personId: person.id, kind: input.kind, title: input.title, account: input.account, startsOn: input.startsOn, endsOn: input.endsOn, hours: input.hours });
  },
  label: { start: ({ person, kind, startsOn }) => `Plan ${kind} for ${person} from ${startsOn}` },
});
