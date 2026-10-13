import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { addAchievement, findPerson } from "../lib/data";

export default defineTool({
  description:
    "Record an achievement in someone's Achievements Doc from a plain-English description. " +
    "ICs can only log their own wins; managers can log for anyone. Write a short title and a concrete impact statement " +
    "(numbers, customer, outcome). If the date is not given, use today. Ask for the impact if it is missing rather than inventing it.",
  inputSchema: z.object({
    person: z.string().min(1).describe("Person id or name. Use the caller's own id for 'I' or 'me'."),
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date of the achievement, YYYY-MM-DD"),
    category: z.enum(["customer", "pipeline", "enablement", "community", "leadership"]),
    title: z.string().min(5).max(120),
    impact: z.string().min(10).max(400).describe("What changed because of it, with numbers where the user gave them"),
  }),
  async execute(input, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const person = await findPerson(input.person);
    if (!person) throw new Error(`No one called "${input.person}" is on the team.`);

    // ctx.callId is stable across a replayed step, so it doubles as the
    // idempotency key: an interrupted call that re-runs writes exactly once.
    const result = await addAchievement(
      actor,
      { personId: person.id, occurredOn: input.occurredOn, category: input.category, title: input.title, impact: input.impact },
      ctx.callId,
    );
    return { ...result, person: person.name };
  },
  // Declared after execute so TypeScript infers `output` from its return type.
  label: {
    start: ({ person }) => `Log achievement for ${person}`,
    complete: (_input, output) => (output.duplicate ? "Achievement already logged" : `Logged achievement for ${output.person}`),
  },
});
