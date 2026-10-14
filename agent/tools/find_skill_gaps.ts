import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { skillGaps } from "../lib/data";

export default defineTool({
  description:
    "Compare the team's skills matrix (product skills, certifications, soft skills, stored as category 'enablement') with next quarter's needs. " +
    "For managers it names who qualifies and who is one step away; for ICs it returns team totals plus the IC's own gaps.",
  inputSchema: z.object({}),
  label: { start: () => "Check skills against next quarter's needs" },
  async execute(_input, ctx) {
    return skillGaps(actorFromAuth(ctx.session.auth.current));
  },
});
