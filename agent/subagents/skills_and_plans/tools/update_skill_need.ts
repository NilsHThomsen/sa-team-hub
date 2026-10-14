import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../../../lib/actor";
import { SKILL_CATEGORIES, setSkillNeed } from "../../../lib/edits";
import { managerConfirms } from "../../../lib/policies";

export default defineTool({
  description:
    "Add, change or remove one of next quarter's skill needs, which drive the Coverage gaps table and find_skill_gaps: how many people " +
    "must have a skill (and for product skills, at least which level, 0-4), and why. Soft skills use category 'enablement'. " +
    "Managers only; the manager confirms in the chat before it is saved.",
  inputSchema: z.object({
    category: z.enum(SKILL_CATEGORIES),
    name: z.string().min(2).max(80).describe("Skill name as it appears in the Skills Matrix"),
    minPeople: z.number().int().min(1).max(50).optional(),
    minLevel: z.number().int().min(0).max(4).nullable().optional().describe("Product skills only"),
    reason: z.string().min(10).max(300).optional(),
    remove: z.boolean().optional(),
  }),
  approval: managerConfirms,
  label: { start: ({ name, remove }) => `${remove ? "Remove" : "Set"} the coverage need for ${name}` },
  async execute(input, ctx) {
    return setSkillNeed(actorFromAuth(ctx.session.auth.current), input);
  },
});
