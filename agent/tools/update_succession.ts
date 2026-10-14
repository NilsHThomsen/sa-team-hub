import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { findPerson } from "../lib/data";
import { READINESS, upsertSuccession } from "../lib/edits";
import { managerConfirms } from "../lib/policies";

export default defineTool({
  description:
    "Add, change or remove a succession candidate on the Talent page. Leave out `id` to add one (role, candidate, readiness, pros and cons " +
    "needed); get ids from get_talent_overview. Name a team member in `person` to make them an internal candidate. " +
    "Managers only; the manager confirms in the chat before it is saved.",
  inputSchema: z.object({
    id: z.number().int().optional(),
    roleName: z.string().min(3).max(80).optional().describe("e.g. 'SA Manager, ANZ'"),
    candidate: z.string().min(2).max(80).optional().describe("Candidate's name"),
    person: z.string().optional().describe("Team member's id or name for an internal candidate; 'none' for external"),
    readiness: z.enum(READINESS).optional(),
    pros: z.string().min(5).max(300).optional(),
    cons: z.string().min(5).max(300).optional(),
    remove: z.boolean().optional(),
  }),
  approval: managerConfirms,
  label: { start: ({ id, candidate, remove }) => `${remove ? "Remove" : id ? "Update" : "Add"} succession candidate ${candidate ?? id ?? ""}` },
  async execute({ person: who, ...input }, ctx) {
    let personId: string | null | undefined;
    if (who !== undefined) {
      if (who.toLowerCase() === "none") personId = null;
      else {
        const person = await findPerson(who);
        if (!person) throw new Error(`No one called "${who}" is on the team.`);
        personId = person.id;
      }
    }
    return upsertSuccession(actorFromAuth(ctx.session.auth.current), { personId, ...input });
  },
});
