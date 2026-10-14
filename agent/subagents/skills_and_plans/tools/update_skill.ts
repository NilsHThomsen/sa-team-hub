import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../../../lib/actor";
import { findPerson } from "../../../lib/data";
import { SKILL_CATEGORIES, SKILL_STATUSES, setSkill } from "../../../lib/edits";
import { signedInConfirms } from "../../../lib/policies";

export default defineTool({
  description:
    "Set someone's entry in the Skills Matrix: a product skill level (0 None, 1 Elevator, 2 Present, 3 Demo, 4 Prove), or a certification " +
    "or soft skill's status (not_started, next_focus, in_progress, complete) and due or completed date. Adds the skill if they don't have it; " +
    "`remove` deletes it. Soft skills use category 'enablement'. Use the exact skill name from the matrix. SAs change only their own; managers anyone's. " +
    "The user confirms in the chat before it is saved.",
  inputSchema: z.object({
    person: z.string().min(1).describe("Person id or name. The caller's own id for 'I' or 'me'."),
    category: z.enum(SKILL_CATEGORIES),
    name: z.string().min(2).max(80).describe("e.g. 'Caching & CDN', 'AWS Solutions Architect Professional', 'Champion Building'"),
    level: z.number().int().min(0).max(4).optional().describe("Product skills only"),
    status: z.enum(SKILL_STATUSES).optional().describe("Certifications and soft skills only"),
    dueOn: z.string().date().nullable().optional().describe("YYYY-MM-DD; null clears it"),
    completedOn: z.string().date().nullable().optional().describe("YYYY-MM-DD; defaults to today when status becomes complete"),
    remove: z.boolean().optional(),
  }),
  approval: signedInConfirms,
  label: { start: ({ person, name }) => `Update ${name} for ${person}` },
  async execute({ person: who, ...input }, ctx) {
    const person = await findPerson(who);
    if (!person) throw new Error(`No one called "${who}" is on the team.`);
    return { person: person.name, ...(await setSkill(actorFromAuth(ctx.session.auth.current), { personId: person.id, ...input })) };
  },
});
