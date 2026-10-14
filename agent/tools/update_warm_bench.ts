import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { BENCH_STAGES, upsertCandidate } from "../lib/edits";
import { managerConfirms } from "../lib/policies";

export default defineTool({
  description:
    "Add, change or remove someone on the warm bench (people we would hire if a role opened). Leave out `id` to add one (name, current job, " +
    "focus and source needed); get ids from get_talent_overview. Set `contactedToday` when the manager has just spoken to them. " +
    "Managers only; the manager confirms in the chat before it is saved.",
  inputSchema: z.object({
    id: z.number().int().optional(),
    name: z.string().min(2).max(80).optional(),
    currentJob: z.string().min(3).max(120).optional(),
    focus: z.string().min(2).max(120).optional(),
    stage: z.enum(BENCH_STAGES).optional(),
    source: z.string().min(2).max(80).optional().describe("e.g. 'Referral (Jack)', 'Meetup'"),
    notes: z.string().max(400).optional(),
    contactedToday: z.boolean().optional(),
    remove: z.boolean().optional(),
  }),
  approval: managerConfirms,
  label: { start: ({ id, name, remove }) => `${remove ? "Remove" : id ? "Update" : "Add"} ${name ?? "a candidate"} on the warm bench` },
  async execute(input, ctx) {
    return upsertCandidate(actorFromAuth(ctx.session.auth.current), input);
  },
});
