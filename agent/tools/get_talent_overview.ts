import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { listCandidates, listPromotionCases, listRetentionRisks, listSuccession } from "../lib/data";
import { managerOnly } from "../lib/policies";

export default defineTool({
  description:
    "Manager-only talent view: retention risk for each person (risk, reason, action plan), succession candidates, " +
    "the warm bench of external candidates, and existing promotion cases.",
  inputSchema: z.object({
    include: z
      .array(z.enum(["retention", "succession", "bench", "promotions"]))
      .default(["retention", "succession", "bench", "promotions"]),
  }),
  approval: managerOnly, // ICs are refused before execute runs
  label: { start: () => "Open the talent overview" },
  async execute({ include }, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const want = new Set(include);
    const [retention, succession, bench, promotions] = await Promise.all([
      want.has("retention") ? listRetentionRisks(actor) : undefined,
      want.has("succession") ? listSuccession(actor) : undefined,
      want.has("bench") ? listCandidates(actor) : undefined,
      want.has("promotions") ? listPromotionCases(actor).then((cases) => cases.map(({ case_json: _drop, ...rest }) => rest)) : undefined,
    ]);
    return { retention, succession, bench, promotions };
  },
});
