import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { findPerson } from "../lib/data";
import { PERSON_LEVELS, upsertPerson } from "../lib/edits";
import { managerConfirms } from "../lib/policies";

export default defineTool({
  description:
    "Add an SA to the team, or change a team member's name, title, level (SA1, SA2, SSA, PSA), segment, location or start date. " +
    "Leave out `person` to add someone (name, title, level, segment and location needed). Slack accounts are linked on the Settings page. " +
    "Managers only; the manager confirms in the chat before it is saved.",
  inputSchema: z.object({
    person: z.string().optional().describe("Existing team member's id or name; omit to add someone"),
    name: z.string().min(2).max(80).optional(),
    title: z.string().min(2).max(80).optional().describe("e.g. 'Senior Solutions Architect'"),
    level: z.enum(PERSON_LEVELS).optional(),
    segment: z.string().min(2).max(40).optional().describe("Enterprise, Public Sector, Commercial or Strategic"),
    location: z.string().min(2).max(60).optional(),
    startDate: z.string().date().optional(),
  }),
  approval: managerConfirms,
  label: { start: ({ person, name }) => (person ? `Update ${person}` : `Add ${name ?? "a team member"}`) },
  async execute({ person: who, ...input }, ctx) {
    let id: string | undefined;
    if (who) {
      const person = await findPerson(who);
      if (!person) throw new Error(`No one called "${who}" is on the team.`);
      id = person.id;
    }
    return upsertPerson(actorFromAuth(ctx.session.auth.current), { id, ...input });
  },
});
