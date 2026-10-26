import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { ASSET_KIND_LABEL, listLibrary } from "../lib/data";

export default defineTool({
  description:
    "List the team Library: reference architectures and demo assets (demo scripts, playbooks, cheat sheets, diagrams), " +
    "with the Vercel products each covers, who wrote it and which deals it has been used on. " +
    "Use it to recommend what to reuse on a deal, or to answer what the Library holds and what gets reused most.",
  inputSchema: z.object({
    search: z.string().optional().describe("Optional words to match in titles, summaries and products, e.g. 'migration' or 'BotID'"),
  }),
  label: { start: () => "Search the Library" },
  async execute(input, ctx) {
    actorFromAuth(ctx.session.auth.current); // signed-in callers only
    const { architectures, assets } = await listLibrary();
    const words = (input.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (text: string) => words.length === 0 || words.some((w) => text.toLowerCase().includes(w));
    return {
      architectures: architectures
        .filter((a) => matches(`${a.title} ${a.summary} ${a.problem} ${a.products.join(" ")}`))
        .map((a) => ({ id: a.id, title: a.title, summary: a.summary, products: a.products, author: a.author, page: `/library/${a.id}`, usedOn: a.uses.map((u) => u.account) })),
      assets: assets
        .filter((a) => matches(`${a.title} ${a.description} ${a.kind}`))
        .map((a) => ({ id: a.id, title: a.title, type: ASSET_KIND_LABEL[a.kind], description: a.description, author: a.author, file: a.href, architecture: a.architecture_id, usedOn: a.uses.map((u) => u.account) })),
    };
  },
});
