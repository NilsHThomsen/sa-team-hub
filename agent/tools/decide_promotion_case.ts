import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { decidePromotionCase, listPromotionCases } from "../lib/data";
import { managerOnly } from "../lib/policies";

export default defineTool({
  description:
    "Approve or decline a drafted promotion case that is waiting for the manager. Use when the manager decides in chat after the " +
    "draft's own question has lapsed. Call with no `decision` to list the cases waiting. If only one is waiting, `caseId` can be left out. " +
    "The same buttons are on the Talent page and in Action items on Home. Managers only.",
  inputSchema: z.object({
    decision: z.enum(["approve", "decline"]).optional(),
    caseId: z.number().int().optional().describe("From the list; needed when more than one case is waiting"),
  }),
  approval: managerOnly,
  label: { start: ({ decision }) => (decision ? `${decision === "approve" ? "Approve" : "Decline"} a promotion case` : "Check promotion cases waiting") },
  async execute({ decision, caseId }, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const pending = (await listPromotionCases(actor)).filter((c) => c.status === "pending_approval");
    const waiting = pending.map(({ id, person_name, target_level, summary, created_at }) => ({ id, person: person_name, targetLevel: target_level, summary, drafted: created_at }));
    if (!decision) return { waiting };

    const id = caseId ?? (pending.length === 1 ? pending[0].id : undefined);
    if (id === undefined) {
      return pending.length === 0 ? { error: "No promotion cases are waiting." } : { error: "More than one case is waiting. Ask which one.", waiting };
    }
    const status = await decidePromotionCase(actor, id, decision === "approve");
    return { id, status: status === "rejected" ? "declined" : status };
  },
});
