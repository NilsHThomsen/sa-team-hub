import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { saveDigest } from "../lib/data";

export default defineTool({
  description:
    "Save this week's team digest so it appears on the dashboard home page. Used by the Friday schedule, or when a manager asks for a digest. " +
    "Never include retention risk, succession or candidate details: the digest is visible to the whole team.",
  inputSchema: z.object({
    body: z.string().min(50).max(3000).describe("Plain text, short sections: wins, deals needing attention, development plans due"),
  }),
  label: { start: () => "Save the weekly digest" },
  async execute({ body }, ctx) {
    return saveDigest(actorFromAuth(ctx.session.auth.current), body);
  },
});
