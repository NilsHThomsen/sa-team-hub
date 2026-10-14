import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../../../lib/actor";
import { listCandidates, listPromotionCases, listRetentionRisks, listSuccession, listTalentRatings } from "../../../lib/data";
import { managerOnly } from "../../../lib/policies";

export default defineTool({
  description:
    "Manager-only talent view: the 9-box (performance and potential, with the box name), retention risk for each person (risk, reason, action plan), succession candidates, " +
    "the warm bench of external candidates, and existing promotion cases.",
  inputSchema: z.object({
    include: z
      .array(z.enum(["ninebox", "retention", "succession", "bench", "promotions"]))
      .default(["ninebox", "retention", "succession", "bench", "promotions"]),
  }),
  approval: managerOnly, // ICs are refused before execute runs
  label: { start: () => "Open the talent overview" },
  async execute({ include }, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const want = new Set(include);
    const [ninebox, retention, succession, bench, promotions] = await Promise.all([
      want.has("ninebox") ? listTalentRatings(actor) : undefined,
      want.has("retention") ? listRetentionRisks(actor) : undefined,
      want.has("succession") ? listSuccession(actor) : undefined,
      want.has("bench") ? listCandidates(actor) : undefined,
      want.has("promotions") ? listPromotionCases(actor).then((cases) => cases.map(({ case_json: _drop, ...rest }) => rest)) : undefined,
    ]);
    return { ninebox, retention, succession, bench, promotions };
  },
});
