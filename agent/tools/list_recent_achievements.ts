import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { listAchievements } from "../lib/data";

export default defineTool({
  description:
    "List achievements logged in the last N days. Managers (and the digest schedule) see the whole team; ICs see only their own.",
  inputSchema: z.object({
    days: z.number().int().min(1).max(365).default(7),
  }),
  label: { start: ({ days }) => `List wins from the last ${days} days` },
  async execute({ days }, ctx) {
    const rows = await listAchievements(actorFromAuth(ctx.session.auth.current), { days });
    return rows.map(({ person_name, occurred_on, category, title, impact }) => ({ person: person_name, occurred_on, category, title, impact }));
  },
});
