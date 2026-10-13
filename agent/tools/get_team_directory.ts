import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { listPeople } from "../lib/data";

export default defineTool({
  description:
    "List everyone on the SA team (id, name, title, level, segment, location) and say who is asking and their role. " +
    "Call this first when you need to resolve a person's name to an id, or to know whether the user is a manager or an IC.",
  inputSchema: z.object({}),
  label: { start: () => "Look up the team" },
  async execute(_input, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const people = await listPeople();
    return {
      you: actor.kind === "user" ? { id: actor.personId, name: actor.name, role: actor.role } : { id: "eve:app", role: "scheduler" },
      people: people.map(({ id, name, title, level, segment, location }) => ({ id, name, title, level, segment, location })),
    };
  },
});
